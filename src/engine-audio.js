/**
 * src/engine-audio.js — FEAT-23 / FEAT-120: engine sound tied to engine RPM.
 *
 * FEAT-120: an engine with a baked sample set (assets/audio/engine/manifest-<engine>.json: the Vulcan
 * V6 and the Duratec I4) plays recorded engine-sim loops — see "FEAT-120: baked engine loops" below. Every other
 * engine, and the Vulcan until its loops have loaded, falls back to the FEAT-23 drone:
 *
 * Not a sample-based engine sim — just a small oscillator stack that sounds "engine-ish" without much
 * cost or code. Firing frequency for a 4-stroke V6 is 3 firings/rev (cylinders/2), so the fundamental is
 * f0 = rpm/60 · 3. We stack a sawtooth at f0, a slightly detuned twin (beating → mechanical roughness),
 * a half-octave sub (the lumpy off-beat of a V engine) and an upper harmonic, run them through a lowpass
 * that opens with revs + throttle, and keep the master gain modest so it never turns into a harsh buzz.
 *
 * The AudioContext can only start after a user gesture (browser autoplay policy), so ensureEngineAudio()
 * is called from main.js's keydown handler; updateEngineAudio(rpm, throttle) is called each render frame.
 */

let ctx = null
let master = null        // GainNode — overall volume
let lp = null            // BiquadFilterNode — lowpass, cutoff tracks revs
let oscs = []            // { osc, gain, mult, detune }
let started = false
let enabled = true
let volume = 0.5         // 0..1 user volume (scales the modest internal gains)
let pageActive = true    // false while the tab is blurred/hidden — see setAudioPageActive()

const RPM_MIN = 500      // idle-ish floor for frequency mapping
const F_MIN = 22         // Hz — don't let the fundamental sink into sub-audible mud

// Oscillator recipe: [frequency multiple of f0, relative gain, detune cents, waveform].
const RECIPE = [
  { mult: 1.0,  gain: 0.55, detune: 0,   type: 'sawtooth' },
  { mult: 1.0,  gain: 0.45, detune: 9,   type: 'sawtooth' }, // detuned twin → beating/roughness
  { mult: 0.5,  gain: 0.50, detune: 0,   type: 'sawtooth' }, // half-octave sub → V-engine lump
  { mult: 2.0,  gain: 0.18, detune: 0,   type: 'square'   }, // upper harmonic → bite at high revs
]

/**
 * The single shared AudioContext for the whole game (created lazily, on a user gesture). Other audio
 * modules (src/tire-audio.js) hang their own master gain off it rather than opening a second context
 * — browsers cap live contexts, and independent contexts can't be mixed or resumed together.
 * Returns null if WebAudio is unavailable.
 */
export function getAudioContext () {
  if (ctx) { if (pageActive && ctx.state === 'suspended') ctx.resume(); return ctx }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

/**
 * `seconds` of white noise in a mono buffer on context `ac`. Shared by every audio module (they all
 * hang off the one context above) — the raw material for crank grind, tire roar, wind and one-shots.
 */
export function whiteNoiseBuffer (ac, seconds) {
  const n = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/**
 * Loop a noise buffer from a RANDOM offset. Several taps share one buffer (cheap), so each source
 * starts at its own offset — otherwise two taps of the same buffer are sample-identical and
 * phase-locked, and summing two differently-filtered copies of one signal combs rather than thickens.
 */
export function loopNoise (ac, buf) {
  const src = ac.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.start(0, Math.random() * buf.duration)
  return src
}

/** Create + start the audio graph (idempotent). Must be called from a user gesture. */
export function ensureEngineAudio () {
  if (started) { if (pageActive && ctx && ctx.state === 'suspended') ctx.resume(); return }
  if (!getAudioContext()) return

  lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  lp.Q.value = 0.9

  master = ctx.createGain()
  master.gain.value = 0

  lp.connect(master)
  master.connect(ctx.destination)

  for (const r of RECIPE) {
    const osc = ctx.createOscillator()
    osc.type = r.type
    osc.frequency.value = 60
    osc.detune.value = r.detune
    const g = ctx.createGain()
    g.gain.value = r.gain
    osc.connect(g)
    g.connect(lp)
    osc.start()
    oscs.push({ osc, gain: g, mult: r.mult })
  }
  started = true
  ensureStarter()
}

/**
 * Per-frame update: map engine RPM → fundamental, open the filter with revs/throttle, and set volume.
 * Ramps every param with setTargetAtTime (~50 ms) so nothing zippers.
 */
export function updateEngineAudio (rpm, throttle, firing = true, cylinders = 6, engine = null) {
  if (!started || !ctx) return
  const now = ctx.currentTime
  const tc = 0.05

  // FEAT-120: an engine with baked loops plays them and the drone mutes; the first frame asking for
  // an engine starts its load, and the drone covers until it lands.
  if (engine && !(engine in bakes)) loadBake(engine)
  if (activeEngine !== engine && bakes[activeEngine]) silence(bakes[activeEngine], now)
  activeEngine = engine
  const bake = bakes[engine]
  if (bake) updateBake(bake, rpm, throttle, enabled && firing, enabled && crankOn && !firing, now)
  if (!enabled || bake) { master.gain.setTargetAtTime(0, now, tc); return }

  // FEAT-33: `firing` is false whenever the ignition is not RUNNING. This drone models COMBUSTION,
  // so it has to go silent for a dead engine — including the case that would otherwise sound worst,
  // an off-key coast at speed where the driveline is dragging the engine round at 1300 rpm and the
  // stack would happily drone as if the truck were still running. Kept as a fade, not a cut, so
  // shutting the key off at idle dies away instead of clicking.
  if (!firing) { master.gain.setTargetAtTime(0, now, 0.12); return }

  const r = Math.max(RPM_MIN, rpm || RPM_MIN)
  const f0 = Math.max(F_MIN, (r / 60) * cylinders / 2)   // 4-stroke firing fundamental: cylinders/2 per rev
  for (const o of oscs) o.osc.frequency.setTargetAtTime(f0 * o.mult, now, tc)

  // Filter opens with revs + throttle → brighter under load / at high RPM.
  const th = Math.min(1, Math.max(0, throttle || 0))
  const cutoff = 320 + r * 0.42 + th * 900
  lp.frequency.setTargetAtTime(Math.min(cutoff, 8000), now, tc)

  // Modest, load-aware master gain — idle hum lifts toward a fuller note on throttle. Kept low on purpose.
  const gain = volume * (0.05 + 0.085 * th + 0.00001 * r)
  master.gain.setTargetAtTime(gain, now, tc)
}

export function setEngineAudioEnabled (on) {
  if (enabled === !!on) return   // called every frame; while off, updateEngineAudio holds the mute
  enabled = !!on
  if (!on && started && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  if (!on) stopCrankAudio()          // FEAT-33: the starter hangs off its own gate, not `master`
}

export function setEngineAudioVolume (v) {
  const next = Math.min(1, Math.max(0, v))
  if (next === volume) return    // called every frame; the voices re-read it on their next update
  volume = next
}

/**
 * Page-level mute for a backgrounded tab. Suspends/resumes the ONE shared AudioContext, so this
 * silences engine + tire + wind together (they all hang their master gain off this ctx) and also
 * parks the audio thread — strictly better than ramping gains to zero, which leaves the graph
 * running. Called from main.js on blur/focus/visibilitychange.
 *
 * Why suspend and not "let the gains settle": rAF is throttled to ~1 Hz in a background tab, so
 * update*Audio() effectively stops being called and every gain FREEZES at its last value. A tab
 * backgrounded mid-throttle would otherwise drone at that RPM indefinitely.
 *
 * `pageActive` also gates the opportunistic ctx.resume() in getAudioContext()/ensureEngineAudio(),
 * so a stray call while inactive can't un-mute the page behind this function's back.
 */
export function setAudioPageActive (on) {
  pageActive = !!on
  if (!ctx) return                                  // no gesture yet — nothing to suspend
  if (pageActive) { if (ctx.state === 'suspended') ctx.resume() }
  else if (ctx.state === 'running') ctx.suspend()
}

// ── FEAT-120: baked engine loops ─────────────────────────────────────────────────────────────────
//
// engine-sim renders per engine (assets/audio/src/engine/NOTES.md): 8–9 rpm rows × 3 loads (off /
// part 0.30 / full throttle), each a seamless loop at a dyno-held rpm. Every loaded loop runs for the
// life of the page; each frame only re-targets gains and playbackRates (no per-frame node creation). The two rows
// bracketing the rpm and the two loads bracketing the throttle get weight, everything else sits at 0.
// playbackRate = rpm / rpmMeasured pitch-shifts each loop to the live rpm.
//
// The loops are DRY (no exhaust). The chain after the mix is the exhaust, game-side so parts can swap
// without a re-bake:
//   loops → muffler (ConvolverNode — WebAudio's convolution node, loaded with engine-sim's own stock
//   IR, proven to reproduce the sim's stock sound exactly) ─┬─ cabin ───────────────────────┬─ trim → out
//                                                          └─ exterior (shelves + ground) ─┘
// No air-noise stage. engine-sim's V knob only noise-modulates the 0.99·f half of its signal, and the
// dry signal is dominated by the OTHER half, 0.01·f′ (f′ = df/dt, so it is ×441 per sample-step).
// The 2026-10-18 first build multiplied the WHOLE loop by noise and turned the engine into hiss.
// Measured since: dry ⊛ IR alone matches the V 1.0 stock references within ±1 dB in every octave
// band 63 Hz–8 kHz, at 750 off, 2340 part and 4140 full.

// LISTENER: the stock IR is a steep low-pass (+40 dB at 80–160 Hz, −50 dB at the top), which is
// what a body shell does — panels lose ~6 dB/octave more with frequency (the mass law) and the cabin
// booms. So the plain muffler output IS the cabin (hood cam). An outside camera hears the tailpipe
// direct: a high shelf (a filter lifting everything above its corner) gives back the top the body
// took, a low shelf takes out the boom, and the road adds one reflection — pipe 0.4 m up, camera
// 1.8 m up and 6 m back is a 0.2 m longer path, 0.6 ms late, first comb notch near 850 Hz. The two
// paths are copies of one signal (correlated), so they crossfade linearly, not equal-power.
// ponytail: chase/freecam get the fixed 6 m chase geometry; no distance falloff or panning yet —
// add a PannerNode (WebAudio's 3D positioner) when an orbiting or far freecam needs it.

// LOUDNESS: the real range is ~55 dB from 750 off to 5500 full, so idle is inaudible beside WOT.
// `dynamics` (0..1) lifts each loop by dynamics × (its distance below the loudest loop, in dB),
// from the manifest's peakDbfs: 0 = the sim's true levels, 1 = every loop equally loud.
// ponytail: a static per-loop lift, not a compressor; swap in a DynamicsCompressorNode if the
// static curve can't follow load changes well enough.

const BAKE_DIR = 'assets/audio/engine/'
const LOADS = ['off', 'part', 'full']
const PART_THROTTLE = 0.30          // the throttle the 'part' loops were rendered at
const MUFFLER_GAIN_DB = 35          // the stock IR lifts the loudest dry loop by ~+34 dB (measured)
// Per-engine output trim [dB], on top of MUFFLER_GAIN_DB: puts each engine's worst-case peak at the
// speakers near −2 dBFS at the default Engine Volume 0.5. Measured offline by replaying updateBake's
// mix (lift 0.55) through the stock IR over rpm 750 → limiter × throttle 0.6 / 1.0, two random loop
// phases each: the Duratec peaked +7.2 dBFS (4350 rpm) and clipped audibly; the Vulcan +0.6 (3250).
// The I4 runs hot because its firing frequency (2/rev) sits on the IR's 80–160 Hz peak from
// 2400–4800 rpm, where the V6's (3/rev) has already climbed past it. Re-measure after a re-bake or
// a muffler change.
const ENGINE_TRIM_DB = { vulcan30: -2.5, duratec23: -9 }
const EXTERIOR_TRIM_DB = -3.5       // the exterior path peaks ~2–3 dB hotter at +15/−12 (mostly the in-phase reflection)
const GROUND_DELAY_S = 0.0006       // reflected − direct path, 0.2 m / 343 m/s
const GROUND_GAIN = 0.7             // ~−3 dB: asphalt reflects most of it, the longer path spreads a little more

// One sample set per engine, each from its own assets/audio/engine/manifest-<engine>.json, fetched the
// first time that engine is asked for. All of them feed the ONE exhaust chain below; a swapped-out
// engine's voices sit at gain 0. An engine with no manifest (404) stays null and keeps the drone.
const bakes = {}          // engine → null (none / loading) | { loudest, rows: [{ rpm, voices: [voice × 3] }], crank: voice|null }
let activeEngine = null
let muffler = null        // ConvolverNode — every engine's voices connect here
let bakeTrim = null       // GainNode — per-engine trim (ENGINE_TRIM_DB), ahead of the compressor
let comp = null           // DynamicsCompressorNode — the mild engine compressor (COMPRESSOR below)
let compRatio = 2
const COMP_THRESHOLD_DB = -14
// The makeup gain WebAudio's compressor adds [dB]: 0.6 × the curve's cut at 0 dBFS, T·(1 − 1/ratio)
// (the knee ends below 0 dBFS, so the plain ratio line applies there).
const compMakeupDb = () => -0.6 * COMP_THRESHOLD_DB * (1 - 1 / compRatio)
let bakeOut = null        // GainNode — the sampled engine's output, gated by enabled/volume
let dynamics = 0.5
let exterior = true, extBrightDb = 15, extBoomDb = -6
let cabin = null, outside = null, hiShelf = null, loShelf = null   // the listener split (LISTENER above)

async function ensureExhaust () {
  if (muffler) return
  const ir = await ctx.decodeAudioData(await (await fetch(BAKE_DIR + 'muffler-stock.flac')).arrayBuffer())
  if (muffler) return
  // COMPRESSOR (owner, 2026-10-19): mild, on every engine, between the trim and the volume so the
  // Engine Volume slider doesn't change how hard it works. 2:1 above COMP_THRESHOLD_DB, which sits
  // between idle (~−30 dB here) and wide-open throttle (~−6 dB rms on the I4, ~−10 on the V6), so it
  // only acts on the loud end: measured ~−4 dB on the I4 near redline, ~−2 on the V6. The attack
  // (20 ms) and release (300 ms) are slower than one idle firing pulse (27 ms on the V6), so it rides
  // the level instead of pumping on each pulse. WebAudio's compressor ALWAYS adds makeup gain, by
  // spec (1 / its gain at 0 dBFS)^0.6; at 2:1 above −24 dB that lifted the I4 idle 9 dB. bakeOut
  // divides it back out (compMakeupDb), so idle is untouched. Ratio 1 = bypass.
  bakeTrim = ctx.createGain()
  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = COMP_THRESHOLD_DB
  comp.knee.value = 6
  comp.ratio.value = compRatio
  comp.attack.value = 0.02
  comp.release.value = 0.3
  bakeOut = ctx.createGain()
  bakeOut.gain.value = 0
  bakeTrim.connect(comp)
  comp.connect(bakeOut)
  // Safety limiter: idle below −3 dBFS, so at the default volume (trimmed above) it never acts; it
  // only catches an Engine Volume turned up past 0.5, where the output would otherwise clip.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.1
  bakeOut.connect(limiter)
  limiter.connect(ctx.destination)
  muffler = ctx.createConvolver()
  muffler.normalize = false         // engine-sim applies the IR raw; normalising would re-level it
  muffler.buffer = ir
  cabin = ctx.createGain()
  muffler.connect(cabin)
  cabin.connect(bakeTrim)
  hiShelf = ctx.createBiquadFilter()
  hiShelf.type = 'highshelf'
  hiShelf.frequency.value = 800
  loShelf = ctx.createBiquadFilter()
  loShelf.type = 'lowshelf'
  loShelf.frequency.value = 120
  const ground = ctx.createDelay(0.01)
  ground.delayTime.value = GROUND_DELAY_S
  const groundGain = ctx.createGain()
  groundGain.gain.value = GROUND_GAIN
  outside = ctx.createGain()
  muffler.connect(hiShelf)
  hiShelf.connect(loShelf)
  loShelf.connect(outside)
  loShelf.connect(ground)
  ground.connect(groundGain)
  groundGain.connect(outside)
  outside.connect(bakeTrim)
}

/**
 * Load one engine's loops. The grid is rpm rows × LOADS. Two extra takes, when the manifest has them:
 * - `idle`: the free (or balanced) idle replaces the off voice of the row nearest its rpm. The dyno
 *   holding 750 at closed throttle is motoring a little, not idling; the idle take is the real thing.
 * - `crank`: the engine dragged round unfired at the game's cranking speed (~200 rpm, the take whose
 *   rpm is lowest — the `crank500` takes are the old 500 rpm starter). It plays while cranking.
 */
async function loadBake (engine) {
  bakes[engine] = null
  try {
    const res = await fetch(BAKE_DIR + 'manifest-' + engine + '.json')
    if (!res.ok) return
    const manifest = await res.json()
    await ensureExhaust()
    const decode = async f => ctx.decodeAudioData(await (await fetch(BAKE_DIR + f)).arrayBuffer())
    const grid = manifest.loops.filter(l => LOADS.includes(l.load))
    const idle = manifest.loops.find(l => l.load === 'idle')
    const crank = manifest.loops.filter(l => l.load === 'crank').sort((x, y) => x.rpmMeasured - y.rpmMeasured)[0]
    const extra = [idle, crank].filter(Boolean)
    const bufs = await Promise.all([...grid, ...extra].map(l => decode(l.file)))

    const voice = (l, buf) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(gain)
      gain.connect(muffler)
      src.start(0, Math.random() * buf.duration)
      return { src, gain, rpmMeasured: l.rpmMeasured, peakDbfs: l.peakDbfs }
    }
    const rows = new Map()
    grid.forEach((l, i) => {
      if (!rows.has(l.rpmTarget)) rows.set(l.rpmTarget, { rpm: l.rpmTarget, voices: [] })
      rows.get(l.rpmTarget).voices[LOADS.indexOf(l.load)] = voice(l, bufs[i])
    })
    const sorted = [...rows.values()].sort((x, y) => x.rpm - y.rpm)
    if (idle) {
      const row = sorted.reduce((best, r) => Math.abs(r.rpm - idle.rpmMeasured) < Math.abs(best.rpm - idle.rpmMeasured) ? r : best)
      row.voices[0].src.stop()
      row.voices[0] = voice(idle, bufs[grid.length])
    }
    bakes[engine] = { trimDb: ENGINE_TRIM_DB[engine] ?? 0, rows: sorted, crank: crank ? voice(crank, bufs[bufs.length - 1]) : null,
                      loudest: Math.max(...grid.map(l => l.peakDbfs)) }
  } catch (e) {
    console.warn('[engine-audio] baked loops for ' + engine + ' failed to load; keeping the drone', e)
  }
}

function silence (bake, now) {
  for (const row of bake.rows) for (const v of row.voices) v.gain.gain.setTargetAtTime(0, now, 0.05)
  if (bake.crank) bake.crank.gain.gain.setTargetAtTime(0, now, 0.05)
}

/**
 * `on`: combustion (RUNNING and not stumbling). `cranking`: the starter is turning a dead engine —
 * the crank take plays instead of the grid. Off and not cranking fades everything out.
 */
function updateBake (bake, rpm, throttle, on, cranking, now) {
  const tc = 0.05
  const lift = v => Math.pow(10, dynamics * (bake.loudest - v.peakDbfs) / 20)
  if (bake.crank) {
    bake.crank.gain.gain.setTargetAtTime(cranking ? lift(bake.crank) : 0, now, 0.04)
    if (cranking) bake.crank.src.playbackRate.setTargetAtTime(Math.max(CRANK_SOUND_FLOOR_RPM, rpm) / bake.crank.rpmMeasured, now, 0.02)
  }
  if (!on) {
    for (const row of bake.rows) for (const v of row.voices) v.gain.gain.setTargetAtTime(0, now, 0.12)   // same fade-out as the drone
  } else {
    const rows = bake.rows
    const r = Math.max(rows[0].rpm * 0.5, rpm || rows[0].rpm)
    // Row weights: linear in log-rpm between the two bracketing rows (the grid is geometric).
    let j = 0
    while (j < rows.length - 2 && r > rows[j + 1].rpm) j++
    const wr = Math.min(1, Math.max(0, Math.log(r / rows[j].rpm) / Math.log(rows[j + 1].rpm / rows[j].rpm)))
    // Load weights: off ↔ part over 0..PART_THROTTLE, part ↔ full above it.
    const t = Math.min(1, Math.max(0, throttle || 0))
    const wl = t <= PART_THROTTLE ? [1 - t / PART_THROTTLE, t / PART_THROTTLE, 0]
                                  : [0, (1 - t) / (1 - PART_THROTTLE), (t - PART_THROTTLE) / (1 - PART_THROTTLE)]
    rows.forEach((row, i) => {
      const w = i === j ? 1 - wr : i === j + 1 ? wr : 0
      row.voices.forEach((v, l) => {
        // sqrt: equal-power crossfade — the loops are uncorrelated, so their powers add, not amplitudes.
        v.gain.gain.setTargetAtTime(Math.sqrt(w * wl[l]) * lift(v), now, tc)
        v.src.playbackRate.setTargetAtTime(r / v.rpmMeasured, now, tc)
      })
    })
  }

  const x = exterior ? 1 : 0
  cabin.gain.setTargetAtTime(1 - x, now, 0.08)
  outside.gain.setTargetAtTime(x * Math.pow(10, EXTERIOR_TRIM_DB / 20), now, 0.08)
  hiShelf.gain.setTargetAtTime(extBrightDb, now, tc)
  loShelf.gain.setTargetAtTime(extBoomDb, now, tc)
  // Trim: undo the muffler's lift, plus the per-engine headroom trim.
  bakeTrim.gain.setTargetAtTime(Math.pow(10, (bake.trimDb - MUFFLER_GAIN_DB) / 20), now, tc)
  comp.ratio.setTargetAtTime(compRatio, now, tc)
  bakeOut.gain.setTargetAtTime(enabled ? volume * Math.pow(10, -compMakeupDb() / 20) : 0, now, tc)
}

/**
 * FEAT-120 sliders + listener. `dyn` 0..1 loudness flattening (LOUDNESS above); `outside` true for any
 * camera outside the cab; `brightDb` / `boomDb` the exterior high-shelf (800 Hz) and low-shelf (120 Hz)
 * gains (LISTENER above); `starter` the starter-motor recording's level (STARTER below); `ratio` the
 * engine compressor's ratio (COMPRESSOR above, 1 = off).
 */
export function setEngineAudioTuning (dyn, outside, brightDb, boomDb, starter = STARTER_LEVEL, ratio = 2) {
  dynamics = Math.min(1, Math.max(0, dyn))
  exterior = !!outside
  extBrightDb = brightDb
  extBoomDb = boomDb
  starterLevel = starter
  compRatio = Math.max(1, ratio)
}


// ── FEAT-33 / FEAT-120: starter, catch and shutoff ───────────────────────────────────────────────
//
// STARTER: two recorded layers. The ENGINE being dragged over compression is the engine-sim crank take
// (updateBake above, through the exhaust like every other loop). The STARTER MOTOR itself — whine,
// pinion on the ring gear — is a recording: Freesound #520773 "Car not starting" by Ika.Komura, CC0
// (assets/audio/CREDITS.md), cut to a 33-pulse loop of its steady crank. Four synthesized starter
// voices were tried and rejected by the owner (FEAT-120 ticket); don't re-propose them.
//
// Its donor cranks at ~136 rpm (4.55 Hz compression pulses, most likely a four-cylinder). It plays
// at playbackRate = rpm / STARTER_REF_RPM, so it sounds as recorded at the game's nominal crank and
// tracks the live crank speed around that. ponytail: the donor's own chug rides along at its own
// rhythm; if it fights the engine-sim chug on the V6, key the rate to pulse rate instead.
// main.js hands in the STARTER's speed, not the engine's: past starterFreeRPM the overrunning clutch
// lets go, so grinding a running engine stays at the starter's free speed.
//
// The solenoid and pinion clicks stay synthesized (short filtered noise bursts). Catch and shutoff
// are one-shot voices that create, ramp and dispose.

const STARTER_FILE = 'starter-520773.flac'
const STARTER_REF_RPM = 200   // crank rpm at which the starter loop plays at its recorded speed
const STARTER_LEVEL = 0.35    // default starter-motor level, before the user volume scale
// Both crank layers play no slower than this. The crank spins up from 0 in the first ~100 ms, and
// following it down there slows the recordings to a growl (owner, 2026-10-19). A settled crank
// rides 124–251 rpm cold / 155–268 warm, so the floor only shaves the deepest cold troughs.
// ponytail: a flat floor; ramp it in over the spin-up instead if the trough flattening is audible.
const CRANK_SOUND_FLOOR_RPM = 150

let starterGain = null   // GainNode — the starter loop's on/off gate; its source runs for the life of the page
let starterSrc = null
let starterLevel = STARTER_LEVEL
let crankOn = false      // level state, so the per-frame calls from main.js are idempotent

async function ensureStarter () {
  if (starterGain || !getAudioContext()) return
  starterGain = ctx.createGain()
  starterGain.gain.value = 0
  starterGain.connect(ctx.destination)
  try {
    const buf = await ctx.decodeAudioData(await (await fetch(BAKE_DIR + STARTER_FILE)).arrayBuffer())
    starterSrc = ctx.createBufferSource()
    starterSrc.buffer = buf
    starterSrc.loop = true
    starterSrc.connect(starterGain)
    starterSrc.start(0, Math.random() * buf.duration)
  } catch (e) {
    console.warn('[engine-audio] starter recording failed to load; the starter is clicks only', e)
  }
}

/**
 * Starter engaged — LEVEL, not an edge: main.js calls this every frame the key is held at START,
 * including after the engine has caught (you really can keep grinding the starter against a running
 * engine, and holding the key is how the player decides when to stop). Idempotent.
 * @param {number} rpm - the starter's speed in crank rpm (main.js caps it at starterFreeRPM)
 */
export function startCrankAudio (rpm = STARTER_REF_RPM) {
  if (!enabled) return
  ensureStarter()
  if (!starterGain) return
  if (starterSrc) starterSrc.playbackRate.setTargetAtTime(Math.max(CRANK_SOUND_FLOOR_RPM, rpm) / STARTER_REF_RPM, ctx.currentTime, 0.02)
  starterGain.gain.setTargetAtTime(volume * starterLevel, ctx.currentTime, 0.02)
  if (crankOn) return
  crankOn = true
  // FEAT-120: the solenoid clicks and the pinion slams into mesh.
  _noiseHit(0, 0.012, 'highpass', 2500, 0.7, 0.30)
  _noiseHit(0.03, 0.08, 'lowpass', 380, 1.2, 0.75)
}

/** Key released off START (whether it caught or not). Idempotent. */
export function stopCrankAudio () {
  if (!crankOn) return
  crankOn = false
  if (starterGain && ctx) starterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
  if (enabled && ctx) _noiseHit(0, 0.035, 'bandpass', 1500, 1.5, 0.30)   // FEAT-120: the pinion throws out
}


/** A filtered noise burst `at` s from now: the raw material for the starter's clicks. */
function _noiseHit (at, dur, type, freq, Q, peak) {
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = whiteNoiseBuffer(ctx, dur + 0.02)
  const f = ctx.createBiquadFilter()
  f.type = type; f.frequency.value = freq; f.Q.value = Q
  const g = ctx.createGain()
  g.gain.setValueAtTime(volume * peak, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f); f.connect(g); g.connect(ctx.destination)
  src.start(t); src.stop(t + dur + 0.02)
}

/**
 * One-shot voice: a lowpassed sawtooth sweeping f0 → f1 over `dur` with a percussive envelope.
 * Nodes are stopped and left for GC — WebAudio tears down a stopped source's graph on its own.
 */
function _blip (f0, f1, dur, peak, cutoff) {
  if (!enabled || !getAudioContext()) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f0, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur)
  const lpB = ctx.createBiquadFilter()
  lpB.type = 'lowpass'
  lpB.frequency.value = cutoff
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * peak), now + dur * 0.18)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(lpB); lpB.connect(g); g.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

/**
 * The engine catches. Its OWN sound, and deliberately loud enough to cut through the starter —
 * the crank keeps grinding underneath if the driver is still holding the key, so the catch has to
 * be what tells them they can let go. The idle drone fades in behind it on its own.
 */
export function playCatchAudio () {
  _blip(38, 96, 0.42, 0.46, 2400)   // cranking firing rate → up past idle
}

/** Key cut: a short low thump under the drone's own fade-out. */
export function playShutoffAudio () {
  _blip(70, 30, 0.28, 0.22, 700)
}

/**
 * FEAT-50: the low-fuel sputter — one stumble. A short low pop, louder the deeper it goes (`depth`
 * 0..1, the torque it took); the drone dropping out underneath is main.js passing firing=false to
 * updateEngineAudio for the stumble's length.
 */
export function playSputterPop (depth = 0.7) {
  _blip(55, 28, 0.14, 0.18 + 0.2 * depth, 500)
}

/**
 * src/engine-audio.js — FEAT-23: a deliberately simple WebAudio engine drone tied to engine RPM.
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
}

/**
 * Per-frame update: map engine RPM → fundamental, open the filter with revs/throttle, and set volume.
 * Ramps every param with setTargetAtTime (~50 ms) so nothing zippers.
 */
export function updateEngineAudio (rpm, throttle, firing = true) {
  if (!started || !ctx) return
  const now = ctx.currentTime
  const tc = 0.05

  if (!enabled) { master.gain.setTargetAtTime(0, now, tc); return }

  // FEAT-33: `firing` is false whenever the ignition is not RUNNING. This drone models COMBUSTION,
  // so it has to go silent for a dead engine — including the case that would otherwise sound worst,
  // an off-key coast at speed where the driveline is dragging the engine round at 1300 rpm and the
  // stack would happily drone as if the truck were still running. Kept as a fade, not a cut, so
  // shutting the key off at idle dies away instead of clicking.
  if (!firing) { master.gain.setTargetAtTime(0, now, 0.12); return }

  const r = Math.max(RPM_MIN, rpm || RPM_MIN)
  const f0 = Math.max(F_MIN, (r / 60) * 3)      // V6 firing fundamental
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
  enabled = !!on
  if (!on && started && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  if (!on) stopCrankAudio()          // FEAT-33: the starter hangs off its own gate, not `master`
}

export function setEngineAudioVolume (v) {
  volume = Math.min(1, Math.max(0, v))
  // The drone re-reads `volume` every frame; the crank loop is a level set once when it starts, so
  // it has to be told about a mid-crank volume change or the slider appears not to work.
  if (crankOn && crankGain && ctx) crankGain.gain.setTargetAtTime(volume * CRANK_LEVEL, ctx.currentTime, 0.05)
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

// ── FEAT-33: starter, catch and shutoff ──────────────────────────────────────────────────────────
//
// Same philosophy as the drone above — no samples, just a small graph that reads as the right
// mechanical event. The crank is a LOOP gated by its own gain node; catch and shutoff are one-shot
// voices that create, ramp and dispose.
//
// The crank is built on NOISE, not oscillators. A starter is Bendix teeth skidding on a ring gear
// and an engine being dragged over compression — broadband scraping, not a pitch. An earlier
// oscillator version read as a beep for exactly that reason. So: one white-noise source split two
// ways — a bandpass around 1.5 kHz for the teeth, a lowpass under 240 Hz for the barrel-roll of
// compression — each amplitude-modulated at its own rate (fast clatter, slow chug). The only tone
// left is a weak sawtooth for the motor itself, buried under the noise.
//
// AMPLITUDE MODULATION in WebAudio: connect an LFO oscillator to a GainNode's .gain param and its
// output is ADDED to that param's current value. So base 0.22 with a ±0.18 LFO swings the gain
// between 0.04 and 0.40 — that swing IS the chug.

let crankGain = null     // GainNode — the crank loop's on/off gate. Its sources run for the life of
                         // the page behind this gate; starting/stopping is a gain ramp.
let crankOn = false      // level state, so the per-frame calls from main.js are idempotent

const TOOTH_HZ = 33      // ring-gear teeth clattering past
const CHUG_HZ = 12       // ~250 rpm × 3 firings/rev ÷ 60 — the compression beat
const MOTOR_HZ = 88      // the starter motor's own (weak, mostly masked) pitch
const CRANK_LEVEL = 0.34 // crank loop gain, before the user volume scale

/** A couple of seconds of white noise to loop — the raw material for the grind. */
function noiseBuffer (seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function ensureCrankGraph () {
  if (crankGain || !getAudioContext()) return
  const out = ctx.createBiquadFilter()      // final tame — keeps the noise from turning into hiss
  out.type = 'lowpass'
  out.frequency.value = 2600
  out.Q.value = 0.7

  crankGain = ctx.createGain()
  crankGain.gain.value = 0
  out.connect(crankGain)
  crankGain.connect(ctx.destination)

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer()
  noise.loop = true

  // Modulated branch helper: noise → filter → gain, with an LFO swinging that gain.
  const branch = (type, freq, Q, base, lfoHz, depth) => {
    const f = ctx.createBiquadFilter()
    f.type = type; f.frequency.value = freq; f.Q.value = Q
    const g = ctx.createGain()
    g.gain.value = base
    noise.connect(f); f.connect(g); g.connect(out)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = lfoHz
    const amt = ctx.createGain()
    amt.gain.value = depth
    lfo.connect(amt); amt.connect(g.gain); lfo.start()
  }
  branch('bandpass', 1500, 1.0, 0.22, TOOTH_HZ, 0.18)   // teeth on the flywheel
  branch('lowpass', 240, 0.9, 0.55, CHUG_HZ, 0.45)      // dragging it over compression
  noise.start()

  const motor = ctx.createOscillator()
  motor.type = 'sawtooth'
  motor.frequency.value = MOTOR_HZ
  const mg = ctx.createGain()
  mg.gain.value = 0.07
  motor.connect(mg); mg.connect(out); motor.start()
}

/**
 * Starter engaged — LEVEL, not an edge: main.js calls this every frame the key is held at START,
 * including after the engine has caught (you really can keep grinding the starter against a running
 * engine, and holding the key is how the player decides when to stop). Idempotent.
 */
export function startCrankAudio () {
  if (!enabled || crankOn) return
  ensureCrankGraph()
  if (!crankGain) return
  crankOn = true
  crankGain.gain.setTargetAtTime(volume * CRANK_LEVEL, ctx.currentTime, 0.02)
}

/** Key released off START (whether it caught or not). Idempotent. */
export function stopCrankAudio () {
  if (!crankOn) return
  crankOn = false
  if (crankGain && ctx) crankGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
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

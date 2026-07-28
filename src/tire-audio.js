/**
 * src/tire-audio.js — procedural tyre audio: slip (screech / dirt tear) + rolling road noise.
 *
 * Always-running generators whose gains are driven by per-wheel state; nothing is ever created or
 * stopped per frame (see QUALITY notes below) — we only modulate AudioParams.
 *
 * TWO FAMILIES. The SLIP voices below need the tyre to be sliding. The ROLLING voices need only
 * contact and road speed, and are what you hear cruising: a blacktop engine (low body + tread-block
 * impacts, its own chain) and a dirt engine that is literally the wheelspin roar turned down — see
 * the ROLL_ and ROAD_ constants. Rolling level is computed PER WHEEL (load × the surface under that wheel, averaged),
 * so straddling the shoulder splits the level across the two engines instead of flipping between
 * them. Airspeed-driven wind noise is a separate module: src/wind-audio.js.
 *
 *  1) SCREECH (asphalt): tyre squeal is STICK-SLIP oscillation — the tread block grips, deflects,
 *     releases and snaps back at an audible rate, the same physics family as a bowed string. So it
 *     is a TONAL sound: one pitched note ~600-1300 Hz with harmonically related partials, not a
 *     dissonant clash. We build f0 (triangle) + 2·f0 + 3·f0 so they FUSE into a single squeal, then
 *     sell it with the two things that make real squeal recognisable: the pitch is never steady
 *     (vibrato LFO + a slow random wander → the waver/chirp) and the amplitude judders fast and
 *     irregularly (~28 Hz AM). Pitch rises with slip and drops slightly under load. A resonant
 *     bandpass gives it a body/formant; a lowpass keeps it from getting shrill.
 *  2) DIRT (loose surface): looped brown noise (white through a leaky integrator, normalized) →
 *     lowpass whose cutoff opens with slip = a low roar that gets angrier, plus a quiet bandpassed
 *     white-noise "spray" layer for thrown-gravel texture.
 *
 * GATING: per-wheel combined slip |(vLong, vLat)| is silent below SLIP_FLOOR and ramps (smoothstep)
 * to full at SLIP_MAX, weighted by wheel load, and split by a paved weight per wheel — a wheel half
 * on the shoulder feeds both generators. Every param moves via setTargetAtTime so nothing clicks.
 *
 * NOTE: wheelDebug[i].sa is friction-circle-CLAMPED at ≈0.06 (BUG-20 break-away clamp) and is NOT a
 * slip magnitude — vLong/vLat are the real contact-patch slip speeds. Same gotcha as smoke.js:291.
 *
 * Shares the AudioContext with engine-audio.js (getAudioContext) but keeps its own master gain
 * straight into ctx.destination, so tire volume is independent of engine volume.
 */

import { getAudioContext } from './engine-audio.js'

// ── Gating constants (user spec) ──────────────────────────────────────────────────────────
const SLIP_FLOOR = 4.0     // m/s — combined slip below this is silent
const SLIP_MAX   = 12.0    // m/s — combined slip at/above this is full volume
const FN_MIN     = 50      // N — normal force below this ⇒ wheel airborne (fn is 0 in the air)
// Per-wheel load → volume weight, shared by EVERY voice (slip and rolling, both surfaces). Was a
// plain min(1, fn/fzRef): linear, and clamped at the static load so weight transfer could only ever
// make a wheel quieter, never louder. Now it curves and is allowed past 1, so a compressed tyre
// genuinely shouts and an unloaded one nearly drops out. Normalized at fn = fzRef → exactly 1, so
// the tuned cruise balance is unchanged; only the DYNAMICS around it grow. This is most obvious
// off-road, where the surface is constantly loading and unloading each corner.
const LOAD_EXP   = 1.7     // >1 ⇒ light wheels fade faster, loaded wheels push harder
const LOAD_CAP   = 1.8     // ceiling on that push (landings can spike fn well past static)
const LOAD_REF_G = 9.81    // m/s² — nominal static per-wheel load = mass·g/4
const TC         = 0.06    // s — setTargetAtTime time constant for every modulated param

// ── Screech voicing (stick-slip squeal) ───────────────────────────────────────────────────
const SCREECH_F0     = 750     // Hz — stick-slip fundamental at the slip floor
const SCREECH_F_RISE = 300     // Hz — added at full slip (bigger slip angle ⇒ more aggressive tone)
const SCREECH_F_MIN  = 600     // Hz — clamp: squeal energy lives in ~500-1500 Hz
const SCREECH_F_MAX  = 1300
const SCREECH_LOAD_PULL = 0.10 // heavier tyre ⇒ LOWER pitch; max 10% down at full load
const SCREECH_TILT   = 3800    // Hz — anti-shrill lowpass above the formant
const VIB_HZ         = 7.0     // Hz — pitch-instability LFO (the waver in a real squeal)
const VIB_DEPTH      = 18      // Hz peak deviation on f0 (×2, ×3 on the partials → stays harmonic)
const WANDER_MAX     = 25      // Hz — slow random-walk pitch drift, ± this
const WANDER_STEP    = 3.0     // Hz per frame — random-walk increment
const JUDDER_HZ      = 28      // Hz — amplitude-judder LFO (re-rolled 24-34 Hz as it runs)
const JUDDER_DEPTH   = 0.30    // fraction of current level — depth scales with level, so 0 stays 0

// ── Dirt voicing ──────────────────────────────────────────────────────────────────────────
// The sweep sits deliberately LOW. Opening the cutoff toward ~1.3 kHz made a spinning tyre get
// brighter, which reads as spraying/hissing; a tyre tearing into dirt is a low RIP, so the top of
// the sweep is bass-shifted and the filter is given enough Q to growl at the corner instead.
const DIRT_LP_BASE = 170       // Hz — lowpass cutoff at the slip floor (low roar)
const DIRT_LP_RISE = 520       // Hz — cutoff added at full slip (opens to ~690 Hz, not ~1320)
const DIRT_LP_Q    = 1.2       // resonance at the corner — the growl that keeps the tear defined
const DIRT_SLIP_GAIN = 0.68    // level at full slip. Up from 0.55: a lower cutoff throws away real
                               // energy, so holding the old gain would have made the tear quieter
                               // as well as bassier.
const SPRAY_F      = 1500      // Hz — thrown-grit band. Pulled down with the roar (was 2600, which
                               // now floated above it as a separate bright layer).
const SPRAY_GAIN   = 0.05
const NOISE_SECONDS = 3        // looped buffer length; long enough to hide the loop period

// ── Rolling road noise (no slip required) ─────────────────────────────────────────────────
// Level is per wheel: a wheel only contributes while it is loaded and in contact, and its surface
// is sampled at ITS OWN contact patch — so two wheels on the shoulder and two on tarmac genuinely
// feed the two engines separately, and a wheel in the air contributes nothing.
const ROLL_V_FLOOR = 1.0       // m/s — below this a rolling tyre is silent
const ROLL_V_REF   = 30.0      // m/s (~108 km/h) — speed at which the roll curve reaches 1
const ROLL_EXP     = 1.4       // level = (v/ROLL_V_REF)^this — rolling noise builds faster than linear
// Blacktop engine: its OWN voicing, not a re-tint of the dirt roar, and NOT a noise bed. A tyre on
// tarmac is a series of IMPACTS — each tread block slams the road and the carcass rings — so this is
// built as a low resonant body plus a hard amplitude modulation at the block-passage rate. Two
// deliberate choices carry the weight:
//   · brown noise for BOTH layers, no white anywhere. White noise is flat to 20 kHz and reads as
//     hiss/static however you filter it; brown falls at 6 dB/octave, so what survives is mass.
//   · SLAM is AM'd by a sawtooth at a few impacts per wheel revolution — at a crawl you hear the
//     individual hits, at speed they fuse into a growl. A steady gain cannot do that.
const ROAD_LP_BASE = 90        // Hz — body cutoff at the floor (was 140: still too papery)
const ROAD_LP_RISE = 250       // Hz — added at ROLL_V_REF
const ROAD_SLAM_F    = 135     // Hz — carcass ring the impacts excite
const ROAD_SLAM_RISE = 90      // Hz — added at ROLL_V_REF
const ROAD_SLAM_Q    = 3.0     // resonant: it should ring, not shush
const ROAD_HUM_GAIN  = 0.34    // level of the body bus at full roll, before the user volume
const ROAD_SLAM_GAIN = 0.30    // level of the impact bus
const SLAM_PER_REV   = 3       // impacts per wheel revolution — not a real tread count (that would
                               // land in the hundreds of Hz and buzz); tuned so the rate reads as
                               // repeated slams across the usable speed range
const SLAM_HZ_MIN    = 4       // clamp the AM rate: below this it flutters, above it turns tonal
const SLAM_HZ_MAX    = 60
const SLAM_DEPTH     = 0.85    // fraction of the current level swung by the AM — deep, so the gaps
                               // between impacts are real gaps. Scales WITH level, so 0 stays 0.
// Dirt engine: the SAME brown-noise generator as the wheelspin roar, just turned down — driving on
// dirt and spinning on dirt are the same material making the same noise at different energies.
// It gets its OWN filter tap rather than sharing the slip chain's. It shared it at first, and that
// was wrong: the tear's sweep is deliberately bass-heavy (170 Hz at rest), so rolling — which only
// cracks the cutoff open a little — sat entirely under ~290 Hz and was inaudible on normal speakers
// while metering at the same level as the blacktop bus. Bass-shifting the tear made it worse still.
// Its own band puts rolling gravel where gravel actually lives, and decouples the two voicings so
// tuning the tear can never silence it again.
const ROLL_DIRT_LP_BASE = 320  // Hz — rolling-gravel cutoff at the floor
const ROLL_DIRT_LP_RISE = 780  // Hz — added at full roll (opens to ~1.1 kHz: crunch, not rumble)
const ROLL_DIRT_Q = 1.0
const ROAD_DIRT_GAIN = 0.55    // against the slip layer's DIRT_SLIP_GAIN — still clearly the
                               // "quieter version", now in a band you can actually hear

let ctx = null
let started = false
let enabled = true
let screechVol = 0.5
let dirtVol = 0.3
let roadVol = 0.4

let master = null
// screech chain
let osc1 = null, osc2 = null, osc3 = null   // f0, 2·f0, 3·f0 — one fused squeal note
let screechBp = null                        // resonant body/formant, tracks f0
let breathBp = null                         // noise band, tracks f0
let screechGain = null                      // level (judder LFO sums into this AudioParam)
let judderLfo = null, judderDepth = null
let _wander = 0                             // Hz — smoothed random-walk pitch drift
// dirt chains — same brown-noise source, one tap for the slip tear and one for rolling gravel
let dirtLp = null, dirtGain = null, sprayGain = null
let rollDirtLp = null, rollDirtGain = null
// blacktop rolling chain (its own engine — see ROAD_ constants)
let roadLp = null, roadHumGain = null
let roadSlamBp = null, roadSlamGain = null, slamLfo = null, slamDepth = null

/** Fill an AudioBuffer with brown (1/f²) noise: white through a leaky integrator, peak-normalized. */
function _brownNoise (ac) {
  const n = Math.floor(ac.sampleRate * NOISE_SECONDS)
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0, peak = 1e-6
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    d[i] = last
    if (Math.abs(last) > peak) peak = Math.abs(last)
  }
  const k = 0.95 / peak
  for (let i = 0; i < n; i++) d[i] *= k
  return buf
}

function _whiteNoise (ac) {
  const n = Math.floor(ac.sampleRate * NOISE_SECONDS)
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function _loop (ac, buf) {
  const src = ac.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.start()
  return src
}

/** Build + start the tire-audio graph (idempotent). Must be reached from a user gesture. */
export function ensureTireAudio () {
  if (started) return
  ctx = getAudioContext()
  if (!ctx) return

  master = ctx.createGain()
  master.gain.value = 1
  master.connect(ctx.destination)

  // ── Screech: (f0 + 2f0 + 3f0 + tracked noise band) → resonant body → tilt lowpass → gain ──
  const white = _whiteNoise(ctx)

  screechGain = ctx.createGain()
  screechGain.gain.value = 0
  screechGain.connect(master)

  const tilt = ctx.createBiquadFilter()
  tilt.type = 'lowpass'
  tilt.frequency.value = SCREECH_TILT
  tilt.Q.value = 0.7
  tilt.connect(screechGain)

  screechBp = ctx.createBiquadFilter()     // body/formant — resonant, sits just above f0
  screechBp.type = 'bandpass'
  screechBp.frequency.value = SCREECH_F0 * 1.2
  screechBp.Q.value = 2.5
  screechBp.connect(tilt)

  // Harmonic core. Triangle f0 carries the note; sine partials at exactly 2× and 3× (−8 dB, −14 dB)
  // thicken it without adding a second pitch — they must fuse, not beat.
  osc1 = ctx.createOscillator(); osc1.type = 'triangle'; osc1.frequency.value = SCREECH_F0
  osc2 = ctx.createOscillator(); osc2.type = 'sine';     osc2.frequency.value = SCREECH_F0 * 2
  osc3 = ctx.createOscillator(); osc3.type = 'sine';     osc3.frequency.value = SCREECH_F0 * 3
  const g1 = ctx.createGain(); g1.gain.value = 0.55
  const g2 = ctx.createGain(); g2.gain.value = 0.22     // ≈ −8 dB rel f0
  const g3 = ctx.createGain(); g3.gain.value = 0.11     // ≈ −14 dB rel f0
  osc1.connect(g1); g1.connect(screechBp)
  osc2.connect(g2); g2.connect(screechBp)
  osc3.connect(g3); g3.connect(screechBp)
  osc1.start(); osc2.start(); osc3.start()

  // Pitch instability, half 1: a vibrato LFO summed into each osc's frequency AudioParam. Depths are
  // scaled ×1/×2/×3 so the partials stay locked to the fundamental while it wavers.
  const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = VIB_HZ
  for (const [osc, mult] of [[osc1, 1], [osc2, 2], [osc3, 3]]) {
    const d = ctx.createGain(); d.gain.value = VIB_DEPTH * mult
    vib.connect(d); d.connect(osc.frequency)
  }
  vib.start()

  // Amplitude judder: a fast LFO summed into the level param. judderDepth is set per frame to a
  // fraction of the current level, so silence stays silent (depth 0 ⇒ no offset).
  judderLfo = ctx.createOscillator(); judderLfo.type = 'sine'; judderLfo.frequency.value = JUDDER_HZ
  judderDepth = ctx.createGain(); judderDepth.gain.value = 0
  judderLfo.connect(judderDepth); judderDepth.connect(screechGain.gain)
  judderLfo.start()

  // Breathiness: a quiet noise band that TRACKS f0 — the air/scrub around the tone, mixed ≈ −18 dB.
  breathBp = ctx.createBiquadFilter()
  breathBp.type = 'bandpass'
  breathBp.frequency.value = SCREECH_F0
  breathBp.Q.value = 5
  const breathGain = ctx.createGain(); breathGain.gain.value = 0.07
  _loop(ctx, white).connect(breathBp)
  breathBp.connect(breathGain)
  breathGain.connect(screechBp)

  // ── Dirt: brown noise → lowpass (cutoff tracks slip) → gain; + bandpassed white "spray" ──
  const dirtBrown = _brownNoise(ctx)
  dirtGain = ctx.createGain()
  dirtGain.gain.value = 0
  dirtGain.connect(master)
  dirtLp = ctx.createBiquadFilter()
  dirtLp.type = 'lowpass'
  dirtLp.frequency.value = DIRT_LP_BASE
  dirtLp.Q.value = DIRT_LP_Q
  dirtLp.connect(dirtGain)
  _loop(ctx, dirtBrown).connect(dirtLp)

  // Rolling gravel: the same brown noise, its own (higher, independently swept) lowpass and gain.
  rollDirtGain = ctx.createGain()
  rollDirtGain.gain.value = 0
  rollDirtGain.connect(master)
  rollDirtLp = ctx.createBiquadFilter()
  rollDirtLp.type = 'lowpass'
  rollDirtLp.frequency.value = ROLL_DIRT_LP_BASE
  rollDirtLp.Q.value = ROLL_DIRT_Q
  rollDirtLp.connect(rollDirtGain)
  _loop(ctx, dirtBrown).connect(rollDirtLp)   // same buffer, own source node

  sprayGain = ctx.createGain()
  sprayGain.gain.value = 0
  sprayGain.connect(master)
  const sprayBp = ctx.createBiquadFilter()
  sprayBp.type = 'bandpass'
  sprayBp.frequency.value = SPRAY_F
  sprayBp.Q.value = 0.7
  sprayBp.connect(sprayGain)
  _loop(ctx, white).connect(sprayBp)       // same buffer, own source node — grit on top of the roar

  // ── Blacktop rolling: a low BODY + a resonant IMPACT bus, both off brown noise (no white) ──
  const roadBrown = _brownNoise(ctx)

  roadHumGain = ctx.createGain()
  roadHumGain.gain.value = 0
  roadHumGain.connect(master)
  roadLp = ctx.createBiquadFilter()
  roadLp.type = 'lowpass'
  roadLp.frequency.value = ROAD_LP_BASE
  roadLp.Q.value = 1.4                     // a little resonance = the weight under the impacts
  roadLp.connect(roadHumGain)
  _loop(ctx, roadBrown).connect(roadLp)

  // Impact bus: a resonant band around the carcass ring, hard-AM'd by the block-passage sawtooth.
  // Same LFO-summed-into-the-gain-param trick the screech judder uses — see the note on _muteAll.
  roadSlamGain = ctx.createGain()
  roadSlamGain.gain.value = 0
  roadSlamGain.connect(master)
  roadSlamBp = ctx.createBiquadFilter()
  roadSlamBp.type = 'bandpass'
  roadSlamBp.frequency.value = ROAD_SLAM_F
  roadSlamBp.Q.value = ROAD_SLAM_Q
  roadSlamBp.connect(roadSlamGain)
  _loop(ctx, roadBrown).connect(roadSlamBp)   // same buffer, own source node

  // Sawtooth, not sine: the sharp edge per cycle is the slam. A sine just pumps.
  slamLfo = ctx.createOscillator(); slamLfo.type = 'sawtooth'; slamLfo.frequency.value = SLAM_HZ_MIN
  slamDepth = ctx.createGain(); slamDepth.gain.value = 0
  slamLfo.connect(slamDepth); slamDepth.connect(roadSlamGain.gain)
  slamLfo.start()

  started = true
}

// Rotate a body-local vector by a quaternion without allocating (verbatim pattern from smoke.js).
const _qv = { x: 0, y: 0, z: 0 }
function _rotate (x, y, z, q) {
  const ix = q.w * x + q.y * z - q.z * y
  const iy = q.w * y + q.z * x - q.x * z
  const iz = q.w * z + q.x * y - q.y * x
  const iw = -q.x * x - q.y * y - q.z * z
  _qv.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y
  _qv.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z
  _qv.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
  return _qv
}

/** 0 below floor, 1 above max, smoothstep between — the user-specified slip gate. */
function _slipRamp (slip) {
  const u = (slip - SLIP_FLOOR) / (SLIP_MAX - SLIP_FLOOR)
  if (u <= 0) return 0
  if (u >= 1) return 1
  return u * u * (3 - 2 * u)
}

/**
 * Per-frame update. `pavedFactorAt(x, z)` returns ~0 on asphalt … 1 off-road (the same helper the
 * dust system uses); the paved WEIGHT for screech is 1 − that, so a wheel on the shoulder blends.
 */
export function updateTireAudio (vehicleState, params, pavedFactorAt) {
  if (!started) return          // no-op until the keydown gesture builds the graph (autoplay gate)
  const now = ctx.currentTime

  if (!enabled) { _muteAll(now); return }

  const px = vehicleState.position.x, pz = vehicleState.position.z   // only XZ matters for the road test
  const L = params.wheelbase
  const tF = params.trackFront / 2, tR = params.trackRear / 2
  const hubY = params.wheelRadius - params.cgHeight
  const fzRef = (params.mass * LOAD_REF_G) / 4

  let screechLvl = 0, dirtLvl = 0, maxSlip = 0, fnSum = 0
  let rollPaved = 0, rollLoose = 0                   // rolling noise, summed per wheel then averaged

  for (let i = 0; i < 4; i++) {
    const wd = vehicleState.wheelDebug?.[i]
    if (!wd) continue
    const fn = wd.fn || 0
    if (fn <= FN_MIN) continue                       // airborne ⇒ no contact noise
    fnSum += fn                                      // total tyre load — pulls squeal pitch down

    // Load weight — see LOAD_EXP/LOAD_CAP. Feeds the slip voices AND the rolling voices below.
    const load = Math.min(LOAD_CAP, Math.pow(fn / fzRef, LOAD_EXP))

    // Surface under THIS wheel. Sampled before the slip gate below, because rolling noise exists
    // whether or not the tyre is slipping — this is the only per-wheel term road noise has.
    const isFront = i < 2
    const lx = (i === 0 || i === 2) ? -(isFront ? tF : tR) : (isFront ? tF : tR)
    const lz = isFront ? -(L * params.weightRear) : (L * params.weightFront)
    const r = _rotate(lx, hubY, lz, vehicleState.quaternion)
    const loose = pavedFactorAt ? pavedFactorAt(px + r.x, pz + r.z) : 1   // 1 = dirt, ~0 = asphalt
    const paved = 1 - loose

    // Rolling contribution SUMS across wheels (÷4 below) rather than taking the max the slip voices
    // use: four wheels on tarmac should be louder than one, and straddling the shoulder should
    // genuinely split the level between the two engines.
    rollPaved += load * paved
    rollLoose += load * loose

    const vLong = wd.vLong || 0, vLat = wd.vLat || 0
    const slip = Math.hypot(vLong, vLat)
    const ramp = _slipRamp(slip)
    if (ramp <= 0) continue
    if (slip > maxSlip) maxSlip = slip

    const lvl = ramp * load

    if (lvl * paved > screechLvl) screechLvl = lvl * paved
    if (lvl * loose > dirtLvl) dirtLvl = lvl * loose
  }
  rollPaved *= 0.25
  rollLoose *= 0.25

  // Road speed drives both rolling engines. XZ ground speed (not the 3-D airspeed wind-audio.js
  // uses): what a tyre hears is how fast the contact patch is travelling over the surface.
  const roadSpeed = Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z)
  let ru = (roadSpeed - ROLL_V_FLOOR) / (ROLL_V_REF - ROLL_V_FLOOR)
  if (ru < 0) ru = 0
  else if (ru > 1) ru = 1
  const roll = Math.pow(ru, ROLL_EXP)

  // ── Screech: stick-slip note. Pitch climbs with the worst slipping wheel and is pulled DOWN by
  // total tyre load (a loaded tread block sticks longer ⇒ slower slip cycle). Clamped to the band
  // where real squeal energy lives.
  const t = _slipRamp(maxSlip)
  const loadNorm = fnSum / (params.mass * LOAD_REF_G)              // 1.0 ≈ static weight on 4 wheels
  const pull = 1 - SCREECH_LOAD_PULL * Math.min(1, Math.max(0, (loadNorm - 0.8) / 0.8))

  // Pitch instability, half 2: a slow mean-reverting random walk on top of the vibrato LFO. This is
  // the chirp/waver that stops the squeal reading as a synth tone. setTargetAtTime smooths the steps.
  _wander = _wander * 0.97 + (Math.random() * 2 - 1) * WANDER_STEP
  if (_wander > WANDER_MAX) _wander = WANDER_MAX
  else if (_wander < -WANDER_MAX) _wander = -WANDER_MAX

  let f = (SCREECH_F0 + SCREECH_F_RISE * t) * pull + _wander
  if (f < SCREECH_F_MIN) f = SCREECH_F_MIN
  else if (f > SCREECH_F_MAX) f = SCREECH_F_MAX
  osc1.frequency.setTargetAtTime(f, now, TC)
  osc2.frequency.setTargetAtTime(f * 2, now, TC)
  osc3.frequency.setTargetAtTime(f * 3, now, TC)
  screechBp.frequency.setTargetAtTime(f * 1.2, now, TC)            // formant rides just above f0
  breathBp.frequency.setTargetAtTime(f, now, TC)

  const scLevel = screechVol * 0.26 * screechLvl
  screechGain.gain.setTargetAtTime(scLevel, now, TC)
  judderDepth.gain.setTargetAtTime(JUDDER_DEPTH * scLevel, now, TC) // AM depth follows the level
  // Irregular judder: re-roll the rate a couple of times a second so the tremolo never sounds metered.
  if (Math.random() < 0.03) judderLfo.frequency.setTargetAtTime(24 + Math.random() * 10, now, 0.2)

  // ── Dirt slip: the tear. Low sweep + resonance — see the DIRT_ constants.
  dirtLp.frequency.setTargetAtTime(DIRT_LP_BASE + DIRT_LP_RISE * t, now, TC)
  dirtGain.gain.setTargetAtTime(dirtVol * DIRT_SLIP_GAIN * dirtLvl, now, TC)
  sprayGain.gain.setTargetAtTime(dirtVol * SPRAY_GAIN * dirtLvl * t, now, TC)   // thrown grit: slip only

  // ── Dirt rolling: same generator, own band, swept by road speed rather than slip.
  rollDirtLp.frequency.setTargetAtTime(ROLL_DIRT_LP_BASE + ROLL_DIRT_LP_RISE * roll, now, TC)
  rollDirtGain.gain.setTargetAtTime(roadVol * ROAD_DIRT_GAIN * roll * rollLoose, now, TC)

  // ── Blacktop rolling: low body + tread-block impacts.
  roadLp.frequency.setTargetAtTime(ROAD_LP_BASE + ROAD_LP_RISE * roll, now, TC)
  roadSlamBp.frequency.setTargetAtTime(ROAD_SLAM_F + ROAD_SLAM_RISE * roll, now, TC)
  const pavedRoll = roadVol * roll * rollPaved
  roadHumGain.gain.setTargetAtTime(ROAD_HUM_GAIN * pavedRoll, now, TC)

  // Impact rate rides ACTUAL wheel revolutions (v / 2πr), not the speed ramp — so the slams stay
  // locked to how fast the tyre is turning and slow down honestly as the truck rolls to a stop.
  const rev = roadSpeed / (2 * Math.PI * Math.max(0.1, params.wheelRadius))
  let slamHz = SLAM_PER_REV * rev
  if (slamHz < SLAM_HZ_MIN) slamHz = SLAM_HZ_MIN
  else if (slamHz > SLAM_HZ_MAX) slamHz = SLAM_HZ_MAX
  slamLfo.frequency.setTargetAtTime(slamHz, now, TC)
  const slamLevel = ROAD_SLAM_GAIN * pavedRoll
  roadSlamGain.gain.setTargetAtTime(slamLevel, now, TC)
  slamDepth.gain.setTargetAtTime(SLAM_DEPTH * slamLevel, now, TC)   // AM depth follows the level
}

/** Ramp every voice to silence. judderDepth MUST go to 0 too, or the AM LFO keeps swinging the
 *  screech gain around zero (i.e. it would still be audible at a 0 base level). */
function _muteAll (now) {
  screechGain.gain.setTargetAtTime(0, now, TC)
  judderDepth.gain.setTargetAtTime(0, now, TC)
  dirtGain.gain.setTargetAtTime(0, now, TC)
  sprayGain.gain.setTargetAtTime(0, now, TC)
  rollDirtGain.gain.setTargetAtTime(0, now, TC)
  roadHumGain.gain.setTargetAtTime(0, now, TC)
  roadSlamGain.gain.setTargetAtTime(0, now, TC)
  slamDepth.gain.setTargetAtTime(0, now, TC)   // same rule as judderDepth: a live AM depth would
                                               // keep swinging the impact gain around zero
}

export function setTireAudioEnabled (on) {
  enabled = !!on
  if (!on && started) _muteAll(ctx.currentTime)
}

export function setTireAudioVolumes (screech, dirt, road) {
  screechVol = Math.min(1, Math.max(0, screech ?? 0.5))
  dirtVol = Math.min(1, Math.max(0, dirt ?? 0.3))
  roadVol = Math.min(1, Math.max(0, road ?? 0.4))
}

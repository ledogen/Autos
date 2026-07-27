/**
 * src/tire-audio.js — procedural tire-slip audio: pavement screech + dirt tear.
 *
 * Two always-running generators whose gains are driven by per-wheel slip velocity; nothing is ever
 * created or stopped per frame (see QUALITY notes below) — we only modulate AudioParams.
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
const SLIP_MAX   = 8.0     // m/s — combined slip at/above this is full volume
const FN_MIN     = 50      // N — normal force below this ⇒ wheel airborne (fn is 0 in the air)
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
const DIRT_LP_BASE = 220       // Hz — lowpass cutoff at the slip floor (low roar)
const DIRT_LP_RISE = 1100      // Hz — cutoff added at full slip (tearing/brighter)
const NOISE_SECONDS = 3        // looped buffer length; long enough to hide the loop period

let ctx = null
let started = false
let enabled = true
let screechVol = 0.5
let dirtVol = 0.6

let master = null
// screech chain
let osc1 = null, osc2 = null, osc3 = null   // f0, 2·f0, 3·f0 — one fused squeal note
let screechBp = null                        // resonant body/formant, tracks f0
let breathBp = null                         // noise band, tracks f0
let screechGain = null                      // level (judder LFO sums into this AudioParam)
let judderLfo = null, judderDepth = null
let _wander = 0                             // Hz — smoothed random-walk pitch drift
// dirt chain
let dirtLp = null, dirtGain = null, sprayGain = null

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
  dirtGain = ctx.createGain()
  dirtGain.gain.value = 0
  dirtGain.connect(master)
  dirtLp = ctx.createBiquadFilter()
  dirtLp.type = 'lowpass'
  dirtLp.frequency.value = DIRT_LP_BASE
  dirtLp.Q.value = 0.8
  dirtLp.connect(dirtGain)
  _loop(ctx, _brownNoise(ctx)).connect(dirtLp)

  sprayGain = ctx.createGain()
  sprayGain.gain.value = 0
  sprayGain.connect(master)
  const sprayBp = ctx.createBiquadFilter()
  sprayBp.type = 'bandpass'
  sprayBp.frequency.value = 2600
  sprayBp.Q.value = 0.7
  sprayBp.connect(sprayGain)
  _loop(ctx, white).connect(sprayBp)       // same buffer, own source node — grit on top of the roar

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

  for (let i = 0; i < 4; i++) {
    const wd = vehicleState.wheelDebug?.[i]
    if (!wd) continue
    const fn = wd.fn || 0
    if (fn <= FN_MIN) continue                       // airborne ⇒ no contact noise
    fnSum += fn                                      // total tyre load — pulls squeal pitch down

    const vLong = wd.vLong || 0, vLat = wd.vLat || 0
    const slip = Math.hypot(vLong, vLat)
    const ramp = _slipRamp(slip)
    if (ramp <= 0) continue
    if (slip > maxSlip) maxSlip = slip

    const load = Math.min(1, fn / fzRef)             // load-weighted: a light wheel squeals quietly
    const lvl = ramp * load

    const isFront = i < 2
    const lx = (i === 0 || i === 2) ? -(isFront ? tF : tR) : (isFront ? tF : tR)
    const lz = isFront ? -(L * params.weightRear) : (L * params.weightFront)
    const r = _rotate(lx, hubY, lz, vehicleState.quaternion)
    const loose = pavedFactorAt ? pavedFactorAt(px + r.x, pz + r.z) : 1   // 1 = dirt, ~0 = asphalt
    const paved = 1 - loose

    if (lvl * paved > screechLvl) screechLvl = lvl * paved
    if (lvl * loose > dirtLvl) dirtLvl = lvl * loose
  }

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

  // Dirt opens its lowpass with slip — a dull rumble at the floor, a tearing roar at the top.
  dirtLp.frequency.setTargetAtTime(DIRT_LP_BASE + DIRT_LP_RISE * t, now, TC)
  dirtGain.gain.setTargetAtTime(dirtVol * 0.55 * dirtLvl, now, TC)
  sprayGain.gain.setTargetAtTime(dirtVol * 0.06 * dirtLvl * t, now, TC)
}

/** Ramp every voice to silence. judderDepth MUST go to 0 too, or the AM LFO keeps swinging the
 *  screech gain around zero (i.e. it would still be audible at a 0 base level). */
function _muteAll (now) {
  screechGain.gain.setTargetAtTime(0, now, TC)
  judderDepth.gain.setTargetAtTime(0, now, TC)
  dirtGain.gain.setTargetAtTime(0, now, TC)
  sprayGain.gain.setTargetAtTime(0, now, TC)
}

export function setTireAudioEnabled (on) {
  enabled = !!on
  if (!on && started) _muteAll(ctx.currentTime)
}

export function setTireAudioVolumes (screech, dirt) {
  screechVol = Math.min(1, Math.max(0, screech ?? 0.5))
  dirtVol = Math.min(1, Math.max(0, dirt ?? 0.6))
}

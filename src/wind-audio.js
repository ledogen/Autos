/**
 * src/wind-audio.js — procedural wind noise, driven by airspeed.
 *
 * The aero counterpart to tire-audio.js's road noise: what the cabin hears is turbulence over the
 * body/mirrors/gaps, so it depends on airspeed alone — not on the ground, the surface, or whether
 * the wheels are even down (it keeps howling mid-jump, which is the point).
 *
 * TWO LAYERS, both fed from one looped white-noise buffer:
 *   1) BODY  — lowpass whose cutoff opens with speed: a broad roar that gets brighter, not just
 *      louder. This is the bulk of it.
 *   2) HISS  — a bandpass that sweeps up and comes in on a steeper curve, so the thin whistle over
 *      the mirrors only shows up at speed instead of being audible from a crawl.
 *
 * Level follows (v/WIND_V_REF)^WIND_EXP rather than v — aero noise power climbs far faster than
 * linearly with speed, and a linear ramp reads as a fan that someone is turning up.
 *
 * Nothing is created or stopped per frame: the graph is built once and only AudioParams move, all
 * via setTargetAtTime so nothing clicks. Shares the AudioContext with engine-audio.js but keeps its
 * own master gain straight into ctx.destination, so wind volume is independent of engine/tire.
 */

import { getAudioContext } from './engine-audio.js'

const V_FLOOR   = 4.0    // m/s — below this there is no wind noise at all
const V_REF     = 45.0   // m/s (~160 km/h) — speed at which the level curve reaches 1
const WIND_EXP  = 2.0    // level = (v/V_REF)^this — aero noise is nowhere near linear in speed
const TC        = 0.08   // s — setTargetAtTime time constant (slower than tire audio: gusts, not events)
const NOISE_SECONDS = 3  // looped buffer length; long enough to hide the loop period

// Body layer: broad lowpassed roar.
const BODY_LP_BASE = 260    // Hz — cutoff at the floor
const BODY_LP_RISE = 1900   // Hz — added at V_REF
const BODY_GAIN    = 0.55   // level at full, before the user volume

// Hiss layer: thin band that sweeps up and arrives late (squared on top of the level curve).
const HISS_BP_BASE = 1300   // Hz
const HISS_BP_RISE = 2200   // Hz — added at V_REF
const HISS_Q       = 0.9
const HISS_GAIN    = 0.18

let ctx = null
let started = false
let enabled = true
let volume = 0.4

let master = null
let bodyLp = null, bodyGain = null
let hissBp = null, hissGain = null

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

/** Build + start the wind graph (idempotent). Must be reached from a user gesture. */
export function ensureWindAudio () {
  if (started) return
  ctx = getAudioContext()
  if (!ctx) return

  master = ctx.createGain()
  master.gain.value = 1
  master.connect(ctx.destination)

  const white = _whiteNoise(ctx)

  bodyGain = ctx.createGain()
  bodyGain.gain.value = 0
  bodyGain.connect(master)
  bodyLp = ctx.createBiquadFilter()
  bodyLp.type = 'lowpass'
  bodyLp.frequency.value = BODY_LP_BASE
  bodyLp.Q.value = 0.7
  bodyLp.connect(bodyGain)
  _loop(ctx, white).connect(bodyLp)

  hissGain = ctx.createGain()
  hissGain.gain.value = 0
  hissGain.connect(master)
  hissBp = ctx.createBiquadFilter()
  hissBp.type = 'bandpass'
  hissBp.frequency.value = HISS_BP_BASE
  hissBp.Q.value = HISS_Q
  hissBp.connect(hissGain)
  _loop(ctx, white).connect(hissBp)   // same buffer, own source node — decorrelated by phase

  started = true
}

/**
 * Per-frame update.
 * @param {object} vehicleState  reads velocity only
 */
export function updateWindAudio (vehicleState) {
  if (!started) return          // no-op until the keydown gesture builds the graph (autoplay gate)
  const now = ctx.currentTime

  if (!enabled) { _mute(now); return }

  // Airspeed: full 3-D speed, not the XZ ground speed the tyre systems use — a truck dropping off a
  // jump is still moving through air, and the wind should not dip while it does.
  const v = vehicleState.velocity
  const speed = Math.hypot(v.x, v.y, v.z)

  let u = (speed - V_FLOOR) / (V_REF - V_FLOOR)
  if (u <= 0) { _mute(now); return }
  if (u > 1) u = 1
  const level = Math.pow(u, WIND_EXP)

  bodyLp.frequency.setTargetAtTime(BODY_LP_BASE + BODY_LP_RISE * u, now, TC)
  hissBp.frequency.setTargetAtTime(HISS_BP_BASE + HISS_BP_RISE * u, now, TC)
  bodyGain.gain.setTargetAtTime(volume * BODY_GAIN * level, now, TC)
  // Hiss squared on top of `level`: it should be inaudible at town speed and obvious on the highway.
  hissGain.gain.setTargetAtTime(volume * HISS_GAIN * level * level, now, TC)
}

function _mute (now) {
  bodyGain.gain.setTargetAtTime(0, now, TC)
  hissGain.gain.setTargetAtTime(0, now, TC)
}

export function setWindAudioEnabled (on) {
  enabled = !!on
  if (!on && started) _mute(ctx.currentTime)
}

export function setWindAudioVolume (v) { volume = Math.min(1, Math.max(0, v ?? 0.4)) }

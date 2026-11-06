/**
 * src/contact-audio.js — FEAT-120: the truck's contact one-shots. All synthesized, on the one shared
 * AudioContext and the world bus (engine-audio.js). The owner kept each take on 2026-11-02 ("cheap but
 * acceptable for now"; the squeal QUIET). The prototypes are tools/audio-proto/proto.js.
 *
 *   bump-stop clunk — a strut bottoming on its rubber stop: a low thump 90 → 50 Hz in 40 ms and a
 *                     10 ms metallic click near 2 kHz. One per contact, at its peak force.
 *   landing thud    — after air, once per landing (not per wheel): a kick body 120 → 38 Hz, level
 *                     from the vertical speed at touchdown, then a few suspension-rattle ticks.
 *   brake squeal    — a stop from under 15 km/h on a moderate pedal, on a random share of stops: a
 *                     2–4 kHz sine with a slight vibrato, sagging as the disc slows.
 *
 * stepContactAudio runs on the FIXED physics step (main.js, after the damage step) because the
 * signals it reads — vehicleState.bumpForce and the per-wheel tire loads — are per-step peaks.
 * Every voice creates its nodes per event and lets them stop (one-shots; FEAT-120 allows it).
 */

import { getAudioContext, getWorldBus, whiteNoiseBuffer } from './engine-audio.js'

let enabled = true
let volume = 0.6          // 0..1, the bump stop and the landing
let squealVolume = 0.3    // 0..1, the brake squeal on its own (owner: QUIET)
let noise = null

const BUMP_QUIET_N = 2000     // a bump-stop contact under this peak is silent
const BUMP_FULL_N = 30000     // full clunk at this peak (the damage model's front no-harm floor is 12 kN)
const AIR_MIN_S = 0.25        // all four wheels off this long before a touchdown counts as a landing
const LAND_QUIET_MS = 1       // vertical speed at touchdown [m/s]: silent below …
const LAND_FULL_MS = 8        // … full above
const SQUEAL_MAX_MS = 15 / 3.6   // the squeal only starts under 15 km/h
const SQUEAL_REARM_MS = 6        // a new stop needs the truck back above this first
const SQUEAL_PEDAL = [0.15, 0.7] // moderate pedal: a panic stop does not squeal
const SQUEAL_CHANCE = 0.35       // share of qualifying stops that squeal [DEFAULT]

const bumpPeak = [0, 0, 0, 0]
const bumpState = [0, 0, 0, 0]   // per corner: 0 off the stop · 1 force rising · 2 clunked (until it lets go)
let airS = 0
let squealArmed = true

/** Debug-menu controls, read every frame by main.js. */
export function setContactAudio (on, vol, squealVol) {
  enabled = !!on
  volume = vol
  squealVolume = squealVol
}

const clamp01 = x => Math.max(0, Math.min(1, x))
const jit = pct => 1 + (Math.random() * 2 - 1) * pct     // playback variety: pitch / gain jitter
const live = () => { const c = getAudioContext(false); return enabled && c && c.state === 'running' ? c : null }
function out (ctx, g) { const o = ctx.createGain(); o.gain.value = g; o.connect(getWorldBus()); return o }

/** A sine partial with a near-instant attack and an exponential decay, optionally swept to f1. */
function tone (ctx, dest, t, f, g, decay, f1 = null, sweep = 0) {
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(f, t)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sweep)
  const e = ctx.createGain()
  e.gain.setValueAtTime(0.0001, t)
  e.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.003)
  e.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  o.connect(e); e.connect(dest)
  o.start(t); o.stop(t + decay + 0.02)
}

/** A filtered noise burst with an exponential decay. */
function noiseHit (ctx, dest, t, dur, type, freq, q, g) {
  const s = ctx.createBufferSource()
  s.buffer = (noise ??= whiteNoiseBuffer(ctx, 1))
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
  const e = ctx.createGain()
  e.gain.setValueAtTime(Math.max(0.0002, g), t)
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f); f.connect(e); e.connect(dest)
  s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.01)
}

/** Bump-stop clunk; `s` 0..1 = how hard the strut hit its stop. */
export function playBumpStop (s = 0.6) {
  const ctx = live(); if (!ctx) return
  const t = ctx.currentTime, p = jit(0.06), o = out(ctx, volume * (0.15 + 0.6 * s) * jit(0.15))
  tone(ctx, o, t, 90 * p, 0.8, 0.12, 50 * p, 0.04)
  noiseHit(ctx, o, t, 0.010, 'bandpass', 2000 * p, 2.5, 0.5 * s + 0.1)
}

/** Landing thud; `s` 0..1 = vertical speed at touchdown, normalised. */
export function playLanding (s = 0.6) {
  const ctx = live(); if (!ctx) return
  const t = ctx.currentTime, p = jit(0.05), o = out(ctx, volume * (0.2 + 0.7 * s) * jit(0.15))
  tone(ctx, o, t, 120 * p, 0.9, 0.35, 38 * p, 0.08)
  noiseHit(ctx, o, t, 0.03, 'lowpass', 1200, 0.7, 0.35)
  const n = 2 + Math.round(4 * s)
  for (let i = 0; i < n; i++) {
    const dt = 0.05 + i * (0.035 + Math.random() * 0.03)
    noiseHit(ctx, o, t + dt, 0.02, 'bandpass', 900 + Math.random() * 900, 2, 0.25 * (1 - i / n))
  }
}

/** Brake squeal lasting `dur` seconds (the time left to a standstill). */
export function playBrakeSqueal (dur = 1.2) {
  const ctx = live(); if (!ctx) return
  const t = ctx.currentTime, o = out(ctx, 0.06 * squealVolume)
  const f = 2000 + Math.random() * 2000
  const osc = ctx.createOscillator(); osc.frequency.value = f
  const vib = ctx.createOscillator(); vib.frequency.value = 5.5
  const vg = ctx.createGain(); vg.gain.value = f * 0.006
  vib.connect(vg); vg.connect(osc.frequency)
  osc.frequency.setValueAtTime(f, t); osc.frequency.linearRampToValueAtTime(f * 0.94, t + dur)   // sags as the disc slows
  const e = ctx.createGain()
  e.gain.setValueAtTime(0.0001, t)
  e.gain.exponentialRampToValueAtTime(1, t + 0.03)
  e.gain.setValueAtTime(1, t + dur * 0.6)
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(e); e.connect(o)
  osc.start(t); vib.start(t); osc.stop(t + dur + 0.02); vib.stop(t + dur + 0.02)
}

/**
 * One fixed physics step. `tireFz` = the step's per-wheel tire loads (≤ 0 = that wheel is in the
 * air, physics.js D-14); `speed` = ground speed [m/s].
 */
export function stepContactAudio (vehicleState, tireFz, speed, dt) {
  // Bump stops: ONE clunk per contact, sized by its peak — played the step the force stops rising.
  // A truck settling and bouncing on its stops without letting go does not clunk again.
  // ponytail: a harder hit while still resting on the stop is silent; re-arm on peak × 1.5 if missed.
  const bf = vehicleState.bumpForce
  for (let i = 0; bf && i < 4; i++) {
    const f = bf[i] || 0
    if (f <= 0) { bumpState[i] = 0; bumpPeak[i] = 0; continue }
    if (bumpState[i] === 2) continue
    if (f > bumpPeak[i]) { bumpPeak[i] = f; bumpState[i] = 1; continue }
    bumpState[i] = 2
    if (bumpPeak[i] > BUMP_QUIET_N) playBumpStop(clamp01((bumpPeak[i] - BUMP_QUIET_N) / (BUMP_FULL_N - BUMP_QUIET_N)))
  }

  // Landing: the first wheel back down after AIR_MIN_S with all four off.
  let down = 0
  for (let i = 0; i < 4; i++) if ((tireFz?.[i] || 0) > 0) down++
  if (!down) airS += dt
  else {
    if (airS >= AIR_MIN_S) {
      const vy = -(vehicleState.velocity?.y ?? 0)
      if (vy > LAND_QUIET_MS) playLanding(clamp01((vy - LAND_QUIET_MS) / (LAND_FULL_MS - LAND_QUIET_MS)))
    }
    airS = 0
  }

  // Brake squeal: one roll per stop, as the truck slows through 15 km/h on a moderate pedal.
  const pedal = vehicleState.brake ?? 0
  if (speed > SQUEAL_REARM_MS) squealArmed = true
  else if (squealArmed && down && speed < SQUEAL_MAX_MS && speed > 0.5 && pedal >= SQUEAL_PEDAL[0] && pedal <= SQUEAL_PEDAL[1]) {
    squealArmed = false
    if (Math.random() < SQUEAL_CHANCE) playBrakeSqueal(Math.min(1.5, Math.max(0.4, speed / 3)))
  }
}

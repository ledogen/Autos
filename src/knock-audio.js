/**
 * src/knock-audio.js — FEAT-162 P3: the dying engine, heard. Two sounds, synthesized:
 *
 *   KNOCK  a worn rod bearing: its slack is taken up with a clack once per crank revolution, harder
 *          under load. An impulse train at rpm/60 (a PeriodicWave — the browser's wavetable
 *          oscillator — with every harmonic at equal strength, so each period is one click) rings a
 *          narrow bandpass, which is what makes a click sound like metal. It starts when the engine
 *          drops below KNOCK_FROM and grows as it falls toward 0; throttle hardens it.
 *   BANG   the seize, once: a hard broadband hit with a low thump under it, ~0.5 s.
 *
 * Shares the one AudioContext and the world bus (engine-audio.js). It follows the engine's on/volume
 * (main.js setKnockAudio), since it is the engine's own sound.
 */

import { getAudioContext, getWorldBus, whiteNoiseBuffer } from './engine-audio.js'

export const KNOCK_FROM = 0.2   // [DEFAULT] engine condition below which it knocks — the HUD word's line too
const KNOCK_LEVEL = 0.25        // peak gain at 0 % and full throttle, before the volume
const KNOCK_HZ = 1800           // the ring of the clack
const BANG_LEVEL = 0.6

let osc = null, gain = null, enabled = true, volume = 0.5
let _noise = null

/** Build the knock voice (on the first user gesture, with the other ensure*Audio). Idempotent. */
export function ensureKnockAudio () {
  if (osc) return
  const ctx = getAudioContext()
  if (!ctx) return
  const n = 2048                                   // harmonics: 2048 × the ~10 Hz idle rate still reaches the ring
  const re = new Float32Array(n).fill(1), im = new Float32Array(n)
  re[0] = 0
  osc = ctx.createOscillator()
  osc.setPeriodicWave(ctx.createPeriodicWave(re, im))
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = KNOCK_HZ; bp.Q.value = 6
  gain = ctx.createGain()
  gain.gain.value = 0
  osc.connect(bp); bp.connect(gain); gain.connect(getWorldBus())
  osc.start()
}

export function setKnockAudio (on, vol) { enabled = !!on; volume = vol }

/** Per render frame. `cond` the engine track 0..1, `rpm`, `throttle` 0..1, `running` (turning under its own power). */
export function updateKnockAudio (cond, rpm, throttle, running) {
  if (!osc) return
  const worn = enabled && running && cond < KNOCK_FROM ? 0.25 + 0.75 * (1 - Math.max(0, cond) / KNOCK_FROM) : 0
  const t = osc.context.currentTime
  osc.frequency.setTargetAtTime(Math.max(5, rpm / 60), t, 0.03)
  gain.gain.setTargetAtTime(KNOCK_LEVEL * volume * worn * (0.35 + 0.65 * Math.max(0, throttle)), t, 0.05)
}

/** The seize: a broadband hit and a low thump (80 → 35 Hz), then nothing. Silent unless audio is running. */
export function playSeizeBang () {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || !enabled) return
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = BANG_LEVEL * volume
  out.connect(getWorldBus())

  const hit = ctx.createBufferSource()
  hit.buffer = (_noise ??= whiteNoiseBuffer(ctx, 0.5))
  const hf = ctx.createBiquadFilter()
  hf.type = 'lowpass'; hf.frequency.value = 4000
  const hg = ctx.createGain()
  hg.gain.setValueAtTime(1, t)
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
  hit.connect(hf); hf.connect(hg); hg.connect(out)

  const thump = ctx.createOscillator()
  thump.frequency.setValueAtTime(80, t)
  thump.frequency.exponentialRampToValueAtTime(35, t + 0.3)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(1.2, t)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  thump.connect(tg); tg.connect(out)

  hit.start(t, Math.random() * 0.2); thump.start(t)
  hit.stop(t + 0.3); thump.stop(t + 0.52)
}

/**
 * src/heartbeat-audio.js — FEAT-87: the rank timer's heartbeat, one "lub-dub" per pulse.
 *
 * The rank bar pulses on ONE oscillator whose rate ramps 48 → 120 bpm as a line nears
 * (rank-timer.js pulseHz*). main.js calls playHeartbeat() on the frame that oscillator peaks, so
 * the thump and the glow land together. No samples: each half of the beat is a sine dropping in
 * pitch under a fast percussive envelope, lowpassed — a thud felt more than heard. The "dub"
 * follows the "lub" a fixed DUB_DELAY later, softer and a touch higher, scheduled on the audio
 * clock so it cannot jitter with the frame rate.
 *
 * Shares the one AudioContext (engine-audio.js getAudioContext). Fire-and-forget voices: nodes are
 * stopped and left for GC, as engine-audio.js _blip does.
 */

import { getAudioContext } from './engine-audio.js'

const LUB_F0 = 70, LUB_F1 = 38, LUB_DUR = 0.16   // Hz, Hz, s — the first, heavier thump
const DUB_F0 = 82, DUB_F1 = 46, DUB_DUR = 0.13   // …the second, lighter one
const DUB_DELAY = 0.15   // s — lub → dub. Fits inside the shortest period (0.5 s at 120 bpm).
const DUB_LEVEL = 0.65   // dub peak relative to lub
const PEAK = 0.55        // lub peak gain at level 1
const CUTOFF = 260       // Hz — lowpass; keeps it a thud, not a tone

function _thump (ctx, t0, f0, f1, dur, peak) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f0, t0)
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = CUTOFF
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(lp); lp.connect(g); g.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/**
 * One heartbeat. `level` 0..1 scales loudness (main.js passes the bar's intensity × line weight).
 * Silent unless the shared AudioContext is running (it only starts on a user gesture, which has
 * long since happened by the time a job's clock is near a line).
 */
export function playHeartbeat (level = 1) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || level <= 0) return
  const t = ctx.currentTime
  const p = PEAK * Math.min(1, level)
  _thump(ctx, t, LUB_F0, LUB_F1, LUB_DUR, p)
  _thump(ctx, t + DUB_DELAY, DUB_F0, DUB_F1, DUB_DUR, p * DUB_LEVEL)
}

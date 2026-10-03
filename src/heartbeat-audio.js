/**
 * src/heartbeat-audio.js — FEAT-87: the rank timer's heartbeat, played on a KICK DRUM.
 *
 * The rank bar pulses on ONE oscillator whose rate ramps 48 → 140 bpm as a line nears
 * (rank-timer.js pulseHz*). main.js calls playHeartbeat() on the frame that oscillator peaks, so
 * the hit and the glow land together. The rhythm is a heartbeat's "lub-dub" — two hits, the second
 * DUB_DELAY later and softer — but each hit is a synthesized kick (owner, 2026-10-02: "heartbeat
 * but if it was a kick drum"). The dub is scheduled on the audio clock, so it cannot jitter with
 * the frame rate.
 *
 * A KICK, synthesized (no samples), is two layers:
 *   BODY  — a sine whose pitch drops fast from KICK_F0 to KICK_F1 (the "boom" — most of the
 *           sweep happens in the first ~40 ms, which is what makes it punch rather than whoop),
 *           under an envelope with a near-instant attack and a ~0.3 s exponential decay.
 *   CLICK — a ~15 ms burst of highpassed noise on the attack: the beater hitting the head. Without
 *           it a kick reads as a soft thud.
 *
 * Shares the one AudioContext (engine-audio.js getAudioContext). Fire-and-forget voices: nodes are
 * stopped and left for GC, as engine-audio.js _blip does.
 */

import { getAudioContext } from './engine-audio.js'

const KICK_F0 = 150      // Hz — body pitch at the hit
const KICK_F1 = 45       // Hz — …where it settles
const SWEEP_S = 0.07     // s — the pitch drop (exponential, so most of it lands in the first ~40 ms)
const BODY_S = 0.32      // s — body decay to silence
const CLICK_S = 0.015    // s — beater click length
const CLICK_HP = 2500    // Hz — click highpass
const CLICK_LEVEL = 0.35 // click peak relative to the body
// Exported so the rank tile's visual thump (main.js) lands on the same two hits.
export const HEARTBEAT_DUB_DELAY = 0.14   // s — lub → dub. Fits inside the shortest period (0.43 s at 140 bpm).
export const HEARTBEAT_DUB_LEVEL = 0.7    // dub peak relative to lub
const DUB_DELAY = HEARTBEAT_DUB_DELAY, DUB_LEVEL = HEARTBEAT_DUB_LEVEL
const PEAK = 0.6         // lub body peak gain at level 1

let _noise = null        // a short white-noise buffer for the click, built once per context
function _noiseBuf (ctx) {
  if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise
  const n = Math.ceil(ctx.sampleRate * CLICK_S)
  _noise = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = _noise.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return _noise
}

function _kick (ctx, t0, peak) {
  // Body: the pitch-dropping sine.
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(KICK_F0, t0)
  osc.frequency.exponentialRampToValueAtTime(KICK_F1, t0 + SWEEP_S)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + BODY_S)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + BODY_S + 0.02)
  // Click: a highpassed noise tick on the attack.
  const src = ctx.createBufferSource()
  src.buffer = _noiseBuf(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = CLICK_HP
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(Math.max(0.0002, peak * CLICK_LEVEL), t0)
  cg.gain.exponentialRampToValueAtTime(0.0001, t0 + CLICK_S)
  src.connect(hp); hp.connect(cg); cg.connect(ctx.destination)
  src.start(t0)
  src.stop(t0 + CLICK_S + 0.01)
}

/**
 * One heartbeat: lub-dub on the kick. `level` 0..1 scales loudness (main.js passes the bar's
 * intensity × line weight). Silent unless the shared AudioContext is running (it only starts on a
 * user gesture, which has long since happened by the time a job's clock is near a line).
 */
export function playHeartbeat (level = 1) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || level <= 0) return
  const t = ctx.currentTime
  const p = PEAK * Math.min(1, level)
  _kick(ctx, t, p)
  _kick(ctx, t + DUB_DELAY, p * DUB_LEVEL)
}

/**
 * src/glass-audio.js — FEAT-87: the rank tile breaking, as a car side window going. FEAT-97 adds
 * the fragile load's hit sounds (playCargoHit, at the bottom), which reuse the same voices.
 *
 * Owner, 2026-10-03: "short and poppy, like a car side window". A side window is TEMPERED glass:
 * it does not crack and tinkle for seconds like a plate-glass pane, it goes all at once with a
 * sharp POP and crumbles into thousands of small cubes. So the sound is front-loaded and short,
 * about 0.35 s in all, in four layers, all synthesized (no samples):
 *   THUNK   — a sine dropping 220 → 70 Hz in 50 ms: the impact on the pane.
 *   POP     — a 30 ms burst of highpassed noise: the pane letting go. This is the loud part.
 *   CRUMBLE — GRAINS short slices of bandpassed noise, each a few ms, at random high frequencies,
 *             packed densely right after the pop and thinning out (time ∝ r², r uniform): the
 *             cubes raining down.
 *   TINKLE  — PINGS short high sine pings scattered through the tail: the odd cube ringing.
 * The scatter is random each time so two breaks never sound identical; nothing visual reads it.
 *
 * Shares the one AudioContext (engine-audio.js getAudioContext). Fire-and-forget voices: every node
 * is stopped on a schedule and left for GC.
 */

import { getAudioContext, whiteNoiseBuffer } from './engine-audio.js'

const LEVEL = 0.5          // overall peak gain
const TAIL_S = 0.3         // s — the crumble and tinkles land inside this window after the pop
const GRAINS = 34          // crumble grains
const PINGS = 9            // tinkle pings

let _noise = null          // 0.5 s of white noise, built once (there is one AudioContext), sliced by every layer
function _noiseBuf (ctx) {
  return (_noise ??= whiteNoiseBuffer(ctx, 0.5))
}

/** One slice of filtered noise: `type` filter at `freq`/`q`, peak `g`, decaying over `dur`. */
function _noiseHit (ctx, out, t0, dur, type, freq, q, g) {
  const src = ctx.createBufferSource()
  src.buffer = _noiseBuf(ctx)
  const f = ctx.createBiquadFilter()
  f.type = type; f.frequency.value = freq; f.Q.value = q
  const e = ctx.createGain()
  e.gain.setValueAtTime(Math.max(0.0002, g), t0)
  e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f); f.connect(e); e.connect(out)
  src.start(t0, Math.random() * 0.4)   // a random offset into the buffer so slices differ
  src.stop(t0 + dur + 0.01)
}

/** The side window going. Silent unless the shared AudioContext is running. */
export function playGlassBreak (level = 1) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || level <= 0) return
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = LEVEL * Math.min(1, level)
  out.connect(ctx.destination)

  // THUNK
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(220, t)
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.05)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, t)
  tg.gain.exponentialRampToValueAtTime(0.45, t + 0.003)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  osc.connect(tg); tg.connect(out)
  osc.start(t); osc.stop(t + 0.08)

  // POP
  _noiseHit(ctx, out, t + 0.004, 0.03, 'highpass', 1800, 0.7, 1.0)

  // CRUMBLE — dense right after the pop, thinning out, quieter as it goes.
  for (let i = 0; i < GRAINS; i++) {
    const r = Math.random()
    const dt = 0.012 + TAIL_S * r * r
    _noiseHit(ctx, out, t + dt, 0.004 + Math.random() * 0.01, 'bandpass',
              3000 + Math.random() * 6000, 6, 0.55 * (1 - dt / (TAIL_S + 0.05)))
  }

  // TINKLE
  for (let i = 0; i < PINGS; i++) {
    const t0 = t + 0.03 + Math.random() * TAIL_S
    const p = ctx.createOscillator()
    p.type = 'sine'
    p.frequency.value = 3500 + Math.random() * 5000
    const pg = ctx.createGain()
    pg.gain.setValueAtTime(0.0001, t0)
    pg.gain.exponentialRampToValueAtTime(0.12 * (1 - (t0 - t) / (TAIL_S + 0.1)), t0 + 0.002)
    pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + Math.random() * 0.03)
    p.connect(pg); pg.connect(out)
    p.start(t0); p.stop(t0 + 0.06)
  }
}

/**
 * FEAT-97: a fragile load taking a hit. `sound` is the load's kind (data/offers.js: 'glass' |
 * 'thud' | 'piano'); `cost` is the health the hit took (0..1), and the gain follows it — a near
 * miss is a tick, a bad one a crash (√cost, so the small hits stay audible). A glass hit that costs
 * a third or more is the full break.
 */
export function playCargoHit (sound, cost) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || !(cost > 0)) return
  const level = Math.min(1, Math.max(0.08, 1.5 * Math.sqrt(cost)))
  if (sound === 'glass' && cost >= 1 / 3) { playGlassBreak(level); return }
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = LEVEL * level
  out.connect(ctx.destination)
  if (sound === 'glass') {
    // CLINK — two or three short high pings and a tick of bright noise: glass knocking on glass.
    _noiseHit(ctx, out, t, 0.015, 'highpass', 3000, 0.7, 0.4)
    for (let i = 0; i < 3; i++) _ping(ctx, out, t + i * 0.02 * Math.random(), 2500 + Math.random() * 3000, 0.25, 0.08)
    return
  }
  // THUD — a low sine dropping 140 → 50 Hz and a burst of lowpassed noise: something heavy knocked.
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.1)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  osc.connect(g); g.connect(out)
  osc.start(t); osc.stop(t + 0.18)
  _noiseHit(ctx, out, t, 0.06, 'lowpass', 400, 0.7, 0.6)
  // PIANO — the strings jangling on top: a handful of detuned partials ringing out for a second.
  if (sound === 'piano') {
    for (let i = 0; i < 6; i++) _ping(ctx, out, t + 0.005 * i, 110 * 2 ** (Math.floor(Math.random() * 36) / 12), 0.12, 0.6 + Math.random() * 0.6, 'triangle')
  }
}

/** One decaying oscillator note: `freq` Hz, peak `g`, ringing out over `dur` s. */
function _ping (ctx, out, t0, freq, g, dur, type = 'sine') {
  const p = ctx.createOscillator()
  p.type = type
  p.frequency.value = freq
  const pg = ctx.createGain()
  pg.gain.setValueAtTime(0.0001, t0)
  pg.gain.exponentialRampToValueAtTime(g, t0 + 0.002)
  pg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  p.connect(pg); pg.connect(out)
  p.start(t0); p.stop(t0 + dur + 0.02)
}

/**
 * src/gearbox-audio.js — FEAT-126: the gear grind of a missed shift (a shift forced with the clutch in,
 * which the sim rejects — src/drivetrain.js stepManual, drivetrain.missShift).
 *
 * What it is physically: the engaging sleeve's dog teeth meeting a gear still spinning at a different
 * speed, so they skate across each other's faces instead of meshing — a train of metal-on-metal
 * clicks at the tooth-passing rate, heard as a harsh buzzing rasp. Synthesized, three layers:
 *   CLASH  — a short broadband noise hit: the first contact.
 *   RASP   — bandpassed noise chopped by a pulse train at the tooth rate: the teeth skating. The rate
 *            follows engine speed (the mismatch the teeth see) and sags a little as the sleeve is
 *            pushed back out.
 *   BUZZ   — the pulse train itself, bandpassed, under the rasp: the tone of the grind.
 * About 0.4 s in all. Shares the one AudioContext (engine-audio.js); fire-and-forget voices.
 */

import { getAudioContext, whiteNoiseBuffer } from './engine-audio.js'

const LEVEL = 0.135    // overall peak gain — 30 % of the first cut (owner, 2026-10-19: "a little too loud")
const DUR_S = 0.42     // s — the whole grind
const TEETH = 8        // tooth passes per engine revolution, for the rasp rate (rpm/60 × TEETH)

let _noise = null
const _noiseBuf = (ctx) => (_noise ??= whiteNoiseBuffer(ctx, 0.5))

/** The grind. `rpm` (engine speed at the miss) sets the rasp rate. Silent unless audio is running. */
export function playGearGrind (rpm = 2000) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const rate = Math.max(140, Math.min(700, rpm / 60 * TEETH))   // Hz — 2000 rpm → ~270 Hz
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(LEVEL, t + 0.008)
  out.gain.setValueAtTime(LEVEL * 0.8, t + DUR_S * 0.6)
  out.gain.exponentialRampToValueAtTime(0.0001, t + DUR_S)
  out.connect(ctx.destination)

  // The tooth-passing pulse train: a square wave, sagging ~20 % over the grind.
  const pulse = ctx.createOscillator()
  pulse.type = 'square'
  pulse.frequency.setValueAtTime(rate, t)
  pulse.frequency.linearRampToValueAtTime(rate * 0.8, t + DUR_S)

  // RASP — noise gated by the pulse: a gain node whose gain is 0.5 ± 0.5 at the tooth rate.
  const noise = ctx.createBufferSource()
  noise.buffer = _noiseBuf(ctx)
  noise.loop = true
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 1.2
  const chop = ctx.createGain()
  chop.gain.value = 0.5
  const depth = ctx.createGain()
  depth.gain.value = 0.5
  pulse.connect(depth); depth.connect(chop.gain)
  noise.connect(nf); nf.connect(chop); chop.connect(out)

  // BUZZ — the pulse train itself, bandpassed so it reads as metal, not a synth.
  const bf = ctx.createBiquadFilter()
  bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 2
  const bg = ctx.createGain()
  bg.gain.value = 0.25
  pulse.connect(bf); bf.connect(bg); bg.connect(out)

  // CLASH — the first contact.
  const clash = ctx.createBufferSource()
  clash.buffer = _noiseBuf(ctx)
  const cf = ctx.createBiquadFilter()
  cf.type = 'highpass'; cf.frequency.value = 1200
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(0.9, t)
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  clash.connect(cf); cf.connect(cg); cg.connect(out)

  pulse.start(t); noise.start(t, Math.random() * 0.4); clash.start(t, Math.random() * 0.4)
  for (const s of [pulse, noise, clash]) s.stop(t + DUR_S + 0.02)
}

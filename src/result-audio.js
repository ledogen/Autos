/**
 * src/result-audio.js — FEAT-120 coin + grade stingers, FEAT-131 phase 1: the result card's reveal
 * gets its sound. Synthesized, on the one shared AudioContext, straight out (UI, not the world bus:
 * the cab's glass and a tunnel's echo never colour the card). The owner kept both takes on 2026-11-02
 * ("i like coin and stingers"); prototypes in tools/audio-proto/proto.js.
 *
 *   coin    — two quick high pings a fifth apart (2.6 → 3.9 kHz), each with a coin's inharmonic ring
 *             (×2.76) on top so it reads as metal, not a beep. One per money row as it lands.
 *   stinger — a mallet (sine + its 3.9× overtone, the marimba recipe) playing a short figure that
 *             rises in pitch and length with the grade, D one low note up to S a run into a held
 *             chord. Sound only: the card prints no letter (owner, 2026-10-22), the grade is heard.
 */

import { getAudioContext, whiteNoiseBuffer } from './engine-audio.js'

let enabled = true
let volume = 0.6
let noise = null

/** Debug-menu controls, read every frame by main.js. */
export function setResultAudio (on, vol) {
  enabled = !!on
  volume = vol
}

const jit = pct => 1 + (Math.random() * 2 - 1) * pct
const live = () => { const c = getAudioContext(); return enabled && c && c.state === 'running' ? c : null }
function out (ctx, g) { const o = ctx.createGain(); o.gain.value = g; o.connect(ctx.destination); return o }

function tone (ctx, dest, t, f, g, decay) {
  const o = ctx.createOscillator()
  o.frequency.value = f
  const e = ctx.createGain()
  e.gain.setValueAtTime(0.0001, t)
  e.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.003)
  e.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  o.connect(e); e.connect(dest)
  o.start(t); o.stop(t + decay + 0.02)
}

/** The payout coin. */
export function playCoin () {
  const ctx = live(); if (!ctx) return
  const t = ctx.currentTime, o = out(ctx, 0.30 * volume * jit(0.15)), p = jit(0.03)
  for (const [dt, f, d] of [[0, 2600, 0.10], [0.07, 3900, 0.32]]) {
    tone(ctx, o, t + dt, f * p, 0.5, d)
    tone(ctx, o, t + dt, f * p * 2.76, 0.12, d * 0.4)
  }
}

const MIDI = n => 440 * 2 ** ((n - 69) / 12)
const FIGURES = [                                              // [delay s, MIDI note, decay s]
  [[0, 57, 0.35]],                                             // D: one low note (A3)
  [[0, 60, 0.30], [0.12, 64, 0.40]],                           // C: two notes up (C4 E4)
  [[0, 60, 0.25], [0.10, 64, 0.25], [0.20, 67, 0.50]],         // B: a triad up (C4 E4 G4)
  [[0, 64, 0.25], [0.09, 67, 0.25], [0.18, 72, 0.70]],         // A: up to the octave (E4 G4 C5)
  [[0, 67, 0.22], [0.08, 72, 0.22], [0.16, 76, 0.22],          // S: a run to a held chord
   [0.26, 79, 1.10], [0.26, 84, 1.10], [0.26, 72, 1.10]],      //    (G4 C5 E5 → G5 C6 C5)
]
export const STINGER_LEVEL = { D: 0, C: 1, B: 2, A: 3, S: 4 }

/** The grade stinger for `letter` ('D' … 'S'); anything else is silent. */
export function playStinger (letter) {
  const ctx = live(), level = STINGER_LEVEL[letter]
  if (!ctx || level === undefined) return
  const t = ctx.currentTime, o = out(ctx, 0.28 * volume)
  for (const [dt, n, d] of FIGURES[level]) {
    tone(ctx, o, t + dt, MIDI(n), 0.5, d)
    tone(ctx, o, t + dt, MIDI(n) * 3.9, 0.12, Math.min(0.12, d * 0.3))
    // the mallet's tick: 8 ms of bandpassed noise
    const s = ctx.createBufferSource(); s.buffer = (noise ??= whiteNoiseBuffer(ctx, 1))
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500
    const e = ctx.createGain()
    e.gain.setValueAtTime(0.12, t + dt); e.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.008)
    s.connect(f); f.connect(e); e.connect(o)
    s.start(t + dt, Math.random() * 0.8); s.stop(t + dt + 0.02)
  }
}

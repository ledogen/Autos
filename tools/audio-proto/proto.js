// tools/audio-proto/proto.js — FEAT-120 batch 1 PROTOTYPES (tracked; renders go to the git-invisible wip/audio-render/out). Synthesized one-shots for
// the owner to audition as rendered WAVs before any of them enters src/. Each takes `at` (seconds from
// now) so the demo* exports can lay several takes end to end in one render.
//
//   node tools/audio-proto/offline.mjs /tools/audio-proto/proto.js demoCoin 2

import { getAudioContext, whiteNoiseBuffer } from '/src/engine-audio.js'

let _noise = null
const _buf = ctx => (_noise ??= whiteNoiseBuffer(ctx, 1.0))
const _live = () => { const c = getAudioContext(); return c && c.state === 'running' ? c : null }
const _out = (ctx, g) => { const o = ctx.createGain(); o.gain.value = g; o.connect(ctx.destination); return o }
const _jit = (pct) => 1 + (Math.random() * 2 - 1) * pct     // playback variety: pitch / gain jitter

/** A sine (or other wave) partial with a near-instant attack and an exponential decay. */
function _tone (ctx, out, t, f, g, decay, type = 'sine', f1 = null, sweep = 0) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sweep)
    const e = ctx.createGain()
    e.gain.setValueAtTime(0.0001, t)
    e.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.003)
    e.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    o.connect(e); e.connect(out)
    o.start(t); o.stop(t + decay + 0.02)
}

function _noiseHit (ctx, out, t, dur, type, freq, q, g) {
    const s = ctx.createBufferSource()
    s.buffer = _buf(ctx)
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
    const e = ctx.createGain()
    e.gain.setValueAtTime(Math.max(0.0002, g), t)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f); f.connect(e); e.connect(out)
    s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.01)
}

// ── PAYOUT COIN — two quick high pings a fifth apart (2.6 → 3.9 kHz), each with a coin's inharmonic
//    ring (×2.76) on top so it reads as metal, not a beep.
export function playCoin (at = 0) {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime + at, out = _out(ctx, 0.30 * _jit(0.15)), p = _jit(0.03)
    for (const [dt, f, d] of [[0, 2600, 0.10], [0.07, 3900, 0.32]]) {
        _tone(ctx, out, t + dt, f * p, 0.5, d)
        _tone(ctx, out, t + dt, f * p * 2.76, 0.12, d * 0.4)
    }
}

// ── GRADE STINGERS — a mallet (sine + its 3.9× overtone, the marimba recipe) playing a short figure
//    that rises in pitch and length with the grade. level 0 = D … 4 = S.
const MIDI = n => 440 * 2 ** ((n - 69) / 12)
const FIGURES = [
    [[0, 57, 0.35]],                                            // D: one low note (A3)
    [[0, 60, 0.30], [0.12, 64, 0.40]],                          // C: two notes up (C4 E4)
    [[0, 60, 0.25], [0.10, 64, 0.25], [0.20, 67, 0.50]],        // B: a triad up (C4 E4 G4)
    [[0, 64, 0.25], [0.09, 67, 0.25], [0.18, 72, 0.70]],        // A: up to the octave (E4 G4 C5)
    [[0, 67, 0.22], [0.08, 72, 0.22], [0.16, 76, 0.22],         // S: a run to a held chord
     [0.26, 79, 1.10], [0.26, 84, 1.10], [0.26, 72, 1.10]],     //    (G4 C5 E5 → G5 C6 C5)
]
function _mallet (ctx, out, t, f, decay) {
    _tone(ctx, out, t, f, 0.5, decay)
    _tone(ctx, out, t, f * 3.9, 0.12, Math.min(0.12, decay * 0.3))
    _noiseHit(ctx, out, t, 0.008, 'bandpass', 2500, 1, 0.12)   // the mallet's tick
}
export function playStinger (level = 2, at = 0) {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime + at, out = _out(ctx, 0.28)
    for (const [dt, n, d] of FIGURES[Math.max(0, Math.min(4, level))]) _mallet(ctx, out, t + dt, MIDI(n), d)
}

// ── BUMP-STOP CLUNK — a strut bottoming on its rubber stop: a low thump 90 → 50 Hz in 40 ms and a
//    10 ms metallic click near 2 kHz. `s` 0..1 = closing speed at the stop, normalised.
export function playBumpStop (s = 0.6, at = 0) {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime + at, g = 0.15 + 0.6 * s, out = _out(ctx, g * _jit(0.15)), p = _jit(0.06)
    _tone(ctx, out, t, 90 * p, 0.8, 0.12, 'sine', 50 * p, 0.04)
    _noiseHit(ctx, out, t, 0.010, 'bandpass', 2000 * p, 2.5, 0.5 * s + 0.1)
}

// ── LANDING THUD — once per landing after air: the heartbeat kick's body pitched down (120 → 38 Hz),
//    level ∝ vertical speed, then a suspension rattle (a few lowpassed noise ticks, decaying).
export function playLanding (s = 0.6, at = 0) {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime + at, out = _out(ctx, (0.2 + 0.7 * s) * _jit(0.15)), p = _jit(0.05)
    _tone(ctx, out, t, 120 * p, 0.9, 0.35, 'sine', 38 * p, 0.08)
    _noiseHit(ctx, out, t, 0.03, 'lowpass', 1200, 0.7, 0.35)
    const n = 2 + Math.round(4 * s)
    for (let i = 0; i < n; i++) {
        const dt = 0.05 + i * (0.035 + Math.random() * 0.03)
        _noiseHit(ctx, out, t + dt, 0.02, 'bandpass', 900 + Math.random() * 900, 2, 0.25 * (1 - i / n))
    }
}

// ── BRAKE SQUEAL — low speed under moderate pressure: a 2–4 kHz sine with a slight vibrato, fast
//    attack, fading out as the truck stops (`dur` = the time left to standstill).
export function playBrakeSqueal (dur = 1.2, at = 0) {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime + at, out = _out(ctx, 0.06)
    const f = 2000 + Math.random() * 2000
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5
    const vg = ctx.createGain(); vg.gain.value = f * 0.006
    vib.connect(vg); vg.connect(o.frequency)
    // Pitch sags a little as the disc slows.
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.94, t + dur)
    const e = ctx.createGain()
    e.gain.setValueAtTime(0.0001, t)
    e.gain.exponentialRampToValueAtTime(1, t + 0.03)
    e.gain.setValueAtTime(1, t + dur * 0.6)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(e); e.connect(out)
    o.start(t); vib.start(t); o.stop(t + dur + 0.02); vib.stop(t + dur + 0.02)
}

// ── Demos: several takes end to end in one render.
export function demoCoin () { for (let i = 0; i < 4; i++) playCoin(i * 0.5) }
export function demoStingers () { for (let l = 0; l <= 4; l++) playStinger(l, l * 1.6) }
export function demoBumpStop () { [0.2, 0.5, 0.8, 1.0].forEach((s, i) => playBumpStop(s, i * 0.5)) }
export function demoLanding () { [0.25, 0.6, 1.0].forEach((s, i) => playLanding(s, i * 0.9)) }
export function demoBrakeSqueal () { playBrakeSqueal(1.0, 0); playBrakeSqueal(1.6, 1.4) }

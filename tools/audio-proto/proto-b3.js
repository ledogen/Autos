// tools/audio-proto/proto-b3.js — FEAT-120 batch 3 PROTOTYPES: the owner's 2026-11-02 redos that are not
// wired yet. Renders go to the git-invisible wip/. Same harness as proto-b2.js.
//
//   PORT=3885 node tools/audio-proto/offline.mjs /tools/audio-proto/proto-b3.js demoGravel 6

import { getAudioContext, whiteNoiseBuffer, loopNoise } from '/src/engine-audio.js'

let _white = null
const _wbuf = ctx => (_white ??= whiteNoiseBuffer(ctx, 3))
const _gain = (ctx, g, to) => { const n = ctx.createGain(); n.gain.value = g; if (to) n.connect(to); return n }
const _filt = (ctx, type, f, q, to) => {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q
    if (to) n.connect(to); return n
}
const clamp01 = x => Math.max(0, Math.min(1, x))
function _drive (ctx, dur, fn, dt = 0.02) {
    for (let i = 1; i * dt < dur; i++) { const t = i * dt; ctx.suspend(t).then(() => { fn(t, dt); ctx.resume() }) }
}
const lerpKeys = (keys, t) => {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
        const [a, va] = keys[i - 1], [b, vb] = keys[i]
        return va + (vb - va) * (t - a) / (b - a)
    }
    return keys[keys.length - 1][1]
}

// ── GRAVEL (redo) ───────────────────────────────────────────────────────────────────────────────
// Owner, 2026-11-02, on the batch-2 take: "sounds more like a xylophone than gravel strikes" — every
// ping was a sine at its own random pitch, so each read as a note. Gravel strikes are UNPITCHED:
//   STRIKES — a 1–4 ms broadband click (highpassed noise) that excites the SAME wheel-well panel every
//             time: four fixed, inharmonic resonances (Q ~9, 15–45 ms). A stone's size changes the
//             click's loudness and brightness, never the panel's pitch, so no hit carries a note.
//   CRUNCH  — the tread rolling over loose stones: noise chopped into random 1–3 ms grains at a rate
//             that rises with wheel speed, lowpassed ~2.5 kHz. Continuous, under the strikes.
const PANEL = [[1150, 9, 0.045], [2730, 9, 0.03], [4380, 8, 0.022], [6900, 7, 0.015]]   // [Hz, Q, decay s]
const STRIKES_PER_MS = 0.7      // strikes per second per m/s of wheel speed on full gravel (15 m/s ⇒ ~10/s)
export function makeGravel () {
    const ctx = getAudioContext(), out = _gain(ctx, 0.5, ctx.destination)
    // the panel: one resonator bank, always there; strikes are clicks fed into it
    const panelIn = _gain(ctx, 1)
    for (const [f, q] of PANEL) panelIn.connect(_filt(ctx, 'bandpass', f, q, _gain(ctx, 0.9, out)))
    // the crunch bed: noise through a lowpass, gated by a fast random grain envelope
    const crG = _gain(ctx, 0, out), crLp = _filt(ctx, 'lowpass', 2500, 0.7, crG), grain = _gain(ctx, 0, crLp)
    loopNoise(ctx, _wbuf(ctx)).connect(grain)
    return {
        update (dt, wheelSpeed, loose) {
            const now = ctx.currentTime, s = clamp01(wheelSpeed / 15) * loose
            crG.gain.setTargetAtTime(0.22 * s ** 0.7, now, 0.1)
            // grains: 40 + 260·s a second, each 1–3 ms at a random level
            for (let p = (40 + 260 * s) * dt; p > 0; p -= 1) if (Math.random() < Math.min(1, p)) {
                const a = now + Math.random() * dt, d = 0.001 + Math.random() * 0.002
                grain.gain.setValueAtTime(0.3 + 0.7 * Math.random(), a); grain.gain.setValueAtTime(0, a + d)
            }
            // strikes: a click into the panel
            for (let p = STRIKES_PER_MS * wheelSpeed * loose * dt; p > 0; p -= 1) if (Math.random() < Math.min(1, p)) {
                const a = now + Math.random() * dt, size = Math.random()
                const src = ctx.createBufferSource(); src.buffer = _wbuf(ctx)
                const hp = _filt(ctx, 'highpass', 1500 + 3000 * (1 - size), 0.7)
                const e = ctx.createGain(), d = 0.001 + 0.003 * size
                e.gain.setValueAtTime(0.25 + 0.75 * size, a); e.gain.exponentialRampToValueAtTime(0.0001, a + d)
                src.connect(hp); hp.connect(e); e.connect(panelIn); e.connect(out)   // the click itself, and the panel it rings
                src.start(a, Math.random() * 2.5); src.stop(a + d + 0.01)
            }
        },
    }
}
export function demoGravel () {
    const ctx = getAudioContext(), gr = makeGravel()
    _drive(ctx, 6, (t, dt) => gr.update(dt, lerpKeys([[0, 1], [3, 20], [4.5, 20], [6, 3]], t), 1))
}

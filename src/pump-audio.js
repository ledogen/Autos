/**
 * src/pump-audio.js — FEAT-50: the gas pump. All synthesized (no samples), on the one shared
 * AudioContext (engine-audio.js getAudioContext), each voice into its own gain on the world bus
 * (getWorldBus) — the glass-audio.js pattern. The visit is the stop the player makes over and over,
 * so it is meant to feel like a machine (owner, 2026-10-16: "polish and some juice").
 *
 *   NOZZLE   — playNozzle(): the nozzle seating in the filler neck. A sine thunk 170 → 55 Hz in
 *              70 ms under a short lowpassed noise scuff. On open.
 *   FLOW     — setPumpFlow(on): held while F pumps. Three layers built once and only gain-ramped:
 *              the pump motor (a sawtooth at 62 Hz with a slow 5 Hz wobble, lowpassed to a hum),
 *              a sine on its fundamental for weight (the bass, owner 2026-10-20), and the gas
 *              going in (bandpassed noise around 900 Hz with a little resonance). Was 118 Hz with
 *              no sub and the gas at 1.4 kHz: thin, and too loud for a sound you hold.
 *   CLICK    — playGallonClick(): one tick per gallon, the mechanical counter's detent. A 12 ms
 *              highpassed noise tick over a tiny low knock. (Was a struck-bell ding — owner
 *              2026-10-20: "the dinging should be reduced to a click".)
 *   SHUTOFF  — playShutoff(): the auto-shutoff — a hard double clack (two highpassed noise
 *              bursts 45 ms apart) when the tank is full or the wallet runs out.
 *   REGISTER — playRegister(): handbrake down, sale final. A cash-register cha-ching (owner,
 *              2026-10-26; was a ka-chunk and a single till ding): the "cha" is the key lever
 *              tripping the mechanism (three quick clacks), the "ching" is the drawer bell — two
 *              struck partials at 2.4 and 3.2 kHz ringing 0.4 s, each a detuned pair so it
 *              shimmers — and under the bell the drawer rolls open and hits its stop.
 *
 * Every voice is silent unless the context is already running (it starts on the first user
 * gesture, engine-audio.js), and nothing here ever throws on a missing WebAudio.
 */

import { getAudioContext, getWorldBus, whiteNoiseBuffer, loopNoise } from './engine-audio.js'

const LEVEL = 0.45   // overall peak gain for the one-shots
let _noise = null
const _buf = ctx => (_noise ??= whiteNoiseBuffer(ctx, 1.0))
const _live = () => { const c = getAudioContext(); return c && c.state === 'running' ? c : null }

function _out (ctx, g = LEVEL) {
    const out = ctx.createGain()
    out.gain.value = g
    out.connect(getWorldBus())
    return out
}

function _thunk (ctx, out, t, f0, f1, dur, g) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const e = ctx.createGain()
    e.gain.setValueAtTime(0.0001, t)
    e.gain.exponentialRampToValueAtTime(g, t + 0.004)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
    o.connect(e); e.connect(out)
    o.start(t); o.stop(t + dur + 0.05)
}

function _burst (ctx, out, t, dur, type, freq, q, g) {
    const src = ctx.createBufferSource()
    src.buffer = _buf(ctx)
    const f = ctx.createBiquadFilter()
    f.type = type; f.frequency.value = freq; f.Q.value = q
    const e = ctx.createGain()
    e.gain.setValueAtTime(Math.max(0.0002, g), t)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f); f.connect(e); e.connect(out)
    src.start(t, Math.random() * 0.8)
    src.stop(t + dur + 0.01)
}

export function playNozzle () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    _thunk(ctx, out, t, 170, 55, 0.07, 0.6)
    _burst(ctx, out, t, 0.06, 'lowpass', 900, 0.7, 0.35)
}

export function playGallonClick () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx, LEVEL * 0.5)
    _burst(ctx, out, t, 0.012, 'highpass', 3000, 0.7, 0.6)
    _thunk(ctx, out, t, 320, 140, 0.015, 0.25)
}

export function playShutoff () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    _burst(ctx, out, t, 0.025, 'highpass', 2200, 0.8, 0.9)
    _burst(ctx, out, t + 0.045, 0.03, 'highpass', 1600, 0.8, 0.7)
    _thunk(ctx, out, t, 240, 90, 0.04, 0.3)
}

/** A struck bell with chosen partials: [freq Hz, gain, decay s] each, a detuned pair per partial
 *  (the 4–6 Hz beat is the shimmer a real bell has and two pure sines do not). */
function _ring (ctx, out, t, partials) {
    for (const [f, g, decay] of partials) {
        for (const df of [0, 5]) {
            const o = ctx.createOscillator()
            o.type = 'sine'
            o.frequency.value = f + df
            const e = ctx.createGain()
            e.gain.setValueAtTime(0.0001, t)
            e.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.002)
            e.gain.exponentialRampToValueAtTime(0.0001, t + decay)
            o.connect(e); e.connect(out)
            o.start(t); o.stop(t + decay + 0.02)
        }
    }
}

export function playRegister () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    // Redone 2026-11-02 to the owner's reference (a mechanical till, read off its spectrum, never
    // shipped): the 10-31 build was "not cha-ching enough" — a short bell and no real cha.
    // CHA: the key and the gear train, ~0.2 s of broadband clatter, the strikes closing up.
    for (const [dt, f, g] of [[0, 2600, 0.6], [0.05, 4200, 0.5], [0.09, 1900, 0.55], [0.125, 5200, 0.45], [0.15, 3100, 0.5], [0.17, 6400, 0.4], [0.185, 2400, 0.5]])
        _burst(ctx, out, t + dt, 0.018, 'bandpass', f, 1.1, g)
    _thunk(ctx, out, t + 0.02, 220, 90, 0.04, 0.3)
    // CHING: the bell, struck at +0.2 s. A bell's partials are inharmonic — the reference rings at
    // ~2.1, 4.8, 7.4/7.75 and 10.9 kHz (1 : 2.29 : 3.5–3.7 : 5.2), the 2.1 kHz one for about a second.
    const tb = t + 0.2
    _ring(ctx, out, tb, [[2100, 0.40, 1.1], [4800, 0.28, 0.9], [3200, 0.08, 0.3], [7400, 0.16, 0.30], [7750, 0.14, 0.30], [10900, 0.08, 0.15]])
    // The drawer: released under the ring, rolls out and hits its stop, the coins rattling after.
    const td = tb + 0.27
    _burst(ctx, out, td, 0.05, 'bandpass', 3000, 0.7, 0.5)
    const roll = ctx.createBufferSource()
    roll.buffer = _buf(ctx)
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.9
    const rg = ctx.createGain()
    rg.gain.setValueAtTime(0.0001, td)
    rg.gain.exponentialRampToValueAtTime(0.2, td + 0.1)
    rg.gain.exponentialRampToValueAtTime(0.0001, td + 0.12)
    roll.connect(bp); bp.connect(rg); rg.connect(out)
    roll.start(td, Math.random() * 0.8); roll.stop(td + 0.13)
    const ts = td + 0.11
    _thunk(ctx, out, ts, 130, 50, 0.06, 0.6)
    _burst(ctx, out, ts, 0.06, 'lowpass', 900, 0.7, 0.45)
    _burst(ctx, out, ts, 0.03, 'bandpass', 5600, 1.2, 0.35)
    for (let i = 0; i < 9; i++) {   // coins settling in the drawer
        const dt = 0.04 + i * (0.05 + Math.random() * 0.05)
        _burst(ctx, out, ts + dt, 0.012, 'bandpass', 3000 + Math.random() * 3500, 3, 0.18 * (1 - i / 9))
    }
}

// ── The flow voice: built once on first use, then only its gains move (no clicks, no churn) ──
let _flow = null
function _ensureFlow (ctx) {
    if (_flow) return _flow
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(getWorldBus())
    // Motor: sawtooth hum with a slow wobble on the pitch.
    const motor = ctx.createOscillator()
    motor.type = 'sawtooth'
    motor.frequency.value = 62
    const wob = ctx.createOscillator(); wob.frequency.value = 5
    const wobG = ctx.createGain(); wobG.gain.value = 1.3
    wob.connect(wobG); wobG.connect(motor.frequency)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.7
    const motorG = ctx.createGain(); motorG.gain.value = 0.22
    motor.connect(lp); lp.connect(motorG); motorG.connect(master)
    // Sub: a sine on the motor's fundamental — the weight a thin sawtooth alone does not have. Not an
    // octave under: 31 Hz is below what laptop speakers reproduce, so it would be heard on headphones only.
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 62
    const subG = ctx.createGain(); subG.gain.value = 0.35
    wobG.connect(sub.frequency)   // the same wobble, so the two never beat against each other
    sub.connect(subG); subG.connect(master)
    // Gas going in: resonant bandpassed noise, lower and quieter than the motor.
    const hiss = loopNoise(ctx, _buf(ctx))
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4
    const hissG = ctx.createGain(); hissG.gain.value = 0.12
    hiss.connect(bp); bp.connect(hissG); hissG.connect(master)
    motor.start(); wob.start(); sub.start()
    return (_flow = { master })
}

/** Pump running (F held and gas flowing) or not. Ramped so it spools up and down like a motor. */
export function setPumpFlow (on) {
    const ctx = _live(); if (!ctx) return
    if (!on && !_flow) return
    const { master } = _ensureFlow(ctx)
    master.gain.setTargetAtTime(on ? LEVEL * 0.35 : 0, ctx.currentTime, on ? 0.08 : 0.05)
}

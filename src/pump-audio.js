/**
 * src/pump-audio.js — FEAT-50: the gas pump. All synthesized (no samples), on the one shared
 * AudioContext (engine-audio.js getAudioContext), each voice into its own gain straight to the
 * destination — the glass-audio.js pattern. The visit is the stop the player makes over and over,
 * so it is meant to feel like a machine (owner, 2026-10-16: "polish and some juice").
 *
 *   NOZZLE   — playNozzle(): the nozzle seating in the filler neck. A sine thunk 170 → 55 Hz in
 *              70 ms under a short lowpassed noise scuff. On open.
 *   FLOW     — setPumpFlow(on): held while F pumps. Two layers built once and only gain-ramped:
 *              the pump motor (a sawtooth at 118 Hz with a slow 5 Hz wobble, lowpassed to a hum)
 *              and the gas going in (bandpassed noise around 1.4 kHz with a little resonance).
 *   BELL     — playGallonBell(): one ding per gallon, like the mechanical pumps' bell. Three
 *              inharmonic partials (1 : 2.76 : 5.40, a struck small bell) on a 0.7 s decay.
 *   SHUTOFF  — playShutoff(): the auto-shutoff — a hard double clack (two highpassed noise
 *              bursts 45 ms apart) when the tank is full or the wallet runs out.
 *   REGISTER — playRegister(): handbrake down, sale final. A mechanical ka-chunk (low thunk +
 *              noise) then a brighter ding — the till.
 *
 * Every voice is silent unless the context is already running (it starts on the first user
 * gesture, engine-audio.js), and nothing here ever throws on a missing WebAudio.
 */

import { getAudioContext, whiteNoiseBuffer, loopNoise } from './engine-audio.js'

const LEVEL = 0.45   // overall peak gain for the one-shots
let _noise = null
const _buf = ctx => (_noise ??= whiteNoiseBuffer(ctx, 1.0))
const _live = () => { const c = getAudioContext(); return c && c.state === 'running' ? c : null }

function _out (ctx, g = LEVEL) {
    const out = ctx.createGain()
    out.gain.value = g
    out.connect(ctx.destination)
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

function _bell (ctx, out, t, f0, g, decay) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.40, 0.18]]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f0 * ratio
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(g * amp, t + 0.003)
        e.gain.exponentialRampToValueAtTime(0.0001, t + decay / ratio ** 0.5)
        o.connect(e); e.connect(out)
        o.start(t); o.stop(t + decay + 0.05)
    }
}

export function playNozzle () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    _thunk(ctx, out, t, 170, 55, 0.07, 0.6)
    _burst(ctx, out, t, 0.06, 'lowpass', 900, 0.7, 0.35)
}

export function playGallonBell () {
    const ctx = _live(); if (!ctx) return
    _bell(ctx, _out(ctx, LEVEL * 0.55), ctx.currentTime, 1850, 0.5, 0.7)
}

export function playShutoff () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    _burst(ctx, out, t, 0.025, 'highpass', 2200, 0.8, 0.9)
    _burst(ctx, out, t + 0.045, 0.03, 'highpass', 1600, 0.8, 0.7)
    _thunk(ctx, out, t, 240, 90, 0.04, 0.3)
}

export function playRegister () {
    const ctx = _live(); if (!ctx) return
    const t = ctx.currentTime, out = _out(ctx)
    _thunk(ctx, out, t, 130, 60, 0.06, 0.5)
    _burst(ctx, out, t, 0.05, 'bandpass', 700, 1.2, 0.5)
    _burst(ctx, out, t + 0.07, 0.04, 'bandpass', 1100, 1.2, 0.4)
    _bell(ctx, out, t + 0.12, 2600, 0.35, 0.5)
}

// ── The flow voice: built once on first use, then only its gains move (no clicks, no churn) ──
let _flow = null
function _ensureFlow (ctx) {
    if (_flow) return _flow
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    // Motor: sawtooth hum with a slow wobble on the pitch.
    const motor = ctx.createOscillator()
    motor.type = 'sawtooth'
    motor.frequency.value = 118
    const wob = ctx.createOscillator(); wob.frequency.value = 5
    const wobG = ctx.createGain(); wobG.gain.value = 2.5
    wob.connect(wobG); wobG.connect(motor.frequency)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7
    const motorG = ctx.createGain(); motorG.gain.value = 0.16
    motor.connect(lp); lp.connect(motorG); motorG.connect(master)
    // Gas going in: resonant bandpassed noise.
    const hiss = loopNoise(ctx, _buf(ctx))
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.6
    const hissG = ctx.createGain(); hissG.gain.value = 0.22
    hiss.connect(bp); bp.connect(hissG); hissG.connect(master)
    motor.start(); wob.start()
    return (_flow = { master })
}

/** Pump running (F held and gas flowing) or not. Ramped so it spools up and down like a motor. */
export function setPumpFlow (on) {
    const ctx = _live(); if (!ctx) return
    if (!on && !_flow) return
    const { master } = _ensureFlow(ctx)
    master.gain.setTargetAtTime(on ? LEVEL * 0.6 : 0, ctx.currentTime, on ? 0.08 : 0.05)
}

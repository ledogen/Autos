// tools/audio-proto/proto-b2.js — FEAT-120 batch 2 PROTOTYPES (tracked; renders go to the git-invisible wip/audio-render/out). Mostly SUSTAINED voices:
// each is built once (always-running generators) and driven by a per-frame `set(...)` that only moves
// AudioParams, the src/tire-audio.js pattern, so the lift into src/ is the voice as-is plus a hook.
// One-shot grains (gravel pings, spatter) create nodes per event, which the ticket allows.
//
// The demos fake the game's frame loop inside an OfflineAudioContext: `_drive` suspends the render
// every 20 ms, calls the voice's per-frame update with a scripted vehicle state, and resumes.
//
//   node tools/audio-proto/offline.mjs /tools/audio-proto/proto-b2.js demoScrape 6

import { getAudioContext, whiteNoiseBuffer, loopNoise, ensureEngineAudio, updateEngineAudio } from '/src/engine-audio.js'
import { ensureWindAudio, updateWindAudio } from '/src/wind-audio.js'
import { playBumpStop } from './proto.js'

const TC = 0.06                                     // s — setTargetAtTime constant, as tire-audio.js
let _white = null
const _wbuf = ctx => (_white ??= whiteNoiseBuffer(ctx, 3))
const _ctx = () => getAudioContext()
const _gain = (ctx, g, to) => { const n = ctx.createGain(); n.gain.value = g; if (to) n.connect(to); return n }
const _filt = (ctx, type, f, q, to) => {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q
    if (to) n.connect(to); return n
}
const _set = (p, v, ctx, tc = TC) => p.setTargetAtTime(v, ctx.currentTime, tc)
const clamp01 = x => Math.max(0, Math.min(1, x))

/** Fake frame loop for offline demos: fn(t, dt) every dt seconds of render time. */
function _drive (ctx, dur, fn, dt = 0.02) {
    for (let i = 1; i * dt < dur; i++) {
        const t = i * dt
        ctx.suspend(t).then(() => { fn(t, dt); ctx.resume() })
    }
}
/** Piecewise-linear script: [[t0, v0], [t1, v1], …] → v(t). */
const lerpKeys = (keys, t) => {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
        const [a, va] = keys[i - 1], [b, vb] = keys[i]
        return va + (vb - va) * (t - a) / (b - a)
    }
    return keys[keys.length - 1][1]
}
/** Poisson events in one frame: how many of rate λ land in dt (λ·dt stays < ~0.5 here). */
const _poisson = (lambda, dt) => { let n = 0, p = lambda * dt; while (p > 0) { if (Math.random() < Math.min(1, p)) n++; p -= 1 } return n }

// ── UNDERBODY / BUMPER SCRAPE ───────────────────────────────────────────────────────────────────
// Hull sliding on the ground. Two layers: RING = noise through a resonant bandpass (Q 8, centre
// 800 → 2500 Hz rising with sliding speed) — the struck panel singing; DRAG = noise lowpassed at
// ~220 Hz — the truck's weight grinding. Grit = the ring's gain re-rolled every frame (stick-slip
// stutter). Rock/road: ring leads, bright. Dirt: ring muffled to ~700 Hz and quiet, drag leads.
// set(v, load, rock): v = sliding speed m/s, load 0..1 = contact force normalised, rock 0..1.
export function makeScrape () {
    const ctx = _ctx(), out = _gain(ctx, 0.5, ctx.destination)
    const ringG = _gain(ctx, 0, out), ringLp = _filt(ctx, 'lowpass', 9000, 0.7, ringG)
    const ringBp = _filt(ctx, 'bandpass', 800, 8, ringLp)
    const ring2 = _filt(ctx, 'bandpass', 800 * 2.3, 6, ringLp)          // the panel's next mode
    loopNoise(ctx, _wbuf(ctx)).connect(ringBp); loopNoise(ctx, _wbuf(ctx)).connect(ring2)
    const dragG = _gain(ctx, 0, out), dragLp = _filt(ctx, 'lowpass', 220, 1.1, dragG)
    loopNoise(ctx, _wbuf(ctx)).connect(dragLp)
    return {
        set (v, load, rock) {
            const s = clamp01((v - 0.15) / 4), on = s > 0 ? Math.sqrt(s) * load : 0
            const f = 800 + 1700 * clamp01(v / 6)
            _set(ringBp.frequency, f, ctx); _set(ring2.frequency, f * 2.3, ctx)
            _set(ringLp.frequency, 700 + 8300 * rock, ctx, 0.1)
            const grit = 0.55 + 0.45 * Math.random()
            _set(ringG.gain, on * grit * (2.2 * rock + 0.6 * (1 - rock)), ctx, 0.008)
            _set(dragG.gain, on * (0.35 + 0.65 * (1 - rock)) * 0.9, ctx)
        },
    }
}
export function demoScrape () {
    const ctx = _ctx(), sc = makeScrape()
    // 0–3 s: bumper on rock, speed up to 5 m/s and back off; 3.4–6 s: belly on dirt, same.
    _drive(ctx, 6, t => {
        const v = lerpKeys([[0, 0], [0.3, 1], [1.5, 5], [2.6, 0.5], [3.0, 0], [3.4, 0], [3.7, 1], [4.8, 5], [5.8, 0]], t)
        sc.set(v, t < 3.2 ? 0.9 : 0.8, t < 3.2 ? 1 : 0)
    })
}

// ── GRAVEL PING ─────────────────────────────────────────────────────────────────────────────────
// Stones flicked into the wheel wells on loose ground: the glass tinkle grain lowered to 1.5–4 kHz,
// a sheet-metal partial (×2.4) on top so it reads as the well, not a bell. Rate ∝ wheel speed.
function _ping (ctx, out, t) {
    const f = 1500 + Math.random() * 2500, g = 0.15 + Math.random() * 0.5, d = 0.025 + Math.random() * 0.04
    for (const [m, gm, dm] of [[1, 1, 1], [2.4, 0.4, 0.5]]) {
        const o = ctx.createOscillator(); o.frequency.value = f * m
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g * gm, t + 0.001)
        e.gain.exponentialRampToValueAtTime(0.0001, t + d * dm)
        o.connect(e); e.connect(out); o.start(t); o.stop(t + d * dm + 0.01)
    }
}
const PING_PER_MS = 0.7     // pings per second per m/s of wheel speed on gravel (15 m/s ⇒ ~10/s)
export function makeGravel () {
    const ctx = _ctx(), out = _gain(ctx, 0.12, ctx.destination)
    return {
        update (dt, wheelSpeed, loose) {
            const n = _poisson(PING_PER_MS * wheelSpeed * loose, dt)
            for (let i = 0; i < n; i++) _ping(ctx, out, ctx.currentTime + Math.random() * dt)
        },
    }
}
export function demoGravel () {
    const ctx = _ctx(), gr = makeGravel()
    _drive(ctx, 6, (t, dt) => gr.update(dt, lerpKeys([[0, 1], [3, 20], [4.5, 20], [6, 3]], t), 1))
}

// ── REVERSE WHINE + DIFF WHINE ──────────────────────────────────────────────────────────────────
// Gear-mesh tones: frequency = shaft speed × tooth count, so the pitch is physically exact for free.
//  · REVERSE (manual box, straight-cut idler): countershaft ≈ 0.68 × input, 25-tooth reverse gear
//    ⇒ ~17 mesh events per engine rev (800 rpm ≈ 230 Hz, 3000 rpm ≈ 850 Hz). Loud, louder under
//    torque; a once-per-countershaft-rev wobble (gear runout) keeps it from being a test tone.
//  · DIFF: 41:11 ring and pinion (= the Ranger's 3.73 final drive) ⇒ 41 mesh events per AXLE rev
//    (= 11 per driveshaft rev). 30 m/s on 0.368 m tyres ≈ 530 Hz. Quiet, mostly on OVERRUN —
//    coasting off-throttle, the pinion's coast face loaded.
function _whine (ctx, out, h2) {
    const g = _gain(ctx, 0, out), wob = _gain(ctx, 1, g)
    const o = ctx.createOscillator(); o.connect(wob)
    const o2 = ctx.createOscillator(); const g2 = _gain(ctx, h2, wob); o2.connect(g2)
    const lfo = ctx.createOscillator(), lfoG = _gain(ctx, 0.25); lfo.connect(lfoG); lfoG.connect(wob.gain)
    o.start(); o2.start(); lfo.start()
    return { g, o, o2, lfo }
}
const REV_MESH_PER_REV = 17, REV_CS = 0.68
export function makeReverseWhine () {
    const ctx = _ctx(), w = _whine(ctx, _gain(ctx, 0.07, ctx.destination), 0.22)
    return {
        set (rpm, throttle, inReverse) {
            const f = rpm / 60 * REV_MESH_PER_REV
            _set(w.o.frequency, f, ctx, 0.03); _set(w.o2.frequency, 2 * f, ctx, 0.03)
            _set(w.lfo.frequency, rpm / 60 * REV_CS, ctx, 0.03)
            _set(w.g.gain, inReverse ? (0.35 + 0.65 * throttle) * clamp01(rpm / 1500) : 0, ctx)
        },
    }
}
const RING_TEETH = 41, WHEEL_R = 0.368
export function makeDiffWhine () {
    const ctx = _ctx(), w = _whine(ctx, _gain(ctx, 0.035, ctx.destination), 0.3)
    return {
        set (speed, drivelineTorque) {   // torque < 0 = overrun
            const axleHz = speed / (2 * Math.PI * WHEEL_R), f = axleHz * RING_TEETH
            _set(w.o.frequency, f, ctx, 0.03); _set(w.o2.frequency, 2 * f, ctx, 0.03)
            _set(w.lfo.frequency, axleHz * RING_TEETH / 11, ctx, 0.03)      // driveshaft rev rate
            const face = drivelineTorque < 0 ? 1 : 0.25                     // coast face sings
            _set(w.g.gain, face * clamp01(Math.abs(drivelineTorque)) * clamp01(speed / 8), ctx, 0.12)
        },
    }
}
export function demoReverse () {   // creep, throttle up to 2800, lift, back to idle
    const ctx = _ctx(), rv = makeReverseWhine()
    _drive(ctx, 4.5, t => {
        const thr = lerpKeys([[0, 0], [0.8, 0], [1.2, 0.8], [2.6, 0.8], [2.8, 0], [4.5, 0]], t)
        rv.set(lerpKeys([[0, 800], [0.8, 800], [2.6, 2800], [3.6, 900], [4.5, 800]], t), thr, true)
    })
}
export function demoDiff () {       // 30 → 9 m/s coast (overrun), then back on the throttle
    const ctx = _ctx(), df = makeDiffWhine()
    _drive(ctx, 6, t => {
        const v = lerpKeys([[0, 30], [4.5, 9], [6, 13]], t)
        df.set(v, t < 4.5 ? -0.7 : 0.6)
    })
}

// ── WET GROUND ──────────────────────────────────────────────────────────────────────────────────
// Stands in for wading. SPATTER = water flung off the tread: lowpassed (1.5 kHz) noise bursts at a
// rate ∝ wheel speed, plus a continuous spray hiss that the bursts fuse into at speed. SQUELCH = a
// wheel load spike pressing into mud: a band of noise sliding 450 → 140 Hz over ~0.15 s.
function _burst (ctx, out, t, dur, freq, g, f1 = null) {
    const s = ctx.createBufferSource(); s.buffer = _wbuf(ctx)
    const f = _filt(ctx, f1 ? 'bandpass' : 'lowpass', freq, f1 ? 3 : 0.7)
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const e = ctx.createGain()
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.004)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f); f.connect(e); e.connect(out); s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.01)
}
const SPATTER_PER_MS = 2.5   // bursts per second per m/s (8 m/s ⇒ 20/s, fusing into the hiss)
export function makeWet () {
    const ctx = _ctx(), out = _gain(ctx, 0.35, ctx.destination)
    const hissG = _gain(ctx, 0, out), hissLp = _filt(ctx, 'lowpass', 1500, 0.7, hissG)
    loopNoise(ctx, _wbuf(ctx)).connect(hissLp)
    return {
        update (dt, wheelSpeed, wet) {
            const s = clamp01(wheelSpeed / 15)
            _set(hissG.gain, wet * 0.5 * s ** 1.5, ctx, 0.15)
            _set(hissLp.frequency, 900 + 1200 * s, ctx, 0.15)
            const n = _poisson(SPATTER_PER_MS * wheelSpeed * wet, dt)
            for (let i = 0; i < n; i++)
                _burst(ctx, out, ctx.currentTime + Math.random() * dt, 0.015 + Math.random() * 0.03, 1500, 0.1 + 0.35 * Math.random())
        },
        squelch (k) { _burst(ctx, out, ctx.currentTime, 0.16, 450, 0.4 + 0.6 * k, 140) },
    }
}
export function demoWet () {
    const ctx = _ctx(), w = makeWet(), spikes = [0.8, 2.3, 3.5, 5.2]
    _drive(ctx, 6.5, (t, dt) => {
        w.update(dt, lerpKeys([[0, 0.5], [3.5, 12], [5, 12], [6.5, 2]], t), 1)
        if (spikes.some(s => t >= s && t < s + dt)) w.squelch(0.5 + Math.random() * 0.5)
    })
}

// ── GRASS / BRUSH SWISH ─────────────────────────────────────────────────────────────────────────
// Off-road over vegetation: broad bandpassed noise (~3 kHz) for the blades, a lower ~900 Hz band for
// stems dragging the bumper, both under slow random swells (clumps). set(v, density 0..1).
export function makeGrass () {
    const ctx = _ctx(), out = _gain(ctx, 0.5, ctx.destination)
    const hiG = _gain(ctx, 0, out), hi = _filt(ctx, 'bandpass', 3000, 0.6, hiG)
    const loG = _gain(ctx, 0, out), lo = _filt(ctx, 'bandpass', 900, 1.2, loG)
    loopNoise(ctx, _wbuf(ctx)).connect(hi); loopNoise(ctx, _wbuf(ctx)).connect(lo)
    let swell = 0.6, next = 0
    return {
        update (t, v, density) {
            if (t >= next) { swell = 0.3 + 0.7 * Math.random(); next = t + 0.25 + Math.random() * 0.5 }
            const lvl = density * clamp01(v / 12) ** 0.8 * swell
            _set(hiG.gain, lvl * 0.6, ctx, 0.15); _set(loG.gain, lvl * 0.45, ctx, 0.15)
            _set(hi.frequency, 2400 + 1400 * clamp01(v / 12), ctx, 0.2)
        },
    }
}
export function demoGrass () {
    const ctx = _ctx(), g = makeGrass()
    _drive(ctx, 6, t => g.update(t, lerpKeys([[0, 0], [2.5, 11], [4, 11], [6, 3]], t), 1))
}

// ── TUNNEL REVERB ───────────────────────────────────────────────────────────────────────────────
// A ConvolverNode (adds a space's echo to whatever passes through it) as a SEND on the master bus,
// faded in over 0.3 s at the portal. Its impulse response (the space's echo fingerprint) is
// generated: stereo noise under an exponential decay (RT60 1.5 s — the time to fall 60 dB), darkening
// as it decays (a one-pole lowpass whose cutoff falls with time: walls eat highs first), plus the
// tunnel's own signature — a flutter echo between the two walls, every 2·w/c ≈ 53 ms for w = 9 m.
const RT60 = 1.5, BORE_W = 9, C_AIR = 343
function _tunnelIR (ctx) {
    const sr = ctx.sampleRate, n = Math.ceil(sr * RT60), ir = ctx.createBuffer(2, n, sr)
    const flutter = Math.round(sr * 2 * BORE_W / C_AIR)
    for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let y = 0
        for (let i = 0; i < n; i++) {
            const t = i / sr, env = Math.exp(-6.91 * t / RT60)
            const a = Math.exp(-2 * Math.PI * (7000 * Math.exp(-t * 2.2) + 600) / sr)  // cutoff 7.6 k → ~1 k
            y = a * y + (1 - a) * (Math.random() * 2 - 1)
            d[i] = y * env * 3
        }
        for (let k = 1; k * flutter < n; k++) {      // discrete wall-to-wall slaps, decaying
            const i = k * flutter + (ch ? 7 : 0)
            d[i] += 0.5 * Math.exp(-6.91 * (i / sr) / RT60) * (k % 2 ? 1 : -1)
        }
    }
    return ir
}
/** Insert a master bus in front of ctx.destination (every module connects to ctx.destination). The
 *  in-game version is a getMasterBus() export modules connect to; this demo shadows the property. */
function _masterBus (ctx) {
    const dest = ctx.destination, bus = _gain(ctx, 1, dest)
    Object.defineProperty(ctx, 'destination', { value: bus, configurable: true })
    return { bus, dest }
}
export function makeTunnelSend (bus, dest) {
    const ctx = _ctx(), conv = ctx.createConvolver(); conv.buffer = _tunnelIR(ctx)
    const wet = _gain(ctx, 0, dest); bus.connect(conv); conv.connect(wet)
    return { set (inBore) { _set(wet.gain, inBore ? 0.9 : 0, ctx, 0.1) } }   // 3·TC ≈ 0.3 s crossfade
}
export function demoTunnel () {     // engine at part throttle + a bump-stop clunk: outside, in (with a blip), out
    const ctx = _ctx(), { bus, dest } = _masterBus(ctx), tn = makeTunnelSend(bus, dest)
    ensureEngineAudio()
    for (const at of [0.8, 3.0, 5.2, 7.0]) playBumpStop(0.9, at)
    _drive(ctx, 8, t => {
        const thr = lerpKeys([[0, 0.4], [3.4, 0.4], [3.5, 1], [3.9, 1], [4.0, 0], [4.6, 0], [4.7, 0.4], [8, 0.4]], t)
        updateEngineAudio(lerpKeys([[0, 2000], [3.4, 2000], [3.9, 3600], [4.6, 1500], [5.2, 2000]], t), thr)
        tn.set(t > 2 && t < 6)
    })
}

// ── NIGHT CRICKETS ──────────────────────────────────────────────────────────────────────────────
// Field-cricket song: a 4–5 kHz carrier gated into chirps of 3–5 pulses (~30 pulses/s), each voice
// repeating at its own 1.6–2.6 chirps/s (Dolbear's law: chirp rate tracks air temperature). Built as
// always-running oscillators whose gains are scheduled a frame ahead — no nodes per chirp.
export function makeCrickets (voices = 4) {
    const ctx = _ctx(), out = _gain(ctx, 0.06, ctx.destination)
    const vs = []
    for (let i = 0; i < voices; i++) {
        const near = i === 0 ? 1 : 0.25 + 0.4 * Math.random()            // one close, the rest off in the dark
        const lp = _filt(ctx, 'lowpass', near > 0.6 ? 12000 : 6000, 0.7, _gain(ctx, near, out))
        const g = _gain(ctx, 0, lp), o = ctx.createOscillator()
        o.frequency.value = 4200 + Math.random() * 800; o.connect(g); o.start()
        vs.push({ g, rate: 1.6 + Math.random(), next: Math.random() * 0.6 })
    }
    let level = 1
    return {
        update (t, dusk) {   // dusk 0..1 from the day clock
            level = dusk
            for (const v of vs) if (t + 0.05 >= v.next) {
                const pulses = 3 + Math.floor(Math.random() * 3)
                for (let p = 0; p < pulses; p++) {
                    const a = v.next + p * 0.033
                    v.g.gain.setValueAtTime(0, a)
                    v.g.gain.linearRampToValueAtTime(level, a + 0.004)
                    v.g.gain.setValueAtTime(level, a + 0.012)
                    v.g.gain.linearRampToValueAtTime(0, a + 0.018)
                }
                v.next += (1 / v.rate) * (0.92 + 0.16 * Math.random())
            }
        },
    }
}
export function demoCrickets () {
    const ctx = _ctx(), cr = makeCrickets()
    _drive(ctx, 7, t => cr.update(t, clamp01(t / 2)))   // fades in over the first 2 s
}

// ── CAMERA-AWARE MIX ────────────────────────────────────────────────────────────────────────────
// A bus, not a sound: in hood view the world goes through a ~2 kHz lowpass (heard through the glass
// and the firewall). Demo: engine at 3000 rpm + wind at 25 m/s; chase 0–2.5 s, hood 2.5–5 s, chase.
export function demoCameraMix () {
    const ctx = _ctx(), { bus, dest } = _masterBus(ctx)
    bus.disconnect()
    const lp = _filt(ctx, 'lowpass', 20000, 0.5, dest); bus.connect(lp)
    ensureEngineAudio(); ensureWindAudio()
    _drive(ctx, 7.5, t => {
        updateEngineAudio(3000, 0.6)
        updateWindAudio({ velocity: { x: 25, y: 0, z: 0 } })
        _set(lp.frequency, t > 2.5 && t < 5 ? 2000 : 20000, ctx, 0.08)
    })
}

// src/perf.js — TEMP lightweight bucketed profiler for load/stream perf triage (D-arc, plan 09-31).
//
// Usage:
//   import { perfAdd, perfMark, perfDump } from './perf.js'
//   const _t = performance.now(); /* ...work... */ perfAdd('label', performance.now() - _t)
//   perfMark('milestone')   // logs an absolute timestamp since load
//   perfDump('load')        // prints a sorted total-time table for all buckets
//
// Remove all of this (and its call sites) once perf is understood. Zero deps, browser + node.

const _buckets = new Map()   // label -> { ms, n }
let _t0 = (typeof performance !== 'undefined' ? performance.now() : 0)

// PERF-08: when enabled (?prof=1 via main.js), every perfAdd is mirrored into a retroactive
// performance.measure() so the existing frame.* buckets show up on the blink.user_timing track
// of a Chrome trace — the external harness (test/profile.mjs) attributes subsystem cost from there.
let _userTiming = false
export function perfEnableUserTiming() { _userTiming = true }

export function perfAdd(label, ms) {
    let b = _buckets.get(label)
    if (!b) { b = { ms: 0, n: 0 }; _buckets.set(label, b) }
    b.ms += ms; b.n++
    if (_hitchOn) _cur.set(label, (_cur.get(label) ?? 0) + ms)   // PERF-26: per-frame delta
    if (_userTiming && ms > 0.005) {
        try { performance.measure(label, { start: performance.now() - ms, duration: ms }) } catch {}
    }
}

// ── PERF-26: per-frame hitch attribution ─────────────────────────────────────────────────────
// The buckets above are CUMULATIVE — they answer "where did the total go", never "what made THIS
// frame 40 ms". Streaming hitches are exactly the second question, so they need per-frame data:
// the bucket DELTAS for the frame plus the discrete streaming EVENTS that landed in it (a terrain
// chunk committed, a road tile built, a prop LOD swap, a shadow bake slice).
//
// Two clocks are kept, deliberately:
//   cpu — wall time inside the game loop (begin→end). This is our JS, attributable by bucket.
//   ms  — the rAF period (begin→begin). Includes GPU wait, buffer/texture upload, shader compile,
//         compositing and GC — none of which appear in any bucket.
// The split IS the diagnostic. cpu ≈ ms on a hitch ⇒ a CPU budget was blown and `top` names it.
// ms >> cpu ⇒ the cost is off-thread: first draw of freshly-committed geometry, a shader variant
// compiling, or the machine simply being loaded. Cumulative buckets can never tell those apart.
//
// Cost when disabled: one boolean test in perfAdd/perfEvent. Enabled: two Map writes per frame.
let _hitchOn = false, _hitchMs = 24
const _cur    = new Map()   // label -> ms accrued in the CURRENT frame
const _curEv  = new Map()   // tag   -> event count in the CURRENT frame
const _tagStats = new Map() // tag   -> { frames, count, msSum, msMax, cpuSum, hitches }
// Control group: frames in which NO streaming event fired. Every tag's mean frame time is judged
// against this, so "props.chunk frames are slow" is a claim about lift over a quiet frame, not
// about the machine's baseline speed.
const _quiet = { frames: 0, count: 0, msSum: 0, msMax: 0, cpuSum: 0, hitches: 0 }
const _hitches = []
const _HITCH_CAP = 400
let _fBegin = 0, _fCpu = 0, _fProgD = 0, _progPrev = -1, _hFrames = 0

/** Enable hitch attribution. thresholdMs = the frame period that counts as a hitch. */
export function perfEnableHitchLog(thresholdMs = 24) { _hitchOn = true; _hitchMs = thresholdMs }

/**
 * Record a discrete streaming event in the current frame (e.g. 'terrain.chunk', 'props.lodSwap').
 * Tag at the COMMIT point — the moment new work enters the scene — not around a cost, which is
 * what perfAdd is for. A tag with near-zero bucket cost but a fat frame period is the signature of
 * a GPU-side pop-in cost, and that is precisely the case this exists to catch.
 */
export function perfEvent(tag, n = 1) { if (_hitchOn) _curEv.set(tag, (_curEv.get(tag) ?? 0) + n) }

/** Call at the very top of the frame loop. Closes out the PREVIOUS frame, then arms this one. */
export function perfFrameBegin() {
    if (!_hitchOn) return
    const now = performance.now()
    if (_fBegin > 0) _closeFrame(now - _fBegin)
    _fBegin = now
    _cur.clear(); _curEv.clear()
}

/**
 * Call at the very bottom of the frame loop, after render.
 * @param {number} programCount renderer.info.programs.length — a jump means a shader variant
 *   compiled this frame, the single most common cause of an ms >> cpu stall.
 */
export function perfFrameEnd(programCount = -1) {
    if (!_hitchOn) return
    _fCpu = performance.now() - _fBegin
    _fProgD = (programCount >= 0 && _progPrev >= 0) ? programCount - _progPrev : 0
    if (programCount >= 0) _progPrev = programCount
}

function _closeFrame(ms) {
    _hFrames++
    const isHitch = ms >= _hitchMs
    if (_curEv.size === 0) {
        _quiet.frames++; _quiet.msSum += ms; _quiet.cpuSum += _fCpu
        if (ms > _quiet.msMax) _quiet.msMax = ms
        if (isHitch) _quiet.hitches++
    }
    for (const [tag, n] of _curEv) {
        let s = _tagStats.get(tag)
        if (!s) { s = { frames: 0, count: 0, msSum: 0, msMax: 0, cpuSum: 0, hitches: 0 }; _tagStats.set(tag, s) }
        s.frames++; s.count += n; s.msSum += ms; s.cpuSum += _fCpu
        if (ms > s.msMax) s.msMax = ms
        if (isHitch) s.hitches++
    }
    if (isHitch) {
        const all = [..._cur.entries()]
        const top = all.filter(e => e[1] >= 0.2).sort((a, b) => b[1] - a[1]).slice(0, 5)
        // Only the top-level frame.* buckets are summed — the rest (flush.*, terrain.*, ribbon.*)
        // are nested inside them and would double-count. What's left is CPU inside the loop that no
        // bucket covers: unbucketed loop sections, or a GC pause.
        let attributed = 0
        for (const [l, v] of all) if (l.startsWith('frame.')) attributed += v
        if (_hitches.length >= _HITCH_CAP) _hitches.shift()
        _hitches.push({
            t: Math.round(_fBegin - _t0), ms: +ms.toFixed(1), cpu: +_fCpu.toFixed(1),
            unattr: +Math.max(0, _fCpu - attributed).toFixed(1), prog: _fProgD,
            top: top.map(([l, v]) => [l, +v.toFixed(1)]),
            ev: Object.fromEntries(_curEv),
        })
    }
}

/** Clear all hitch state — call at the START of a measurement window so load hitches don't count. */
export function perfHitchReset() {
    _tagStats.clear(); _hitches.length = 0; _hFrames = 0
    _quiet.frames = _quiet.count = _quiet.msSum = _quiet.msMax = _quiet.cpuSum = _quiet.hitches = 0
}

/** Structured read-back for the external harness (window.__hitches in main.js). */
export function perfHitchReport() {
    const tags = {}
    for (const [tag, s] of _tagStats) {
        tags[tag] = {
            frames: s.frames, events: s.count, hitches: s.hitches,
            meanMs: s.msSum / s.frames, maxMs: s.msMax, meanCpuMs: s.cpuSum / s.frames,
        }
    }
    return {
        thresholdMs: _hitchMs, frames: _hFrames, hitches: _hitches.slice(),
        quiet: _quiet.frames ? {
            frames: _quiet.frames, hitches: _quiet.hitches,
            meanMs: _quiet.msSum / _quiet.frames, maxMs: _quiet.msMax, meanCpuMs: _quiet.cpuSum / _quiet.frames,
        } : null,
        tags,
    }
}

/** Human-readable console table — the in-game half of the diagnostic (window.__hitchDump()). */
export function perfHitchDump() {
    const r = perfHitchReport()
    const q = r.quiet
    console.log(`──────── hitch report — ${r.frames} frames, ${r.hitches.length} over ${r.thresholdMs}ms ────────`)
    if (q) console.log(`  quiet frame (no streaming event): mean ${q.meanMs.toFixed(1)}ms  cpu ${q.meanCpuMs.toFixed(1)}ms  max ${q.maxMs.toFixed(1)}ms  over ${(100 * q.hitches / q.frames).toFixed(1)}%`)
    const rows = Object.entries(r.tags).sort((a, b) => (b[1].meanMs - a[1].meanMs))
    console.log(`  ${'tag'.padEnd(22)} ${'frames'.padStart(7)} ${'events'.padStart(7)} ${'meanMs'.padStart(7)} ${'lift'.padStart(7)} ${'cpu'.padStart(7)} ${'maxMs'.padStart(7)} ${'hitch%'.padStart(7)}`)
    for (const [tag, s] of rows) {
        const lift = q ? s.meanMs - q.meanMs : NaN
        console.log(`  ${tag.padEnd(22)} ${String(s.frames).padStart(7)} ${String(s.events).padStart(7)} ${s.meanMs.toFixed(1).padStart(7)} ${(lift >= 0 ? '+' : '') + lift.toFixed(1).padStart(6)} ${s.meanCpuMs.toFixed(1).padStart(7)} ${s.maxMs.toFixed(1).padStart(7)} ${(100 * s.hitches / s.frames).toFixed(1).padStart(7)}`)
    }
    console.log(`  ── worst 10 frames ──`)
    for (const h of r.hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 10)) {
        const ev = Object.entries(h.ev).map(([k, v]) => `${k}×${v}`).join(' ') || '—'
        const top = h.top.map(([l, v]) => `${l} ${v}`).join(', ') || '—'
        console.log(`  @${String(h.t).padStart(7)}ms  ${h.ms.toFixed(1).padStart(6)}ms (cpu ${h.cpu.toFixed(1)}${h.prog ? `, +${h.prog} shaders` : ''})  [${ev}]  ${top}`)
    }
    console.log(`────────────────────────────────────────────────────────────────`)
}

// PERF-08: per-frame dt ring buffer (~60s at 60fps). Fed once per render frame from the loop's
// existing FPS-EMA call site; read back whole by the harness for p50/p95/p99 without any polling.
const _FRAME_CAP = 3600
const _frameDt = new Float32Array(_FRAME_CAP)
let _frameHead = 0, _frameCount = 0
export function perfFrameDt(dtMs) {
    _frameDt[_frameHead] = dtMs
    _frameHead = (_frameHead + 1) % _FRAME_CAP
    if (_frameCount < _FRAME_CAP) _frameCount++
}

// Structured read-back for the external harness (window.__perfData in main.js). Returns buckets
// plus the frame-dt buffer in chronological order. perfDump stays console-only for humans.
export function perfSnapshot() {
    const buckets = {}
    for (const [label, b] of _buckets) buckets[label] = { ms: b.ms, n: b.n }
    const frames = new Array(_frameCount)
    const start = (_frameHead - _frameCount + _FRAME_CAP) % _FRAME_CAP
    for (let i = 0; i < _frameCount; i++) frames[i] = _frameDt[(start + i) % _FRAME_CAP]
    return { sinceLoadMs: performance.now() - _t0, buckets, frames }
}

// Absolute milestone marker (ms since last perfReset / module load).
export function perfMark(label) {
    console.log(`[perf @${(performance.now() - _t0).toFixed(0)}ms] ${label}`)
}

// Sorted dump of every bucket by total time. Call when the load/stream settles.
export function perfDump(tag = '') {
    const rows = [..._buckets.entries()].sort((a, b) => b[1].ms - a[1].ms)
    let total = 0; for (const [, b] of rows) total += b.ms
    console.log(`──────── perf dump [${tag}] — ${(performance.now() - _t0).toFixed(0)}ms since load, ${total.toFixed(0)}ms in buckets ────────`)
    for (const [label, b] of rows) {
        console.log(`  ${b.ms.toFixed(1).padStart(9)} ms  ${String(b.n).padStart(6)}×  ${(b.ms / b.n).toFixed(2).padStart(7)} avg  ${label}`)
    }
    console.log(`────────────────────────────────────────────────────────────────`)
}

export function perfReset() { _buckets.clear(); _t0 = performance.now() }

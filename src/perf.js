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
    if (_userTiming && ms > 0.005) {
        try { performance.measure(label, { start: performance.now() - ms, duration: ms }) } catch {}
    }
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

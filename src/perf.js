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

export function perfAdd(label, ms) {
    let b = _buckets.get(label)
    if (!b) { b = { ms: 0, n: 0 }; _buckets.set(label, b) }
    b.ms += ms; b.n++
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

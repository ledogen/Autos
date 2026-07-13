// test/run-all.mjs — the `npm test` entry point. Runs every headless gate, each in its own
// node child process (so a process.exit(1) in one gate doesn't abort the runner, and gates
// stay isolated). Exits non-zero if ANY gate fails.
//
// PERF-08: gates run CONCURRENTLY on a small pool (they are isolated pure-node processes —
// no ports, no shared files, deterministic math), which cuts the wall time from the sum of
// all gates to roughly the slowest gate. Output is buffered per gate and printed whole on
// completion, so logs stay grouped exactly like the old sequential runner. Each gate's wall
// time is printed and the slowest are summarized at the end — if the suite creeps, the table
// names the culprit. `--serial` restores one-at-a-time (e.g. when timing a single gate
// without pool contention); `--only=<substr>[,<substr>]` filters gates by name.
//
// Gates are listed explicitly (not glob-discovered) because test/ also holds libraries
// (lib/*.mjs) and rainy-day manual scripts (assert-m4-*.mjs, need a recorded log) that are
// NOT pass/fail gates. Add a gate here when you write one.

import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const GATES = [
    'arc-router.mjs',       // arc-primitive router: valid-by-construction (Phase 09-31)
    'road-dequantize.mjs',  // BUG-16+FEAT-20: de-quantize refit — shortcut straightens the bow, κ-filter clothoids, switchbacks preserved, endpoint-exact
    'road-minradius.mjs',   // BUG-12: DENSE centerline min-radius the ribbon sweeps (incl. capture fixtures) — RED until Phase B
    'centerline-curvature.mjs', // Road Overhaul Phase A: EXACT primitive min-radius + D-16 invariance (new path, beside old)
    'defect-b-grade.mjs',   // smoothGradeInPlace window-invariance (defect B)
    'invariance.mjs',       // two-center network invariance (THIS rewrite — green since Phase 2)
    'road-band-coverage.mjs', // Mechanism B: R-scaled band covers the disc — runs don't drop out on fly-over (hit+gradeY invariant)
    'restream-invariance.mjs', // same-instance re-stream (cache-reuse) invariance — drive-in == fresh
    'ribbon-carve.mjs',     // synthetic ribbon↔carve agreement (dump-free; replaced seam-grade.mjs)
    'road-smoothness.mjs',  // collision surface has no invisible step the visual ribbon lacks (carve continuity)
    'shoulder-lateral-continuity.mjs', // BUG-15: carve cross-section is C0 across the shoulder edge (no camber-tilt cliff → no airborne/slam in hairpins)
    'road-fill-support.mjs', // BUG-15 (fill): physics footprint matches the mesh embankment extent — car doesn't drop through a raised fill shoulder
    'carve-mesh-smoothness.mjs', // QUAL-07 regression net: REAL _buildCarveTable whole-surface has no catastrophic spikes/tearing (spike% + worst 2nd-diff bounded vs shipped baseline)
    'road-apex-sliver.mjs', // BUG-21: no off-road sliver at a shared hairpin anchor (radial end-fallback in _resolveRoadSurface) — no jolt crossing run boundaries
    'replay-selftest.mjs',  // capture↔replay round-trip (Phase 4 place path) — src/capture.js + replay.mjs
    'route-worker-sync.mjs',// PERF-03 WS-A: worker routing copy == road-carve.js canonical (byte-identical)
    'route-bundle-parity.mjs', // QUAL-14: bundled default-world route cache == live router output (regenerate asset on router change)
    'route-merge.mjs',      // FEAT-10: no collinear duplicates + connectivity (graph emits each edge once)
    'crossing-classifier.mjs', // FEAT-07/08/11/13 foundation: bounded crossing classifier == brute force (graph, cull-off) + once-per-build identity
    'road-graph.mjs',       // FEAT-13 v2: Delaunay/Urquhart primitives — empty-circumcircle, Urquhart⊇MST (connected), order-invariant
    'graph-topology.mjs',   // FEAT-13 v2: blue-noise + Urquhart: reachability, window-invariance, direction variety, step-free inter-edge surface, junction-at-road-grade
    'graph-cull-radius-invariance.mjs', // BUG-25: crossing cull is render-radius- + approach-history-invariant (320 m vs 1500 m edge sets agree; drive-out-and-back reproduces the network)
    'props.mjs',            // FEAT-06: prop geometry sanity + scatter determinism/window-invariance + slot accounting
    'prop-road-clearance.mjs', // BUG-23: no hard-collidable prop (centre-or-overhang) on the road footprint (inflated keep-out)
    'rock-collision-proxy.mjs', // BUG-22: ROCK hard-contact sphere proxy fits the visible surface (no overshoot air-gap → no spurious sideways shove)
    'rock-collision-mesh.mjs',  // BUG-22c: BOULDERS collide vs their actual triangle mesh (exact visible surface, no sphere overshoot)
    'penetration-failsafe.mjs', // BUG-24: catastrophic-penetration failsafe fires only on true tunnels (depth>wheelRadius), not resolvable deep contact — no body teleport on the shoulder step
    'body-contact-energy.mjs',  // BUG-27: hard body slams are strictly dissipative (restitution≈0, accumulated-impulse solver, tamed Baumgarte) — no phantom spin, no launch, rest stays stable
    'drivetrain-climb.mjs',     // FEAT-23: auto-trans + torque-converter climbs 20–30% grades from a stop with no drive/brake oscillation; accel tapers with speed; 4-gear progression, no shift hunting
    'water-invariance.mjs',     // FEAT-22/17/18: basins/saddles/ponds/streams deterministic + window-invariant; ponds rim-contained; streams descend + end at basins; submerged hook
    'pond-route-around.mjs',    // FEAT-17: roads route AROUND ponds — setWaterNoGo site filter + opts.pondDiscs arc rejection: zero centerline points/nodes in any pond+skirt disc
    'stream-carve.mjs',         // FEAT-18: stream channels cut bed+banks (C0, bounded, descending); every road×stream crossing holds road grade for physics (ribbon-deck) with the channel notch continuous both sides
    'stream-bed-drape.mjs',     // FEAT-25: cobble bed ribbon drapes the carved channel — dry shoulders above the waterline (user-visible), center under water, deterministic
]

const argv = process.argv.slice(2)
const SERIAL = argv.includes('--serial')
const only = argv.find(a => a.startsWith('--only='))?.slice(7).split(',')
const gates = only ? GATES.filter(g => only.some(s => g.includes(s))) : GATES
if (only && gates.length === 0) { console.error(`--only matched no gates`); process.exit(1) }

// Pool size: leave headroom for the OS; serial mode = 1. CPU-heavy gates scale ~linearly
// until memory bandwidth saturates, so cap rather than using every core.
const POOL = SERIAL ? 1 : Math.max(2, Math.min(8, availableParallelism() - 2))

const runGate = gate => new Promise(resolve => {
    const t0 = performance.now()
    const child = spawn('node', [join(HERE, gate)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => out += d)
    child.stderr.on('data', d => out += d)
    child.on('close', status => {
        const secs = (performance.now() - t0) / 1000
        console.log(`\n${'━'.repeat(64)}\n▶ ${gate} — ${secs.toFixed(1)}s ${status === 0 ? '✓' : '✗ FAILED'}\n${'━'.repeat(64)}`)
        process.stdout.write(out)
        resolve({ gate, status, secs })
    })
})

// Gates with wall-clock timing ASSERTIONS (e.g. arc-router's PERF:search-time < 60 ms/connection)
// go RED under pool contention — 8 CPU-heavy siblings triple their measured times. They run
// serially AFTER the pool drains so their clocks are honest.
const TIMING_GATES = new Set(['arc-router.mjs'])

const queue = gates.filter(g => !TIMING_GATES.has(g))
const results = []
const suiteT0 = performance.now()
await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, async () => {
    while (queue.length) results.push(await runGate(queue.shift()))
}))
for (const gate of gates.filter(g => TIMING_GATES.has(g))) results.push(await runGate(gate))

const failed = results.filter(r => r.status !== 0).map(r => r.gate)
const suiteSecs = (performance.now() - suiteT0) / 1000
const cpuSecs = results.reduce((s, r) => s + r.secs, 0)
console.log(`\n${'═'.repeat(64)}`)
console.log(`slowest gates: ${[...results].sort((a, b) => b.secs - a.secs).slice(0, 5).map(r => `${r.gate} ${r.secs.toFixed(0)}s`).join(' · ')}`)
console.log(`wall ${suiteSecs.toFixed(0)}s (pool ${POOL}) · gate-cpu ${cpuSecs.toFixed(0)}s`)
if (failed.length) {
    console.log(`RUN-ALL: ${gates.length - failed.length}/${gates.length} gates green — FAILED: ${failed.join(', ')}`)
    process.exit(1)
}
console.log(`RUN-ALL: all ${gates.length} gates green ✓`)

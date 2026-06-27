// test/run-all.mjs — the `npm test` entry point. Runs every headless gate in sequence,
// each in its own node child process (so a process.exit(1) in one gate doesn't abort the
// runner, and gates stay isolated). Exits non-zero if ANY gate fails.
//
// Gates are listed explicitly (not glob-discovered) because test/ also holds libraries
// (lib/*.mjs) and rainy-day manual scripts (assert-m4-*.mjs, need a recorded log) that are
// NOT pass/fail gates. Add a gate here when you write one.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const GATES = [
    'arc-router.mjs',       // arc-primitive router: valid-by-construction (Phase 09-31)
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
    'road-apex-sliver.mjs', // BUG-21: no off-road sliver at a shared hairpin anchor (radial end-fallback in _resolveRoadSurface) — no jolt crossing run boundaries
    'replay-selftest.mjs',  // capture↔replay round-trip (Phase 4 place path) — src/capture.js + replay.mjs
    'route-worker-sync.mjs',// PERF-03 WS-A: worker routing copy == road-carve.js canonical (byte-identical)
    'camber-continuity.mjs',// BUG-19: banking carries continuously across continuing run boundaries (cross-run seed sync)
    'props.mjs',            // FEAT-06: prop geometry sanity + scatter determinism/window-invariance + slot accounting
]

let failed = []
for (const gate of GATES) {
    console.log(`\n${'━'.repeat(64)}\n▶ ${gate}\n${'━'.repeat(64)}`)
    const res = spawnSync('node', [join(HERE, gate)], { stdio: 'inherit' })
    if (res.status !== 0) failed.push(gate)
}

console.log(`\n${'═'.repeat(64)}`)
if (failed.length) {
    console.log(`RUN-ALL: ${GATES.length - failed.length}/${GATES.length} gates green — FAILED: ${failed.join(', ')}`)
    process.exit(1)
}
console.log(`RUN-ALL: all ${GATES.length} gates green ✓`)

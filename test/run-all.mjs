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
    'restream-invariance.mjs', // same-instance re-stream (cache-reuse) invariance — drive-in == fresh
    'ribbon-carve.mjs',     // synthetic ribbon↔carve agreement (dump-free; replaced seam-grade.mjs)
    'replay-selftest.mjs',  // capture↔replay round-trip (Phase 4 place path) — src/capture.js + replay.mjs
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

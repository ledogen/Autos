// test/run-all.mjs — the `npm test` entry point. Runs every headless gate in sequence,
// each in its own node child process (so a process.exit(1) in one gate doesn't abort the
// runner, and gates stay isolated). Exits non-zero if ANY gate fails.
//
// Gates are listed explicitly (not glob-discovered) because test/ also holds libraries
// (lib/*.mjs), diagnostics (diag-*.mjs, spline-continuity.mjs), and browser harnesses
// (*.html, *.js) that are NOT pass/fail gates. Add a gate here when you write one.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const GATES = [
    'arc-router.mjs',       // arc-primitive router: valid-by-construction (Phase 09-31)
    'defect-b-grade.mjs',   // smoothGradeInPlace window-invariance (defect B)
    'invariance.mjs',       // two-center network invariance (THIS rewrite — RED until Phase 2)
    'ribbon-carve.mjs',     // synthetic ribbon↔carve agreement (dump-free; replaced seam-grade.mjs)
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

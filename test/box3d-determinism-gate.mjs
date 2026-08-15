// GATE (FEAT-48): the physics engine is bit-deterministic on this machine — the Phase 0
// contract that made the Box3D adoption a GO. Runs the determinism harness (10k fixed steps,
// tumbling hull on a heightfield, sampled mid-flight and settled) twice in-process and diffs
// the state hash against the recorded expectation (test/box3d-determinism.expected, line 1).
// A hash change means the engine build, the bindings, or the harness changed — review and
// re-record deliberately, never blindly. Cross-machine axis (Windows thin client) is the
// deferred owner-run check documented in the .expected file.
//
// Run: node test/box3d-determinism-gate.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { run } from './box3d-determinism.mjs'

const expected = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'box3d-determinism.expected'), 'utf8')
  .split('\n')[0].trim()

const { hash, samePass } = await run()
const match = hash === expected
console.log(`  ${samePass ? '✓' : '✗'} run-to-run in-process: two sims identical`)
console.log(`  ${match ? '✓' : '✗'} hash matches recorded expectation (${hash} vs ${expected})`)
if (!samePass || !match) { console.log('BOX3D-DETERMINISM: FAIL'); process.exit(1) }
console.log('BOX3D-DETERMINISM: PASS — engine state hash reproducible and matches the Phase 0 record ✓')

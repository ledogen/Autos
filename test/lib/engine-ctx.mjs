// test/lib/engine-ctx.mjs — FEAT-48: engine world scaffolding for the physics gates.
//
// After the cutover, stepPhysics requires engineCtx = { engine, chassis }. Gates that
// mock their ground with an analytic function get the SAME surface as an engine
// heightfield here (the wheels still use the gate's own analytic queryContacts — the
// heightfield only carries chassis/body contact and gravity integration).
//
// Usage per scenario:
//   const ctx = await makeEngineCtx(vs, P, { groundFn: (x, z) => -tanT * z, extent: 1024, cell: 8 })
//   ... stepPhysics(vs, P, DT, queryContacts, ctx) ...
//   ctx.dispose()
//
// One engine WORLD per scenario (WASM module is shared/idempotent); dispose when done.

import { createPhysicsEngine } from '../../src/physics-engine.js'
import { createVehicleChassis } from '../../src/physics.js'

export async function makeEngineCtx (vs, P, { groundFn = null, extent = 128, cell = 2, friction = 0.8 } = {}) {
  const engine = await createPhysicsEngine()
  if (groundFn) {
    const N = Math.round((2 * extent) / cell) + 1
    const h = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) {
      for (let xi = 0; xi < N; xi++) {
        h[zi * N + xi] = groundFn(-extent + xi * cell, -extent + zi * cell)
      }
    }
    const ground = engine.createBody({ type: 'static', position: { x: -extent, y: 0, z: -extent } })
    engine.addHeightfield(ground, h, N, N, cell, { friction })
  }
  const chassis = createVehicleChassis(engine, vs, P)
  return { engine, chassis, dispose: () => engine.dispose() }
}

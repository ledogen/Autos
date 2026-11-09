// test/lib/engine-ctx.mjs — FEAT-48: engine world scaffolding for the physics gates.
//
// After the cutover, stepPhysics requires engineCtx = { engine, chassis }. Gates that
// mock their ground with an analytic function get the SAME surface as an engine
// heightfield here (the wheels still use the gate's own analytic queryContacts — the
// heightfield only carries chassis/body contact and gravity integration).
//
// Usage per scenario:
//   const ctx = await makeEngineCtx(vs, P, { groundFn: (x, z) => -tanT * z, extent: 1024, cell: 8 })
//   (cx, cz centre the heightfield square when the scenario is not at the origin — e.g. a replayed
//   capture somewhere out in the world. `road: true` builds it as the road deck instead, FEAT-193.)
//   ... stepPhysics(vs, P, DT, queryContacts, ctx) ...
//   ctx.dispose()
//
// One engine WORLD per scenario (WASM module is shared/idempotent); dispose when done.

import { createPhysicsEngine } from '../../src/physics-engine.js'
import { createVehicleChassis } from '../../src/physics.js'

export async function makeEngineCtx (vs, P, { groundFn = null, extent = 128, cell = 2, friction = 0.8, cx = 0, cz = 0, bed = null, road = false } = {}) {
  const engine = await createPhysicsEngine()
  if (groundFn && road) {
    // FEAT-193: the same surface as the ROAD DECK — a mesh in GROUP_ROAD at the road's μ (terrain-physics.js
    // RoadPhysics), so the chassis meets it as it meets asphalt. Faces wound upward (a mesh collides from its front).
    const N = Math.round((2 * extent) / cell) + 1, pos = new Float32Array(N * N * 3), idx = []
    for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) {
      const k = 3 * (zi * N + xi), x = cx - extent + xi * cell, z = cz - extent + zi * cell
      pos[k] = x; pos[k + 1] = groundFn(x, z); pos[k + 2] = z
    }
    for (let zi = 0; zi < N - 1; zi++) for (let xi = 0; xi < N - 1; xi++) {
      const a = zi * N + xi, b = a + 1, c = a + N, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
    engine.addRoadMesh(engine.createBody({ type: 'static' }), pos, Uint32Array.from(idx), { friction: 0.9 })
  } else if (groundFn) {
    const N = Math.round((2 * extent) / cell) + 1
    const h = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) {
      for (let xi = 0; xi < N; xi++) {
        h[zi * N + xi] = groundFn(cx - extent + xi * cell, cz - extent + zi * cell)
      }
    }
    const ground = engine.createBody({ type: 'static', position: { x: cx - extent, y: 0, z: cz - extent } })
    engine.addHeightfield(ground, h, N, N, cell, { friction })
  }
  const chassis = createVehicleChassis(engine, vs, P, { bed })   // bed: the model's open-bed spec, as the game builds it
  return { engine, chassis, dispose: () => engine.dispose() }
}

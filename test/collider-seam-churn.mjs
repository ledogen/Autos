// GATE (BUG-60): a long-lived STATIC hull keeps answering wheel-sized contact queries while
// short-lived shapes are created and destroyed around it.
//
// WHY THIS EXISTS. The FEAT-41 menu stage puts a permanent static rock in the same world as the
// wheel hard cores, which destroy and re-create a hull shape every physics step (updateWheelRims →
// replaceHullLocal, 4 mm threshold — ~1000 shape create/destroys per second). Under that churn the
// rock stopped being reported by contactSphere: the wheel settled INSIDE it, at ground height, with
// the rock still drawn around it. The collider was never damaged — body transform, shape id, hull
// data and the raw narrow-phase test were all correct at every failing sample — so the assertions
// below deliberately check the SEAM's answer (contactSphere), not the geometry, because the
// geometry was never the thing that broke.
//
// This matters well beyond the menu: FEAT-71/72/74 scatter static POI and road-furniture hulls
// through a world where debris spawns and despawns constantly.
//
// Five independent invariants:
//   1. BOOKKEEPING — the shape-keyed maps return to their baseline after each create/destroy
//      cycle. destroyBody used to prune only _shapeToHandle, leaving _shapeHulls and _shapeSizeR
//      to grow without bound; keys are index1+generation and Box3D RECYCLES shape slots, so a
//      stale hull entry is hull data waiting to be read for a DIFFERENT, live shape.
//   2. VISIBILITY — the static hull answers a wheel-sized sphere at its own surface with the same
//      depth on every cycle as it did on cycle 0. This is the assertion that actually failed.
//   3. DEBRIS UNDER THE WHEEL — the same query with {collidesWith: GROUP_DEBRIS, dynamicOnly} still
//      finds a live debris body, because that is the path a wheel rolling over a loose rock takes
//      (physics.js qcPlus) and it runs through the same rewritten enumeration.
//   4. HULL OWNERSHIP (BUG-62) — retained hull count does not grow per cycle. The world copies hull
//      data on shape creation, so each body owns exactly one copy per live hull shape and frees it
//      when the slot is replaced or the body dies.
//   5. KEY WIDTH (BUG-61) — the shape key cannot alias once a recycled slot's generation passes
//      65535, which ~20 minutes of driving reaches.
//
// Pure node, no browser: initPhysicsEngine() runs headless, same as box3d-determinism-gate.
//
// Run: node test/collider-seam-churn.mjs

import { initPhysicsEngine, PhysicsEngine, GROUP_STATIC, GROUP_DEBRIS, GROUP_CHASSIS }
  from '../src/physics-engine.js'

const CYCLES = 12
const STEPS_PER_CYCLE = 120
const DT = 1 / 60

await initPhysicsEngine()
const E = new PhysicsEngine()

// A part-buried faceted rock, the stage's shape: icosahedron sheared flat at 0.7·RY.
const R_XZ = 0.62, R_Y = 0.45, FLAT = 0.70, PROUD = 0.26
const PHI = (1 + Math.sqrt(5)) / 2
const rockPoints = []
for (const [x, y, z] of [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
  [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]]) {
  const k = 1 / Math.hypot(x, y, z)
  rockPoints.push(x * k * R_XZ, Math.min(y * k * R_Y, R_Y * FLAT), z * k * R_XZ)
}
const ROCK = { x: -1.035, y: PROUD - R_Y * FLAT, z: -1.052 }   // top of the cap sits at y = PROUD

const rock = E.createBody({ type: 'static', position: ROCK, userData: { kind: 'rock' } })
E.addHull(rock, rockPoints, { friction: 0.95, group: GROUP_STATIC })

const ground = E.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 }, userData: { kind: 'ground' } })
E.addBox(ground, { x: 60, y: 5, z: 60 }, { group: GROUP_STATIC })

// The churn source: a chassis whose four wheel cores are rebuilt every step, directly over the
// rock. Distance matters — the same churn far away never provoked the fault.
const RIM = { friction: 0.5, restitution: 0, group: GROUP_CHASSIS, collidesWith: GROUP_DEBRIS, updateBodyMass: false }
const corePoints = (cx, cy, cz, r = 0.30, halfW = 0.11, sides = 12) => {
  const a = []
  for (let i = 0; i < sides; i++) {
    const th = (i / sides) * Math.PI * 2
    for (const sx of [-halfW, halfW]) a.push(cx + sx, cy + r * Math.sin(th), cz + r * Math.cos(th))
  }
  return a
}
const chassis = E.createBody({ type: 'dynamic', position: { x: ROCK.x, y: 0.9, z: ROCK.z } })
E.addBox(chassis, { x: 0.9, y: 0.5, z: 2.3 }, { group: GROUP_CHASSIS, density: 300 })
const cores = []
for (const [x, z] of [[-0.75, -1.4], [0.75, -1.4], [-0.75, 1.4], [0.75, 1.4]]) {
  E.addHull(chassis, corePoints(x, -0.3, z), RIM)
  cores.push({ shapeIndex: E.shapeCount(chassis) - 1, x, z, y: -0.3 })
}
E.setMassData(chassis, 1600, { x: 2699, y: 3000, z: 678 })

// A wheel-sized sphere resting on the cap: 0.368 m tire, hub at 0.60, cap top at 0.26 → 28 mm in.
const WHEEL_R = 0.368, HUB_Y = 0.60
const surfaceDepthMM = () => {
  const hits = E.contactSphere({ x: ROCK.x, y: HUB_Y, z: ROCK.z }, WHEEL_R, { collidesWith: GROUP_STATIC })
  const onRock = hits.filter(h => E.getUserData(h.body)?.kind === 'rock')
  return onRock.length ? Math.round(Math.max(...onRock.map(h => h.depth)) * 1000) : null
}
const mapSizes = () => ({ toHandle: E._shapeToHandle.size })
// Hulls live on the body record now (one per live hull shape), so "retained" is a real census.
const hullsRetained = () => {
  let n = 0
  for (const rec of E._bodies.values()) for (const h of rec.hulls) if (h) n++
  return n
}
// The qcPlus path: a loose rock under the wheel, dynamic bodies only.
const debrisSeen = (y) => E.contactSphere({ x: 0, y, z: 3.0 }, WHEEL_R,
  { collidesWith: GROUP_DEBRIS, dynamicOnly: true }).length

const DEBRIS_PROBE_Y = 0.30   // a wheel-sized sphere sitting where the debris rocks settle
const baseDepth = surfaceDepthMM()
const baseMaps = mapSizes()
const baseHulls = hullsRetained()
if (baseDepth === null) { console.log('COLLIDER-SEAM-CHURN: FAIL — the rock does not answer even at rest'); process.exit(1) }

const failures = []
for (let c = 0; c < CYCLES; c++) {
  // Three debris bodies spawn, live through the cycle, and are destroyed — the create/destroy half.
  const live = []
  for (let d = 0; d < 3; d++) {
    const b = E.createBody({ type: 'dynamic', position: { x: (d - 1) * 0.34, y: 0.6, z: 3.0 },
      linearVelocity: { x: 0, y: -1, z: 0 }, userData: { kind: 'debris' } })
    E.addHull(b, rockPoints.map(v => v * 0.35), { density: 2200, friction: 0.8, group: GROUP_DEBRIS })
    live.push(b)
  }
  let debrisHeld = 0
  for (let k = 0; k < STEPS_PER_CYCLE; k++) {
    for (const r of cores) {                       // the replaceHullLocal half
      r.y += (k % 2 ? 1 : -1) * 0.006              // > RIM_REBUILD_M, so every step really rebuilds
      E.replaceHullLocal(chassis, r.shapeIndex, corePoints(r.x, r.y, r.z), RIM)
    }
    E.step(DT, 4)
    if (k > 20 && debrisSeen(DEBRIS_PROBE_Y) > 0) debrisHeld++
  }
  for (const b of live) E.destroyBody(b)

  const depth = surfaceDepthMM()
  const maps = mapSizes()
  const hulls = hullsRetained()
  if (depth === null) failures.push(`cycle ${c}: the rock stopped answering a ${WHEEL_R} m sphere at its own surface`)
  else if (Math.abs(depth - baseDepth) > 1) failures.push(`cycle ${c}: surface depth drifted ${baseDepth} → ${depth} mm`)
  if (maps.toHandle !== baseMaps.toHandle) failures.push(`cycle ${c}: _shapeToHandle ${baseMaps.toHandle} → ${maps.toHandle} (dead shapes retained)`)
  if (hulls !== baseHulls) failures.push(`cycle ${c}: hulls retained ${baseHulls} → ${hulls} (BUG-62: a rebuilt slot's copy was not freed)`)
  if (debrisHeld === 0) failures.push(`cycle ${c}: a debris body under the wheel was never seen by the qcPlus query`)
}

// BUG-61: _shapeKey is a pure function of (index1, generation), so test it as one. Driving a real
// slot past 65535 generations would mean ~70k engine rebuilds inside this gate — slow, and it
// stresses the engine rather than the invariant. Sweep the boundary directly instead.
{
  const seen = new Map()
  let collided = null
  for (const index1 of [1, 2, 3, 17, 4096]) {
    for (const generation of [0, 1, 65534, 65535, 65536, 65537, 131071, 131072, 4294967295]) {
      const key = E._shapeKey({ index1, generation })
      if (!Number.isSafeInteger(key)) { collided = `key ${key} for slot ${index1} gen ${generation} is not a safe integer`; break }
      const prev = seen.get(key)
      if (prev && prev.index1 !== index1) { collided = `slot ${prev.index1} gen ${prev.generation} and slot ${index1} gen ${generation} share key ${key}`; break }
      seen.set(key, { index1, generation })
    }
  }
  if (collided) failures.push(`BUG-61: ${collided}`)
}

console.log(`  baseline: surface depth ${baseDepth} mm · ${baseMaps.toHandle} live shapes · ${baseHulls} hulls held`)
console.log(`  ${CYCLES} churn cycles × ${STEPS_PER_CYCLE} steps, ~${CYCLES * STEPS_PER_CYCLE * 4} shape rebuilds`)
if (failures.length) {
  for (const f of failures.slice(0, 8)) console.log(`  ✗ ${f}`)
  if (failures.length > 8) console.log(`  … and ${failures.length - 8} more`)
  console.log('COLLIDER-SEAM-CHURN: FAIL')
  process.exit(1)
}
console.log(`  ✓ the static hull answered ${baseDepth} mm on every cycle`)
console.log(`  ✓ debris under the wheel stayed visible to the qcPlus query (dynamicOnly)`)
console.log(`  ✓ hulls retained held at ${baseHulls} — no per-rebuild leak`)
console.log('  ✓ _shapeToHandle retained no dead shape, and the key cannot alias')
console.log('COLLIDER-SEAM-CHURN: PASS — a static collider survives shape churn around it ✓')

// GATE (BUG-246, owner 2026-11-20): the truck driven into a route house's porch at walking pace never ends up
// inside it.
//
// The owner: "occasionally it also lets the truck through. And then the truck crashes into the house, but is
// clipping through the porch. This only happened at slow speed." The porch floors stand 0.40 m (ranchDeck),
// 0.50 m (cottagePorch) and 0.72 m (cabinLanding) — at or under the bumper blade's bottom edge (0.49 m), above
// the axle (0.37 m). The chassis hull met them, but the TIRES are the analytic query (world-contacts.js), and
// PoiSystem.queryContact did not list the route houses: the wheels rolled through the porch while the slab's
// chamfer slid the body up onto it, and the truck crept on until the house wall stopped it.
//
// The test truck on flat ground, the house's colliders through terrain-physics.js PoiPhysics (as main.js
// _syncPoiPhysics builds them), the wheels through world-contacts.js makeQueryContacts with the PoiSystem that
// owns the house (the game's query), driven at a held speed into the porch's front face, square and at ±30°.
// Per house, speed and angle, throttle held at the speed (the truck keeps pushing): no hub ever crosses the porch's
// face (its overlap with the porch box stays under the tire's radius: a wheel inside the porch is the clip), and the
// bumper never reaches the house wall. Measured: 2–5 cm pressed in at a crawl, 21–25 cm at 8 m/s (past the 15 cm soft
// band: the rim meets the step, as it would on a 40 cm kerb at 18 mph).
// Run: node test/porch-strike.mjs
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { createPhysicsEngine, GROUP_TERRAIN } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { PoiPhysics } from '../src/terrain-physics.js'
import { PoiSystem } from '../src/poi.js'
import { makeQueryContacts } from '../src/world-contacts.js'

const DT = 1 / 60
let fails = 0
const check = (ok, label) => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}`); if (!ok) fails++ }

/** Box `b` of house `h` in its frame: (lx, ly, lz) of world point p. */
const local = (h, b, p) => {
  const cs = Math.cos(h.modelYaw), sn = Math.sin(h.modelYaw), dx = p.x - h.modelX, dz = p.z - h.modelZ
  return { x: cs * dx - sn * dz - b.c[0], y: p.y - h.baseY - b.c[1], z: sn * dx + cs * dz - b.c[2] }
}

async function strike (key, speed, angleDeg) {
  const M = PROP_MODELS[key], porch = M.collision.boxes[M.porch], body = M.collision.boxes[0]
  // the house at the origin, yaw 0: its porch faces model −Z, so the truck comes from −Z heading +Z
  const h = { id: 'house', key, modelX: 0, modelZ: 0, baseY: 0, modelYaw: 0, collision: M.collision }
  const P = structuredClone(RANGER_PARAMS)
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  engine.addBox(engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } }), { x: 500, y: 5, z: 500 }, { friction: 0.9, group: GROUP_TERRAIN })
  new PoiPhysics(engine).sync([h], 1.6)
  const pois = new PoiSystem({ getParams: () => ({}) })
  pois._routeHouses = [h]
  const q = makeQueryContacts({
    params: P, groundH: () => 0, groundN: () => ({ x: 0, y: 1, z: 0 }), pois: () => pois,
  })
  // truck forward is body −Z; yaw it to head along a = (sin θ, 0, cos θ) toward the porch face
  const th = angleDeg * Math.PI / 180, yaw = Math.PI + th
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  const face = porch.c[2] - porch.s[2] / 2, aim = { x: porch.c[0], z: face }
  vs.position.set(aim.x - Math.sin(th) * 7, eq.bodyY, aim.z - Math.cos(th) * 7)
  vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  vs.strutComp = [...eq.strutComp]
  const dir = new THREE.Vector3(Math.sin(th), 0, Math.cos(th))
  vs.velocity.copy(dir).multiplyScalar(speed); vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P)
  const fwd = new THREE.Vector3()
  let worstWheel = -Infinity, restWheel = -Infinity, wall = false, maxRise = 0
  for (let s = 0; s < 60 * (7 / speed + 4); s++) {
    const vNow = vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion))
    vs.throttle = Math.max(0, Math.min(1, (speed - vNow) * 0.8)); vs.brake = 0
    stepPhysics(vs, P, DT, q, { engine, chassis })
    maxRise = Math.max(maxRise, vs.position.y - eq.bodyY)
    restWheel = -Infinity
    for (let i = 0; i < 4; i++) {
      const w = local(h, porch, getWheelPosition(i, vs, P)), r = P.wheelRadius
      // the tire's overlap with the porch box: its radius less the hub's distance to the box, or, with the hub
      // inside the box (the clip), its radius plus the hub's distance to the nearest face
      const ex = Math.abs(w.x) - porch.s[0] / 2, ey = Math.abs(w.y) - porch.s[1] / 2, ez = Math.abs(w.z) - porch.s[2] / 2
      const d = ex < 0 && ey < 0 && ez < 0 ? r - Math.max(ex, ey, ez)
        : r - Math.hypot(Math.max(ex, 0), Math.max(ey, 0), Math.max(ez, 0))
      worstWheel = Math.max(worstWheel, d); restWheel = Math.max(restWheel, d)
    }
    // the bumper blade's face (physics.js CHASSIS_PROFILE noseZ) at the house wall's box = the porch did not hold it
    const b = local(h, body, new THREE.Vector3(0, 0, -2.053).applyQuaternion(vs.quaternion).add(vs.position))
    if (b.z > -body.s[2] / 2 - 0.05 && Math.abs(b.x) < body.s[0] / 2) wall = true
  }
  engine.dispose()
  return { worstWheel, restWheel, wall, maxRise }
}

for (const key of ['ranchDeck', 'cottagePorch', 'cabinLanding']) {
  const floor = PROP_MODELS[key].collision.boxes[PROP_MODELS[key].porch].s[1]
  for (const speed of [0.5, 1, 2, 4, 8]) for (const ang of [0, 30, -30]) {
    const r = await strike(key, speed, ang)
    check(r.worstWheel < RANGER_PARAMS.wheelRadius && !r.wall, `${key} (floor ${floor.toFixed(2)} m) at ${speed} m/s, ${ang}°: deepest tire `
      + `${(r.worstWheel * 100).toFixed(0)} cm into the porch (rest ${(r.restWheel * 100).toFixed(0)}), body ${r.wall ? 'REACHED the house wall' : 'held off the wall'}, `
      + `rose ${(r.maxRise * 100).toFixed(0)} cm`)
  }
}
console.log(fails ? `\nPORCH-STRIKE: ${fails} FAILED` : '\nPORCH-STRIKE: ALL CHECKS PASSED')
process.exit(fails ? 1 : 0)

// GATE: rocks in the open bed stay in the bed at highway speed (owner report 2026-09-29).
//
// Owner: "if I start driving quickly and cornering ... the rocks lead slightly then they go back in
// the bed ... before they glitch out either through the cab or the tailgate."
//
// The cause was the chassis' Box3D BULLET flag (continuous collision, so the truck cannot tunnel
// through a barrel it hits at speed). Once the chassis moves fast enough to count as "fast" in the
// engine, a bullet's sweep stops at the first dynamic body it would touch — and a rock resting in the
// bed touches it at t = 0. Every step then froze the truck at its start pose while the rocks carried
// on, and they left through the cab. Measured on flat ground at constant speed: escapes at 22 m/s and
// up, none at 20, before any steering at all.
//
// The fix (src/debris.js beforeStep): a body inside the bed well is flagged a bullet itself, and a
// bullet never sweeps against another bullet. Ordinary contact still carries the rock; debris outside
// the bed stays a plain body, so the truck still sweeps against anything on the road ahead.
//
// Three checks:
//   (1) CONTROL — without beforeStep the rocks DO escape at 60 mph (the gate can see the bug).
//   (2) STRAIGHT — 60 mph, straight line, six rocks: none leaves the bed.
//   (3) SLALOM — 60 mph with a steering wiggle (the owner's repro), and 78 mph: none leaves the bed.
//
// Run: node test/cargo-bed.mjs

import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DebrisSystem, DEBRIS_TYPES } from '../src/debris.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
const ROCK = DEBRIS_TYPES.rock
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

/** The rock GLB's vertices, centred on their bbox — the same hull debris.js builds at runtime. */
function rockHull () {
  const buf = fs.readFileSync(new URL('../assets/models/test-rock.glb', import.meta.url))
  const jl = buf.readUInt32LE(12)
  const js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  const binOff = 20 + jl + 8
  const pts = []
  for (const n of js.nodes) {
    if (n.mesh == null) continue
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])))
    for (const pr of js.meshes[n.mesh].primitives) {
      const a = js.accessors[pr.attributes.POSITION], bv = js.bufferViews[a.bufferView]
      const off = buf.byteOffset + binOff + (bv.byteOffset || 0) + (a.byteOffset || 0)
      const f = new Float32Array(buf.buffer.slice(off, off + a.count * 12))
      for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3(f[3 * i], f[3 * i + 1], f[3 * i + 2]).applyMatrix4(m))
    }
  }
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3())
  return pts.flatMap(v => [v.x - c.x, v.y - c.y, v.z - c.z])
}
const HULL = rockHull()

/**
 * Drive a loaded truck on flat ground and report the first rock to leave the bed.
 * @returns {{ escapedAt: number|null, maxSlosh: number }} escape time [s] or null; widest |x| seen.
 */
async function drive ({ speed, amp = 0, period = 1.2, seconds = 6, rocks = 6, flagCargo = true }) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })

  const vs = makeVehicleState(P, RUNNING)
  const eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 1000)
  vs.strutComp = [...eq.strutComp]
  vs.velocity.set(0, 0, -speed)                       // forward = -Z
  vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const ctx = { engine, chassis }
  const flat = (cx, cy, cz, r) => {
    const d = r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
  }

  // Rocks resting just above the floor, already moving with the truck. beforeStep only reads
  // _eng and _live, so it runs on a bare record list — the same code path the game takes.
  const live = []
  for (let i = 0; i < rocks; i++) {
    const at = new THREE.Vector3([-0.3, 0.3, 0][i % 3], BED.floorY + 0.25,
      BED.frontZ + 0.35 + i * (1.4 / Math.max(1, rocks - 1))).add(vs.position)
    const body = engine.createBody({ type: 'dynamic', position: at, linearVelocity: { x: 0, y: 0, z: -speed } })
    engine.addHull(body, HULL, { density: ROCK.density, friction: ROCK.friction, restitution: ROCK.restitution, group: GROUP_DEBRIS })
    live.push({ body, cargo: false, prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion() })
  }
  const debris = { _eng: engine, _live: live }

  const cp = new THREE.Vector3(), cq = new THREE.Quaternion(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  let escapedAt = null, maxSlosh = 0
  for (let s = 0; s < seconds * 60 && escapedAt === null; s++) {
    const t = s * DT
    const steer = t > 1 ? amp * Math.sin(2 * Math.PI * (t - 1) / period) : 0
    vs.throttle = 0.45
    vs.steerAngle = steer
    if (vs.wheelSteerAngles) vs.wheelSteerAngles[0] = vs.wheelSteerAngles[1] = steer
    if (flagCargo) DebrisSystem.prototype.beforeStep.call(debris, chassis, BED)
    stepPhysics(vs, P, DT, flat, ctx)
    engine.getTransform(chassis, cp, cq)
    const inv = cq.clone().invert()
    for (const r of live) {
      engine.getTransform(r.body, p, q)
      p.sub(cp).applyQuaternion(inv)
      maxSlosh = Math.max(maxSlosh, Math.abs(p.x))
      const out = p.y < BED.floorY - 0.05 || Math.abs(p.x) > BED.innerHalfW + 0.02 ||
        p.z < BED.frontZ - 0.02 || p.z > BED.tailZ + 0.02
      if (out) { escapedAt = t; break }
    }
  }
  engine.dispose()
  return { escapedAt, maxSlosh }
}

console.log('control — without the cargo flag the bug is visible:')
{
  const r = await drive({ speed: 26.8, seconds: 2, flagCargo: false })
  ok(r.escapedAt !== null, `rocks leave the bed at 60 mph (escaped at ${r.escapedAt?.toFixed(2)} s)`)
}

console.log('straight line — 60 mph:')
{
  const r = await drive({ speed: 26.8 })
  ok(r.escapedAt === null, `six rocks stay in the bed for 6 s (${r.escapedAt === null ? 'none escaped' : 'escaped at ' + r.escapedAt.toFixed(2) + ' s'})`)
}

console.log('slalom — the owner\'s repro:')
for (const c of [{ speed: 26.8, amp: 0.06, period: 1.2 }, { speed: 26.8, amp: 0.1, period: 1.5 }, { speed: 35, amp: 0.05, period: 1.2 }]) {
  const r = await drive(c)
  ok(r.escapedAt === null && r.maxSlosh > 0.1,
    `${(c.speed * 2.237).toFixed(0)} mph, steer ±${c.amp} rad every ${c.period} s: none escaped, rocks slosh to |x| ${r.maxSlosh.toFixed(2)} m ` +
    `(${r.escapedAt === null ? 'held' : 'ESCAPED at ' + r.escapedAt.toFixed(2) + ' s'})`)
}

console.log(fail ? 'CARGO-BED: FAIL' : 'CARGO-BED: PASS')
process.exit(fail)

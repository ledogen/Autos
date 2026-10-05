// GATE: the FEAT-88 haul load — firewood bundles drop into the bed, stay there, and stay out of the
// wear model and the debris cap.
//
// The load is what the game spawns: bedDropPoints() places the pieces (body-local, seeded), each is
// dropped HAUL_DROP_H above the floor on a HAUL_DROP_GAP stagger exactly like main.js's _haulStep,
// and "aboard" is inBedWell() — the same test settle pays on. The bundle is an 8-point box at the
// asset's size (0.30 x 0.30 x 0.48 m) and its real 11 kg, so the gate needs no GLB.
//
// Checks:
//   (a) DETERMINISM — the same key gives the same drop points, spins and variants; another key does not.
//   (b) LOADING — 7 and 12 bundles dropped on a parked truck all land in the well.
//   (c) RIDE — the 12-bundle load stays aboard through a launch to 60 km/h and a hard stop.
//   (d) WEAR — with the bundles flagged noDamage the chassis contact readout ignores them; unflagged,
//       the same load registers (so the gate can see the filter).
//   (e) CAP — reclaiming past DEBRIS_CAP never takes a pinned body, and pinned bodies do not count.
//
// Run: node test/haul-load.mjs

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { HAUL_BUNDLES, HAUL_BUNDLE_KG } from '../data/offers.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DebrisSystem, DEBRIS_TYPES, DEBRIS_CAP, bedDropPoints, inBedWell } from '../src/debris.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
const DROP_H = 2.6, DROP_GAP = 0.3          // main.js HAUL_DROP_H / HAUL_DROP_GAP
const SIZE = [0.30, 0.30, 0.48]
const BOX = []
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) BOX.push(sx * SIZE[0] / 2, sy * SIZE[1] / 2, sz * SIZE[2] / 2)
const DENSITY = HAUL_BUNDLE_KG / (SIZE[0] * SIZE[1] * SIZE[2])
const SPEC = DEBRIS_TYPES.bundleA

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

/** A truck parked on flat ground with its bed empty. */
async function truck () {
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
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const flat = (cx, cy, cz, r) => {
    const d = r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
  }
  const live = []
  const t = { P, engine, vs, chassis, live, ctx: { engine, chassis }, flat, debris: { _eng: engine, _live: live } }
  t.step = () => {
    DebrisSystem.prototype.beforeStep.call(t.debris, chassis, BED)
    stepPhysics(vs, P, DT, flat, t.ctx)
  }
  return t
}

/** Drop `n` bundles the way _haulStep does, then let them settle. */
function load (t, n, key, { noDamage = true } = {}) {
  const drops = bedDropPoints(n, BED, key)
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), qd = new THREE.Quaternion()
  t.vs.throttle = 0; t.vs.brake = 0; t.vs.handbrake = true   // parked: the latch holds the handbrake
  for (let s = 0, i = 0; s < Math.round(((n - 1) * DROP_GAP + 3) / DT); s++) {
    while (i < n && s * DT >= i * DROP_GAP) {
      const d = drops[i++]
      v.set(d.x, d.y, d.z).applyQuaternion(t.vs.quaternion).add(t.vs.position)
      q.copy(t.vs.quaternion).multiply(qd.set(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w))
      const body = t.engine.createBody({ type: 'dynamic', position: { x: v.x, y: v.y + DROP_H, z: v.z },
        quaternion: { x: q.x, y: q.y, z: q.z, w: q.w }, linearVelocity: { x: 0, y: -1.2, z: 0 },
        angularVelocity: d.spin, userData: { kind: 'debris', noDamage } })
      t.engine.addHull(body, BOX, { density: DENSITY, friction: SPEC.friction, restitution: SPEC.restitution, group: GROUP_DEBRIS })
      t.live.push({ body, cargo: false, prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion() })
    }
    t.step()
  }
}

/** Bundles inside the well right now — the settle count. */
function aboard (t) {
  const cp = new THREE.Vector3(), cq = new THREE.Quaternion(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  t.engine.getTransform(t.chassis, cp, cq)
  cq.invert()
  return t.live.filter(r => { t.engine.getTransform(r.body, p, q); return inBedWell(p.sub(cp).applyQuaternion(cq), BED) }).length
}

console.log('(a) determinism:')
{
  const a = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#0'))
  const b = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#0'))
  const c = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#1'))
  ok(a === b, 'same key → identical drop points, spins and variants')
  ok(a !== c, 'a different offer → a different load')
  const pts = bedDropPoints(12, BED, 'k')
  ok(pts.every(d => Math.abs(d.x) + SIZE[0] / 2 < BED.wheelhouseHalfW && d.z > BED.frontZ && d.z < BED.tailZ),
    'every drop point is over the floor, inside the wheelhouse walls')
}

console.log("(b) loading a parked truck:")
for (const n of HAUL_BUNDLES) {
  const t = await truck()
  load(t, n, `haul:6:gate:${n}`)
  const a = aboard(t)
  ok(a === n, `${n} bundles dropped, ${a} in the bed`)
  t.engine.dispose()
}

console.log('(c) the 12-bundle load rides:')
{
  const t = await truck()
  const n = HAUL_BUNDLES[1]
  load(t, n, 'haul:6:gate:ride')
  let top = 0
  t.vs.handbrake = false; t.vs.brake = 0; t.vs.throttle = 0.6
  for (let s = 0; s < 8 / DT && top < 16.7; s++) { t.step(); top = Math.max(top, t.vs.velocity.length()) }
  const atSpeed = aboard(t)
  t.vs.throttle = 0; t.vs.brake = 1
  for (let s = 0; s < 4 / DT; s++) t.step()
  const stopped = aboard(t)
  ok(top >= 16.7, `reached ${(top * 3.6).toFixed(0)} km/h`)
  ok(atSpeed === n && stopped === n, `${n} aboard at speed (${atSpeed}) and after a hard stop (${stopped})`)
  t.engine.dispose()
}

console.log('(d) cargo never reads as an impact:')
for (const noDamage of [true, false]) {
  const t = await truck()
  load(t, HAUL_BUNDLES[1], 'haul:6:gate:wear', { noDamage })
  const hit = t.engine.maxContactImpulse(t.chassis)
  ok(noDamage ? hit.impulse === 0 : hit.impulse > 0,
    `${noDamage ? 'flagged' : 'UNflagged (control)'}: chassis contact impulse ${hit.impulse.toFixed(1)} N·s`)
  t.engine.dispose()
}

console.log('(e) the cap never eats the load:')
{
  const reclaimed = []
  const rec = (pinned, i) => ({ pinned, i })
  const fake = { _live: [], _reclaim: (r) => reclaimed.push(r) }
  for (let i = 0; i < 12; i++) fake._live.push(rec(true, i))            // the load first, oldest
  for (let i = 12; i < 12 + DEBRIS_CAP + 2; i++) fake._live.push(rec(false, i))
  DebrisSystem.prototype._enforceCap.call(fake)
  ok(reclaimed.length === 2 && reclaimed.every(r => !r.pinned), `2 over the cap → the 2 oldest UNPINNED reclaimed (${reclaimed.map(r => r.i)})`)
  ok(fake._live.filter(r => r.pinned).length === 12, 'all 12 pinned bundles survive')
}

console.log(fail ? 'HAUL-LOAD: FAIL' : 'HAUL-LOAD: PASS')
process.exit(fail)

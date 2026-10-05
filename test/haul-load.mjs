// GATE: the FEAT-88 haul load — firewood bundles drop into the bed, stay there, and stay out of the
// wear model and the debris cap.
//
// The load is what the game spawns: bedDropPoints() places the pieces (body-local, seeded), each is
// dropped HAUL_DROP_H above the floor on a HAUL_DROP_GAP stagger exactly like main.js's _haulStep,
// and "aboard" is inBedWell() — the same test settle pays on. Each bundle is the convex hull of its
// own shipped GLB (variants A/B/C, as debris.js builds it) at its real 11 kg.
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

import fs from 'node:fs'
import * as THREE from 'three'
import { PROP_MODELS } from '../data/prop-models.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { HAUL_BUNDLES, HAUL_BUNDLE_KG } from '../data/offers.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DebrisSystem, DEBRIS_TYPES, DEBRIS_CAP, bedDropPoints, inBedWell, bboxCorners } from '../src/debris.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
const DROP_H = 2.6, DROP_GAP = 0.3          // main.js HAUL_DROP_H / HAUL_DROP_GAP

/** A GLB's vertices centred on their bbox — the hull debris.js builds (same reader as cargo-bed). */
function glbHull (url) {
  const buf = fs.readFileSync(new URL('../' + url, import.meta.url))
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
const HULLS = Object.fromEntries(Object.entries(DEBRIS_TYPES).filter(([k]) => k.startsWith('bundle'))
  .map(([k, spec]) => [k, glbHull(PROP_MODELS[spec.model].url)]))
const SPEC = DEBRIS_TYPES.bundleA
const SIZE = [0.32, 0.33, 0.45]   // the largest extents across the variants — for the drop-point clearance check

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
      // Density by debris.js's own probe, so each variant weighs exactly its massKg on its own hull.
      const rho = DEBRIS_TYPES[d.kind].massKg / DebrisSystem.prototype._hullVolume.call({ _eng: t.engine }, HULLS[d.kind])
      t.engine.addHull(body, HULLS[d.kind], { density: rho, friction: SPEC.friction, restitution: SPEC.restitution, group: GROUP_DEBRIS })
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

console.log('(0) every bundle hull builds, at the mass offers.js says:')
{
  const t = await truck()
  const masses = Object.keys(HULLS).map(k => {
    const b = t.engine.createBody({ type: 'dynamic', position: { x: 0, y: 50, z: 0 } })
    t.engine.addHull(b, HULLS[k], { density: DEBRIS_TYPES[k].massKg / DebrisSystem.prototype._hullVolume.call({ _eng: t.engine }, HULLS[k]), group: GROUP_DEBRIS })
    return t.engine.getMass(b)
  })
  ok(masses.every(m => Math.abs(m - HAUL_BUNDLE_KG) < 0.01), `every variant is ${HAUL_BUNDLE_KG} kg on its own hull (${masses.map(m => m.toFixed(2)).join(', ')})`)
  t.engine.dispose()
}

// From here on the load uses what the GAME would build: debris.js falls back to a variant's
// bounding box when the engine refuses its hull, so (b)–(d) test the shipped behaviour even while
// (0) is red on an asset.
{
  const t = await truck()
  for (const k of Object.keys(HULLS)) {
    if (!(DebrisSystem.prototype._hullVolume.call({ _eng: t.engine }, HULLS[k]) > 0)) HULLS[k] = bboxCorners(HULLS[k])
  }
  t.engine.dispose()
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

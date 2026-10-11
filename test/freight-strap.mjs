// GATE: FEAT-96 freight — a load STRAPPED (welded) in the bed.
//
// The freight job hands its load over at accept, already welded to the chassis at strapPose()
// (src/debris.js). What must hold:
//   1. the data joins up — every freight thing names a load, every load a registered model, and
//      nothing is posted from a blank "from" (owner, 2026-10-10);
//   2. strapPose is deterministic and seats every load ON the deck (rib crests), or on the
//      wheelhouse tops only when its strap-free width really is wider than the gap;
//   3. the weld holds: a 400 kg load drifts < 5 mm in the bed over a rough road at 15 m/s;
//   4. mass is real: the rear struts squat the same welded as with the same body resting loose;
//   5. teardown: removing the body takes the weld with it — body and joint counts back to baseline.

import * as THREE from 'three'
import { PROP_MODELS } from '../data/prop-models.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { THINGS, SOURCES } from '../data/offers.js'
import { FREIGHT } from '../data/freight.js'
import { BUILT_FAMILIES, jobBadge } from '../src/offer-board.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { strapPose } from '../src/debris.js'
import { splitPayout } from '../src/economy.js'
import { gradeRun, RANK_THRESHOLDS_DEFAULT } from '../src/par.js'
import { FREIGHT_TIME_SLACK, FREIGHT_TIP_MULT } from '../data/offers.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── 1. the data ──────────────────────────────────────────────────────────────────────────────
console.log('data:')
const freight = THINGS.filter(t => t.family === 'freight')
ok(BUILT_FAMILIES.has('freight'), 'freight is a built family')
ok(freight.length > 0 && freight.every(t => FREIGHT[t.load]), `every freight thing (${freight.length}) names a load in data/freight.js`)
ok(Object.values(FREIGHT).every(r => PROP_MODELS[r.model]), 'every load is a registered model')
ok(freight.every(t => t.pools.length > 0 && t.pools.every(k => SOURCES[k]?.families.includes('freight'))),
  'every freight thing has a shipper, and each shipper posts freight')
ok(freight.every(t => t.massKg[0] > 0 && t.massKg[1] >= t.massKg[0]), 'every freight thing has a real mass range')
const badges = ['delivery', 'freight', 'fragile', 'haul'].map(f => jobBadge({ family: f, shape: 'courier' }))
  .concat(jobBadge({ family: 'delivery', shape: 'fetch' }))
ok(new Set(badges).size === badges.length && jobBadge({ family: 'papers' }) === null,
  `card badges are distinct (${badges.join(' ')}); Larry has none`)

// ── 1b. freight's pay curve (owner, 2026-10-11): grades looser, tips less, base untouched ─────────
console.log('pay:')
const lineSame = [0.5, 0.77, 1, 1.2, 2].every(r => JSON.stringify(splitPayout(180, r, 1)) === JSON.stringify(splitPayout(180, r, 1, 1, 1)))
ok(lineSame, 'tipMult 1 is the ordinary line, to the cent')
const fS = splitPayout(230, 0.5 / FREIGHT_TIME_SLACK, 1, 1, FREIGHT_TIP_MULT), cS = splitPayout(230, 0.5, 1)
ok(fS.base === cS.base && Math.abs(fS.total - fS.base * (1 + FREIGHT_TIP_MULT)) < 0.011,
  `freight S pays base × ${1 + FREIGHT_TIP_MULT} ($${fS.total}), courier/haul base × 2 ($${cS.total}) on the same par`)
const looseT = Object.fromEntries(Object.entries(RANK_THRESHOLDS_DEFAULT).map(([k, v]) => [k, v * FREIGHT_TIME_SLACK]))
ok(gradeRun(230, 230, looseT).letter === 'B' && gradeRun(230 * 0.88, 230, looseT).letter === 'S'
  && gradeRun(230 * 1.1, 230, looseT).letter === 'C',
  'freight letters: par pace is B, 0.88 × par is S, 1.1 × par is still C')

// ── 2. strapPose ─────────────────────────────────────────────────────────────────────────────
console.log('strapPose:')
const halfOf = (r) => { const [x, y, z] = PROP_MODELS[r.model].collision.size; return { x: x / 2, y: y / 2, z: z / 2 } }
let seated = true, onWh = []
for (const [k, r] of Object.entries(FREIGHT)) {
  const h = halfOf(r), p = strapPose(BED, h)
  const bottom = p.y - h.y, wide = h.x > BED.wheelhouseHalfW
  if (JSON.stringify(p) !== JSON.stringify(strapPose(BED, h))) seated = false
  if (Math.abs(bottom - (wide ? BED.wheelhouseY : BED.floorY)) > 1e-9) seated = false
  if (wide) onWh.push(k)
}
ok(seated, 'every load sits on the rib crests (or the wheelhouse tops if wider than the gap), same pose every call')
ok(onWh.length < Object.keys(FREIGHT).length / 2, `only genuinely wide loads ride the wheelhouses: ${onWh.join(', ')}`)
// The strap trap: a pallet's straps read 1.40 m wide on the mesh; judged on that it would ride 207 mm up.
const pal = halfOf(FREIGHT.pottingSoilPallet)
ok(Math.abs(strapPose(BED, { ...pal, x: 0.70 }, pal.x).y - pal.y - BED.floorY) < 1e-9, 'a 1.0 m pallet with 1.4 m straps still sits on the deck')

// ── 3–5. physics ─────────────────────────────────────────────────────────────────────────────
async function truck (bumpy) {
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
  // The wheels read an analytic road (the chassis box never touches it): ±4 cm of washboard + swell.
  const gy = (x, z) => bumpy ? 0.04 * Math.sin(z * 1.7) + 0.03 * Math.sin(z * 0.53 + x * 0.9) : 0
  const road = (cx, cy, cz, r) => {
    const d = gy(cx, cz) + r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, gy(cx, cz), cz) }] : []
  }
  return { P, engine, vs, chassis, step: () => stepPhysics(vs, P, DT, road, { engine, chassis }) }
}
const LOAD = { x: 0.5, y: 0.3, z: 0.6 }, KG = 400
const LOCAL = strapPose(BED, LOAD)
function addLoad (t, lift = 0) {
  const p = new THREE.Vector3(LOCAL.x, LOCAL.y + lift, LOCAL.z).applyQuaternion(t.vs.quaternion).add(t.vs.position)
  const b = t.engine.createBody({ type: 'dynamic', position: p, quaternion: t.vs.quaternion })
  t.engine.addBox(b, LOAD, { density: KG / (8 * LOAD.x * LOAD.y * LOAD.z), friction: 0.6, group: GROUP_DEBRIS })
  return { b, p }
}
const rearComp = (t) => (t.vs.strutComp[2] + t.vs.strutComp[3]) / 2

console.log('physics:')
// 4. mass is real — welded vs the same box resting loose (2 cm drop onto the crests).
const tl = await truck(false), loose = addLoad(tl, 0.02)
for (let i = 0; i < 240; i++) tl.step()
const tw = await truck(false), base = tw.engine.counters()
const w = addLoad(tw)
tw.engine.createWeldJoint(tw.chassis, w.b, w.p)
const welded = tw.engine.counters()
for (let i = 0; i < 240; i++) tw.step()
const dl = rearComp(tl), dw = rearComp(tw)
ok(Math.abs(dl - dw) < 0.003, `rear struts squat the same welded as loose (${(dw * 1000).toFixed(1)} vs ${(dl * 1000).toFixed(1)} mm)`)
// 5. teardown.
ok(welded.joints === base.joints + 1 && welded.bodies === base.bodies + 1, 'strapping adds one body and one joint')
tw.engine.destroyBody(w.b)
const after = tw.engine.counters()
ok(after.bodies === base.bodies && after.joints === base.joints, `removing the load takes the weld with it (bodies ${after.bodies}/${base.bodies}, joints ${after.joints}/${base.joints})`)
tl.engine.dispose(); tw.engine.dispose()

// 3. the weld holds over a rough road at speed.
const tr = await truck(true)
const r = addLoad(tr)
tr.engine.createWeldJoint(tr.chassis, r.b, r.p)
tr.vs.velocity.set(0, 0, -15)
tr.vs.wheelOmega = [0, 1, 2, 3].map(() => 15 / tr.P.wheelRadius)
let drift = 0, finite = true
const bp = new THREE.Vector3(), bq = new THREE.Quaternion(), rel = new THREE.Vector3(), qi = new THREE.Quaternion()
for (let i = 0; i < 300; i++) {
  tr.vs.throttle = 0.35
  tr.step()
  tr.engine.getTransform(r.b, bp, bq)
  rel.copy(bp).sub(tr.vs.position).applyQuaternion(qi.copy(tr.vs.quaternion).invert())
  drift = Math.max(drift, rel.distanceTo(LOCAL))
  if (![bp.x, bp.y, bp.z, tr.vs.position.y].every(Number.isFinite)) finite = false
}
ok(finite, 'no NaN over 5 s of rough road')
ok(drift < 0.005, `400 kg welded drifts ${(drift * 1000).toFixed(2)} mm in the bed over a rough road at 15 m/s (< 5)`)
tr.engine.dispose()

console.log(fail ? '\nFREIGHT-STRAP: FAILED' : '\nFREIGHT-STRAP: all checks passed')
process.exit(fail)

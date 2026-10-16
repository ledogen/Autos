// test/calibrate-overload-puncture.mjs — FEAT-112 rainy-day calibration (NOT a gate).
//
// Question: with the overload tire ramp (FEAT-112 §6), does a fresh tire survive ordinary driving with
// cinder blocks aboard, and pop on a genuinely hard hit? Measures the peak bump-stop force per corner
// (vehicleState.bumpForce, the signal damage.js _landBumpStop prices) for a cinder-block pallet of
// several masses over a fixed set of inputs, and prints it against the fresh-tire pop threshold.
//
// Rig: test/fragile-cargo.mjs's — real stepPhysics, a flat crash box, wheels on an analytic road,
// the load welded in the bed at strapPose with the cinder pallet's real collision size. Pure node and
// deterministic, so one run per cell is the answer.
//
//   node test/calibrate-overload-puncture.mjs

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { strapPose } from '../src/debris.js'
import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'

const DT = 1 / 60, MPH = 0.44704
const BED = DEFAULT_VEHICLE_MODEL.bed
const [sx, sy, sz] = PROP_MODELS.cinderBlockPallet.collision.size
const HALF = { x: sx / 2, y: sy / 2, z: sz / 2 }

// FEAT-112 numbers: soft 570, pop onset 600, hard cap 820 (owner, 2026-10-16).
const ONSET = 600, CAP = 820
const MASSES = [0, 570, 670, 785, 820]

// ── surfaces: height y(x, z) and its gradient, travel is −Z from z = 1000 ───────────────────────
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
const flat = () => ({ y: 0, gx: 0, gz: 0 })
// The fragile gate's washboard: ±amp, two crossing sines.
const washboard = amp => (x, z) => ({
  y: amp * (Math.sin(z * 1.7) + 0.7 * Math.sin(z * 0.53 + x * 0.9)),
  gx: amp * 0.7 * 0.9 * Math.cos(z * 0.53 + x * 0.9),
  gz: amp * (1.7 * Math.cos(z * 1.7) + 0.7 * 0.53 * Math.cos(z * 0.53 + x * 0.9)),
})
// The lab's rumble lane (src/lab.js rumbleSurface): raised cosine, amp above the plane, crest-to-crest
// spacing, 2 m fade in and out, over s = 1000 − z ∈ [5, 125].
const rumble = (amp, spacing) => (x, z) => {
  const s = 1000 - z - 5, len = 120
  if (s < 0 || s > len) return flat()
  const w = smooth(0, 2, s) * smooth(len, len - 2, s), k = 2 * Math.PI / spacing
  return { y: amp * 0.5 * (1 - Math.cos(k * s)) * w, gx: 0, gz: -amp * 0.5 * k * Math.sin(k * s) * w }
}

async function run (massKg, { surf = flat, mph = 0, drop = 0, steer = 0, steps = 300 }) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY + drop, 1000)
  vs.strutComp = [...eq.strutComp]
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const n = new THREE.Vector3()
  const road = (cx, cy, cz, r) => {
    const g = surf(cx, cz), d = g.y + r - cy
    if (d <= 0) return []
    n.set(-g.gx, 1, -g.gz).normalize()
    return [{ normal: n.clone(), depth: d * n.y, contactPoint: new THREE.Vector3(cx, g.y, cz) }]
  }
  if (massKg > 0) {
    const lp = strapPose(BED, HALF)
    const p = new THREE.Vector3(lp.x, lp.y, lp.z).applyQuaternion(vs.quaternion).add(vs.position)
    const b = engine.createBody({ type: 'dynamic', position: p, quaternion: vs.quaternion })
    engine.addBox(b, HALF, { density: massKg / (8 * HALF.x * HALF.y * HALF.z), group: GROUP_DEBRIS })
    engine.createWeldJoint(chassis, b, p)
  }
  const v0 = mph * MPH
  vs.velocity.set(0, 0, -v0)
  vs.wheelOmega = [0, 1, 2, 3].map(() => v0 / P.wheelRadius)
  const peak = [0, 0, 0, 0]
  let vSum = 0
  for (let i = 0; i < steps; i++) {
    const v = Math.hypot(vs.velocity.x, vs.velocity.z); vSum += v
    vs.throttle = mph ? Math.min(1, Math.max(0, (v0 - v) * 0.6 + 0.25)) : 0
    if (steer) { const a = steer * Math.sin(i * DT * 2 * Math.PI / 3); vs.wheelSteerAngles = [a, a, 0, 0] }
    stepPhysics(vs, P, DT, road, { engine, chassis })
    for (let k = 0; k < 4; k++) peak[k] = Math.max(peak[k], Math.abs(vs.bumpForce[k] || 0))
  }
  engine.dispose()
  return { peak, held: vSum / steps / MPH }
}

// ── the overload ramp: condition cap by bed mass, then the existing puncture curve ─────────────
const cap = (m, far) => m <= ONSET ? 1 : 0.5 - (0.5 - far) * Math.min(1, (m - ONSET) / (CAP - ONSET))
const dm = new DamageModel()
const popN = (m, far) => dm.punctureThreshold(Math.min(1, cap(m, far)))

const INPUTS = {
  'paved slalom, 45 mph':        { mph: 45, steer: 0.08, steps: 600 },
  'washboard ±4 cm, 34 mph':     { surf: washboard(0.04), mph: 34, steps: 600 },
  'washboard ±6 cm, 25 mph':     { surf: washboard(0.06), mph: 25, steps: 600 },
  'med rumble, 20 mph':          { surf: rumble(0.125, 0.625), mph: 20, steps: 900 },
  'large rumble, 20 mph':        { surf: rumble(0.200, 1.000), mph: 20, steps: 900 },
  'large rumble, 40 mph':        { surf: rumble(0.200, 1.000), mph: 40, steps: 600 },
  'drop 0.5 m, parked':          { drop: 0.5, steps: 240 },
  'drop 0.9 m, parked':          { drop: 0.9, steps: 240 },
  'crest landing 1 m, 34 mph':   { drop: 1.0, mph: 34, steps: 240 },
}

const kN = f => (f / 1000).toFixed(1).padStart(6)
console.log(`cinder pallet ${sx}×${sy}×${sz} m at strapPose; peak bump-stop force, REAR max (front max) kN`)
console.log(`floors: spring ${D.springForceFloorFront / 1000}/${D.springForceFloorRear / 1000} kN F/R\n`)
console.log('fresh-tire pop threshold by mass (far end of ramp 10 % | 20 %):')
for (const m of MASSES) {
  const a = popN(m, 0.10), b = popN(m, 0.20)
  console.log(`  ${String(m).padStart(4)} kg  ${a === Infinity ? '   none' : kN(a)} | ${b === Infinity ? '  none' : kN(b)}`)
}
console.log()
console.log('input'.padEnd(28) + MASSES.map(m => `${m} kg`.padStart(15)).join(''))
for (const [label, opt] of Object.entries(INPUTS)) {
  const cells = []
  let held = 0
  for (const m of MASSES) {
    const r = await run(m, opt)
    held = r.held
    const rear = Math.max(r.peak[2], r.peak[3]), front = Math.max(r.peak[0], r.peak[1])
    const pop = rear >= popN(m, 0.10) ? '*' : ' '
    cells.push(`${kN(rear)}${pop}(${kN(front).trim()})`.padStart(15))
  }
  console.log(label.padEnd(28) + cells.join('') + (opt.mph ? `   held ~${held.toFixed(0)} mph @785` : ''))
}
console.log('\n* = rear peak reaches the fresh-tire pop threshold with the 10 % ramp')

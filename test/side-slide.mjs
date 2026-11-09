// test/side-slide.mjs — BUG-89 / BUG-115 / BUG-116 / FEAT-193: a rolled truck scrubs to a stop, and a sideways one rolls on.
//
// Through the GAME's contact (src/world-contacts.js → src/tire-contact.js) and the game's open-bed chassis. Until
// BUG-116 this gate ran its own sphere contact, whose tire read a full radius of phantom depth lying on its side — that
// is what carried the truck and made the old 26.9 m pass; the game's tire carries its honest sidewall load.
//
// BUG-89: the down-side tires' sidewalls scrub at the tire's μ (physics.js Step 2.6).
// BUG-116: on its side the truck rests on the slab's FLANK (0.85 m out; the tires' faces stop at 0.83), and at the
// body's 0.1 it skated 108 m from 15 m/s. The flank is its own hull at its own grip. The sidewall scrub is gated on the
// tire's tilt (a tire lying at 87° put a few newtons on its strut, which switched the scrub off), and a tilted tire's
// load acts at its contact edge, not its hub (at the hub, a truck on its side tipped onto its wheels on a 12° slope).
// FEAT-193 (owner, 2026-11-08): the flank grips dirt at pair μ 1.0 and the road deck at 0.5 (BUG-116 had 0.5 on dirt).
//   • 15 m/s along its length on flat dirt stops inside 30 m (measured 11.8 m; 20.4 m at 0.5; was 108 m)
//   • on the ROAD deck it skids: the same slide runs over 1.3× the dirt one, and still stops inside 30 m (measured 20.1 m)
//   • lying flush on its side across a 15° slope it holds: < 1 m in 10 s, still on its side (was 18 m, ending on its wheels)
//   • on its side, still rolling (8–12 m/s sideways, 2.5–3.5 rad/s roof-first, 9 cases): ≥ 5 roll on past 80°
//     (measured 9; 6 at 0.5; was 3) and the mean slide is under 25 m (measured 15.1 m; was 37.3 m)
// BUG-115: on its ROOF the cab hull grips at pair μ 0.3 (owner, 2026-11-06):
//   • on its roof across 8° and 15° it holds: < 1 m in 10 s after it lands

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { makeQueryContacts } from '../src/world-contacts.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`); if (!ok) failed++ }
const tiltDeg = (vs) => Math.acos(Math.max(-1, Math.min(1, new THREE.Vector3(0, 1, 0).applyQuaternion(vs.quaternion).y))) * 180 / Math.PI

/** A truck dropped rolled `rollDeg` (90 = on its right side, roof toward +x; 180 = its roof) on ground y = tan(slope)·x, settled 3 s. */
async function rolled (slopeDeg, rollDeg, road = false) {
  const t = Math.tan(slopeDeg * Math.PI / 180), n = new THREE.Vector3(-t, 1, 0).normalize()
  const qc = makeQueryContacts({ params: RANGER_PARAMS, groundH: (x) => t * x, groundN: () => n })
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const vs = {
    position: new THREE.Vector3(0, rollDeg === 180 ? 1.3 : 1.0, 0), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), rollDeg * Math.PI / 180),
    angularVelocity: new THREE.Vector3(), steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0], wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: true,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: (x) => t * x, extent: 128, cell: slopeDeg ? 1 : 4, bed: DEFAULT_VEHICLE_MODEL.bed, road })
  const step = (k) => { for (let i = 0; i < k; i++) stepPhysics(vs, P, DT, qc, ctx) }
  step(180)
  return { vs, ctx, step }
}

/** Slide until it stops (or 10 s): distance [m] and the roll it turned through [deg, + = toward the roof]. */
function slide ({ vs, step }) {
  const p0 = vs.position.clone(), axis = new THREE.Vector3()
  let t = 0, roll = 0
  while (t < 10 && !(t > 0.5 && vs.velocity.length() < 0.2)) {
    step(1); t += DT
    roll += vs.angularVelocity.dot(axis.set(0, 0, -1).applyQuaternion(vs.quaternion)) * DT * 180 / Math.PI
  }
  return { d: Math.hypot(vs.position.x - p0.x, vs.position.z - p0.z), t, roll }
}

const along = []
for (const road of [false, true]) {
  const r = await rolled(0, 90, road)
  r.vs.velocity.set(0, 0, -15)
  const { d, t } = slide(r)
  along.push(d)
  check(d < 30, `15 m/s on its side along its length on ${road ? 'the road' : 'dirt'} stops in ${d.toFixed(1)} m, ${t.toFixed(1)} s (< 30 m; was 108 m)`)
  r.ctx.dispose()
}
check(along[1] > 1.3 * along[0], `…and skids further on the road than on dirt: ${along[1].toFixed(1)} vs ${along[0].toFixed(1)} m (> 1.3×; FEAT-193 road μ 0.5, dirt 1.0)`)
{
  const { vs, ctx, step } = await rolled(15, 75)   // flush with the slope, wheels downhill
  const p0 = vs.position.clone()
  step(600)
  const d = vs.position.distanceTo(p0)
  check(d < 1 && tiltDeg(vs) > 60, `lying on its side across a 15° slope it holds: ${d.toFixed(2)} m in 10 s, ${tiltDeg(vs).toFixed(0)}° from upright (< 1 m, still on its side; was 18 m)`)
  ctx.dispose()
}
{
  let rolls = 0, sum = 0
  const cases = []
  for (const v of [8, 10, 12]) {
    for (const w of [2.5, 3, 3.5]) {
      const r = await rolled(0, 90)
      r.vs.velocity.set(v, 0, 0); r.vs.angularVelocity.set(0, 0, -w)
      const { d, roll } = slide(r)
      if (Math.abs(roll) >= 80) rolls++
      sum += d
      cases.push(`${v}/${w}: ${roll.toFixed(0)}° ${d.toFixed(1)} m`)
      r.ctx.dispose()
    }
  }
  console.log(`  sideways, still rolling (v m/s / ω rad/s): ${cases.join(' · ')}`)
  check(rolls >= 5, `on its side and still rolling, ${rolls}/9 roll on past 80° (≥ 5; was 3)`)
  check(sum / 9 < 25, `…and the mean slide is ${(sum / 9).toFixed(1)} m (< 25 m; was 37.3 m)`)
}
for (const slope of [8, 15]) {
  const { vs, ctx, step } = await rolled(slope, 180)
  const p0 = vs.position.clone()
  step(600)
  const d = vs.position.distanceTo(p0)
  check(d < 1, `lying on its roof across a ${slope}° slope it holds: ${d.toFixed(2)} m in 10 s (< 1 m; was ${slope === 8 ? 28 : 110} m)`)
  ctx.dispose()
}

console.log(failed ? `${failed} CHECK(S) FAILED` : 'PASS — a rolled truck scrubs to a stop, and a sideways one rolls on')
process.exit(failed ? 1 : 0)

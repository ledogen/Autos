// test/drop-rebound.mjs — BUG-140: a hard drop onto the wheels does not bounce the truck back up.
//
// The settled truck lifted h m (tires h above flat ground) and let go, fresh springs and dampers, through the game's
// contact (src/world-contacts.js → src/tire-contact.js). "Rebound" = the CG's peak rise above its resting height after
// the first touch, as a share of h: the energy the drop hands back.
// Two causes (the ticket has the physics):
//   A. The body took the strut forces once per 1/60 s, against its start-of-step motion — a force that lags the motion
//      pumps energy, worst on the bump stop (ω·dt ≈ 0.9–1.5). The body now moves within the step (suspension.js).
//   2. On its stop the body rides the tire with only the wheel's carcass damper (ζ ≈ 0.13 for the body). There the
//      tire's damper is raised to ζ 0.5 of the body-on-tire critical (params.tireStopDampingRatio).
// Main 33f1a202 returned 9.6 / 12.0 / 26.7 / 40.0 / 81.1 % from 0.5 / 1 / 2 / 3 / 5 m, the 5 m drop tipping the truck
// 89°. A alone: 7.9 / 7.7 / 10.4 / 13.5 / 17.3 % (the same at 120 and 240 Hz: converged). A + 2: 7.9 / 7.1 / 7.3 / 8.7 / 10.0 %.
//   • every drop from 0.5 to 5 m hands back under 12 % of its height (main: up to 81 %)
//   • the 5 m drop's share stays under 1.6× the 1 m drop's (main 6.8×, A alone 2.2×, A + 2 1.4×)
//   • the truck lands level: it tilts under 10° (main: 89° from 5 m)

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

async function drop (h) {
  const qc = makeQueryContacts({ params: RANGER_PARAMS, groundH: () => 0, groundN: () => new THREE.Vector3(0, 1, 0) })
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const vs = {
    position: new THREE.Vector3(0, 1.0, 0), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(), steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0], wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: true, bumpForce: [0, 0, 0, 0],
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 64, cell: 4, bed: DEFAULT_VEHICLE_MODEL.bed })
  const step = () => stepPhysics(vs, P, DT, qc, ctx)
  for (let i = 0; i < 4 / DT; i++) step()
  const y0 = vs.position.y
  vs.position.y += h; vs.velocity.set(0, 0, 0); vs.angularVelocity.set(0, 0, 0)
  const up = new THREE.Vector3()
  let touched = false, peak = -Infinity, tilt = 0
  for (let t = 0; t < 4; t += DT) {
    step()
    if (!touched && P._tireFz.some(f => f > 0)) touched = true
    if (touched && (vs.velocity.y > 0 || peak > -Infinity)) peak = Math.max(peak, vs.position.y)
    up.set(0, 1, 0).applyQuaternion(vs.quaternion)
    tilt = Math.max(tilt, Math.acos(Math.min(1, up.y)) * 180 / Math.PI)
  }
  ctx.dispose()
  return { share: Math.max(0, peak - y0) / h, tilt }
}

const HS = [0.5, 1, 2, 3, 5], r = new Map()
for (const h of HS) r.set(h, await drop(h))
console.log('  rebound share: ' + HS.map(h => `${h} m ${(100 * r.get(h).share).toFixed(1)} % (tilt ${r.get(h).tilt.toFixed(1)}°)`).join(' · '))
const worst = Math.max(...HS.map(h => r.get(h).share))
check(worst < 0.12, `every drop 0.5–5 m hands back under 12 % of its height: worst ${(100 * worst).toFixed(1)} % (main 81 %)`)
check(r.get(5).share < 1.6 * r.get(1).share, `the 5 m drop's share is ${(r.get(5).share / r.get(1).share).toFixed(2)}× the 1 m drop's (< 1.6; main 6.8, A alone 2.2)`)
const tilt = Math.max(...HS.map(h => r.get(h).tilt))
check(tilt < 10, `it lands level: worst tilt ${tilt.toFixed(1)}° (< 10°; main 89° from 5 m)`)

console.log(failed ? `${failed} CHECK(S) FAILED` : 'PASS — a hard drop onto the wheels does not bounce the truck back up')
process.exit(failed ? 1 : 0)

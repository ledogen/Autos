// test/side-slide.mjs — BUG-89: a truck on its side scrubs to a stop instead of skating.
//
// On its side the down-side tires carry ~60 % of the weight. With the strut unloaded Pacejka is off,
// and until BUG-89 that contact load was frictionless (physics.js Step 2.6): 15 m/s along its length
// slid 245 m, and on a 15° slope a truck lying still slid away at up to 15 m/s (75 m in 10 s). The
// sidewall now scrubs at the tire's μ; the body keeps BUG-27b's slippery 0.1.
//   • 15 m/s along its length on flat dirt stops inside 40 m (measured 26.9 m)
//   • at rest on its side across a 15° slope it holds: < 1 m of creep in 10 s (measured 0.42 m —
//     the friction's low-speed regularisation, SIDEWALL_V_REG)

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`); if (!ok) failed++ }

/** A truck dropped onto its right side on ground y = tan(slope)·x, settled 3 s. */
async function onItsSide (slopeDeg) {
  const t = Math.tan(slopeDeg * Math.PI / 180), n = new THREE.Vector3(-t, 1, 0).normalize()
  const ground = (x) => t * x
  const qc = (cx, cy, cz, r) => {
    const d = r - (cy - ground(cx)) * n.y
    return d > 0 ? [{ normal: n.clone(), depth: d, contactPoint: new THREE.Vector3(cx - n.x * (r - d), ground(cx), cz) }] : []
  }
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const vs = {
    position: new THREE.Vector3(0, 1.0, 0), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI / 2),
    angularVelocity: new THREE.Vector3(), steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0], wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: true,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: (x) => ground(x), extent: 128, cell: slopeDeg ? 1 : 4 })
  const step = (k) => { for (let i = 0; i < k; i++) stepPhysics(vs, P, DT, qc, ctx) }
  step(180)
  return { vs, ctx, step }
}

{
  const { vs, ctx, step } = await onItsSide(0)
  vs.velocity.set(0, 0, -15)
  const p0 = vs.position.clone()
  let t = 0
  while (t < 10 && !(t > 0.5 && vs.velocity.length() < 0.2)) { step(1); t += DT }
  const d = Math.hypot(vs.position.x - p0.x, vs.position.z - p0.z)
  check(d < 40, `15 m/s on its side along its length stops in ${d.toFixed(1)} m, ${t.toFixed(1)} s (< 40 m; was 245 m)`)
  ctx.dispose()
}
{
  const { vs, ctx, step } = await onItsSide(15)
  const p0 = vs.position.clone()
  step(600)
  const d = vs.position.distanceTo(p0)
  check(d < 1, `lying on its side across a 15° slope it holds: ${d.toFixed(2)} m in 10 s (< 1 m; was 75 m)`)
  ctx.dispose()
}

console.log(failed ? `${failed} CHECK(S) FAILED` : 'PASS — a truck on its side scrubs to a stop')
process.exit(failed ? 1 : 0)

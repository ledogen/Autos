// test/lib/flat-drive.mjs — the real stepPhysics on flat ground (or a cross-slope plane) under a scripted
// input, for the drivetrain gates (traction.mjs, diff-clutch.mjs). Logs what those gates judge: time,
// rear tread slide (damage.js's wear integrand), rear wheel-speed gap, sideslip, yaw, the assists' state.

import * as THREE from 'three'
import { stepPhysics } from '../../src/physics.js'
import { computeStaticEquilibrium } from '../../src/suspension.js'
import { makeTraction } from '../../src/traction.js'
import { RANGER_PARAMS } from '../../data/ranger.js'
import { makeEngineCtx } from './engine-ctx.mjs'

const DT = 1 / 60
const SLIP_FLOOR = 0.15   // damage.js tireSlipFloor — the no-wear floor

/**
 * Drive one scenario. `input(t, vs)` returns { throttle, brake, steer, handbrake } each step (the
 * keyboard ramp is the caller's). Stops at `until(vs, t)` or `tMax`. `onStep(vs, P, dt)` runs after each step.
 */
export async function drive ({ ta = false, tc = false, mu = 0.8, muScale = [1, 1, 1, 1], diff = 'open', slope = 0,
  v0 = 0, steer0 = 0, input, until = () => false, tMax = 20, traction = true, extra = {}, onStep = null }) {
  const P = { ...RANGER_PARAMS, throttleAssist: ta, tractionControl: tc, frictionCoeff: mu, rearDiffMode: diff, ...extra }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  P._tireMuScale = muScale
  const eq = computeStaticEquilibrium(P)
  // A cross-slope plane y = slope·x (the truck faces −z, so +x is its right: positive slope = right side up).
  const n = new THREE.Vector3(-slope, 1, 0).normalize()
  const groundFn = (x) => slope * x
  const queryContacts = (cx, cy, cz, r) => {
    const dist = (cy - groundFn(cx)) * n.y
    const gd = r - dist
    return gd > 0 ? [{ normal: n.clone(), depth: gd, contactPoint: new THREE.Vector3(cx - n.x * dist, cy - n.y * dist, cz - n.z * dist) }] : []
  }
  const w = v0 / P.wheelRadius
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan(slope)),
    angularVelocity: new THREE.Vector3(),
    steerAngle: steer0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [steer0, steer0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [w, w, w, w], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    slipVel: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  if (traction) vs.traction = makeTraction()
  const ctx = await makeEngineCtx(vs, P, { groundFn, extent: 512, cell: 4 })
  for (let s = 0; s < 30; s++) stepPhysics(vs, P, DT, queryContacts, ctx)   // settle onto the tires
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3()
  const out = { t: 0, slide: 0, sigSum: 0, sigN: 0, gapMax: 0, betaMax: 0, heading0: 0, yaw: 0, capMin: 1, pMax: 0,
    passThrough: true, spinMax: 0, trace: [] }
  let prevHeading = null
  while (out.t < tMax) {
    const u = input(out.t, vs)
    vs.throttle = u.throttle ?? 0; vs.brake = u.brake ?? 0; vs.handbrake = !!u.handbrake
    if (u.steer !== undefined) { vs.steerAngle = u.steer; vs.wheelSteerAngles[0] = vs.wheelSteerAngles[1] = u.steer }
    stepPhysics(vs, P, DT, queryContacts, ctx); out.t += DT
    onStep?.(vs, P, DT)   // e.g. a DamageModel stepping beside the physics
    fwd.set(0, 0, -1).applyQuaternion(vs.quaternion); right.set(1, 0, 0).applyQuaternion(vs.quaternion); up.set(0, 1, 0).applyQuaternion(vs.quaternion)
    const vF = vs.velocity.dot(fwd), vL = vs.velocity.dot(right), speed = Math.hypot(vF, vL)
    for (const i of [2, 3]) out.slide += Math.max(0, vs.slipVel[i] - SLIP_FLOOR) * DT
    const r = P.wheelRadius, vRef = 0.5 * Math.abs(vs.wheelOmega[0] + vs.wheelOmega[1]) * r
    const v2 = Math.abs(vs.wheelOmega[2]) * r, v3 = Math.abs(vs.wheelOmega[3]) * r
    const vHi = Math.max(v2, v3)
    if (vs.throttle > 0.5 || vs.brake > 0.5) { out.sigSum += (vHi - vRef) / Math.max(vHi, vRef, 1); out.sigN++ }
    out.gapMax = Math.max(out.gapMax, Math.abs(v2 - v3))
    out.spinMax = Math.max(out.spinMax, vHi - vRef)
    if (speed > 3) out.betaMax = Math.max(out.betaMax, Math.atan2(Math.abs(vL), Math.abs(vF)) * 180 / Math.PI)
    const heading = Math.atan2(-fwd.x, -fwd.z)
    if (prevHeading !== null) { let d = heading - prevHeading; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); out.yaw += d }
    prevHeading = heading
    if (vs.traction) {
      out.capMin = Math.min(out.capMin, vs.traction.cap); out.pMax = Math.max(out.pMax, vs.traction.p[2], vs.traction.p[3])
      if (vs.traction.cap !== 1 || vs.traction.p[2] || vs.traction.p[3]) out.passThrough = false
    }
    const yawRate = vs.angularVelocity.dot(up), rRef = 0.5 * (vs.wheelOmega[0] + vs.wheelOmega[1]) * r * Math.tan(vs.steerAngle) / P.wheelbase
    out.trace.push([out.t, vF, vL, vHi - vRef, vs.traction?.cap ?? 1, yawRate, rRef])
    if (until(vs, out.t, vF)) break
  }
  out.speed = Math.hypot(vs.velocity.x, vs.velocity.z)
  out.yawDeg = Math.abs(out.yaw) * 180 / Math.PI
  out.sigMean = out.sigN ? out.sigSum / out.sigN : 0
  out.state = [vs.position.x, vs.position.y, vs.position.z, ...vs.wheelOmega]
  ctx.dispose()
  return out
}


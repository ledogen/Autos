// test/step-carry-reset.mjs — BUG-224 gate: a seat clears the step-to-step carry physics keeps on params.
// The lab-exit launch left params._bodyOther's torque NaN; the in-step body copy (BUG-140) fed it back every step
// (its mounts go NaN, its torque reads NaN·0) and the next seat went NaN. Here: poison the carry on a settled truck,
// show it holds itself, then resetStepCarry + a fresh pose must step clean.
import * as THREE from 'three'
import { stepPhysics, resetStepCarry } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const ground = () => 0
const up = new THREE.Vector3(0, 1, 0)
const queryContacts = (cx, cy, cz, r) => { const gd = r - cy; return gd > 0 ? [{ normal: up.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }] : [] }
const P = { ...RANGER_PARAMS }
P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
const eq = computeStaticEquilibrium(P)
const seat = (vs) => {
  vs.position.set(0, eq.bodyY + 0.05, 0); vs.quaternion.identity(); vs.velocity.set(0, 0, 0); vs.angularVelocity.set(0, 0, 0)
  vs.strutComp = [...eq.strutComp]; vs.strutCompVel = [0, 0, 0, 0]; vs.wheelOmega = [0, 0, 0, 0]; vs.slipLong = [0, 0, 0, 0]; vs.slipLat = [0, 0, 0, 0]
}
const vs = {
  position: new THREE.Vector3(), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
  steerAngle: 0, throttle: 0, brake: 1, smoothThrottle: 0, smoothBrake: 1, wheelSteerAngles: [0, 0, 0, 0],
  wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })), wheelPhase: [0, 0, 0, 0], handbrake: false,
  drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
}
seat(vs)
const ctx = await makeEngineCtx(vs, P, { groundFn: ground, extent: 64, cell: 1 })
const finite = () => [vs.position.x, vs.position.y, vs.position.z, ...vs.strutComp, P._bodyOther.tx, P._bodyOther.ty, P._bodyOther.tz].every(Number.isFinite)
let fails = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++ }
for (let s = 0; s < 120; s++) stepPhysics(vs, P, DT, queryContacts, ctx)
const ref = vs.position.clone()
check(finite(), `a settled truck steps finite (|v| ${vs.velocity.length().toFixed(3)})`)
P._bodyOther.tx = NaN
for (let s = 0; s < 30; s++) stepPhysics(vs, P, DT, queryContacts, ctx)
check(!Number.isFinite(P._bodyOther.tx), 'a NaN carry feeds itself (the BUG-224 mechanism; if this flips, the reset is moot, not wrong)')
resetStepCarry(P); seat(vs)
for (let s = 0; s < 120; s++) stepPhysics(vs, P, DT, queryContacts, ctx)
const off = vs.position.distanceTo(ref)
check(finite() && off < 0.05, `after resetStepCarry + a seat the truck steps as a clean seat does (${off.toFixed(4)} m from the control's pose)`)
if (fails) { const bad = []; const walk = (o, p) => { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === "number" && !Number.isFinite(v)) bad.push(p + k); else if (v && typeof v === "object" && p.length < 40) walk(v, p + k + ".") } }; walk(vs, "vs."); walk(P, "P."); console.log("non-finite:", bad.slice(0, 30).join(" "), "pos", vs.position.toArray(), "v", vs.velocity.toArray()) }
process.exit(fails ? 1 : 0)

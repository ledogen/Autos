// test/hilift.mjs — FEAT-138 the hi-lift jack (src/hilift.js) on the real stepPhysics, flat ground.
//
//   • a truck at rest on its side, heaved toward upright, comes back onto its wheels
//   • the heave is cut at the balance point (well inside the 3 s cap), then the 5 s cooldown refuses
//   • a truck on its wheels refuses the jack; a run that is over refuses it
//   • from the roof two heaves (roof → side, side → wheels) right it
// The heave's torque is the only thing that differs from a free truck: it goes in through
// vehicleState.jackTorque, which stepPhysics adds to the chassis torque it hands the engine.

import * as THREE from 'three'
import { stepPhysics, rollBalance } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { HiLift, HILIFT, rollDeg, basin } from '../src/hilift.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const queryContacts = (cx, cy, cz, r) => {
  const gd = r - cy
  return gd > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
}

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`); if (!ok) failed++ }

/** A truck dropped at roll φ0 [deg] onto flat ground and left to settle for 3 s. */
async function rolledTruck (phi0) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const vs = {
    position: new THREE.Vector3(0, 1.3, 0), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), phi0 * Math.PI / 180),
    angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: true,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 64, cell: 2 })
  const run = { vs, P, ctx, t: 0 }
  steps(run, 180)
  return run
}

function steps (run, n, jack = null) {
  for (let i = 0; i < n; i++) {
    jack?.step(run.vs, run.P.mass, DT, run.t)
    stepPhysics(run.vs, run.P, DT, queryContacts, run.ctx)
    run.t += DT
  }
}

/** Heave in `dir` and report how long the torque ran, then let the truck settle. */
function heave (run, jack, dir) {
  const ok = jack.start(dir, run.vs, run.t, false)
  const t0 = run.t
  while (jack.active && run.t - t0 < HILIFT.maxS + 1) steps(run, 1, jack)
  const heaveS = run.t - t0
  steps(run, 180)
  return { ok, heaveS, phi: rollDeg(run.vs.quaternion) }
}

const bal = rollBalance(RANGER_PARAMS)
console.log(`balance: wheels ${bal.wheelsDeg.toFixed(1)}°, roof ${bal.roofDeg.toFixed(1)}° · torque ${(HILIFT.torquePerKg * RANGER_PARAMS.mass / 1000).toFixed(1)} kN·m`)

// 1. On its right side → heave left → on its wheels.
{
  const run = await rolledTruck(90)
  const phi0 = rollDeg(run.vs.quaternion)
  check(basin(phi0, bal) === 1, `dropped on its right side, settles there (φ ${phi0.toFixed(1)}°)`)
  const jack = new HiLift(bal)
  check(jack.refusal(run.vs, run.t, true) !== null, 'refused once the run is over')
  const h = heave(run, jack, -1)
  check(h.ok, 'the jack accepts a truck on its side')
  check(Math.abs(h.phi) < 10, `back on its wheels (φ ${h.phi.toFixed(1)}°)`)
  check(h.heaveS < HILIFT.maxS, `cut at the balance point, not the cap (${h.heaveS.toFixed(2)} s)`)
  // heave() settled 3 s after the cut, so 2 s of the 5 s cooldown remain.
  check(jack.refusal(run.vs, run.t, false) === 'catching your breath', `the cooldown refuses (${jack.refusal(run.vs, run.t, false)})`)
  check(!jack.start(-1, run.vs, run.t, false), 'start() honours the refusal')
  steps(run, 150)
  check(jack.refusal(run.vs, run.t, false) === 'the truck is on its wheels', `on its wheels refuses (${jack.refusal(run.vs, run.t, false)})`)
  run.ctx.dispose()
}

// 2. On its roof → heave right (+τ rolls the top right: φ 180 → −180…−90, its LEFT side, then on).
//    The ticket expected two presses (one per stage). In the physics one usually carries it all the way:
//    falling from the roof's balance point to the side releases ~5 kJ, the side → wheels climb needs
//    ~2.2 kJ. So: on its wheels within two presses, and say how many it took.
{
  const run = await rolledTruck(180)
  const phi0 = rollDeg(run.vs.quaternion)
  check(basin(phi0, bal) === 2, `dropped on its roof, settles there (φ ${phi0.toFixed(1)}°)`)
  const jack = new HiLift(bal)
  const a = heave(run, jack, 1)
  let presses = 1, phi = a.phi
  if (Math.abs(phi) >= 10) {
    run.t += HILIFT.cooldownS   // the cooldown is real time; skip it
    phi = heave(run, jack, 1).phi
    presses = 2
  }
  check(Math.abs(phi) < 10, `roof → wheels in ${presses} press(es) (φ ${phi.toFixed(1)}°, first heave ${a.heaveS.toFixed(2)} s)`)
  run.ctx.dispose()
}

console.log(failed ? `${failed} CHECK(S) FAILED` : 'PASS — the hi-lift rights a rolled truck on flat ground')
process.exit(failed ? 1 : 0)

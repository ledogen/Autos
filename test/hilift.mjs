// test/hilift.mjs — FEAT-138 the hi-lift jack (src/hilift.js) on the real stepPhysics, flat ground.
//
//   • a truck at rest on its side, heaved toward upright, comes back onto its wheels
//   • the heave is cut at the wheels' balance point (well inside the 8 s cap), then the 5 s cooldown refuses
//   • a truck on its wheels refuses the jack; a run that is over refuses it
//   • from the roof ONE long press walks it over its side onto its wheels (owner, 2026-11-06)
//   • §3 reliability (owner, 2026-11-06: "high torque, low speed"): roof and side × level and ±8°/±15°
//     cross-slopes × three settle poses × both push directions. On the level every one rights in one
//     press and rolls no faster than 4 rad/s; on the slopes every one within two. Before the slow press
//     (constant 14 kN·m, cut at each balance): roof level 4/6 in one press, slopes 21/24 in one press,
//     24/24 in two, 5.0 rad/s at the fastest. The slope misses are a sliding roof: the body's pair
//     friction is BUG-27b's 0.1, below tan 8°, so a truck on its roof slides tens of metres downhill.
// The heave's torque is the only thing that differs from a free truck: it goes in through
// vehicleState.jackTorque, which stepPhysics adds to the chassis torque it hands the engine.

import * as THREE from 'three'
import { stepPhysics, rollBalance } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { HiLift, HILIFT, rollDeg, basin } from '../src/hilift.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
/** The wheels' analytic ground: the plane y = −tan(θ)·x (θ = 0 is flat), the same one the heightfield carries. */
const planeContacts = (slopeDeg) => {
  const t = Math.tan(slopeDeg * Math.PI / 180), k = Math.hypot(t, 1)
  const n = new THREE.Vector3(t / k, 1 / k, 0)
  return (cx, cy, cz, r) => {
    const d = (cy + t * cx) / k, gd = r - d
    return gd > 0 ? [{ normal: n.clone(), depth: gd, contactPoint: new THREE.Vector3(cx - n.x * d, cy - n.y * d, cz) }] : []
  }
}

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`); if (!ok) failed++ }

/** A truck dropped at roll φ0 [deg] onto ground falling `slopeDeg` toward +x (the truck's right) and left to settle 3 s. */
async function rolledTruck (phi0, slopeDeg = 0) {
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
  const tanT = Math.tan(slopeDeg * Math.PI / 180)
  const ctx = await makeEngineCtx(vs, P, { groundFn: (x) => -tanT * x, extent: 128, cell: 2 })
  const run = { vs, P, ctx, t: 0, query: planeContacts(slopeDeg) }
  steps(run, 180)
  return run
}

/** Roll rate about the truck's forward axis [rad/s]. */
const rollRate = (vs) => {
  const q = vs.quaternion, w = vs.angularVelocity
  return -2 * (q.x * q.z + q.w * q.y) * w.x - 2 * (q.y * q.z - q.w * q.x) * w.y - (1 - 2 * (q.x * q.x + q.y * q.y)) * w.z
}

function steps (run, n, jack = null) {
  for (let i = 0; i < n; i++) {
    jack?.step(run.vs, run.P.mass, DT, run.t)
    stepPhysics(run.vs, run.P, DT, run.query, run.ctx)
    run.t += DT
    run.peak = Math.max(run.peak ?? 0, Math.abs(rollRate(run.vs)))
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
  check(h.heaveS < HILIFT.maxS, `cut at the wheels' balance point, not the cap (${h.heaveS.toFixed(2)} s)`)
  // heave() settled 3 s after the cut, so 2 s of the 5 s cooldown remain.
  check(jack.refusal(run.vs, run.t, false) === 'catching your breath', `the cooldown refuses (${jack.refusal(run.vs, run.t, false)})`)
  check(!jack.start(-1, run.vs, run.t, false), 'start() honours the refusal')
  steps(run, 150)
  check(jack.refusal(run.vs, run.t, false) === 'the truck is on its wheels', `on its wheels refuses (${jack.refusal(run.vs, run.t, false)})`)
  run.ctx.dispose()
}

// 2. On its roof → heave right (+τ rolls the top right: φ 180 → −180…−90, its LEFT side, then on).
//    One press: the push carries on through the side and is cut at the wheels' balance point.
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
  check(Math.abs(phi) < 10 && presses === 1, `roof → wheels in ${presses} press(es) (φ ${phi.toFixed(1)}°, first heave ${a.heaveS.toFixed(2)} s)`)
  run.ctx.dispose()
}

// 3. FEAT-138 (owner, 2026-11-06): how reliable is it? Every settle pose × ground × direction, one press
//    and then a second if the first left it on its side. A rolled truck on its wheels = basin 0 (on a
//    slope its world roll is the slope's, so not |φ| < 10).
{
  const SLOPES = [0, 8, -8, 15, -15]
  const rows = []
  for (const [start, phis, dirs] of [['roof', [170, 180, -170], [1, -1]], ['side', [80, 90, 100], [-1]]]) {
    for (const slope of SLOPES) {
      for (const phi0 of phis) {
        for (const dir of dirs) {
          const run = await rolledTruck(phi0, slope)
          const jack = new HiLift(bal)
          const settled = basin(rollDeg(run.vs.quaternion), bal)
          run.peak = 0
          let presses = 0, b = settled
          while (b !== 0 && presses < 2) {
            // A second press heaves the way the truck now needs: toward its wheels from the side it lies on.
            const d = presses === 0 || b === 2 ? dir : -b
            heave(run, jack, d)
            run.t += HILIFT.cooldownS
            presses++
            b = basin(rollDeg(run.vs.quaternion), bal)
          }
          rows.push({ start, slope, phi0, dir, settled, presses, ok: b === 0, peak: run.peak, drift: Math.hypot(run.vs.position.x, run.vs.position.z) })
          run.ctx.dispose()
        }
      }
    }
  }
  const rate = (f) => { const r = rows.filter(f); return `${r.filter(x => x.ok && x.presses === 1).length}/${r.length} in one press, ${r.filter(x => x.ok).length}/${r.length} in two` }
  const peak = (f) => Math.max(...rows.filter(f).map(x => x.peak)).toFixed(2)
  for (const start of ['roof', 'side']) {
    console.log(`  from the ${start}: level ${rate(x => x.start === start && x.slope === 0)} · slopes ${rate(x => x.start === start && x.slope !== 0)}`
      + ` · fastest roll on the level ${peak(x => x.start === start && x.slope === 0)} rad/s`)
  }
  const level = rows.filter(x => x.slope === 0), slopes = rows.filter(x => x.slope !== 0)
  check(level.every(x => x.ok && x.presses === 1), 'on the level, roof and side: every one on its wheels in one press')
  check(Math.max(...level.map(x => x.peak)) < 4, `…walked over, not flung: the fastest roll ${peak(x => x.slope === 0)} rad/s (< 4; the old press 5.0)`)
  check(slopes.every(x => x.ok), 'on ±8° and ±15° cross-slopes: every one on its wheels within two presses')
  for (const x of rows.filter(x => !x.ok || x.presses > 1)) console.log(`    ${x.ok ? "two presses" : "failed"}: ${x.start} φ0 ${x.phi0} slope ${x.slope}° dir ${x.dir} (settled basin ${x.settled}, drift ${x.drift.toFixed(1)} m)`)
}

console.log(failed ? `${failed} CHECK(S) FAILED` : 'PASS — the hi-lift rights a rolled truck on flat ground')
process.exit(failed ? 1 : 0)

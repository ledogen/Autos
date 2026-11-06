// test/wheel-collapse.mjs — FEAT-162 P1a: a written-off wheel COLLAPSES (owner, 2026-11-06: "written off
// wheel should mean after wheel hits 0%").
//
//   1. The damage model: a wheel at exactly 0 publishes its folded-rim radius, steel grip and the full
//      (steel) contact rate; at 1 % it still stands. FEAT-94's flat → rim wear (damage-filter-puncture §5)
//      is how a wheel gets there: ~2 km shreds the flat, ~1 more km at 50 km/h writes the rim off.
//   1b. …driven all the way (owner, 2026-11-05: "a flat doesn't stop you for a day" must not happen): a
//      flat at 50 km/h ends in a COLLAPSED wheel within ~1 km of the tire shredding, ~3 km from the pop.
//   2. The real stepPhysics on flat ground: that corner drops onto its hub and the hub never turns —
//      undriven (front) or driven (rear, open diff: the other rear wheel takes the drive).
//   3. What the truck can still do on it, at full throttle. A collapsed driven (rear) corner strands it;
//      a collapsed front corner is dragged, and how hard that should be is an open owner call.
//
// Pure node: the flat-drive harness (the Box3D engine ctx, no THREE scene, no DOM).
import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'
import { drive } from './lib/flat-drive.mjs'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

console.log('§1 the damage model publishes the collapse at exactly 0')
{
  const P = { engineIdleRPM: 750, engineRedlineRPM: 5500 }
  const d = new DamageModel({ params: P })
  d.setAll(1); d.set('wheelRL', 0.01); d.publish(P)
  ok(P._wheelCollapseR.every(r => r === 0), 'a wheel at 1 % still stands')
  d.set('wheelRL', 0); d.flat[2] = true; d.publish(P)
  ok(P._wheelCollapseR[2] === D.wheelCollapseR && P._wheelCollapseR.filter(r => r).length === 1, `at 0 it collapses to ${D.wheelCollapseR} m, that corner only`)
  ok(P._tireMuScale[2] === D.wheelCollapseMu && P._tireRateScale[2] === 1, `steel on the road: grip ×${D.wheelCollapseMu}, the full contact rate (not a flat's air)`)
  d.set('wheelRL', 0.5); d.publish(P)
  ok(P._wheelCollapseR[2] === 0, 'a new wheel (the spare, the shop) stands it back up')
}

console.log('§1b a flat, driven on, ends in a collapsed wheel')
{
  const P = { engineIdleRPM: 750, engineRedlineRPM: 5500 }
  const d = new DamageModel({ params: P }), DT = 1 / 60, v = 50 / 3.6, vs = { velocity: { x: v, y: 0, z: 0 } }
  d.setAll(1); d.flat[1] = true
  let km = 0, shredKm = null
  while (!d.collapsed(1) && km < 10) {
    d.step(vs, P, DT); km += v * DT / 1000
    if (shredKm === null && d.get('tireFR') <= 0) shredKm = km
  }
  d.publish(P)
  ok(d.collapsed(1) && P._wheelCollapseR[1] === D.wheelCollapseR,
    `the front-right flat at 50 km/h: the tire shreds at ${shredKm?.toFixed(2)} km, the wheel collapses at ${km.toFixed(2)} km`)
  ok(km - shredKm > 0.5 && km - shredKm < 1.5, `…${(km - shredKm).toFixed(2)} km on the rim (FEAT-94's ~1 km): a flat can't be driven on for a day`)
}

/** Full throttle for `tMax` s with one corner collapsed. Logs the collapsed hub's spin and height. */
async function run (corner, { grade = 0, tMax = 20 } = {}) {
  const R = [0, 0, 0, 0]; R[corner] = D.wheelCollapseR
  const mu = [1, 1, 1, 1]; mu[corner] = D.wheelCollapseMu
  let spin = 0
  const out = await drive({ grade, muScale: mu, extra: { _wheelCollapseR: R, _tireRateScale: [1, 1, 1, 1] }, tMax,
    input: () => ({ throttle: 1 }),
    onStep: (vs) => {
      spin = Math.max(spin, Math.abs(vs.wheelOmega[corner]))
    } })
  return { ...out, spin }
}

console.log('§2 the corner drops onto its hub, and the hub never turns')
const base = await drive({ tMax: 20, input: () => ({ throttle: 1 }) })
const front = await run(0), rear = await run(2)
ok(front.spin === 0, `front-left collapsed: its hub never turns under 20 s of full throttle (max |ω| ${front.spin})`)
ok(rear.spin === 0, `rear-left collapsed: its hub never turns either, though it is driven (max |ω| ${rear.spin})`)
ok(Math.abs(rear.state[6]) > 10, `...and the open diff hands the drive to the right rear, which spins (ω ${rear.state[6].toFixed(1)} rad/s)`)

console.log('§3 what the truck can still do on it (20 s of full throttle from rest, open diff)')
console.log(`     healthy                 ${(base.speed * 3.6).toFixed(1)} km/h`)
console.log(`     front-left collapsed    ${(front.speed * 3.6).toFixed(1)} km/h`)
console.log(`     rear-left collapsed     ${(rear.speed * 3.6).toFixed(1)} km/h`)
const climbF = await run(0, { grade: 0.05 }), climbR = await run(2, { grade: 0.05 })
console.log(`     5 % grade, front-left   ${(climbF.speed * 3.6).toFixed(1)} km/h`)
console.log(`     5 % grade, rear-left    ${(climbR.speed * 3.6).toFixed(1)} km/h`)
ok(rear.speed < 15 / 3.6 && climbR.speed < 15 / 3.6,
    'a collapsed DRIVEN corner strands it: under 15 km/h flat or up 5 % (the open diff spins the good wheel)')
// A collapsed FRONT corner is steel sliding at ×0.5 of the road's grip on ~2 kN (the corner droops and the
// load moves to its diagonal): under a kilonewton, which the engine out-pulls. Honest Newton, reported
// only — whether dragging it should break something is the owner's call (feat162-front-drag).
ok(front.speed < base.speed, 'a collapsed front corner drags: slower than a healthy truck (reported above)')

console.log(fail ? '\nFAIL — the wheel collapse has drifted' : '\nPASS — a written-off wheel collapses onto its hub and is dragged')
process.exit(fail)

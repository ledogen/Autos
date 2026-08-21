// test/damage-rim-strike.mjs — SM-3 gate: what bends a rim, and what does not.
//
// Two events, no continuous wear (owner, 2026-08-20): a CRASH that reaches the wheel through the
// armor, thresholded so a light knock bends nothing, and a RIM STRIKE — hitting something with the
// wheel. A rock, a kerb, a pothole edge.
//
// THE SIGNAL IS OFF-AXIS CONTACT FORCE, and that choice is what this gate exists to protect. It is
// the part of the tire contact force that is not along the strut axis: exactly zero on flat ground
// however hard the tire is loaded, non-zero only when a wheel meets something that is not the road.
//
// It was chosen from two owner captures that between them rule out every vertical proxy:
//
//   corner  hard cornering on rough ground, tire peaked at 34.5 kN VERTICAL (2.6x the truck's whole
//           weight on one corner) — and must NOT mark a rim. Carrying load is the tire's job.
//   rocks   a pile of rocks struck at 50 mph, only 15.5 kN vertical — and MUST mark it.
//
// Vertical load ranks those two BACKWARDS, and every vertical proxy inherits it: tire deflection is
// vertical load over a spring rate; bump-stop force is what is left after the tire passes it on;
// strut acceleration is a derivative of the same thing. Re-driven in-game, off-axis force reads
// 8.7 kN through that corner against 42 kN into those rocks — a 5x separation, right way round.
//
// If someone "simplifies" this back to a vertical signal, the corner capture starts eating rims
// again and the rock strike goes back to costing nothing. That is the regression here.

import { DamageModel, DAMAGE_PARAMS as D, MPH } from '../src/damage.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 0.004
const STATIC = DamageModel.staticWheelLoad(P)
const TRIP = D.wheelStrikeFloorMult * STATIC
const FULL = D.wheelStrikeFullMult * STATIC
const fresh = () => new DamageModel({ params: P })

/** Drive one strike event: off-axis force `n` newtons on a corner for a few steps, then clear. */
function strike (d, n, corner = 0, steps = 4) {
  const vs = { obstacleForce: [0, 0, 0, 0] }
  for (let i = 0; i < steps; i++) { vs.obstacleForce[corner] = n; d.step(vs, P, DT) }
  vs.obstacleForce[corner] = 0
  d.step(vs, P, DT)
}
const kN = (x) => x * 1000

console.log(`§1 the two owner captures, ranked the right way round (floor ${(TRIP / 1000).toFixed(1)} kN)`)
{
  // Re-driven in-game at both captured locations, seed 6, tireStiffness 160 kN/m.
  const corner = fresh(); strike(corner, kN(8.7))
  ok(corner.get('wheelFL') === 1, 'hard cornering (8.7 kN off-axis) bends NOTHING — the tire carries the load')

  const rocks = fresh(); strike(rocks, kN(42))
  const lost = (1 - rocks.get('wheelFL')) * 100
  console.log(`  rocks at speed (42 kN off-axis) costs the wheel ${lost.toFixed(1)}%`)
  ok(lost > 5 && lost < 30, '...and a rock strike at speed DOES mark it, without writing it off in one')

  // The ordering itself, stated as the invariant rather than as two numbers.
  ok((1 - rocks.get('wheelFL')) > 10 * (1 - corner.get('wheelFL') + 1e-9),
    'a rock strike costs far more than hard cornering — the ranking every vertical proxy got backwards')
}

console.log('\n§2 flat ground cannot bend a rim, however hard the tire is loaded')
{
  // The physical guarantee behind the signal: off-axis force is zero on flat ground by
  // construction, so no amount of vertical load reaches this track.
  const d = fresh()
  const vs = { obstacleForce: [0, 0, 0, 0], tireFlat: [8000, 8000, 8000, 8000],
               strutCompVel: [3, 3, 3, 3], slipVel: [10, 10, 10, 10], bumpForce: [0, 0, 0, 0] }
  for (let i = 0; i < 60 / DT; i++) d.step(vs, P, DT)
  ok(d.get('wheelFL') === 1, 'a minute of maximum cornering load on flat ground bends no rim at all')
  ok(d.get('tireFL') < 1 && d.get('damperFront') < 1, '...while the tracks that DO have continuous sources moved')
}

console.log('\n§3 the floor, and the square law past it')
{
  const under = fresh(); strike(under, TRIP * 0.95)
  ok(under.get('wheelFL') === 1, 'just under the floor costs nothing')
  const a = fresh(); strike(a, TRIP + kN(10))
  const b = fresh(); strike(b, TRIP + kN(20))
  const ratio = (1 - b.get('wheelFL')) / (1 - a.get('wheelFL'))
  ok(Math.abs(ratio - 4) < 0.05, `doubling force-over-floor quadruples the damage (x${ratio.toFixed(2)})`)
  const kill = fresh(); strike(kill, TRIP + FULL)
  ok(kill.get('wheelFL') <= 0.001, `${((TRIP + FULL) / 1000).toFixed(0)} kN writes the wheel off in one strike`)

  // The headroom the owner asked for: a bad strike must not be a write-off.
  const one = fresh(); strike(one, kN(42))
  ok(one.get('wheelFL') > 0.7, 'one 42 kN strike leaves the wheel above 70% — 4x headroom, as asked')
}

console.log('\n§4 thresholds scale with the truck, not with the tire spring')
{
  // Multiples of STATIC WHEEL LOAD, so they mean "N times what this wheel normally carries".
  // Deliberately NOT a function of tireStiffness: the owner raised it to 160 kN/m expecting the
  // tire to protect the rim, and any stiffness-derived threshold moves the wrong way when he does.
  const heavy = { ...P, mass: P.mass * 2 }
  ok(DamageModel.staticWheelLoad(heavy) > STATIC * 1.9, 'a heavier truck carries more per wheel, so its strike floor rises with it')
  const stiff = { ...P, tireStiffness: P.tireStiffness * 2 }
  ok(DamageModel.staticWheelLoad(stiff) === STATIC, 'stiffening the tire does NOT move the floor — stiffness must never make a rim more fragile')
}

console.log('\n§5 it is an EVENT, on the corner that struck')
{
  const brief = fresh(); strike(brief, kN(42), 0, 2)
  const long  = fresh(); strike(long,  kN(42), 0, 300)
  ok(Math.abs(brief.get('wheelFL') - long.get('wheelFL')) < 1e-12,
    'grinding along the obstacle costs the same as hitting it — a strike is an event, not a dwell')
  const d = fresh(); strike(d, kN(42), 2)
  ok(d.get('wheelRL') < 1 && d.get('wheelFL') === 1 && d.get('wheelRR') === 1, 'only the corner that struck is bent')
}

console.log('\n§6 a crash bends the rim, but only past a threshold')
{
  const impulseAt = (mph) => P.mass * mph * MPH
  const tap = new DamageModel({ params: P }); tap.set('armorFront', 0)   // armor gone: worst case
  tap.applyImpact('front', impulseAt(D.impactWheel.floorMph - 3), P.mass)
  ok(tap.get('wheelFL') === 1, `a ${D.impactWheel.floorMph - 3} mph knock bends no rim even with the bumper destroyed`)
  const crash = new DamageModel({ params: P }); crash.set('armorFront', 0)
  crash.applyImpact('front', impulseAt(45), P.mass)
  ok(crash.get('wheelFL') < 1, 'a 45 mph collision does')
  ok(crash.get('wheelRL') === 1, '...and only the wheels in that region — a front hit leaves the rears alone')
}

console.log(fail ? '\nFAIL — the rim damage model has drifted' : '\nPASS — rims are bent by striking things and by real crashes, and by nothing else')
process.exit(fail)

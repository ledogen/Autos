// test/damage-rim-strike.mjs — SM-3 gate: what bends a rim, and what does not.
//
// Two events, no continuous wear: a CRASH that reaches the wheel through the armor, thresholded so
// a light knock bends nothing, and a RIM STRIKE — the wheel's rigid core meeting something.
//
// THE SIGNAL IS THE ENGINE'S OWN CONTACT IMPULSE ON THE WHEEL HARD CORE, and that is the thing this
// gate protects, because three plausible proxies were tried first and every one of them failed:
//
//   tire deflection / bump-stop force / strut acceleration — all vertical load through some filter,
//     and vertical load ranks the owner's two captures BACKWARDS: hard cornering peaked a tire at
//     34.5 kN while a 50 mph rock strike peaked at 15.5 kN. Carrying load is the tire's job.
//   off-axis contact force — ranks those two right, but goes QUIET on the case that matters most,
//     because the tire ENVELOPING factor (suspension.js) deliberately attenuates small hard
//     objects. The more rim-threatening the rock, the less force the soft path reports.
//
// The rigid core sidesteps all of it. QUAL-25 already puts a sphere per wheel at
// wheelRadius − WHEEL_SOFT_BAND on the chassis, riding the strut-derived hub and colliding with
// debris only: the outer band IS the rubber and the core IS the rim. So "the rubber ran out" needs
// no threshold — it is the condition that the core reports a contact at all, and Box3D solves that
// with proper impulse exchange rather than a penalty spring of ours.
//
// The enveloping factor then points the right way round for free: a boulder envelops little so the
// tire resists and rides over with the core untouched; a small hard rock envelops a lot so the
// carcass wraps it and the hub sinks until the core meets it.

import { DamageModel, DAMAGE_PARAMS as D, MPH } from '../src/damage.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 0.004
const STATIC = DamageModel.staticWheelLoad(P)
const YIELD = D.rimYieldMult * STATIC
const fresh = () => new DamageModel({ params: P })

/** Drive one strike event: `n` newtons of core contact force for a few steps, then clear. */
function strike (d, n, corner = 0, steps = 3) {
  const vs = { rimForce: [0, 0, 0, 0] }
  for (let i = 0; i < steps; i++) { vs.rimForce[corner] = n; d.step(vs, P, DT) }
  vs.rimForce[corner] = 0
  d.step(vs, P, DT)
}

console.log(`§1 yield — below it the rim springs back (static ${(STATIC / 1000).toFixed(1)} kN, yield ${(YIELD / 1000).toFixed(1)} kN)`)
{
  const under = fresh(); strike(under, YIELD * 0.99, 0, 400)
  ok(under.get('wheelFL') === 1,
    'a load just under yield, held for 400 steps, bends nothing — elastic is elastic however long you hold it')
  const over = fresh(); strike(over, YIELD * 3)
  ok(over.get('wheelFL') < 1, '...and a load past yield does take a permanent set')

  // Damage is the OVERLOAD, not the total load: only the excess goes into plastic work.
  const a = fresh(); strike(a, YIELD + 10000)
  const b = fresh(); strike(b, YIELD + 20000)
  const ratio = (1 - b.get('wheelFL')) / (1 - a.get('wheelFL'))
  ok(Math.abs(ratio - Math.pow(2, D.rimStrikeExp)) < 0.05,
    `doubling the OVERLOAD raises the damage by 2^${D.rimStrikeExp} (x${ratio.toFixed(2)}) — plastic work, not total load`)
}

console.log('\n§2 measured: the two sources are priced on their OWN scales')
{
  // Running over a rock does not reach the rim (peak core force 3-5 kN, measured 11-55 mph).
  for (const [mph, kN] of [[11, 3.2], [34, 3.9], [55, 5.1]]) {
    const d = fresh(); strike(d, kN * 1000)
    const lost = (1 - d.get('wheelFL')) * 100
    console.log(`  ${mph} mph over a rock peaks the core at ${kN} kN → ${lost.toFixed(2)}% of the wheel`)
    ok(lost < 1, '...which leaves the rim essentially intact, as a real tire would')
  }
  // Landing loads come through the ROAD path and are an order of magnitude larger, so they get
  // their own yield and overload scale. Owner's target shape: a 1 m drop damages SPRINGS ONLY, a
  // 2 m drop damages springs AND rim. Measured with test/collision-drop-lab.mjs.
  const road = (d, n, corner = 0, steps = 3) => {
    const vs = { rimForce: [0, 0, 0, 0], rimForceRoad: [0, 0, 0, 0] }
    for (let i = 0; i < steps; i++) { vs.rimForceRoad[corner] = n; d.step(vs, P, DT) }
    vs.rimForceRoad[corner] = 0
    d.step(vs, P, DT)
  }
  const oneM = fresh(); road(oneM, 0)          // a 1 m drop never bottoms the tire at all
  ok(oneM.get('wheelFL') === 1, 'a 1 m drop puts NO load on the rim — the tire does not bottom, so lesser drops cost springs only')
  const twoM = fresh(); road(twoM, 86200)      // 2 m drop, measured
  const lost2 = (1 - twoM.get('wheelFL')) * 100
  console.log(`  a 2 m drop puts 86.2 kN past full compression → ${lost2.toFixed(1)}% of the wheel`)
  ok(lost2 > 1 && lost2 < 10, '...which marks the rim without writing it off')
}

console.log('\n§3 nothing but a core contact can bend a rim')
{
  // The cores collide with DEBRIS ONLY (see createVehicleChassis), so terrain, roads and static
  // props can never produce this signal at all. Everything else the model integrates is hammered
  // here for a simulated minute with the cores untouched.
  const d = fresh()
  const vs = { rimForce: [0, 0, 0, 0], tireFlat: [8000, 8000, 8000, 8000], bumpForce: [0, 0, 0, 0],
               strutCompVel: [3, 3, 3, 3], slipVel: [10, 10, 10, 10] }
  for (let i = 0; i < 60 / DT; i++) {
    // Cycle the bump stops so they bank real landings rather than resting on them (a steady load
    // deliberately never banks — see the decay rule).
    const on = (i % 250) < 8
    // Well past the alignment floor: the point of this line is that the OTHER tracks all move, so
    // the rim staying pristine is a real result and not an inert state. The floor rose with the
    // progressive carcass (18 -> 60 kN), so 20 kN no longer reaches alignment.
    for (let k = 0; k < 4; k++) vs.bumpForce[k] = on ? 120000 : 0
    d.step(vs, P, DT)
  }
  ok(d.get('wheelFL') === 1, 'a minute of max cornering load, repeated hard bottoming and full wheelspin bends no rim')
  ok(d.get('tireFL') < 1 && d.get('springFront') < 1 && d.get('damperFront') < 1,
    '...while the tracks those signals DO feed all moved, so the state was not simply inert')
  ok(d.get('alignFL') < 1, '...including the alignment those hard bumps threw out — the crosstalk still fires')
}

console.log('\n§4 priced past yield, banked as one event, on the corner that struck')
{
  const kill = fresh(); strike(kill, YIELD + D.rimFullMult * STATIC)
  ok(kill.get('wheelFL') <= 0.001, `${((YIELD + D.rimFullMult * STATIC) / 1000).toFixed(0)} kN writes the wheel off in one strike`)

  const brief = fresh(); strike(brief, YIELD * 4, 0, 2)
  const long  = fresh(); strike(long,  YIELD * 4, 0, 400)
  ok(Math.abs(brief.get('wheelFL') - long.get('wheelFL')) < 1e-12,
    'a core resting against what it hit costs the same as striking it — an event, not a dwell')
  const d = fresh(); strike(d, YIELD * 4, 2)
  ok(d.get('wheelRL') < 1 && d.get('wheelFL') === 1 && d.get('wheelRR') === 1, 'only the corner that struck is bent')

  // The headroom the owner asked for: one bad strike must not be a write-off.
  const one = fresh(); strike(one, YIELD * 4)
  ok(one.get('wheelFL') > 0.7, 'a load four times yield still leaves most of the wheel — headroom, as asked')
}

console.log('\n§5 a crash bends the rim, but only past a threshold')
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

console.log(fail ? '\nFAIL — the rim damage model has drifted' : '\nPASS — rims are bent by the core striking something, and by real crashes')
process.exit(fail)

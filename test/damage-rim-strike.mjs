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
const fresh = () => new DamageModel({ params: P })

/** Drive one strike event: `ns` newton-seconds on a corner's core for a few steps, then clear. */
function strike (d, ns, corner = 0, steps = 3) {
  const vs = { rimImpulse: [0, 0, 0, 0] }
  for (let i = 0; i < steps; i++) { vs.rimImpulse[corner] = ns; d.step(vs, P, DT) }
  vs.rimImpulse[corner] = 0
  d.step(vs, P, DT)
}

console.log('§1 the lab anchors — a thrown rock, run over at a range of speeds')
{
  // Measured in-game (lab strip, 50 kg debris rock, window.__debris.spawn).
  for (const [mph, ns, lo, hi] of [[22, 3076, 0.05, 1], [60, 5495, 3, 12]]) {
    const d = fresh(); strike(d, ns)
    const lost = (1 - d.get('wheelFL')) * 100
    console.log(`  ${mph} mph over a rock (${ns} N·s on the core) costs the wheel ${lost.toFixed(2)}%`)
    ok(lost >= lo && lost <= hi, `...within the intended ${lo}-${hi}% band`)
  }
  // The PINCH floor: a rock trapped between core and ground registers a big impulse even at
  // walking pace, so easing over one must be free and only speed may cost you.
  const crawl = fresh(); strike(crawl, D.rimStrikeFloorNs - 1)
  ok(crawl.get('wheelFL') === 1, `a pinch below ${D.rimStrikeFloorNs} N·s costs nothing — easing over a rock is free`)
}

console.log('\n§2 nothing but a core contact can bend a rim')
{
  // The cores collide with DEBRIS ONLY (see createVehicleChassis), so terrain, roads and static
  // props can never produce this signal at all. Everything else the model integrates is hammered
  // here for a simulated minute with the cores untouched.
  const d = fresh()
  const vs = { rimImpulse: [0, 0, 0, 0], tireFlat: [8000, 8000, 8000, 8000], bumpForce: [0, 0, 0, 0],
               strutCompVel: [3, 3, 3, 3], slipVel: [10, 10, 10, 10] }
  for (let i = 0; i < 60 / DT; i++) {
    // Cycle the bump stops so they bank real landings rather than resting on them (a steady load
    // deliberately never banks — see the decay rule).
    const on = (i % 250) < 8
    for (let k = 0; k < 4; k++) vs.bumpForce[k] = on ? 20000 : 0
    d.step(vs, P, DT)
  }
  ok(d.get('wheelFL') === 1, 'a minute of max cornering load, repeated hard bottoming and full wheelspin bends no rim')
  ok(d.get('tireFL') < 1 && d.get('springFront') < 1 && d.get('damperFront') < 1,
    '...while the tracks those signals DO feed all moved, so the state was not simply inert')
  ok(d.get('alignFL') < 1, '...including the alignment those hard bumps threw out — the crosstalk still fires')
}

console.log('\n§3 priced square-law past the floor, banked as one event, on the corner that struck')
{
  const f = D.rimStrikeFloorNs
  const a = fresh(); strike(a, f + 2000)
  const b = fresh(); strike(b, f + 4000)
  const ratio = (1 - b.get('wheelFL')) / (1 - a.get('wheelFL'))
  ok(Math.abs(ratio - 4) < 0.05, `doubling impulse-over-floor quadruples the damage (x${ratio.toFixed(2)})`)
  const kill = fresh(); strike(kill, D.rimStrikeFullNs)
  ok(kill.get('wheelFL') <= 0.001, `${D.rimStrikeFullNs} N·s writes the wheel off in one strike`)

  const brief = fresh(); strike(brief, 6000, 0, 2)
  const long  = fresh(); strike(long,  6000, 0, 400)
  ok(Math.abs(brief.get('wheelFL') - long.get('wheelFL')) < 1e-12,
    'a core resting against what it hit costs the same as striking it — an event, not a dwell')
  const d = fresh(); strike(d, 6000, 2)
  ok(d.get('wheelRL') < 1 && d.get('wheelFL') === 1 && d.get('wheelRR') === 1, 'only the corner that struck is bent')

  // The headroom the owner asked for: one bad strike must not be a write-off.
  const one = fresh(); strike(one, 5495)
  ok(one.get('wheelFL') > 0.85, 'one 60 mph rock strike leaves the wheel above 85%')
}

console.log('\n§4 a crash bends the rim, but only past a threshold')
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

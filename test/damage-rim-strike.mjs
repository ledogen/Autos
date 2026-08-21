// test/damage-rim-strike.mjs — SM-3 gate: what bends a rim, and what does not.
//
// Two events, no continuous wear (owner, 2026-08-20):
//
//   1. a CRASH hard enough to reach the wheel through the armor — thresholded, so a light knock
//      does not bend a rim;
//   2. a RIM STRIKE — the tire bottoming out against a pothole edge or kerb until there is no
//      rubber left between the road and the flange.
//
// The second is thresholded on TIRE DEFLECTION rather than on bump-stop force or strut
// acceleration, and that choice is the thing this gate exists to protect. The load path is
// road → tire carcass → RIM → strut. The carcass is the only thing between the road and the wheel,
// so its deflection is what decides whether the flange ever touches down. Strut travel is
// DOWNSTREAM of the rim (you can bottom the suspension smoothly on a long landing without a strike,
// and strike a rim on a sharp edge without the strut running out of travel), and strut acceleration
// is downstream of that again.
//
// The threshold is a fraction of SIDEWALL HEIGHT — wheelRadius − rimRadius, a real dimension off
// the tire, not a tuning constant. That is why it is derived here rather than hardcoded.

import { DamageModel, DAMAGE_PARAMS as D, MPH } from '../src/damage.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 0.004
const SIDEWALL = P.wheelRadius - P.rimRadius
const STATIC = DamageModel.staticTireDeflection(P)
const TRIP = D.wheelStrikeStaticMult * STATIC
const FULL = D.wheelStrikeFullStaticMult * STATIC
const fresh = () => new DamageModel({ params: P })

/** Drive one tire-bottoming event: deflect to `m` metres for a few steps, then come off it. */
function strike (d, m, corner = 0, steps = 4) {
  const vs = { tireDeflect: [0, 0, 0, 0] }
  for (let i = 0; i < steps; i++) { vs.tireDeflect[corner] = m; d.step(vs, P, DT) }
  vs.tireDeflect[corner] = 0
  d.step(vs, P, DT)
}

console.log(`§1 the threshold scales with the tire spring (static ${(STATIC * 1000).toFixed(0)} mm ⇒ strike at ${(TRIP * 1000).toFixed(0)} mm)`)
{
  const soft = fresh(); strike(soft, TRIP * 0.95)
  ok(soft.get('wheelFL') === 1, 'deflecting to 95% of the strike point costs nothing — the carcass is still carrying it')
  const hard = fresh(); strike(hard, TRIP + 0.05)
  ok(hard.get('wheelFL') < 1, '...going 50 mm past it does bend the rim')

  // The threshold is a MULTIPLE OF STATIC DEFLECTION, not the sidewall height, and that is
  // deliberate: this sim's tire is a linear spring with no bottoming, so a 4 m drop reports 361 mm
  // of "deflection" against a 165 mm sidewall — the rim 200 mm underground. A ratio to static is
  // what a linear spring represents honestly, and it tracks tireStiffness and mass if either moves.
  const soft2 = { ...P, tireStiffness: P.tireStiffness / 2 }   // softer tire ⇒ everything deflects more
  ok(DamageModel.staticTireDeflection(soft2) > STATIC * 1.9,
    'halving tire stiffness doubles static deflection — so the strike point moves with it, not against it')
  ok(TRIP > SIDEWALL, 'and the strike point sits ABOVE the real sidewall, which is the tell that `depth` is not a true carcass deflection here')
}

console.log('\n§2 priced on how far PAST the point it went, square-law')
{
  const a = fresh(); strike(a, TRIP + 0.02)
  const b = fresh(); strike(b, TRIP + 0.04)
  const ratio = (1 - b.get('wheelFL')) / (1 - a.get('wheelFL'))
  ok(Math.abs(ratio - 4) < 0.05, `doubling the excess quadruples the damage (x${ratio.toFixed(2)})`)
  const kill = fresh(); strike(kill, TRIP + FULL)
  ok(kill.get('wheelFL') <= 0.001, `${(FULL * 1000).toFixed(0)} mm past the point destroys the wheel outright`)
}

console.log('\n§3 it is an EVENT, on the corner that took it')
{
  const brief = fresh(); strike(brief, TRIP + 0.05, 0, 2)
  const long  = fresh(); strike(long,  TRIP + 0.05, 0, 300)
  ok(Math.abs(brief.get('wheelFL') - long.get('wheelFL')) < 1e-12,
    'holding the tire bottomed costs the same as hitting it once — a strike is an event, not a dwell')
  const d = fresh(); strike(d, TRIP + 0.05, 2)
  ok(d.get('wheelRL') < 1 && d.get('wheelFL') === 1 && d.get('wheelRR') === 1, 'only the corner that struck is bent')
}

console.log('\n§4 driving does NOT wear a wheel — there is no continuous source')
{
  // Every other signal hammered for a simulated minute, with the tire never bottoming.
  const d = fresh()
  const vs = { tireDeflect: [0.05, 0.05, 0.05, 0.05], strutCompVel: [2, 2, 2, 2],
               bumpForce: [0, 0, 0, 0], slipVel: [8, 8, 8, 8], tireFlat: [4000, 4000, 4000, 4000] }
  for (let i = 0; i < 60 / DT; i++) d.step(vs, P, DT)
  ok(d.get('wheelFL') === 1, 'a minute of violent strut motion and full-slip driving bends no rim at all')
  ok(d.get('damperFront') < 1 && d.get('tireFL') < 1, '...while the tracks that DO have continuous sources moved')
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

console.log('\n§6 the drop anchors measured in the lab')
{
  // Peak tire deflection measured in-game via window.__tp(x, z, h, drop) — see the note in
  // DAMAGE_PARAMS. These are the numbers the multipliers were calibrated against.
  for (const [h, defl, lo, hi] of [[0.5, 0.154, 0, 0.01], [0.9, 0.233, 0.1, 4], [1.5, 0.267, 5, 20], [4.0, 0.361, 90, 100]]) {
    const d = fresh(); strike(d, defl)
    const lost = (1 - d.get('wheelFL')) * 100
    console.log(`  a ${h} m drop (${(defl * 1000).toFixed(0)} mm) costs the wheel ${lost.toFixed(1)}%`)
    ok(lost >= lo && lost <= hi, `...within the intended ${lo}-${hi}% band`)
  }
}

console.log(fail ? '\nFAIL — the rim damage model has drifted' : '\nPASS — rims are bent by bottoming the tire and by real crashes, and by nothing else')
process.exit(fail)

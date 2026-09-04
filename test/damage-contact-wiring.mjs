// test/damage-contact-wiring.mjs — SM-3 gate: raw engine contacts become the RIGHT impacts.
//
// Slice 1 built the impact model; slice 2 connects it to the engine. Two pieces sit between a
// manifold and applyImpact(), and both fail silently if they are wrong:
//
//   classifyImpactRegion(point, normal)  — which armor region a contact landed on, in body frame.
//   DamageModel.feedContact(...)         — whether a contact is an impact at all.
//
// The second is the one with teeth. The engine reports a manifold on EVERY step a body is touching
// anything, at 250 Hz. Without gating, a truck sitting still on the ground would be "hit" by its
// own weight a quarter of a thousand times a second and would shred its own front bumper in under
// a minute of doing nothing. That regression would not throw, it would just quietly delete the
// damage model's meaning — so it is pinned here.
//
// Body frame throughout: forward = −Z, right = +X, up = +Y, origin = CG.

import { DamageModel, DAMAGE_PARAMS as D, MPH } from '../src/damage.js'
import { classifyImpactRegion } from '../src/physics.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const MASS = P.mass, DT = 0.004
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }
const impulseAt = (mph) => MASS * mph * MPH

console.log('§1 the normal picks the FACE, the point picks which end of it')
{
  const nz = { x: 0, y: 0, z: 1 }, nx = { x: 1, y: 0, z: 0 }, ny = { x: 0, y: 1, z: 0 }
  ok(classifyImpactRegion({ x: 0, y: 0, z: -2.1 }, nz) === 'front', 'a longitudinal push at the nose is a FRONT hit')
  ok(classifyImpactRegion({ x: 0, y: 0, z: 2.7 }, nz) === 'rear', 'a longitudinal push at the tail is a REAR hit')
  ok(classifyImpactRegion({ x: -0.9, y: 0, z: 0 }, nx) === 'left', 'a lateral push at −x is a LEFT hit (right = +x)')
  ok(classifyImpactRegion({ x: 0.9, y: 0, z: 0 }, nx) === 'right', 'a lateral push at +x is a RIGHT hit')
  ok(classifyImpactRegion({ x: 0, y: -0.6, z: 0 }, ny) === null, 'a vertical push underneath is the GROUND, not armor')
  ok(classifyImpactRegion({ x: 0, y: 1.0, z: 0 }, ny) === null, '...and one from above is the roof, which has no armor either')

  // The sign of a manifold normal depends on which shape the engine labelled A, so the classifier
  // must read magnitudes only. Flipping every normal must change nothing.
  const flip = (v) => ({ x: -v.x, y: -v.y, z: -v.z })
  const same = [[{ x: 0, y: 0, z: -2.1 }, nz], [{ x: 0.9, y: 0, z: 0 }, nx], [{ x: 0, y: -0.6, z: 0 }, ny]]
    .every(([p, n]) => classifyImpactRegion(p, n) === classifyImpactRegion(p, flip(n)))
  ok(same, 'the classification is invariant to the normal\'s SIGN (the engine picks A arbitrarily)')

  // A pickup's CG sits well forward of body center, so a CG-relative split would put the front/rear
  // boundary inside the cab. The split is taken about the bumper mid-point instead.
  ok(classifyImpactRegion({ x: 0, y: 0, z: 0.2 }, nz) === 'front', 'the front/rear split is the bumper mid-point, not the CG — z=+0.2 is still the front half')
}

console.log('\n§2 the parked truck: a contact is NOT an impact')
{
  const d = new DamageModel({ params: {} })
  // One physics step of the truck's own weight, as a single manifold point. This is what resting
  // on the ground actually reports.
  const resting = MASS * 9.81 * DT
  const region = classifyImpactRegion({ x: 0, y: -0.55, z: 0 }, { x: 0, y: 1, z: 0 })
  for (let i = 0; i < 60 / DT; i++) d.feedContact(region, resting, MASS, DT)   // a full minute parked
  ok(d.get('armorFront') === 1, 'a minute parked on the ground costs the front armor nothing at all')
  ok(d.get('radiator') === 1, '...and the radiator nothing')
  console.log(`  (one resting step reads as ${(resting / MASS / MPH).toFixed(2)} mph equivalent; the floor is ${D.impactMinMph} mph)`)
  ok(resting / MASS < D.impactMinMph * MPH, 'the resting reading is below the floor by design, with margin')

  // Even pointed at armor — nose against a fence — a sub-floor contact must stay inert.
  const d2 = new DamageModel({ params: {} })
  for (let i = 0; i < 60 / DT; i++) d2.feedContact('front', resting, MASS, DT)
  ok(d2.get('armorFront') === 1, 'and leaning on a fence for a minute is not a crash either')
}


console.log('\n§3 one collision is one impact, priced on the truck\'s own Δv')
{
  // Severity comes from the VEHICLE's velocity change across the burst, not from the engine's
  // accumulated contact impulse. A solver's accumulated normal impulse includes what it spends
  // pushing penetration back out, which moves no momentum — measured against owner captures that
  // read a 60 mph strike as 104 and a 30 as 65. Δv keeps the glancing-blow property the impulse
  // model was chosen for, because a glance barely deflects the truck.
  const v = (mph) => ({ x: mph * MPH, y: 0, z: 0 })
  const quiet = (d, atMph) => { let r = null
    for (let i = 0; i < 20; i++) { const x = d.feedContact(null, 0, MASS, DT, v(atMph)); if (x && !r) r = x }
    return r }

  const d = new DamageModel({ params: {} })
  let landed = null, count = 0
  // 40 ms of approach at 50 mph so the pre-impact history is populated, then the hit.
  for (let i = 0; i < 12; i++) d.feedContact(null, 0, MASS, DT, v(50))
  for (let i = 0; i < 10; i++) {
    const mph = 50 - 45 * Math.min(1, i / 6)
    const r = d.feedContact('front', impulseAt(30), MASS, DT, v(mph))
    if (r) { landed = r; count++ }
  }
  const r = quiet(d, 5); if (r) { landed = r; count++ }
  ok(count === 1, 'a burst of contact steps lands exactly ONE impact')
  ok(landed && Math.abs(landed.v / MPH - 45) < 1.5,
    `...priced at the truck\'s own Δv, 50 → 5 mph (model says ${landed ? (landed.v / MPH).toFixed(1) : '-'})`)
  ok(landed && landed.region === 'front', '...on the region that took the peak')

  // THE PRE-IMPACT REACH-BACK. The engine's impulse only crosses the trigger a step or two into the
  // hit, by which time the deceleration has already happened. A burst that used the velocity of the
  // step it STARTED on measured Δv over ~4 ms and priced a 34 mph crash at 0.4 mph — nothing.
  ok(D.impactPreSteps >= 5, `a burst reaches ${D.impactPreSteps} steps back for its pre-impact speed`)
  const late = new DamageModel({ params: {} })
  // No approach history at all: the hit starts on the very first step it is ever fed.
  let landedLate = null
  for (let i = 0; i < 10; i++) {
    const rr = late.feedContact('front', impulseAt(30), MASS, DT, v(i === 0 ? 50 : 5))
    if (rr && !landedLate) landedLate = rr
  }
  const rl = quiet(late, 5); if (rl && !landedLate) landedLate = rl
  ok(landedLate && landedLate.v / MPH > 30, 'even with the drop happening immediately, the reach-back still catches most of it')

  // A COLLISION DOES NOT REPORT A CONTACT EVERY STEP. The manifold comes and goes as the pair
  // separates and re-touches, and banking on the first quiet step cut every crash to one step.
  const flick = new DamageModel({ params: {} })
  for (let i = 0; i < 12; i++) flick.feedContact(null, 0, MASS, DT, v(50))
  let landedFlick = null
  for (let i = 0; i < 10; i++) {
    const on = i % 3 !== 1                       // contact drops out every third step
    const mph = 50 - 45 * Math.min(1, i / 6)
    const rr = flick.feedContact(on ? 'front' : null, on ? impulseAt(30) : 0, MASS, DT, v(mph))
    if (rr && !landedFlick) landedFlick = rr
  }
  const rf = quiet(flick, 5); if (rf && !landedFlick) landedFlick = rf
  ok(landedFlick && landedFlick.v / MPH > 30,
    `a flickering manifold still prices the whole collision (${landedFlick ? (landedFlick.v / MPH).toFixed(1) : '-'} mph), not one step of it`)
}

console.log('\n§4 the region travels with the peak, and a long scrape does not last forever')
{
  const v = (mph) => ({ x: mph * MPH, y: 0, z: 0 })
  const d = new DamageModel({ params: {} })
  d.feedContact('front', impulseAt(10), MASS, DT, v(30))
  d.feedContact('left',  impulseAt(25), MASS, DT, v(20))
  d.feedContact('front', impulseAt(12), MASS, DT, v(15))
  let r = null
  for (let i = 0; i < 20; i++) { const x = d.feedContact(null, 0, MASS, DT, v(10)); if (x && !r) r = x }
  ok(r && r.region === 'left', 'the impact lands on the face that took the worst of it, not the one touched first')

  const d2 = new DamageModel({ params: {} })
  let hits = 0
  for (let i = 0; i < 1 / DT; i++) if (d2.feedContact('right', impulseAt(8), MASS, DT, v(20))) hits++
  ok(hits >= 3, `a full second of sustained scraping banks repeated hits (${hits}), rather than one that never ends`)
}

console.log('\n§5 brakes wear on ENERGY, so holding a hill costs nothing')
{
  // The owner caught this: torque x time wore the rear pads while the truck simply sat on a slope
  // with the brakes holding it. A stationary pad slides nothing, dissipates nothing, loses nothing.
  const held = new DamageModel({ params: {} })
  const stopped = { brakeTorque: [1300, 1300, 450, 450], wheelOmega: [0, 0, 0, 0] }
  for (let i = 0; i < 300 / DT; i++) held.step(stopped, {}, DT)   // five minutes parked on the brakes
  ok(held.get('brakeRear') === 1 && held.get('brakeFront') === 1,
    'five minutes holding a hill on full brake torque costs the pads NOTHING')

  const rolling = new DamageModel({ params: {} })
  const moving = { brakeTorque: [1300, 1300, 450, 450], wheelOmega: [49, 49, 49, 49] }  // ~18 m/s
  for (let i = 0; i < 300 / DT; i++) rolling.step(moving, {}, DT)
  ok(rolling.get('brakeFront') < 1, '...while the same torque at speed does wear them')
  ok(rolling.get('brakeFront') < rolling.get('brakeRear'),
    'and the fronts wear faster than the rears, which is how brakes actually behave')
}

console.log(fail ? '\nFAIL — the contact→impact wiring has drifted' : '\nPASS — engine contacts reach the right armor regions, and only when they are impacts')
process.exit(fail)

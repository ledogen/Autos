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

console.log('\n§3 one collision is one impact, priced on its PEAK')
{
  // A burst: rises to a 20 mph peak over ~10 steps, falls away over ~10, then contact breaks.
  const d = new DamageModel({ params: {} })
  const shape = [0.2, 0.5, 0.8, 1.0, 0.9, 0.6, 0.3, 0.1]
  let landed = null, count = 0
  for (const f of shape) { const r = d.feedContact('front', impulseAt(20) * f, MASS, DT); if (r) { landed = r; count++ } }
  const r = d.feedContact(null, 0, MASS, DT)     // contact breaks
  if (r) { landed = r; count++ }
  ok(count === 1, 'a burst of 8 contact steps lands exactly ONE impact')
  ok(landed && Math.abs(landed.v / MPH - 20) < 0.01, '...priced at the burst PEAK (20 mph), not its first, last or sum')
  ok(landed && landed.region === 'front', '...on the region that took the peak')

  // Peak, not sum: leaning on the thing you already hit must not keep adding damage.
  const dSum = new DamageModel({ params: {} })
  for (let i = 0; i < 8; i++) dSum.feedContact('front', impulseAt(20), MASS, DT)
  dSum.feedContact(null, 0, MASS, DT)
  const dOne = new DamageModel({ params: {} })
  dOne.feedContact('front', impulseAt(20), MASS, DT); dOne.feedContact(null, 0, MASS, DT)
  ok(Math.abs(dSum.get('armorFront') - dOne.get('armorFront')) < 1e-12, 'eight steps at 20 mph cost exactly what one does — peak, not sum')
}

console.log('\n§4 the region travels with the peak, and a long scrape does not last forever')
{
  // Clips a post front-first, then slews into it and loads the left side harder.
  const d = new DamageModel({ params: {} })
  d.feedContact('front', impulseAt(10), MASS, DT)
  d.feedContact('left', impulseAt(25), MASS, DT)
  d.feedContact('front', impulseAt(12), MASS, DT)
  const r = d.feedContact(null, 0, MASS, DT)
  ok(r && r.region === 'left', 'the impact lands on the face that took the worst of it, not the one touched first')

  // A sustained scrape: contact never breaks. It must bank periodically rather than never.
  const d2 = new DamageModel({ params: {} })
  let hits = 0
  for (let i = 0; i < 1 / DT; i++) if (d2.feedContact('right', impulseAt(8), MASS, DT)) hits++
  ok(hits >= 3, `a full second of sustained scraping banks repeated hits (${hits}), rather than one that never ends`)
  ok(hits <= Math.ceil(1 / D.impactHoldMax) + 1, `...at the ${D.impactHoldMax}s hold cadence, not per step`)
}

console.log(fail ? '\nFAIL — the contact→impact wiring has drifted' : '\nPASS — engine contacts reach the right armor regions, and only when they are impacts')
process.exit(fail)

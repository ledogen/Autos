// test/rock-collision-proxy.mjs — BUG-22 gate: rock/boulder hard-contact proxy matches the VISIBLE
// surface (no overshoot air-gap → no spurious sideways shove off the road).
//
// FEAT-06b models a rock/boulder as one hard sphere. The old proxy used the blob's boundingSphere
// radius = its OUTERMOST lump (radius·(1+irregularity)), so the truck collided with empty space metres
// before the visible surface — worst on huge/partly-buried boulders, where the near-tangential normal
// kicked the truck sideways off the road WITHOUT a real contact. BUG-22 bakes the proxy to the visible
// BULK instead. This gate locks that:
//   (1) bulk-fit   — baked collision radius tracks the bulk (mean equatorial reach), not the outer lump.
//   (2) no air-gap — a truck standoff that WOULD have hit the old boundingSphere proxy now returns NO
//                    contact (the overshoot band is gone), while touching the bulk still contacts.
//   (3) no-regress — the smallest rock still collides at its visible surface (proxy not shrunk away),
//                    and the bush soft-drag radius is unchanged.
//
// Run: node test/rock-collision-proxy.mjs   (exit 0 = pass)

import { buildPalette } from '../src/props/prop-palette.js'
import { sphereVsSphere } from '../src/props/prop-collider.js'
import { FLORA_PARAMS } from '../data/flora.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const P = FLORA_PARAMS
const ROCK_SCALE = P.collision.rockRadiusScale   // live inset applied in prop-system queryProps
const R_TRUCK = 0.4                              // representative contact-query radius (wheel-ish)

// Geometry stats for a baked blob: outermost horizontal lump + mean equatorial reach + 3D boundingSphere.
const geoStats = (geo) => {
  const pos = geo.attributes.position
  let maxAbsY = 0
  for (let i = 0; i < pos.count; i++) maxAbsY = Math.max(maxAbsY, Math.abs(pos.getY(i)))
  let maxHr = 0, sumHr = 0, nEq = 0
  for (let i = 0; i < pos.count; i++) {
    const hr = Math.hypot(pos.getX(i), pos.getZ(i))
    maxHr = Math.max(maxHr, hr)
    if (Math.abs(pos.getY(i)) < 0.4 * maxAbsY) { sumHr += hr; nEq++ }   // equatorial band = the bulk
  }
  geo.computeBoundingSphere()
  return { maxHr, meanEqHr: sumHr / Math.max(1, nEq), bs: geo.boundingSphere.radius }
}

const SEEDS = [1, 42, 777, 2024]

console.log('1. proxy radius tracks the visible BULK, not the outermost lump')
{
  let allBulkFit = true, allTighter = true, samples = 0
  for (const seed of SEEDS) {
    const { variants } = buildPalette(seed, P)
    for (const cat of ['rock', 'boulder']) {
      for (const entry of variants[cat]) {
        const s = geoStats(entry.geo)
        const r = entry.collision.radius
        samples++
        // tracks the bulk: within a band around the mean equatorial reach (substantial, no blow-out)
        if (!(r >= 0.70 * s.meanEqHr && r <= 1.15 * s.meanEqHr)) allBulkFit = false
        // strictly inside the outermost lump (so the truck no longer hits the outer-lump shell = air)
        if (!(r < s.maxHr)) allTighter = false
      }
    }
  }
  ok(samples >= 16, `sampled rock+boulder variants across seeds (${samples})`)
  ok(allBulkFit, 'every proxy radius sits within [0.70, 1.15]× the bulk (mean equatorial) reach')
  ok(allTighter, 'every proxy radius is strictly inside the outermost visible lump (no air-shell)')
}

console.log('2. no air-gap: a standoff that hit the OLD (boundingSphere) proxy now misses')
{
  // Use the largest boulder variant (worst overshoot). Compare new bulk proxy vs the old maxR proxy.
  const { variants } = buildPalette(2024, P)
  let big = null, bigBs = 0
  for (const e of variants.boulder) { const s = geoStats(e.geo); if (s.bs > bigBs) { bigBs = s.bs; big = { e, s } } }
  const scale = 1.0
  const effNew = big.e.collision.radius * scale * ROCK_SCALE   // current effective collidable radius
  const effOld = big.s.bs * scale * ROCK_SCALE                 // pre-fix effective collidable radius
  ok(effNew < effOld - 1.0, `boulder proxy tightened by >1 m (old ${effOld.toFixed(2)} → new ${effNew.toFixed(2)})`)

  // Standoff in the removed overshoot band: truck would have penetrated the OLD shell, but is now clear.
  const dAir = effOld + R_TRUCK - 0.3      // 0.3 m inside the old surface
  const air = sphereVsSphere(big.s.bs * 0 + dAir, 0, 0, R_TRUCK, 0, 0, 0, effNew)  // rock at origin
  ok(air === null, `standoff ${dAir.toFixed(2)} m (inside old shell) → NO contact under the bulk proxy`)

  // But genuinely touching the bulk still contacts, with a sane outward (horizontal) normal + small depth.
  const dHit = effNew + R_TRUCK - 0.1
  const hit = sphereVsSphere(dHit, 0, 0, R_TRUCK, 0, 0, 0, effNew)
  ok(hit && hit.depth > 0 && hit.depth < 0.25, `touching the bulk → contact with small depth (${hit ? hit.depth.toFixed(3) : 'none'})`)
  ok(hit && hit.nx > 0.99 && Math.abs(hit.ny) < 1e-6, 'contact normal points outward (away from rock), not launching')
}

console.log('3. no regression: smallest rock still collides; bush drag radius unchanged')
{
  const { variants } = buildPalette(42, P)
  // smallest rock variant
  let small = null, smR = Infinity
  for (const e of variants.rock) { if (e.collision.radius < smR) { smR = e.collision.radius; small = e } }
  const eff = small.collision.radius * ROCK_SCALE
  ok(eff > 0.3, `smallest rock proxy still substantial (eff radius ${eff.toFixed(2)} m)`)
  const dHit = eff + R_TRUCK - 0.05
  ok(sphereVsSphere(dHit, 0, 0, R_TRUCK, 0, 0, 0, eff) !== null, 'truck touching the smallest rock surface → contact (still collides)')

  // bush soft-drag radius must remain the full visual boundingSphere (unchanged feel)
  const bs = geoStats(variants.bush[0].geo).bs
  ok(Math.abs(variants.bush[0].collision.radius - bs) < 1e-6, 'bush collision radius == visual boundingSphere (drag unchanged)')
}

console.log(fails === 0 ? '\nROCK-COLLISION-PROXY GATE: PASS' : `\nROCK-COLLISION-PROXY GATE: FAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)

// GATE: the FEAT-88 haul load — firewood bundles drop into the bed, stay there, and stay out of the
// wear model and the debris cap.
//
// The load is what the game spawns: bedDropPoints() lays the pieces out on the yard's bed-sized drop
// zone (seeded), each dropped HAUL_DROP_Y above the pad on a HAUL_DROP_GAP stagger exactly like
// main.js's _haulStep — at FIXED points, so a truck parked off the zone catches less,
// and "aboard" is inBedWell() — the same test settle pays on. Each bundle is the convex hull of its
// own shipped GLB (variants A/B/C, as debris.js builds it) at its real 11 kg.
//
// Checks:
//   (a) DETERMINISM — the same key gives the same drop points, spins and variants; another key does not.
//   (b) LOADING — the stock's ends (12 and 30 bundles) dropped on a truck parked squarely over the zone: at least 80%
//       land in the well (the loader is sloppy — a lost piece or two is part of the job, owner
//       2026-10-09); one parked a metre off catches under 80% (parking is the skill).
//   (No RIDE check: spilling on the drive is the player's fault and the point of a loose heap —
//   owner 2026-10-09 dropped the old "launch to 60 and a hard stop loses nothing" assertion.)
//   (d) WEAR — with the bundles flagged noDamage the chassis contact readout ignores them; unflagged,
//       the same load registers (so the gate can see the filter).
//   (e) CAP — reclaiming past DEBRIS_CAP never takes a pinned body, and pinned bodies do not count.
//
// Run: node test/haul-load.mjs

import { HAUL_STOCK, HAUL_BUNDLE_KG } from '../data/offers.js'
import { GROUP_DEBRIS } from '../src/physics-engine.js'
import { DEBRIS_TYPES, DEBRIS_CAP, DebrisSystem, bedDropPoints } from '../src/debris.js'
import { BED, HULLS, hullVolume, truck, useGameHulls, load, aboard } from './lib/haul-rig.mjs'

const SIZE = [0.32, 0.33, 0.45]   // the largest extents across the variants — for the drop-point clearance check

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

console.log('(0) every bundle hull builds, at the mass offers.js says:')
{
  const t = await truck()
  const masses = Object.keys(HULLS).map(k => {
    const b = t.engine.createBody({ type: 'dynamic', position: { x: 0, y: 50, z: 0 } })
    t.engine.addHull(b, HULLS[k], { density: DEBRIS_TYPES[k].massKg / hullVolume(t.engine, HULLS[k]), group: GROUP_DEBRIS })
    return t.engine.getMass(b)
  })
  ok(masses.every(m => Math.abs(m - HAUL_BUNDLE_KG) < 0.01), `every variant is ${HAUL_BUNDLE_KG} kg on its own hull (${masses.map(m => m.toFixed(2)).join(', ')})`)
  t.engine.dispose()
}

// From here on the load uses what the GAME would build (haul-rig.mjs useGameHulls), so (b)–(d) test
// the shipped behaviour even while (0) is red on an asset.
await useGameHulls()

console.log('(a) determinism:')
{
  const a = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#0'))
  const b = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#0'))
  const c = JSON.stringify(bedDropPoints(12, BED, 'haul:6:poi:1|2#0#1'))
  ok(a === b, 'same key → identical drop points, spins and variants')
  ok(a !== c, 'a different offer → a different load')
  const pts = bedDropPoints(12, BED, 'k')
  ok(pts.every(d => Math.abs(d.x) + SIZE[0] / 2 < BED.wheelhouseHalfW && d.z > BED.frontZ && d.z < BED.tailZ),
    'every drop point is over the floor, inside the wheelhouse walls')
}

console.log("(b) loading a parked truck:")
for (const n of HAUL_STOCK) {
  const t = await truck()
  load(t, n, `haul:6:gate:${n}`)
  const a = aboard(t)
  ok(a >= n * 0.8, `parked squarely: ${n} bundles dropped, ${a} in the bed (≥ 80%)`)
  t.engine.dispose()
}
{
  const n = 15, t = await truck()
  load(t, n, `haul:6:gate:${n}`, { off: 1.0 })
  const a = aboard(t)
  ok(a < n * 0.8, `parked a metre off the zone: ${a} of ${n} in the bed`)
  t.engine.dispose()
}

console.log('(d) cargo never reads as an impact:')
for (const noDamage of [true, false]) {
  const t = await truck()
  load(t, 15, 'haul:6:gate:wear', { noDamage })
  const hit = t.engine.maxContactImpulse(t.chassis)
  ok(noDamage ? hit.impulse === 0 : hit.impulse > 0,
    `${noDamage ? 'flagged' : 'UNflagged (control)'}: chassis contact impulse ${hit.impulse.toFixed(1)} N·s`)
  t.engine.dispose()
}

console.log('(e) the cap never eats the load:')
{
  const reclaimed = []
  const rec = (pinned, i) => ({ pinned, i })
  const fake = { _live: [], _reclaim: (r) => reclaimed.push(r) }
  for (let i = 0; i < 12; i++) fake._live.push(rec(true, i))            // the load first, oldest
  for (let i = 12; i < 12 + DEBRIS_CAP + 2; i++) fake._live.push(rec(false, i))
  DebrisSystem.prototype._enforceCap.call(fake)
  ok(reclaimed.length === 2 && reclaimed.every(r => !r.pinned), `2 over the cap → the 2 oldest UNPINNED reclaimed (${reclaimed.map(r => r.i)})`)
  ok(fake._live.filter(r => r.pinned).length === 12, 'all 12 pinned bundles survive')
}

console.log(fail ? 'HAUL-LOAD: FAIL' : 'HAUL-LOAD: PASS')
process.exit(fail)

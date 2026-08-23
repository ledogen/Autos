// test/capture-classify.mjs — BUG-53: what is actually at an owner's captured spot, and did it merge?
//
// The owner marks a place in-game (capture key, kind "place") when a stretch of road looks wrong.
// This rebuilds the network with the window centred on that mark, finds the runs there, and answers
// the two questions a capture asks:
//
//   1. WHAT IS IT — for every pair of runs at the mark: do they share a node, how far do they run
//      within shared-earthworks distance, how far apart are their decks, and do they cross?
//   2. DID THE FIX FIRE — is either run carrying a merge (cededSpans / offCurveSpans), and if not,
//      which guard skipped it (the per-reason tally every guard writes via _v2MergeSkipped).
//
// Proximity that lies inside a merge's own extent is the FIX WORKING, not a defect, so it is
// discounted — a merged pair reports "MERGED", an unmerged one reports the conflict that remains.
//
// Rainy-day script, not a gate.
// USAGE: node test/capture-classify.mjs <seed> <markX> <markZ> [--look=160] [--radius=1400]
//        node test/capture-classify.mjs 3 1044 7423
// Marks come straight out of a capture file: .place.mark.{x,z} and .world.seed.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const argv = process.argv.slice(2)
const pos = argv.filter((a) => !a.startsWith('--'))
const flag = (k, d) => { const f = argv.find((a) => a.startsWith(`--${k}=`)); return f ? Number(f.split('=')[1]) : d }
if (pos.length < 3) { console.error('usage: node test/capture-classify.mjs <seed> <markX> <markZ> [--look=160] [--radius=1400]'); process.exit(1) }
const SEED = Number(pos[0]), MX = Number(pos[1]), MZ = Number(pos[2])
const LOOK = flag('look', 160)        // m — runs this close to the mark are "at" it
const RADIUS = flag('radius', 1400)
const NEAR = RANGER_PARAMS.roadV2.mergeProxM ?? 18   // the same distance the merge itself uses

const nearestOn = (px, pz, pts, polyCum) => {
  let d = Infinity, cum = 0, y = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const ex = b.x - a.x, ez = b.z - a.z
    const l2 = ex * ex + ez * ez
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
    const dd = Math.hypot(px - (a.x + t * ex), pz - (a.z + t * ez))
    if (dd < d) { d = dd; cum = polyCum[i - 1] + t * (polyCum[i] - polyCum[i - 1]); y = a.y + t * (b.y - a.y) }
  }
  return { d, cum, y }
}
// STRICT proper crossing (open interval, matches _segCrossParam): the coincident vertices of a
// merged strand touch everywhere, and an inclusive test would count each touch as a crossing.
const segX = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz
  const den = r1 * s2 - r2 * s1
  if (Math.abs(den) < 1e-12) return null
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den
  return (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) ? { t, u } : null
}

const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setRadius(RADIUS)
road.update(new THREE.Vector3(MX, 0, MZ))

const runs = [...road._network.entries()]
  .map(([k, e]) => ({ k, e, a: e.cellA?.join(','), b: e.cellB?.join(','), len: e.polyCum[e.polyCum.length - 1] }))
  .filter((r) => r.a && r.b)
const atMark = runs
  .map((r) => ({ r, hit: nearestOn(MX, MZ, r.e.points, r.e.polyCum) }))
  .filter((o) => o.hit.d < LOOK)
  .sort((x, y) => x.hit.d - y.hit.d)

console.log(`\n#### seed ${SEED}  mark (${MX}, ${MZ})  — ${runs.length} runs in the window, ${atMark.length} within ${LOOK} m`)
console.log(`     merges applied: ${road._v2Merges || 0} · guard skips: ${JSON.stringify(road._v2MergeSkip || {})}`)
for (const why of road._v2MergeSkipWhy || []) console.log(`       skipped  ${why}`)
// BUG-55: the pair census's disjoint findings (pairs sharing NO node — invisible to the per-node
// planner). Phase 1 counts them; the resolution ladder lands on them later.
for (const d of road._v2CensusStampResolved()?.disjoint || [])
  console.log(`     census disjoint: ${d.a} × ${d.b} · near ${d.nearLen.toFixed(0)} m, minSep ${d.minSep.toFixed(1)}, deck gap ${d.maxDy.toFixed(1)} m${d.resolved ? ` · resolved (${d.resolved})` : d.tear ? ' · TEAR (unresolved)' : ''}`)
// BUG-55 phase 5: a mark over deleted tarmac must not silently print CLEAN — say what was
// deleted, why, and whether the mark sits on it.
let deletedAtMark = 0
for (const rec of (road._v2Deleted || new Map()).values()) {
  let dMin = Infinity
  for (const p of rec.pts || []) { const dd = Math.hypot(p.x - MX, p.z - MZ); if (dd < dMin) dMin = dd }
  if (dMin < LOOK) deletedAtMark++
  console.log(`     resolved by DELETING ${rec.key} (detour ${rec.hops} hops) · pairs: ${rec.pairs.join(', ')}${dMin < LOOK ? '   <<< AT THE MARK' : ''}`)
}
for (const o of atMark) {
  const ceded = (o.r.e.cededSpans || []).map((s) => `${s.s0.toFixed(0)}–${s.s1.toFixed(0)} m to ${s.owner}`)
  console.log(`     ${o.r.k}  ${o.r.len.toFixed(0)} m · ${o.hit.d.toFixed(0)} m from mark` +
              (ceded.length ? `  · MERGED: cedes ${ceded.join(', ')}` : ''))
}

let defects = 0
for (let i = 0; i < atMark.length; i++) for (let j = i + 1; j < atMark.length; j++) {
  const A = atMark[i].r, B = atMark[j].r
  const shared = [A.a, A.b].filter((n) => n === B.a || n === B.b)
  // The merge's own extent (ceded strand + taper band) is intended geometry, in three ways:
  // A ceding to B, B ceding to A, and — at a junction where several legs bundle onto one spine —
  // A and B both ceding to the SAME third run, which puts them on one pavement by construction.
  const aOff = A.e.offCurveSpans || [], bOff = B.e.offCurveSpans || []
  const sanction = []
  for (const sp of aOff) if (sp.owner === B.k) sanction.push([sp.s0, sp.s1])
  for (const sp of bOff) if (sp.owner === A.k) sanction.push([sp.ownerS0 ?? -1, sp.ownerS1 ?? -1])
  for (const sp of aOff) if (bOff.some((o) => o.owner === sp.owner)) sanction.push([sp.s0, sp.s1])
  const merged = sanction.length > 0

  const pA = A.e.points, cA = A.e.polyCum, pB = B.e.points, cB = B.e.polyCum
  let nearLen = 0, minSep = Infinity, maxDy = 0, sepAt = null, dyAt = null, atTheMark = false
  for (let m = 0; m < pA.length; m++) {
    if (sanction.some(([s0, s1]) => cA[m] >= s0 - 1 && cA[m] <= s1 + 1)) continue
    const r = nearestOn(pA[m].x, pA[m].z, pB, cB)
    if (r.d >= NEAR) continue
    if (m > 0) nearLen += cA[m] - cA[m - 1]
    if (r.d < minSep) { minSep = r.d; sepAt = pA[m] }
    const dy = Math.abs(pA[m].y - r.y)
    if (dy > maxDy) { maxDy = dy; dyAt = { p: pA[m], sep: r.d } }
    if (Math.hypot(pA[m].x - MX, pA[m].z - MZ) < LOOK) atTheMark = true
  }
  const xs = []
  for (let m = 1; m < pA.length; m++) for (let n = 1; n < pB.length; n++) {
    const X = segX(pA[m - 1].x, pA[m - 1].z, pA[m].x, pA[m].z, pB[n - 1].x, pB[n - 1].z, pB[n].x, pB[n].z)
    if (!X) continue
    const sA = cA[m - 1] + X.t * (cA[m] - cA[m - 1])
    if (sanction.some(([s0, s1]) => sA >= s0 - 1 && sA <= s1 + 1)) continue
    const px = pA[m - 1].x + X.t * (pA[m].x - pA[m - 1].x), pz = pA[m - 1].z + X.t * (pA[m].z - pA[m - 1].z)
    const yA = pA[m - 1].y + X.t * (pA[m].y - pA[m - 1].y)
    const yB = pB[n - 1].y + X.u * (pB[n].y - pB[n - 1].y)
    xs.push({ px, pz, gap: Math.abs(yA - yB), dMark: Math.hypot(px - MX, pz - MZ) })
  }
  if (!xs.length && nearLen < 20) continue
  defects++
  console.log(`\n   -- ${A.k}  ×  ${B.k}   [${shared.length ? `share node ${shared.join('+')}` : 'DISJOINT'}]${merged ? '  (already merged — this is what is LEFT OVER)' : ''}`)
  if (nearLen >= 20)
    console.log(`      alongside ${nearLen.toFixed(0)} m · closest ${minSep.toFixed(1)} m @(${sepAt.x.toFixed(0)},${sepAt.z.toFixed(0)}) · worst deck gap ${maxDy.toFixed(1)} m @(${dyAt.p.x.toFixed(0)},${dyAt.p.z.toFixed(0)}) at ${dyAt.sep.toFixed(1)} m apart${atTheMark ? '   <<< AT THE MARK' : ''}`)
  for (const x of xs)
    console.log(`      CROSSES @(${x.px.toFixed(0)},${x.pz.toFixed(0)}) with ${x.gap.toFixed(1)} m between decks · ${x.dMark.toFixed(0)} m from mark${x.dMark < LOOK ? '   <<< AT THE MARK' : ''}`)
}
if (!defects) console.log(`\n   CLEAN — no unmerged conflict between any pair of runs at this mark.${deletedAtMark ? ` (${deletedAtMark} DELETED run(s) pass within ${LOOK} m — see above)` : ''}`)

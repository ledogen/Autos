// test/route-sharing-census.mjs — FEAT-76 step 1: how much do roads already share ground?
//
// The baseline the reuse feature has to beat. Today two edges route independently, land near each
// other by coincidence, and the plan layer merges or shoves them afterwards. This counts that
// coincidence directly, on the FINAL registered runs, at the shipped defaults (RANGER_PARAMS —
// per QUAL-29 the A/B reference is main as it stands, not the v1-at-reanchor column).
//
// For every unordered pair of registered runs it finds the maximal SHARED SPANS — stretches where
// the two centrelines stay within mergeProxM (18 m, the shared-earthworks distance) — and reports:
//   - how many pairs share ground at all, and how many metres in total
//   - the span-length distribution, split node-anchored vs mid-span
//   - the outcome each sharing pair actually got: MERGE / SHOVE / NOTHING
//
// Outcome is read off the registered geometry, not the tallies:
//   T       — FEAT-76: the pair's fork was PROMOTED to a real degree-3 node. One run's endpoint is a
//             promoted id (k = -1) sitting on the other, or on a run that is a slice of the other's
//             trunk. This is the outcome the ticket converts every wye into.
//   merged  — HISTORIC, cannot occur since QUAL-30: one run's cededSpans named the other, or both ceded
//             to the same third-party winner (a shared throat that forks twice)
//   shoved  — a run carries offCurveSpans naming the partner but cedes nothing to it: the
//             deflection rung, roads kept apart rather than made one
//   nothing — the pair shares ground and the plan layer did neither
//
// Spans are measured on the canonically-first run's samples (uniform 4 m spacing, PROTO_SAMPLE_DS),
// so the two directions agree to within a sample; separation never exceeds 18 m by construction.
//
// Rainy-day script, NOT a gate — it measures, it does not assert. Multi-seed is the point: a
// single seed explains the mechanism but cannot say whether a later change generalises.
// USAGE: node test/route-sharing-census.mjs [seed,seed,...] [radius]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = (process.argv[2] || '6,20,11,7,3').split(',').map(Number)
const RADIUS = Number(process.argv[4] || process.argv[3] || 1400)
const PROX = RANGER_PARAMS.roadV2?.mergeProxM ?? 18
const MINREG = 30    // m — _v2NodeMerges' own floor: shorter than this is pad-dressing, not sharing
const NODEW = 40     // m — a span touching this close to a shared run end is node-anchored

// perpendicular distance from (px,pz) to a polyline, with its cumulative-arc table
function nearestD(px, pz, pts, cum) {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, bx = pts[i].x, bz = pts[i].z
    const dx = bx - ax, dz = bz - az
    const L2 = dx * dx + dz * dz
    let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = ax + t * dx, qz = az + t * dz
    const d = Math.hypot(px - qx, pz - qz)
    if (d < best) best = d
  }
  return best
}

const pct = (arr, p) => { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(p*s.length))] }
const sum = (a) => a.reduce((x, y) => x + y, 0)

const all = []
for (const seed of SEEDS) {
  const t0 = Date.now()
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.setRadius(RADIUS)
  road.update(new THREE.Vector3(0, 0, 0))
  const buildMs = Date.now() - t0

  const runs = [...road._network.entries()].map(([k, e]) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of e.points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
    }
    return { k, e, a: e.cellA?.join(','), b: e.cellB?.join(','), minX, maxX, minZ, maxZ,
             L: e.polyCum[e.polyCum.length - 1] }
  })

  // FEAT-76: the promoted-T relation. A departure node is a synthetic id (k = -1) and it lives ON
  // the through road, so the two runs of a promoted pair meet at one: the side road starts there and
  // one half of the split trunk ends there.
  const promKeys = new Set(road._promoted ? road._promoted.keys() : [])
  const endsAtProm = (R) => [R.a, R.b].filter((c) => promKeys.has(c))
  const isT = (A, B) => endsAtProm(A).some((c) => endsAtProm(B).includes(c))
  const cedesTo = () => false          // QUAL-30: no run cedes any more — kept so the row still prints 0
  const offFor  = (R, other) => (R.e.offCurveSpans || []).some((s) => s.owner === other.k)
  const sharedWinner = () => false     // QUAL-30: likewise

  const spans = []          // every shared span, one entry each
  const pairs = []          // one entry per sharing pair
  let bboxTested = 0, walked = 0
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j]
    bboxTested++
    if (A.maxX + PROX < B.minX || B.maxX + PROX < A.minX ||
        A.maxZ + PROX < B.minZ || B.maxZ + PROX < A.minZ) continue
    walked++
    // walk A's samples, collect maximal runs of "within PROX of B"
    const pA = A.e.points, cA = A.e.polyCum, pB = B.e.points, cB = B.e.polyCum
    const mine = []
    let s0 = null, prev = null
    for (let m = 0; m < pA.length; m++) {
      const d = nearestD(pA[m].x, pA[m].z, pB, cB)
      if (d <= PROX) { if (s0 === null) s0 = cA[m]; prev = cA[m] }
      else if (s0 !== null) { mine.push([s0, prev]); s0 = null }
    }
    if (s0 !== null) mine.push([s0, prev])
    if (!mine.length) continue

    const shareN = [A.a, A.b].filter((n) => n === B.a || n === B.b).length > 0
    const LA = cA[cA.length - 1]
    let outcome = 'nothing'
    if (isT(A, B)) outcome = 'T'
    else if (cedesTo(A, B) || cedesTo(B, A)) outcome = 'merge'
    else if (sharedWinner(A, B)) outcome = 'merge*'          // both ceded to the same third winner
    else if (offFor(A, B) || offFor(B, A)) outcome = 'shove'

    let total = 0, longest = 0, anchored = false, real = 0
    for (const [x0, x1] of mine) {
      const len = x1 - x0
      total += len
      if (len > longest) longest = len
      const nodeAnchored = shareN && (x0 < NODEW || LA - x1 < NODEW)
      if (nodeAnchored) anchored = true
      if (len >= MINREG) real++
      spans.push({ len, nodeAnchored, outcome, kA: A.k, kB: B.k, shareN })
    }
    pairs.push({ kA: A.k, kB: B.k, shareN, nSpans: mine.length, total, longest, anchored, outcome, real,
                 x: pA[0].x, z: pA[0].z })
  }

  const real = pairs.filter((p) => p.longest >= MINREG)
  const by = (o) => real.filter((p) => p.outcome === o).length
  const realSpans = spans.filter((s) => s.len >= MINREG)
  const anchoredS = realSpans.filter((s) => s.nodeAnchored), midS = realSpans.filter((s) => !s.nodeAnchored)
  const lens = realSpans.map((s) => s.len)
  const netL = sum(runs.map((r) => r.L))

  console.log(`\n=== seed ${seed} · ${runs.length} runs · ${(netL/1000).toFixed(1)} km of road · radius ${RADIUS} m · built in ${(buildMs/1000).toFixed(1)} s ===`)
  console.log(`  pairs: ${bboxTested} total, ${walked} bbox-near, ${pairs.length} share ground at all, ${real.length} share >= ${MINREG} m`)
  console.log(`  shared metres (spans >= ${MINREG} m): ${sum(lens).toFixed(0)} m over ${realSpans.length} spans = ${(100*sum(lens)/netL).toFixed(1)}% of network length`)
  console.log(`  span length: median ${pct(lens,0.5).toFixed(0)} m · p90 ${pct(lens,0.9).toFixed(0)} m · max ${(lens.length?Math.max(...lens):0).toFixed(0)} m`)
  console.log(`  span anchor: ${anchoredS.length} node-anchored (legs leaving a shared junction) · ${midS.length} MID-SPAN (parted, came back)`)
  // The reuse-relevant class: two runs with NO node in common on the same ground. A junction's own
  // legs leaving together are expected geometry; two unrelated roads are the coincidence FEAT-76
  // proposes to route for deliberately.
  const disj = real.filter((p) => !p.shareN)
  console.log(`  pair kinship: ${real.length - disj.length} share a node (junction legs) · ${disj.length} DISJOINT (unrelated roads on the same ground)`)
  for (const p of disj.slice(0, 3))
    console.log(`     DISJOINT ${p.longest.toFixed(0)} m · outcome ${p.outcome} · ${p.kA} x ${p.kB}`)
  console.log(`  outcome of the ${real.length} real sharing pairs: T ${by('T')} · MERGE ${by('merge')} · merge-via-shared-winner ${by('merge*')} · SHOVE ${by('shove')} · NOTHING ${by('nothing')}`)
  console.log(`  promoted T nodes: ${road._promoted ? road._promoted.size : 0} (plan-layer promote/decline ${road._promoteStats ? road._promoteStats.done + '/' + road._promoteStats.declined : 'n/a'})`)
  const nothing = real.filter((p) => p.outcome === 'nothing').sort((a, b) => b.longest - a.longest)
  const nothingM = sum(nothing.map((p) => p.total))
  console.log(`  the NOTHING bucket: ${nothing.length} pairs, ${nothingM.toFixed(0)} m of unsanctioned shared ground (${(100*nothingM/netL).toFixed(1)}% of network)`)
  for (const p of nothing.slice(0, 5))
    console.log(`     ${p.longest.toFixed(0)} m longest (${p.total.toFixed(0)} m over ${p.nSpans}) · ${p.shareN ? 'share a node' : 'DISJOINT'}${p.anchored ? ' · node-anchored' : ''} · ${p.kA} x ${p.kB}`)
  console.log(`  plan-layer tallies: merges ${road._v2Merges||0} · shoves ${road._v2Shoves||0} · reroutes ${road._v2Reroutes||0} · condemned ${road._v2Condemned||0}`)
  const skip = road._v2MergeSkip || {}
  const skipRows = Object.entries(skip).sort((a, b) => b[1] - a[1])
  console.log(`  merge/shove declines: ${skipRows.length ? skipRows.map(([r, n]) => `${r} ${n}`).join(' · ') : '(none)'}`)

  all.push({ seed, runs: runs.length, netL, pairs: real.length, sharedM: sum(lens), spans: realSpans.length,
             anchored: anchoredS.length, mid: midS.length, lens, disjoint: disj.length,
             T: by('T'), merge: by('merge') + by('merge*'), shove: by('shove'), nothing: nothing.length, nothingM })
}

console.log(`\n=== across ${all.length} seeds ===`)
console.log(`seed   runs    km  pairs  disj  anch  mid   med  p90   max     T MERGE SHOVE NOTHING   nothing m  % net`)
for (const a of all)
  console.log(`${String(a.seed).padStart(4)} ${String(a.runs).padStart(6)} ${(a.netL/1000).toFixed(1).padStart(5)} ${String(a.pairs).padStart(6)} ${String(a.disjoint).padStart(5)} ${String(a.anchored).padStart(5)} ${String(a.mid).padStart(4)} ${pct(a.lens,0.5).toFixed(0).padStart(5)} ${pct(a.lens,0.9).toFixed(0).padStart(4)} ${(a.lens.length?Math.max(...a.lens):0).toFixed(0).padStart(5)} ${String(a.T).padStart(5)} ${String(a.merge).padStart(5)} ${String(a.shove).padStart(5)} ${String(a.nothing).padStart(7)} ${a.nothingM.toFixed(0).padStart(11)} ${(100*a.nothingM/a.netL).toFixed(1).padStart(6)}`)
const T = (f) => sum(all.map(f))
const allLens = all.flatMap((a) => a.lens)
console.log(`\ntotals: ${T((a)=>a.pairs)} sharing pairs · ${T((a)=>a.sharedM).toFixed(0)} m shared of ${(T((a)=>a.netL)/1000).toFixed(1)} km (${(100*T((a)=>a.sharedM)/T((a)=>a.netL)).toFixed(1)}%)`)
console.log(`        outcome T ${T((a)=>a.T)} · MERGE ${T((a)=>a.merge)} · SHOVE ${T((a)=>a.shove)} · NOTHING ${T((a)=>a.nothing)}`)
console.log(`        span median ${pct(allLens,0.5).toFixed(0)} m · p90 ${pct(allLens,0.9).toFixed(0)} m · anchored ${T((a)=>a.anchored)} vs mid-span ${T((a)=>a.mid)}`)
console.log(`        kinship ${T((a)=>a.pairs) - T((a)=>a.disjoint)} junction-leg pairs vs ${T((a)=>a.disjoint)} DISJOINT — the latter is the reuse opportunity FEAT-76 is aimed at`)

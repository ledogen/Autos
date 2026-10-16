// GATE (FEAT-30): a story-mode mission may only route over roads that ACTUALLY EXIST.
//
// The bug this pins, in full, because it is easy to reintroduce and invisible in code review:
// `_streamNetwork` runs `_assembleGraphEdges`, which registers the Urquhart edges MINUS the spec-time
// degree drops (`_degreeDrops`), and the mid-span T promotions then split some of those edges in
// two. The roads in the world are therefore never the raw Urquhart set. The mission planner
// originally read `_buildUrquhart` directly and happily routed through edges the world never
// builds, drawing confident routes across empty hillsides. (When this gate was written a crossing
// cull also deleted edges — ~15% of nearby raw edges; the cull is gone since FEAT-68, the degree
// drops and the promotions are not.)
//
// Two further properties are pinned here because both produced real, separate defects:
//   - the mission's centerline must BE the registered centerline object, not a re-route. Routing an
//     edge in isolation loses its neighbours' corridor context and lands a visibly different curve.
//   - `edgeParData` must return the REGISTERED key spelling. An edge is stored under whichever
//     endpoint order was seen first, and `roadQuality` HASHES the runKey — so handing back the
//     reversed spelling silently yields a different surface-quality series for the same tarmac.
//
// Heavy: needs a real streamed network.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { MissionSystem } from '../src/mission.js'
import { mulberry32 } from '../src/seed.js'

// ── DETERMINISM: this gate pins its own dice ────────────────────────────────────────────────────
// Every roll-based check below calls `ms._roll()`, and `_roll` uses Math.random BY DESIGN (mission
// rolls are run-layer randomness, SM-INV-12 — that is correct in the game and must not change).
// The consequence for the gate was that its own denominators wandered: the centerline-identity
// check in section 2 reported 30/38, then 27/34, on an UNCHANGED tree, and other runs gave 31/42,
// 29/37, 28/36. A check whose sample set re-rolls every run cannot tell a fix from noise — which
// matters especially here, because this file is BUG-41's referee.
//
// So the gate replaces Math.random with a seeded mulberry32 for the whole process, and each
// roll-based section re-seeds from its OWN constant. Per-section seeding keeps the sections
// independent: adding or removing a roll in section 1 no longer shifts section 5's sample. The
// stream is installed before the network is built so nothing in the run can escape it. Coverage is
// unchanged — same generator, same number of rolls — only the dice are fixed.
let _rng = mulberry32(0x5EED)
Math.random = () => _rng()
const reseed = (s) => { _rng = mulberry32(s >>> 0) }

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// The band the gate plans on. Missions read the PLAY RoadSystem (2026-09-07: story mode's frozen
// region band IS the planning network — there is no second instance any more), and every claim
// below is radius-independent, so this streams one representative wide network and rolls on it
// rather than paying for the region's full 2800 m.
const PLAN_R = 1400
const C = { x: 4500, z: 600 }
const road = new RoadSystem(6, RANGER_PARAMS)
road.setRadius(PLAN_R)
road.update(new THREE.Vector3(C.x, 0, C.z))

// ── 0. the gap the bug drove through actually exists ────────────────────────────────────────────
// A NON-VACUITY control for section 1, nothing more: section 1 asserts that missions only route
// over the REGISTERED network, and that assertion is only worth anything while the registered
// network actually DIFFERS from the raw Urquhart graph. If the two ever coincide, section 1 passes
// without testing anything and the original bug could walk straight back in.
//
// HISTORY, because this check has now been wrong twice in opposite directions:
//   · originally it asserted a healthy cull share (~15% of raw edges near centre do not exist).
//   · FEAT-68 (2026-08-19) DELETED the routed-geometry culls, so it inverted to `culled === 0`.
//   · BUG-57's keep-the-connection ladder then re-introduced a DELETE last-resort, making a
//     non-zero share correct again — and the inverted check went red without a defect behind it.
//   · FEAT-76's T-promotion then made it worse in a way that had nothing to do with culling at
//     all: promoting a wye to a real T SPLITS run A–B into A–P and P–B around a promoted node, so
//     the site-pair key A|B disappears while the road is still entirely there. Measured on seed 6:
//     of 7 "culled" edges, 5 were merely split and only 2 were genuinely absent.
//
// So the check now measures PRESENCE OF THE CONNECTION rather than presence of a key, and asserts
// that a gap exists rather than that it doesn't.
//
// An edge counts as built if the world joins its endpoints either directly or through INSERTED
// nodes — deliberately defined as "a node the raw graph does not have", NOT as FEAT-76's `k === -1`
// encoding. That is what stops this drifting a fourth time: the next feature that inserts a node
// needs no change here.
{
  const kf = (id) => `${id[0]},${id[1]},${id[2]}`
  const mx = Math.floor(C.x / 256), mz = Math.floor(C.z / 256)
  const raw = road._buildUrquhart(mx - 9, mx + 9, mz - 9, mz + 9, false)

  // Every node the GRAPH knows about. Anything else in the built network was inserted by a later
  // stage (FEAT-76 promoted Ts today) and is a waypoint along a road, not a destination.
  const graphNodes = new Set()
  for (const [a, b] of raw.edges) { graphNodes.add(kf(a)); graphNodes.add(kf(b)) }

  const direct = new Set()
  const adj = new Map()
  for (const [, e] of road._network) {
    if (!e.cellA || !e.cellB) continue
    const a = kf(e.cellA), b = kf(e.cellB)
    direct.add(`${a}|${b}`); direct.add(`${b}|${a}`)
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b); adj.get(b).add(a)
  }

  // a → b using only inserted nodes in between: the same road, re-keyed by a split.
  const joinedThroughInserted = (a, b, maxHops = 6) => {
    const seen = new Set([a])
    let frontier = [a]
    for (let h = 0; h < maxHops; h++) {
      const next = []
      for (const n of frontier) for (const m of (adj.get(n) ?? [])) {
        if (m === b) return true
        if (seen.has(m) || graphNodes.has(m)) continue   // never route THROUGH another real site
        seen.add(m); next.push(m)
      }
      if (!(frontier = next).length) break
    }
    return false
  }

  let near = 0, absent = 0, split = 0
  for (const [a, b] of raw.edges) {
    const pa = road._nodePos(a), pb = road._nodePos(b)
    if (Math.hypot(pa.x - C.x, pa.z - C.z) > 1600 || Math.hypot(pb.x - C.x, pb.z - C.z) > 1600) continue
    near++
    const ka = kf(a), kb = kf(b)
    if (direct.has(`${ka}|${kb}`)) continue
    if (joinedThroughInserted(ka, kb)) { split++; continue }
    absent++
  }

  // The gap must EXIST (or section 1 is vacuous) and must stay a trim rather than a shredding.
  // Measured on seed 6 @ HEAD: 2 of 26 absent (8%), 5 more merely split by T-promotion. The 40%
  // ceiling is set well clear of that while still catching a return of the pre-FEAT-68 cull
  // machinery, which "shredded v2 connectivity" at roughly 15% and would climb from there.
  check('raw Urquhart still differs from the built network (section 1 is not vacuous)',
    near > 10 && absent >= 1 && absent <= 0.40 * near,
    `${absent}/${near} absent (${(100 * absent / near).toFixed(0)}%), ${split} split by inserted nodes`)
  console.log(`       ${absent}/${near} raw edges near centre are genuinely NOT built; ${split} more are SPLIT around an inserted node (the road exists, the key changed)`)
}

// ── 1. no mission may propose an edge the world culled ──────────────────────────────────────────
const ms = new MissionSystem({
  getRoad: () => road,
  getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
  getSeed: () => 6,
  teleport () {}, setMapOpen () {}, onChange () {},
})
{
  reseed(1001)
  let phantom = 0, present = 0, rolls = 0
  let untagged = 0, minDeg = Infinity, realJunctions = 0
  const bad = []
  for (let i = 0; i < 20; i++) {
    const m = ms._roll()
    if (!m) continue
    rolls++
    for (const sg of m.segments) {
      if (road._network.has(sg.runKey)) present++
      else { phantom++; if (bad.length < 4) bad.push(sg.runKey) }
      // FEAT-39: the GPS assist decides where to raise a junction arrow from this tag alone. If it
      // ever stops being written, gps.js fails OPEN and puts an arrow on every bend in the road —
      // a silent regression the gps-route gate cannot see, because it feeds synthetic segments.
      if (typeof sg.endDeg !== 'number') untagged++
      else { minDeg = Math.min(minDeg, sg.endDeg); if (sg.endDeg >= 3) realJunctions++ }
    }
  }
  check('every mission edge exists in the CULLED network', phantom === 0 && present > 0,
    `${phantom} phantom of ${present + phantom} over ${rolls} rolls: ${bad.join(' ')}`)
  check('every mission segment carries its end-node DEGREE (FEAT-39 GPS junction filter)',
    untagged === 0 && present > 0, `${untagged} untagged of ${present + phantom}`)
  check('degrees are plausible: >=1 everywhere, and SOME joins are real junctions',
    minDeg >= 1 && realJunctions > 0, `minDeg=${minDeg}, ${realJunctions} joins of degree 3+`)
  console.log(`       ${rolls} missions, ${present} edges, ${phantom} phantom, ${realJunctions} deg-3+ joins`)
}

// ── 2. the route uses the world's OWN centerline, not a re-route ─────────────────────────────────
// Routing an edge in isolation loses its neighbours' corridor context and lands a visibly different
// curve, so the mission's blue line must be the white line the world actually built.
//
// For a PLAIN run that is object identity with the registered centerline, and this asserted exactly
// that. But a MERGED run's registered `centerline` is a stale primitive record — BUG-53: its points
// were re-seated onto the winner's course, so the primitive no longer describes the road underneath
// them. edgeParData deliberately hands those runs a points-backed sampler instead, which is the
// CORRECT geometry and is necessarily not the registered object. Identity therefore reported a
// permanent 33/39 (all 6 misses off-curve, 0 plain) — it was testing the wrong property for merged
// runs, not catching a defect. So the check splits by run class: identity where the primitive is
// still the road, and geometric agreement with the REGISTERED POLYLINE where it is not.
{
  reseed(1002)
  let same = 0, plain = 0, tracked = 0, merged = 0, worstDev = 0, worstKey = ''
  for (let i = 0; i < 8; i++) {
    const m = ms._roll()
    if (!m) continue
    for (const sg of m.segments) {
      const e = road._network.get(sg.runKey)
      if (!e) continue
      if (!e.offCurveSpans) {
        plain++
        if (e.centerline === sg.centerline) same++
        continue
      }
      // Merged: the sampler must interpolate the registered points, so every sampled position sits
      // ON that polyline. Deviation is floating-point noise if it is the same geometry, and metres
      // if the segment carried a re-route or a stale primitive.
      merged++
      let dev = 0
      const L = sg.centerline.length
      for (let k = 0; k <= 20; k++) {
        const q = sg.centerline.pointAt(L * k / 20)
        let best = Infinity
        for (let j = 1; j < e.points.length; j++) {
          const a = e.points[j - 1], b = e.points[j]
          const dx = b.x - a.x, dz = b.z - a.z
          const len2 = dx * dx + dz * dz
          const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / len2)) : 0
          best = Math.min(best, Math.hypot(q.x - (a.x + dx * t), q.z - (a.z + dz * t)))
        }
        dev = Math.max(dev, best)
      }
      if (dev > worstDev) { worstDev = dev; worstKey = sg.runKey }
      if (dev < 0.01) tracked++
    }
  }
  check('mission segments use the REGISTERED centerline object (blue line IS the white line)',
    plain > 0 && same === plain, `${same}/${plain} plain runs identical`)
  check('merged-run segments track the REGISTERED polyline (BUG-53 sampler is the real road)',
    merged > 0 && tracked === merged,
    `${tracked}/${merged} within 0.01 m; worst ${worstDev.toFixed(4)} m on ${worstKey}`)
}

// ── 3. edgeParData returns the registered key spelling (roadQuality hashes it) ───────────────────
{
  let wrong = 0, checked = 0
  for (const [runKey, e] of road._network) {
    if (!e.cellA || !e.cellB) continue
    // Ask BOTH ways round; both must name the key the network actually stores.
    for (const [a, b] of [[e.cellA, e.cellB], [e.cellB, e.cellA]]) {
      const ed = road.edgeParData(a, b)
      checked++
      if (!ed || ed.key !== runKey) wrong++
    }
    if (checked > 40) break
  }
  check('edgeParData reports the registered runKey from either endpoint order',
    wrong === 0, `${wrong}/${checked} wrong spelling`)
}

// ── 4. the far end must still be there when you DRIVE to it ─────────────────────────────────────
// The gate plans on a PLAN_R band; the play system in free roam streams ~320 m around the truck. If
// the cull disagreed between those windows, a mission could be planned onto a road that evaporates
// on arrival — which is exactly what "freecamming confirms it" would look like. Story mode now
// plans on the play instance itself, frozen, so the two windows are the same object there — but the
// degraded entry path (a timed-out region warm leaves streaming live) can still narrow the window
// under a live mission, so the agreement stays worth pinning.
{
  reseed(1004)
  let missing = 0, total = 0
  const bad = []
  for (let i = 0; i < 6; i++) {
    const m = ms._roll()
    if (!m) continue
    const last = m.segments[m.segments.length - 1]
    const play = new RoadSystem(6, RANGER_PARAMS)
    play.setRadius(320)
    play.update(new THREE.Vector3(m.end.x, 0, m.end.z))
    total++
    // QUAL-24: check the ABSTRACT EDGE, not the runKey. The claim is "the road you were sent to is
    // still there when you drive up" — a cull-agreement claim. A runKey names a run GROUPING, and a
    // deg-2 chain merge groups by the streamed band, so the plan radius and the 320 m play radius can
    // spell the same road differently while both genuinely have it. Same assertion, stable unit.
    const pg = play.networkGraph()
    const ek = (a, b) => { const ka = pg.key(a), kb = pg.key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}` }
    const have = new Set(pg.edges.map(([a, b]) => ek(a, b)))
    const want = (last.cellA && last.cellB) ? ek(last.cellA, last.cellB) : null
    if (want === null || !have.has(want)) { missing++; if (bad.length < 3) bad.push(want ?? `no-edge:${last.runKey}`) }
  }
  check('the drop-point road still exists when the PLAY system streams there',
    total > 0 && missing === 0, `${missing}/${total} evaporated: ${bad.join(' ')}`)
}

// ── 5. mission size envelope ────────────────────────────────────────────────────────────────────
{
  reseed(1005)
  const lens = []
  for (let i = 0; i < 10; i++) { const m = ms._roll(); if (m) lens.push(m.distance / 1000) }
  const lo = Math.min(...lens), hi = Math.max(...lens)
  check('missions land in a sane length envelope', lens.length >= 8 && lo > 1.0 && hi < 9.0,
    `${lens.length} rolls, ${lo.toFixed(1)}-${hi.toFixed(1)} km`)
  console.log(`       ${lens.length} rolls, ${lo.toFixed(1)}-${hi.toFixed(1)} km`)
}

// ── 6. FEAT-43: a story region CONFINES the mission ─────────────────────────────────────────────
// Story mode fences the player inside REGION_RADIUS_M, but Quick Job rolls BOTH endpoints freely
// from the network's node set — and that set reaches well past its nominal radius, because the
// streamed band carries a wide margin. Measured on seed 6 before the fix: a 1400 m band centred ON
// the region centre still offered nodes out to 2783 m, 4 of 43 beyond a 2500 m wall, so roughly one
// roll in ten sent the player outside the world they were allowed to be in. Regenerating just
// re-rolled the dice. The guard matters more now that the real network is the whole region band.
//
// Pinned here rather than in a story-mode test because the containment lives in the PLANNER: it is
// _roll's candidate filter plus the finished-polyline re-check, and both are mission-side.
{
  const R = 2500
  const region = { x: C.x, z: C.z, r: R }
  const msR = new MissionSystem({
    getRoad: () => road,
    getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
    getSeed: () => 6,
    getRegion: () => region,
    teleport () {}, setMapOpen () {}, onChange () {},
  })
  const dist = (p) => Math.hypot(p.x - region.x, p.z - region.z)
  reseed(1006)
  let rolls = 0, escaped = 0, worst = 0
  for (let i = 0; i < 25; i++) {
    const m = msR._roll()
    if (!m) continue
    rolls++
    // The POLYLINE is the claim: pins inside the wall on a road that itself leaves is still an escape.
    for (const p of [...m.poly, m.start, m.end]) {
      const d = dist(p)
      if (d > worst) worst = d
      if (d > R) escaped++
    }
  }
  check('a region-confined mission never leaves the wall (pins AND driven polyline)',
    rolls >= 8 && escaped === 0, `${escaped} points outside r=${R} over ${rolls} rolls, worst ${worst.toFixed(0)} m`)
  console.log(`       ${rolls} confined rolls, furthest point ${worst.toFixed(0)} m of ${R} m`)

  // The filter must not strangle the generator: if confinement left too little network to plan on,
  // the mode would quietly stop offering jobs, which looks identical to "it's still generating".
  check('confinement still yields missions at a healthy rate', rolls >= 20, `${rolls}/25 rolls produced a mission`)

  // And it must stay OPT-IN: free roam (no region) keeps the original unconfined behaviour, which
  // is what every section above has been exercising all along.
  reseed(1007)
  let free = 0
  for (let i = 0; i < 6; i++) if (ms._roll()) free++
  check('no region ⇒ unchanged free-roam planning', free >= 5, `${free}/6 rolls`)
}

// ── 7. ARC DOMAIN + ELEVATION AGREEMENT (BUG-41) ─────────────────────────────────────────────────
// `edgeParData()` and `runProfile()` must index the SAME road by the SAME arc. Par integrates over
// the first; the carve, the ribbon, the physics and the GPS overlay all read the second. If the two
// disagree, par prices a road the player does not drive — and par is the FEAT-53 payout denominator.
//
// HISTORY, because this section previously asserted the opposite. Until 2026-09-06 the two series
// deliberately differed and that was ruled WONTFIX (2026-08-03): the disagreement was measured as
// centimetres in the run INTERIOR and confined to junction END BANDS, where par has already clamped
// the truck to a junction speed cap. This section pinned that SHAPE, as an alarm rather than a
// correctness check. The alarm then fired (interior p99 3.241 m, band p99 400 m) — and the diagnosis
// was that it had never been an elevation problem at all. `edgeParData` handed out a sampler keyed
// on `clArc`, the PRE-MERGE routed centerline arc, while a merged run's points follow the winner's
// course, whose arc is `polyCum`. Compared at matched XZ the worst run's "elevation disagreement"
// collapsed from 3.156 m to 0.298 m; the arc offset between the two domains reached 17.3 m, and
// `centerline.length` was short by up to 6.80% (33.3 m) on 10 of 52 runs. BUG-41 re-parameterised
// the sampler onto the driven arc, so the two now agree BY CONSTRUCTION and the checks below assert
// agreement rather than a licensed shape.
//
// The instrument was wrong too, and that is fixed here: comparing two samplers at the same `s` is
// only meaningful while their domains agree, which is exactly what had silently stopped being true.
// So the domain is now asserted FIRST, per run. A FAIL below means some later stage has re-seated a
// run without moving its par arc with it — re-open BUG-41; it does not mean "revert the carve".
{
  const MARGIN = 250     // m from each end — beyond the widest measured band
  const STEP = 4
  const iAbs = [], bands = [], peaks = []
  let runs = 0
  let domMax = 0, domWorst = '', domRel = 0, domL = 0   // |par arc length - driven arc length|, over every run
  for (const [, e] of road._network) {
    if (!e.cellA || !e.cellB) continue
    const ed = road.edgeParData(e.cellA, e.cellB)
    if (!ed || !ed.centerline) continue
    const L = ed.centerline.length
    // THE DOMAIN CHECK (BUG-41). The elevation comparisons below sample both series at the same `s`,
    // which only means anything if `s` names the same point in each. `polyCum` is the run's driven
    // arc and the domain runProfile indexes, so the par centerline must measure the same length.
    if (e.polyCum) {
      const d = Math.abs(L - e.polyCum[e.polyCum.length - 1])
      // Scored RELATIVE to run length: the residual is chord-vs-arc SAMPLING, which scales with the
      // run (and its curviness), so a fixed metre bar silently tightens as runs get longer.
      const rel = d / Math.max(1, e.polyCum[e.polyCum.length - 1])
      if (rel > domRel) { domRel = rel; domMax = d; domWorst = ed.key; domL = e.polyCum[e.polyCum.length - 1] }
    }
    const dAt = (s) => ed.gradeAt(s) - road.runProfile(s, ed.key).gradeY

    if (L >= 2 * MARGIN + 100) {
      runs++
      for (let s = MARGIN; s <= L - MARGIN; s += STEP) iAbs.push(Math.abs(dAt(s)))
    }
    // End bands: how far in does the disagreement reach, and how big does it get?
    for (const fromStart of [true, false]) {
      let band = 0, peak = 0
      for (let t = 0; t <= Math.min(400, L / 2); t += STEP) {
        const v = Math.abs(dAt(fromStart ? t : L - t))
        if (v > 0.5) { band = t; peak = Math.max(peak, v) }
      }
      bands.push(band); peaks.push(peak)
    }
    if (runs > 40) break
  }
  const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))] }
  const iMax = Math.max(...iAbs), iP99 = pct(iAbs, 0.99)
  const bMax = Math.max(...bands), bP99 = pct(bands, 0.99)
  const pMax = Math.max(...peaks)

  // FIRST: the two series are indexed by the same arc. Every check below is vacuous without it.
  //
  // The residual is chord-vs-arc SAMPLING and it is proportional to run length, not constant: measured
  // 2026-09-07 over 415 runs (seeds 6/11/3/20, cutMax 20 and 25) the gap is 0.02-0.06% of length with
  // no bimodality — median 0.027 m, max 0.062%. So the bar is RELATIVE. The old fixed 0.5 m encoded only
  // half of what this comment already said ("max 0.39 m ... 0.040%") and therefore tightened silently as
  // runs got longer: a curvy 899 m run at 0.062% is 0.560 m and failed a bar its 0.040% sibling passed.
  // 0.15% keeps >2x headroom over the measured worst while staying ~500x below the failure this guards —
  // a run re-seated without its par arc shows up here at TENS OF METRES, not fractions of one.
  const domBar = Math.max(0.5, 0.0015 * domL)
  check('BUG-41: par and runProfile index the run by the SAME arc',
    domMax < domBar, `worst |par length - driven length| ${domMax.toFixed(3)} m (${(domRel * 100).toFixed(4)}% of a ${domL.toFixed(0)} m run, bar ${domBar.toFixed(2)} m) on ${domWorst}`)

  // The load-bearing property: away from the junctions, par's hills ARE the carved hills.
  check('BUG-41: the two elevation series agree in the run INTERIOR',
    iAbs.length > 500 && iMax < 2.0 && iP99 < 0.5,
    `${iAbs.length} samples over ${runs} runs: p99 ${iP99.toFixed(3)} m, max ${iMax.toFixed(3)} m`)

  // Residual disagreement is the junction approach, where the later stage reconciles the run onto
  // its shared node/pad elevation. It must stay there rather than creep along the run.
  check('BUG-41: residual disagreement stays confined to the junction END BANDS',
    bP99 <= 250 && bMax <= 320,
    `band width over ${bands.length} run ends: p99 ${bP99} m, max ${bMax} m`)

  // ...and stay within the magnitude the junction reconciliation is worth.
  check('BUG-41: end-band divergence stays within its measured magnitude',
    pMax <= 45, `peak |Δelevation| ${pMax.toFixed(2)} m`)

  console.log(`       interior p99 ${iP99.toFixed(3)} m / max ${iMax.toFixed(3)} m · band p99 ${bP99} m / max ${bMax} m · peak ${pMax.toFixed(1)} m`)
}

console.log(fails === 0 ? '\nPASS mission-network' : `\nFAIL mission-network (${fails})`)
process.exit(fails === 0 ? 0 : 1)

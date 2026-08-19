// GATE (FEAT-30): a story-mode mission may only route over roads that ACTUALLY EXIST.
//
// The bug this pins, in full, because it is easy to reintroduce and invisible in code review:
// `_streamNetwork` runs `_assembleGraphEdges` (registers every Urquhart edge) and THEN
// `_cullNetwork` (drops crossings, clearance violations, excess degree). The roads in the world are
// therefore **Urquhart MINUS the cull**. The mission planner originally read `_buildUrquhart`
// directly — the raw, pre-cull set — and happily routed through edges the world deletes, drawing
// confident routes across empty hillsides. Roughly 15% of nearby raw edges do not survive the cull,
// so this was not a rare corner case.
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
import { MissionSystem, MISSION_PLAN_RADIUS } from '../src/mission.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const C = { x: 4500, z: 600 }
const road = new RoadSystem(6, RANGER_PARAMS)
road.setRadius(MISSION_PLAN_RADIUS)
road.update(new THREE.Vector3(C.x, 0, C.z))

// ── 0. the gap the bug drove through actually exists ────────────────────────────────────────────
{
  const kf = (id) => `${id[0]},${id[1]},${id[2]}`
  const registered = new Set()
  for (const [, e] of road._network) if (e.cellA && e.cellB) {
    registered.add(`${kf(e.cellA)}|${kf(e.cellB)}`); registered.add(`${kf(e.cellB)}|${kf(e.cellA)}`)
  }
  const mx = Math.floor(C.x / 256), mz = Math.floor(C.z / 256)
  const raw = road._buildUrquhart(mx - 9, mx + 9, mz - 9, mz + 9, false)
  let near = 0, culled = 0
  for (const [a, b] of raw.edges) {
    const pa = road._nodePos(a), pb = road._nodePos(b)
    if (Math.hypot(pa.x - C.x, pa.z - C.z) > 1600 || Math.hypot(pb.x - C.x, pb.z - C.z) > 1600) continue
    near++
    if (!registered.has(`${kf(a)}|${kf(b)}`)) culled++
  }
  // FEAT-68 (2026-08-19): the routed-geometry culls are DELETED (measured: they shredded v2
  // connectivity while preventing zero real crossings), so the registered network ≡ the
  // degree-capped graph. The check inverts: a NONZERO cull share now means phantom edge-dropping
  // machinery came back.
  check('no routed-geometry cull exists — registered network ≡ degree-capped graph near centre',
    near > 10 && culled === 0, `${culled}/${near} culled near centre`)
  console.log(`       ${culled}/${near} raw edges near centre do NOT exist in the world (${(100 * culled / near).toFixed(0)}%)`)
}

// ── 1. no mission may propose an edge the world culled ──────────────────────────────────────────
const ms = new MissionSystem({
  getRoad: () => road,
  makePlanner: () => road,
  getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
  getSeed: () => 6,
  teleport () {}, setMapOpen () {}, onChange () {},
})
{
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
{
  let same = 0, total = 0
  for (let i = 0; i < 8; i++) {
    const m = ms._roll()
    if (!m) continue
    for (const sg of m.segments) {
      total++
      if (road._network.get(sg.runKey)?.centerline === sg.centerline) same++
    }
  }
  check('mission segments use the REGISTERED centerline object (blue line IS the white line)',
    total > 0 && same === total, `${same}/${total} identical`)
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
// The planner streams a MISSION_PLAN_RADIUS band around the player; the play system streams ~320 m
// around the truck. If the cull disagreed between those windows, a mission could be planned onto a road that
// evaporates on arrival — which is exactly what "freecamming confirms it" would look like. Routes
// now reach ~5.6 km, so this is worth pinning rather than assuming.
{
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
  const lens = []
  for (let i = 0; i < 10; i++) { const m = ms._roll(); if (m) lens.push(m.distance / 1000) }
  const lo = Math.min(...lens), hi = Math.max(...lens)
  check('missions land in a sane length envelope', lens.length >= 8 && lo > 1.0 && hi < 9.0,
    `${lens.length} rolls, ${lo.toFixed(1)}-${hi.toFixed(1)} km`)
  console.log(`       ${lens.length} rolls, ${lo.toFixed(1)}-${hi.toFixed(1)} km`)
}

// ── 6. FEAT-43: a story region CONFINES the mission ─────────────────────────────────────────────
// Story mode fences the player inside REGION_RADIUS_M, but Quick Job rolls BOTH endpoints freely
// from the planner's node set — and that set reaches well past the planner's nominal radius,
// because the streamed band carries a wide margin. Measured on seed 6 before the fix: a planner at
// MISSION_PLAN_RADIUS centred ON the region centre still offered nodes out to 2783 m, 4 of 43
// beyond a 2500 m wall, so roughly one roll in ten sent the player outside the world they were
// allowed to be in. Regenerating just re-rolled the dice.
//
// Pinned here rather than in a story-mode test because the containment lives in the PLANNER: it is
// _roll's candidate filter plus the finished-polyline re-check, and both are mission-side.
{
  const R = 2500
  const region = { x: C.x, z: C.z, r: R }
  const msR = new MissionSystem({
    getRoad: () => road,
    makePlanner: () => road,
    getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
    getSeed: () => 6,
    getRegion: () => region,
    teleport () {}, setMapOpen () {}, onChange () {},
  })
  const dist = (p) => Math.hypot(p.x - region.x, p.z - region.z)
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
  let free = 0
  for (let i = 0; i < 6; i++) if (ms._roll()) free++
  check('no region ⇒ unchanged free-roam planning', free >= 5, `${free}/6 rolls`)
}

// ── 7. DRIFT ALARM (BUG-41): par prices a DIFFERENT elevation series than the world carves ───────
// This does NOT assert the two agree. They deliberately do not, and that was ruled WONTFIX
// (2026-08-03): `edgeParData().gradeAt` samples the ROUTED design polyline, while the carve, the
// ribbon, the physics and the GPS overlay all read `runProfile().gradeY`, a later pipeline stage.
// Par integrates a slope over a 2 m step (par.js DS), so it is insensitive to what that later stage
// mostly adds, and PAR_REF was calibrated (FEAT-30) against real drives through this same sampler —
// the basis is a convention, and switching it would invalidate the fit to buy ~0.6% of par time.
//
// What makes that ruling SAFE is the measured SHAPE of the disagreement, and that is what this pins:
//   - in the run INTERIOR the two series are the same road to within centimetres;
//   - the disagreement is confined to END BANDS, where the later stage reconciles the run onto its
//     shared junction/pad elevation — and where par has already clamped the truck to a junction
//     speed cap, so a grade error there buys little time either way.
// If a future carve stage widens those bands into the interior, par silently starts pricing hills
// the truck does not climb, at a magnitude nobody measured. That is the regression this catches. It
// is an alarm, not a correctness check: a FAIL here means "re-open BUG-41", not "revert the carve".
{
  const MARGIN = 250     // m from each end — beyond the widest measured band (232 m)
  const STEP = 4
  const iAbs = [], bands = [], peaks = []
  let runs = 0
  for (const [, e] of road._network) {
    if (!e.cellA || !e.cellB) continue
    const ed = road.edgeParData(e.cellA, e.cellB)
    if (!ed || !ed.centerline) continue
    const L = ed.centerline.length
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

  // The load-bearing property: away from the junctions, par's hills ARE the carved hills.
  check('BUG-41 alarm: the two elevation series agree in the run INTERIOR',
    iAbs.length > 500 && iMax < 2.0 && iP99 < 0.5,
    `${iAbs.length} samples over ${runs} runs: p99 ${iP99.toFixed(3)} m, max ${iMax.toFixed(3)} m`)

  // The disagreement must stay a junction-approach phenomenon, not creep along the run.
  check('BUG-41 alarm: the disagreement stays confined to the junction END BANDS',
    bP99 <= 250 && bMax <= 320,
    `band width over ${bands.length} run ends: p99 ${bP99} m, max ${bMax} m`)

  // ...and stay the size it was when the WONTFIX was measured (peak 30.8 m across seeds 6/1/42).
  check('BUG-41 alarm: end-band divergence stays within its measured magnitude',
    pMax <= 45, `peak |Δelevation| ${pMax.toFixed(2)} m`)

  console.log(`       interior p99 ${iP99.toFixed(3)} m / max ${iMax.toFixed(3)} m · band p99 ${bP99} m / max ${bMax} m · peak ${pMax.toFixed(1)} m`)
}

console.log(fails === 0 ? '\nPASS mission-network' : `\nFAIL mission-network (${fails})`)
process.exit(fails === 0 ? 0 : 1)

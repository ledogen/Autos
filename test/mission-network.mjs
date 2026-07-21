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
  check('the cull removes a non-trivial share of raw Urquhart edges (the bug surface is real)',
    near > 10 && culled > 0, `${culled}/${near} culled near centre`)
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
    if (!play._network.has(last.runKey)) { missing++; if (bad.length < 3) bad.push(last.runKey) }
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

console.log(fails === 0 ? '\nPASS mission-network' : `\nFAIL mission-network (${fails})`)
process.exit(fails === 0 ? 0 : 1)

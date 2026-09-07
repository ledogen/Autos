// GATE (run-all): node test/promoted-node-id.mjs
//
// FEAT-76 — A PROMOTED T MUST BE THE SAME NODE FROM EVERY DIRECTION YOU DRIVE UP TO IT.
//
// Wye→T promotion introduces the first node in the graph that is NOT a blue-noise site: the point
// where a side road departs a through road. It has a synthetic id — the millimetre-quantised world
// XZ with k = -1 — and four modules outside the road system (mission.js, map2d.js, paper-route.js,
// world-validate.js) carry that id as an opaque triple. If the same physical T derived a different
// id depending on which stream window built it, the symptom would not be a crash: it would be
// missing POIs, a mission that cannot find its own edge, and a world-validate union-find that reads
// one connected world as two. That is BUG-25's failure mode wearing a new hat, so it gets a gate.
//
// GATING, per seed, over the T nodes that several windows all contain:
//   1. IDENTICAL ID — byte-for-byte, including the `${a},${b},${c}` spelling those modules key on.
//   2. IDENTICAL POSITION AND DECK HEIGHT — the id names a point ON a built road; if two windows
//      put the same T at different heights, the trunk they split is not window-invariant either.
//   3. DEGREE 3 — a promoted node that is not a three-way junction is a T that lost a leg.
//   4. NO COLLISION with a real site id (structural: real k >= 0), asserted rather than assumed.
//
// Windows per seed are concentric-ish: the same ground reached from four different centres, which
// is exactly how the streamer meets a T in play.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'

const SEEDS = ['6', '20', '11']
// four centres that overlap heavily — a T inside the shared ground must come out identical in all
const CENTERS = [[0, 0], [400, -300], [-350, 450], [250, 350]]
const RADIUS = 1400
// only judge Ts comfortably inside a window's own extent — a frontier run legitimately differs
// (1000 of the 1400 m radius: far enough in that the margin graph is complete around the node)
const CORE = 1000

const build = (seed, cx, cz) => {
  const road = new RoadSystem(parseWorldSeed(seed), P)
  road.setRadius(RADIUS)
  road.update(new THREE.Vector3(cx, 0, cz))
  return road
}

let fails = 0, checked = 0, seen = 0
for (const seed of SEEDS) {
  // node key -> [{ center, pos, deg, id }]
  const byKey = new Map()
  let anyProm = 0
  for (const [cx, cz] of CENTERS) {
    const road = build(seed, cx, cz)
    anyProm += road._promoted.size
    for (const [k, rec] of road._promoted) {
      // 4. the namespace claim, checked not assumed
      if (rec.id[2] !== -1) { console.log(`  FAIL ${seed}: promoted id ${k} does not carry k = -1`); fails++ }
      if (`${rec.id[0]},${rec.id[1]},${rec.id[2]}` !== k) { console.log(`  FAIL ${seed}: id ${rec.id} does not spell its own key ${k}`); fails++ }
      const deg = (road._proto.nodeInc.get(k) || []).length
      const arr = byKey.get(k) || byKey.set(k, []).get(k)
      arr.push({ c: `${cx},${cz}`, pos: rec.pos.clone(), deg, inCore: Math.hypot(rec.pos.x - cx, rec.pos.z - cz) < CORE })
    }
  }
  seen += anyProm
  // A T in the CORE of one window must be present, and identical, in every window whose core also
  // covers it. That is the invariance claim; a T only one window can see is a frontier artefact.
  for (const [k, obs] of byKey) {
    const core = obs.filter((o) => o.inCore)
    if (!core.length) continue
    const want = core.filter((o) => o.inCore).length
    const covering = CENTERS.filter(([cx, cz]) => Math.hypot(core[0].pos.x - cx, core[0].pos.z - cz) < CORE).length
    checked++
    if (want < covering) {
      console.log(`  FAIL ${seed}: T ${k} is in the core of ${covering} windows but only ${want} built it`)
      fails++; continue
    }
    for (const o of core) {
      if (o.deg !== 3) { console.log(`  FAIL ${seed}: T ${k} has degree ${o.deg} from centre ${o.c} (want 3)`); fails++ }
      const d = o.pos.distanceTo(core[0].pos)
      if (d > 1e-9) { console.log(`  FAIL ${seed}: T ${k} moved ${d.toExponential(2)} m between centres ${core[0].c} and ${o.c}`); fails++ }
    }
  }
  console.log(`seed ${seed}: ${byKey.size} distinct T nodes across ${CENTERS.length} windows, ${[...byKey.values()].filter((o) => o.some((x) => x.inCore)).length} in core`)
}

// A promotion that never fires proves nothing — say so loudly rather than passing an empty gate.
if (seen === 0) { console.log('FAIL: no promoted T nodes were built at all — the gate proved nothing'); fails++ }
console.log(`\n${fails ? 'FAIL' : 'PASS'}: ${checked} core T node(s) checked for window-invariant identity, ${fails} violation(s)`)
process.exit(fails ? 1 : 0)

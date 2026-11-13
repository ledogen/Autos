// GATE (run-all): node test/road-overlap-join.mjs   [--verbose]
//
// BUG-105 overlap join (owner, 2026-11-07, bug105-overlap: "(a) join with two Ts"). Two shipped roads that share no
// node but lie on each other's pavement for tens of metres are joined after layout (RoadSystem._v2JoinOverlaps): a T
// where they first touch, one shared road over the stretch, a T where they part. The one such pair in 240 census
// windows is seed 1394642004 at (683, 1286): a promoted T's departure (g:0,1,0:368253,1465649,-1) 1.2 m beside
// g:1,1,1:1,2,1 for ~80 m. On a window centred on it, built as the game builds them (pond no-go), this asserts:
//
//   join     the pair is joined: two new Ts on the other road, each with three runs ending at it (< 0.5 m), the side
//            road's two halves keep its two original ends (node 0,1,0 and the promoted T), and the decks agree at
//            each T (< 1 cm: the side road's end is pinned to the through road's deck);
//   overlap  no two runs within 500 m of the site that share no node lie under 2·HW apart (pavements on each other)
//            for 20 m or more, the backstop's own rule, judged here with a plain nearest-point walk;
//   window   the joined runs are bit-identical with the window shifted 700 m toward the origin.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { nearestOn } from './lib/close-pairs.mjs'

const VERBOSE = process.argv.includes('--verbose')
const SEED = '1394642004', SX = 683, SZ = 1286
const SIDE_A = '0,1,0', SIDE_B = '368253,1465649,-1', TRUNK = ['1,1,1', '1,2,1']
const NEAR = 2 * (P.roadHalfWidth ?? 5), MIN_M = 20

let fails = 0
const check = (label, ok, detail = '') => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${detail ? '  ' + detail : ''}`); if (!ok) fails++ }
const build = (cx, cz) => {
  const ws = parseWorldSeed(SEED), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P)
  road.setRadius(1400)
  road.update(new THREE.Vector3(cx, 0, cz))
  return road
}
const hashPts = (pts) => { let h = 2166136261; for (const p of pts) for (const v of [p.x, p.y, p.z]) { h ^= Math.round(v * 1000); h = Math.imul(h, 16777619) >>> 0 } return h.toString(16) }
const ends = (e) => [e.cellA.join(','), e.cellB.join(',')]
const near = (road) => [...road._network].filter(([, e]) => e.cellA && e.points?.some((p) => Math.hypot(p.x - SX, p.z - SZ) < 500))

const t0 = Date.now()
const road = build(SX, SZ)
console.log(`seed ${SEED} window (${SX}, ${SZ}): ${road._network.size} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
const joined = (road._v2MergeSkipWhy || []).filter((w) => w.startsWith('overlap-join'))
if (VERBOSE) for (const w of joined) console.log('  ' + w)

// ── join ──
const runs = near(road)
const halfA = runs.find(([, e]) => ends(e).includes(SIDE_A) && ends(e).some((c) => c.endsWith(',-1')) && !ends(e).includes(SIDE_B))
const halfB = runs.find(([, e]) => ends(e).includes(SIDE_B) && ends(e).some((c) => c.endsWith(',-1') && c !== SIDE_B) && !ends(e).some((c) => TRUNK.includes(c)))
const Ts = [halfA, halfB].map((h) => h && ends(h[1]).find((c) => c.endsWith(',-1') && c !== SIDE_B))
check('the side road is cut into two halves that keep its two ends (node 0,1,0 and the promoted T)', !!halfA && !!halfB,
  `${halfA?.[0] ?? '—'} · ${halfB?.[0] ?? '—'}`)
check('the original side run is gone', !road._network.has(`g:${SIDE_A}:${SIDE_B}`))
for (const T of Ts.filter(Boolean)) {
  const legs = runs.filter(([, e]) => ends(e).includes(T))
  const at = legs.map(([, e]) => (ends(e)[0] === T ? e.points[0] : e.points.at(-1)))
  const spread = Math.max(...at.map((p) => Math.hypot(p.x - at[0].x, p.z - at[0].z)))
  const dy = Math.max(...at.map((p) => Math.abs(p.y - at[0].y)))
  check(`T ${T}: three runs end at it, < 0.5 m apart, decks within 1 cm`, legs.length === 3 && spread < 0.5 && dy < 0.01,
    `${legs.length} runs, ${spread.toFixed(3)} m, ${(dy * 100).toFixed(2)} cm`)
}

// ── overlap ── (stations every 4 m on the shorter run of each pair sharing no node)
let worst = null
for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
  const [ka, A] = runs[i], [kb, B] = runs[j]
  if (ends(A).some((c) => ends(B).includes(c))) continue
  const [S, W] = A.polyCum.at(-1) <= B.polyCum.at(-1) ? [A, B] : [B, A]
  let run = 0, best = 0
  for (const p of S.points) {
    if (nearestOn(p.x, p.z, W.points, W.polyCum).d < NEAR) run += 4
    else run = 0
    best = Math.max(best, run)
  }
  if (!worst || best > worst.len) worst = { len: best, ka, kb }
}
check(`no two runs that share no node lie under ${NEAR} m apart for ${MIN_M} m or more`, !worst || worst.len < MIN_M,
  worst ? `longest ${worst.len} m (${worst.ka} × ${worst.kb})` : '')

// ── window ──
const L = Math.hypot(SX, SZ), road2 = build(SX - 700 * SX / L, SZ - 700 * SZ / L)
const keep = [halfA, halfB, ...Ts.filter(Boolean).flatMap((T) => runs.filter(([, e]) => ends(e).includes(T)))].filter(Boolean)
const moved = [...new Set(keep.map(([k]) => k))].filter((k) => !road2._network.has(k) || hashPts(road2._network.get(k).points) !== hashPts(road._network.get(k).points))
check('the joined runs are bit-identical with the window shifted 700 m toward the origin', keep.length > 0 && moved.length === 0,
  moved.join(', '))

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL ROAD-OVERLAP-JOIN CHECKS PASSED')
process.exit(fails ? 1 : 0)

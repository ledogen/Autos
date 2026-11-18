// test/urquhart-restore.mjs — FEAT-265 (DEC-401): a planned road that fails to route puts back the side Urquhart
// dropped on its account (RoadSystem._v2RestoreDropped).
//
// Seed 3200351065 (the owner's): the food vendor's spur end -1,1,1 lost its 756 m chord to -1,0,0 to Urquhart, whose
// two shorter sides via -1,1,2 both fail to route past a pond. The restore must
//   1. register that side, routed (length, not condemned), and count it in the junction degree;
//   2. build it identically in the network worker (buildNetworkSnapshot: same RoadSystem, params snapshot, pond discs)
//      and answer the same degree after adoptNetwork;
//   3. build it identically from another window (centred on the side, a free-roam radius);
// and a window with no failed route (seed 6, the worker-parity window) restores nothing, so it exports as before.
// Run: node test/urquhart-restore.mjs
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { snapshotRoadParams, buildNetworkSnapshot, pondDiscPad } from '../src/road-network-worker.js'

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }
const build = (seed, center, radius) => {
    const rs = new RoadSystem(seed, P), water = wirePondNoGo(rs, seed, P)
    rs.setRadius(radius); rs.update(new THREE.Vector3(center.x, 0, center.z))
    return { rs, water }
}
const runOf = (rs, a, b) => rs._network.get(`g:${a}:${b}`) ?? rs._network.get(`g:${b}:${a}`)

const SEED = parseWorldSeed('3200351065'), A = '-1,0,0', B = '-1,1,1', id = (k) => k.split(',').map(Number)
const sp = spawnDecision(SEED, P), C = { x: sp.x, z: sp.z }

// 1. the story region, synchronous
const t0 = performance.now()
const { rs, water } = build(SEED, C, REGION_WARM_RADIUS_M)
const e = runOf(rs, A, B), L = e?.polyCum?.at(-1) ?? 0
log(rs._v2Restored.has(`${A}|${B}`) && e && L > 500 && !e.condemned, 'owner seed: the side Urquhart dropped for the pond edges is restored and routed',
    `run ${e ? 'present' : 'MISSING'}, ${L.toFixed(0)} m, condemned ${!!e?.condemned}; restored sides ${rs._v2Restored.size / 2} (${(performance.now() - t0).toFixed(0)} ms)`)
const incA = rs._proto.nodeInc.get(A)?.length ?? 0, degA = rs._graphDegreeOf(id(A))
log(degA >= incA && incA > 0 && rs._proto.nodeInc.get(A).some((k) => k === `g:${A}:${B}` || k === `g:${B}:${A}`),
    'the restored side counts in its node\'s junction degree', `degree ${degA}, registered legs ${incA}`)

// 2. the network worker's build path, and adoptNetwork
const pad = pondDiscPad(P), R = REGION_WARM_RADIUS_M, discs = []
for (const p of water.pondsNear(C.x - R - pad, C.z - R - pad, C.x + R + pad, C.z + R + pad)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
const req = { seed: SEED, params: structuredClone(snapshotRoadParams(P)), center: C, radius: R, pondDiscs: Float64Array.from(discs) }
const wk = structuredClone(buildNetworkSnapshot(req, null).data), sy = rs.exportNetwork()
const runsEq = JSON.stringify(wk.runs.map((r) => [r.key, Array.from(r.pts)])) === JSON.stringify(sy.runs.map((r) => [r.key, Array.from(r.pts)]))
log(runsEq && JSON.stringify(wk.restored) === JSON.stringify(sy.restored), 'worker build == sync build (every run, the restored set)',
    `${wk.runs.length} vs ${sy.runs.length} runs, restored ${JSON.stringify(wk.restored)}`)
const ad = new RoadSystem(SEED, P); ad.adoptNetwork(wk)
log(ad._graphDegreeOf(id(A)) === degA && ad._graphDegreeOf(id(B)) === rs._graphDegreeOf(id(B)), 'adoptNetwork answers the restored nodes\' degrees as the builder does',
    `${A}: ${ad._graphDegreeOf(id(A))} vs ${degA}, ${B}: ${ad._graphDegreeOf(id(B))} vs ${rs._graphDegreeOf(id(B))}`)

// 3. another window: centred on the restored side, free-roam radius
const pa = rs._nodePos(id(A)), pb = rs._nodePos(id(B))
const w2 = build(SEED, { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, 1600).rs, e2 = runOf(w2, A, B)
log(!!e2 && JSON.stringify(Array.from(e2.polyCum)) === JSON.stringify(Array.from(e.polyCum)) && JSON.stringify(e2.centerline?.primitives) === JSON.stringify(e.centerline?.primitives),
    'window invariance: a free-roam window centred on the side builds it identically', e2 ? `${e2.polyCum.at(-1).toFixed(1)} m vs ${L.toFixed(1)} m` : 'MISSING')

// 4. no failed route → nothing restored, the export carries no `restored` field (byte-identical to before)
const s6 = build(6, { x: 139, z: 341 }, 1600).rs
log(s6._v2Restored.size === 0 && !('restored' in s6.exportNetwork()), 'seed 6 window: no restore, the export is unchanged', `restored ${s6._v2Restored.size}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// GATE (BUG-259 slice 3): nothing ground-textured lies on the road inside a bore. Owner, 2026-11-24: "a lot of the road
// surface inside the tunnels is covered by ground texure / there is z fighting". Two surfaces wear the terrain's material in a
// tube: the terrain MESH (the chunk's carve table on its 1 m grid) and the bore FLOOR (road-mesh.js buildTunnelTube's apron).
// Every bore span of the story region as the game builds it, every 2 m along and 0.5 m across:
//   1. on the lane (|lat| <= halfWidth) neither stands within CLEAR of the asphalt top the tires ride (sampleRoadTopY:
//      ribbon, pad or connector), nor over it: the terrain mesh (inside the arch, the mouth capsule's discard applied) and every
//      floor of every span. Main: where two bores meet, a leg's floor (8 m a side, one plank at its own camber) and its R
//      run-on past the node stood over the other legs' asphalt (seed 675325687's T: 1.34 m), and at a JOIN inside the hill
//      (two runs end to end, both bored) the connector and a leg past its end carved the skin down into the tube (seed
//      515997046 (2918, 517): the hill 15-25 m under raw, 5.5 m into the lane's arch; 2311041641 (-1583, 436): 7.1 m);
//   2. a join inside the hill is dark like the rest of the bore (shade < 0.5 at the join; main 1.0, daylight).
// A 20-seed census (BUG-259's Log) found 21 sites, every one at a node in a bore; plain bores were clean.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { TerrainSystem } from '../src/terrain.js'
import { GRID_SAMPLES as N, CHUNK_SIZE as S } from '../src/terrain-height.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',') : ['515997046', '2311041641', '675325687', '2781682411']
const R = P.tunnelBoreRadius ?? 8, HW = P.roadHalfWidth ?? 5, CLEAR = 0.05
const TP = TerrainSystem.prototype
let fail = 0
const ok = (c, msg) => { console.log(`[${c ? 'PASS' : 'FAIL'}] ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++ }

function meshSampler(T) {   // the chunk mesh as world-rig builds it, triangle-interpolated (PlaneGeometry −π/2 about X: faces abd, bcd)
    const chunks = new Map()
    const chunk = (cx, cz) => {
        const k = cx + ',' + cz; let Y = chunks.get(k); if (Y) return Y
        const raw = new Float32Array(N * N)
        for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) raw[zi * N + xi] = T.rawHeightWorld(cx * S + xi, cz * S + zi)
        const carve = TP._buildCarveTable.call(T.self, cx, cz, raw)
        Y = new Float32Array(N * N); for (let i = 0; i < N * N; i++) Y[i] = TP._composeCarvedY.call(T.self, raw[i], carve, null, i)
        chunks.set(k, Y); return Y
    }
    const v = (ix, iz) => { const cx = Math.floor(ix / S), cz = Math.floor(iz / S); return chunk(cx, cz)[(iz - cz * S) * N + (ix - cx * S)] }
    return (x, z) => {
        const x0 = Math.floor(x), z0 = Math.floor(z), u = x - x0, w = z - z0
        if (u + w <= 1) { const a = v(x0, z0); return a + u * (v(x0 + 1, z0) - a) + w * (v(x0, z0 + 1) - a) }
        const c = v(x0 + 1, z0 + 1); return c + (1 - u) * (v(x0, z0 + 1) - c) + (1 - w) * (v(x0 + 1, z0) - c)
    }
}
function cutAt(T, x, z, y) {   // the shader's mouth capsule (TerrainSystem.tunnelCutAt) on the mesh point at its own height
    const self = T.self; self._tunnelPortals ??= TP._tunnelPortals
    const keep = self.analyticHeight; self.analyticHeight = () => y
    try { return TP.tunnelCutAt.call(self, x, z) } finally { self.analyticHeight = keep }
}
function floorIndex(road, seed) {   // every span's floor triangles on a 4 m hash; (x, z) → the floors' Y there
    const rm = new RoadMeshSystem({ add() {}, remove() {} }, road, null, P, seed), H = new Map(), C = 4
    for (const [runKey, e] of road._network) for (const sp of e.tunnelSpans ?? []) {
        const L = e.polyCum.at(-1), s0 = Math.max(0, sp.s0), s1 = Math.min(L, sp.s1)
        const g = rm.buildTunnelTube(runKey, s0, s1, s0 !== sp.s0 || s1 !== sp.s1 ? { ...sp, s0, s1 } : sp, P)?.floor
        if (!g) continue
        const p = g.attributes.position.array, ix = g.index.array
        for (let i = 0; i < ix.length; i += 3) {
            const t = [ix[i], ix[i + 1], ix[i + 2]].map((j) => [p[3 * j], p[3 * j + 1], p[3 * j + 2]])
            const xs = t.map((q) => q[0]), zs = t.map((q) => q[2])
            for (let a = Math.floor(Math.min(...xs) / C); a <= Math.floor(Math.max(...xs) / C); a++)
                for (let b = Math.floor(Math.min(...zs) / C); b <= Math.floor(Math.max(...zs) / C); b++) { const k = a + ',' + b; (H.get(k) ?? H.set(k, []).get(k)).push(t) }
        }
    }
    return (x, z) => {
        const out = []
        for (const [a, b, c] of H.get(Math.floor(x / C) + ',' + Math.floor(z / C)) ?? []) {
            const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-9) continue
            const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2
            if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) out.push(l1 * a[1] + l2 * b[1] + l3 * c[1])
        }
        return out
    }
}

for (const s of SEEDS) {
    const seed = parseWorldSeed(s), road = new RoadSystem(seed, P), C = spawnDecision(seed, P)
    wirePondNoGo(road, seed, P); road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
    const T = makeTerrainHeadless(seed, P, road), mesh = meshSampler(T), fl = floorIndex(road, s), ug = road._undergroundNodes()
    let n = 0, terr = 0, flo = 0, wT = -Infinity, wF = -Infinity, atT = '', atF = '', spans = 0
    for (const [runKey, e] of road._network) {
        const L = e.polyCum.at(-1)
        for (const sp of e.tunnelSpans ?? []) {
            spans++
            for (let a = Math.max(0, sp.s0); a <= Math.min(L, sp.s1); a += 2) {
                const p = road.runPointAt(runKey, a), g = road.runProfile(a, runKey)
                if (!p) continue
                for (let lat = -HW + 0.25; lat <= HW - 0.25; lat += 0.5) {
                    const x = p.x + g.tz * lat, z = p.z - g.tx * lat, top = road.sampleRoadTopY(x, z)
                    if (top == null) continue
                    n++
                    const ym = mesh(x, z), dT = ym - top
                    if (ym - g.gradeY < Math.sqrt(R * R - lat * lat) && dT > -CLEAR && !cutAt(T, x, z, ym)) {
                        terr++; if (dT > wT) { wT = dT; atT = `(${x.toFixed(1)}, ${z.toFixed(1)})` } }
                    for (const fy of fl(x, z)) if (fy - top > -CLEAR) { flo++; if (fy - top > wF) { wF = fy - top; atF = `(${x.toFixed(1)}, ${z.toFixed(1)})` } }
                }
            }
        }
    }
    ok(terr === 0, `seed ${s}: terrain mesh within ${CLEAR * 100} cm of the asphalt or over it in a bore: ${terr} of ${n} lane points on ${spans} spans${terr ? `, worst ${wT.toFixed(2)} m over at ${atT}` : ''}`)
    ok(flo === 0, `seed ${s}: a bore floor within ${CLEAR * 100} cm of the asphalt or over it: ${flo} of ${n}${flo ? `, worst ${wF.toFixed(2)} m over at ${atF}` : ''}`)
    const joins = new Set([...ug.values()].filter((nd) => nd.boreJoin))
    let shade = 0
    for (const nd of joins) shade = Math.max(shade, road.boreShadeAt(nd.pos.x, (nd.pos.y ?? 0) + 1, nd.pos.z))
    if (joins.size || s === '515997046' || s === '2311041641') ok(joins.size > 0 && shade < 0.5, `seed ${s}: ${joins.size} joins inside the hill, brightest bore shade at one ${shade.toFixed(2)} (a tunnel's, < 0.5)`)
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)

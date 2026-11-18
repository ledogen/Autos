// CENSUS (BUG-214): the walls round POI and camp pads. Not a gate — a measurement.
//
// Per seed: the story region as story mode builds it (spawn → validateArea → PoiSystem.build, which hands
// the lay-by pads to the carve), the stream carve wired the way main.js wires it, plus camp pads sited by
// the real CampSystem.evaluate at random road points (flat sites only, as the make-camp prompt allows).
// For every pad, the terrain on the CHUNK GRID (1 m vertices at integer world metres, the triangle
// diagonal included) inside the pad's carve ring, with the pads on and with them off:
//   grade   worst |Δh| / edge length on an edge the pad moved   (base = the same edge with no pads)
//   step    worst |Δh| on such an edge (m)
//   wallH   height of the contiguous > 45° stretch through the worst edge, along the pad's outward normal
//   cause   at the worst edge (see classify): cap / selfref / overlap / ok
//   mesh    worst |chunk-mesh Y − analyticHeight| over the pad's chunks (the seam / LOD check)
//
//   over    worst overshoot (m): ground pushed past both the bench's design and the no-pad ground (a spike)
//
//   node test/pad-wall-census.mjs --seeds=281831,768902 [--camps=12] [--out=file.jsonl] [--keep=dir] [--padToe=m]
// --padToe: EXPERIMENT — the bench's toe cap (m) in place of roadMaxEmbankmentToe, pads only (mesh check skipped).
import * as THREE from 'three'
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { CampSystem, CAMP_PARAMS } from '../src/camp.js'
import { padSd, PAD_RIM_HOLD } from '../src/road-carve.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { TerrainSystem, CHUNK_SIZE, GRID_SAMPLES } from '../src/terrain.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]
const SEEDS = (arg('seeds') || '281831').split(',')
const NCAMP = Number(arg('camps') ?? 12)
const OUT = arg('out'), KEEP = arg('keep')
const shoulder = P.roadShoulderWidth ?? 2.5, fillS = P.roadFillSlope ?? 3, cutS = P.roadCutSlope ?? 1
const PAD_TOE = arg('padToe') ? Number(arg('padToe')) : null
const maxToe = PAD_TOE ?? P.roadMaxEmbankmentToe ?? 10, clr = P.roadClearanceMargin ?? 0.25
const REACH = PAD_RIM_HOLD + shoulder + maxToe

function rng (s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// The pad carve's own falloff at one point (road.js _poiPadCarve, minus the road gate): what the ring
// is asked to do here, for the classifier only. The measured heights come from the real analyticHeight.
function padRing (q, raw) {
    const designY = q.y - clr
    const fill = shoulder + Math.max(0, designY - raw) * fillS, cut = shoulder + Math.max(0, raw - designY) * cutS
    const toe = Math.min(Math.max(fill, cut), maxToe)
    return { designY, toe, capped: Math.max(fill, cut) > maxToe, dh: raw - designY }
}
function padW (q, sd, raw) {
    if (sd <= PAD_RIM_HOLD) return 1
    const { toe } = padRing(q, raw), over = sd - PAD_RIM_HOLD
    if (over >= toe) return 0
    const u = Math.min(1, over / Math.max(shoulder, toe))
    return 1 - u * u * (3 - 2 * u)
}

for (const s of SEEDS) {
    const t0 = Date.now()
    const seed = parseWorldSeed(String(s))
    const sp = spawnDecision(seed, P)
    const C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const { rawHeightWorld } = makeTerrainHeadless(seed, P, null)
    const water = new WaterSystem(seed, P, rawHeightWorld)
    const k = water.k, wreach = k.streamWidth * Math.max(k.widthFlatScale ?? 1, 1) + k.streamBankWidth, R = 512
    const waterCarve = {
        streamsNear: (x0, z0, x1, z1) => water.streamsInBBox(x0, z0, x1, z1),
        maxReach: () => wreach,
        sampleAt: (x, z, st, raw) => water.streamCarveSample(x, z, st ?? water.streamsInBBox(x - R, z - R, x + R, z + R), raw),
    }
    const terr = makeTerrainHeadless(seed, P, road, waterCarve)
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terr, getSeed: () => seed, getParams: () => P })
    const pois = poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    const poiPads = (road._poiPads || []).map((q, i) => ({ q, kind: 'poi', type: pois[i]?.type ?? '?' }))

    // Camp pads: the real siting at random road points inside the region (flat sites only).
    const camp = new CampSystem({ getSeed: () => seed, getParams: () => P, getRoad: () => road, getTerrain: () => terr,
                                  getWater: () => water, treesNear: () => 0 })
    const g = road.networkGraph(), edges = g.edges.filter(([a, b]) => Math.hypot(g.pos(a).x - C.x, g.pos(a).z - C.z) < REGION_RADIUS_M - 200)
    const rnd = rng(seedFor(seed, 'bug214')), campPads = []
    for (let tries = 0; campPads.length < NCAMP && tries < NCAMP * 30; tries++) {
        const [, , runKey] = edges[Math.floor(rnd() * edges.length)]
        const e = road._network.get(runKey); const len = e?.polyCum?.[e.polyCum.length - 1]
        if (!(len > 60)) continue
        const pt = road.runPointAt(runKey, 30 + rnd() * (len - 60)); if (!pt) continue
        const side = rnd() < 0.5 ? -1 : 1
        const tq = road.queryNearest(pt.x, pt.z, 5); if (!tq) continue
        const tl = Math.hypot(tq.tangent.x, tq.tangent.z) || 1
        const x = pt.x + (tq.tangent.z / tl) * side * 12, z = pt.z - (tq.tangent.x / tl) * side * 12
        camp._eval = null
        const ev = camp.evaluate(x, z)
        if (!ev.flat || !ev.pad) continue
        if (campPads.some(c => Math.hypot(c.q.x - ev.pad.x, c.q.z - ev.pad.z) < 120)) continue
        if (poiPads.some(c => Math.hypot(c.q.x - ev.pad.x, c.q.z - ev.pad.z) < 40)) continue
        campPads.push({ q: ev.pad, kind: 'camp', type: 'camp' })
    }
    road.setCampPads(campPads.map(c => c.q))
    if (PAD_TOE != null) {   // the experiment: the same carve with the bench's own toe cap
        const orig = road._poiPadCarve, alt = Object.create(road, { _params: { value: { ...road._params, roadMaxEmbankmentToe: PAD_TOE } } })
        road._poiPadCarve = (...a) => orig.apply(alt, a)
    }
    const all = [...poiPads, ...campPads]

    // Height grids for every pad, pads on, then pads off (the base), on the chunk vertex lattice.
    const grids = all.map(({ q }) => {
        const ext = Math.ceil(Math.hypot(q.halfLen, q.halfWid) + REACH + 2)
        const x0 = Math.floor(q.x) - ext, z0 = Math.floor(q.z) - ext, n = 2 * ext + 1
        return { x0, z0, n, h: new Float64Array(n * n), hb: new Float64Array(n * n), raw: new Float64Array(n * n), sd: new Float64Array(n * n) }
    })
    for (const [gi, G] of grids.entries()) for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) {
        const x = G.x0 + i, z = G.z0 + j, q = all[gi].q
        G.h[j * G.n + i] = terr.analyticHeight(x, z); G.raw[j * G.n + i] = rawHeightWorld(x, z); G.sd[j * G.n + i] = padSd(q, x - q.x, z - q.z)
    }
    const keepPoi = road._poiPads, keepCamp = road._campPads
    road.setPoiPads(null); road.setCampPads(null)
    for (const G of grids) for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) G.hb[j * G.n + i] = terr.analyticHeight(G.x0 + i, G.z0 + j)
    road.setPoiPads(keepPoi); road.setCampPads(keepCamp)

    // Chunk-mesh check: the real chunk build (_buildCarveTable + _composeCarvedY) vs analyticHeight.
    const TP = TerrainSystem.prototype, N = GRID_SAMPLES, S = CHUNK_SIZE, cell = S / (N - 1)
    const meshMemo = new Map()
    const meshY = (cx, cz) => {
        const key = `${cx},${cz}`; if (meshMemo.has(key)) return meshMemo.get(key)
        const raw = new Float32Array(N * N)
        for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) raw[zi * N + xi] = rawHeightWorld(cx * S + xi * cell, cz * S + zi * cell)
        const ct = TP._buildCarveTable.call(terr.self, cx, cz, raw), st = TP._buildStreamTable.call(terr.self, cx, cz, raw)
        const y = new Float64Array(N * N); for (let i = 0; i < N * N; i++) y[i] = TP._composeCarvedY.call(terr.self, raw[i], ct, st, i)
        meshMemo.set(key, y); return y
    }

    const rows = []
    for (const [pi, { q, kind, type }] of all.entries()) {
        const G = grids[pi], n = G.n, at = (i, j) => j * n + i
        let worst = { grade: 0 }, worstBase = 0, step = 0, over = 0
        const dY = q.y - clr
        for (let i = 0; i < n * n; i++) if (G.sd[i] > 0 && G.sd[i] <= REACH)
            over = Math.max(over, G.h[i] - Math.max(dY, G.hb[i]), Math.min(dY, G.hb[i]) - G.h[i])
        const consider = (a, b, len, ia, ja, ib, jb) => {
            const sa = G.sd[a], sb = G.sd[b]
            if (Math.min(sa, sb) > REACH || Math.max(sa, sb) <= 0) return          // outside the ring
            if (Math.abs(G.h[a] - G.hb[a]) < 0.02 && Math.abs(G.h[b] - G.hb[b]) < 0.02) return   // pad did not move it
            const gr = Math.abs(G.h[b] - G.h[a]) / len
            step = Math.max(step, Math.abs(G.h[b] - G.h[a]))
            if (gr > worst.grade) worst = { grade: gr, base: Math.abs(G.hb[b] - G.hb[a]) / len, a, b, ia, ja, ib, jb, len }
            worstBase = Math.max(worstBase, Math.abs(G.hb[b] - G.hb[a]) / len)
        }
        for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
            consider(at(i, j), at(i + 1, j), 1, i, j, i + 1, j)
            consider(at(i, j), at(i, j + 1), 1, i, j, i, j + 1)
            consider(at(i, j + 1), at(i + 1, j), Math.SQRT2, i, j + 1, i + 1, j)   // PlaneGeometry's diagonal
        }
        const row = { seed: s, kind, type, x: +q.x.toFixed(1), z: +q.z.toFixed(1), y: +q.y.toFixed(2),
                      grade: +worst.grade.toFixed(2), over: +over.toFixed(2), baseGrade: +(worst.base ?? 0).toFixed(2), step: +step.toFixed(2) }
        if (worst.a != null) {
            // Which way is "out" at the worst edge, and what the ring is asked to do there.
            const [ain, aout] = G.sd[worst.a] <= G.sd[worst.b] ? [worst.a, worst.b] : [worst.b, worst.a]
            const xo = G.x0 + (aout % n), zo = G.z0 + Math.floor(aout / n)
            const ring = padRing(q, G.raw[aout])
            const wIn = padW(q, G.sd[ain], G.raw[ain]), wOut = padW(q, G.sd[aout], G.raw[aout])
            // Other carves at the worst edge: a second pad's ring, or the road / stream carve already moving the ground.
            const otherPad = all.some((o, oi) => oi !== pi && padSd(o.q, xo - o.q.x, zo - o.q.z) <= REACH)
            const baseMoved = Math.max(Math.abs(G.hb[ain] - G.raw[ain]), Math.abs(G.hb[aout] - G.raw[aout]))
            // The wall along the outward normal through the worst edge: analytic heights at 0.25 m.
            const e = 0.05, gx = (padSd(q, xo + e - q.x, zo - q.z) - padSd(q, xo - e - q.x, zo - q.z)) / (2 * e)
            const gz = (padSd(q, xo - q.x, zo + e - q.z) - padSd(q, xo - q.x, zo - e - q.z)) / (2 * e), gl = Math.hypot(gx, gz) || 1
            const nx = gx / gl, nz = gz / gl, sd0 = G.sd[aout]
            const prof = []
            for (let d = -sd0; d <= REACH - sd0 + 0.01; d += 0.25) prof.push(terr.analyticHeight(xo + nx * d, zo + nz * d))
            let iMax = 0, gMax = 0
            for (let i = 1; i < prof.length; i++) { const gr = Math.abs(prof[i] - prof[i - 1]) / 0.25; if (gr > gMax) { gMax = gr; iMax = i } }
            let i0 = iMax, i1 = iMax
            while (i0 > 1 && Math.abs(prof[i0 - 1] - prof[i0 - 2]) / 0.25 > 1) i0--
            while (i1 < prof.length - 1 && Math.abs(prof[i1 + 1] - prof[i1]) / 0.25 > 1) i1++
            const wallH = Math.abs(prof[i1] - prof[i0 - 1])
            // Non-monotone profile: the surface turns back toward the bench after starting down to raw.
            let reversals = 0
            for (let i = 2; i < prof.length; i++) { const a = prof[i - 1] - prof[i - 2], b = prof[i] - prof[i - 1]; if (a * b < 0 && Math.abs(a) > 0.05 && Math.abs(b) > 0.05) reversals++ }
            const cause = otherPad ? 'overlap-pad' : baseMoved > 0.1 ? 'overlap-road/stream'
                : wOut > wIn + 0.02 ? 'selfref' : ring.capped ? 'cap' : 'ok'
            // Mesh vs analytic over the pad's chunks.
            let mesh = PAD_TOE != null ? null : 0
            if (mesh != null) {
            const cx0 = Math.floor(G.x0 / S), cx1 = Math.floor((G.x0 + n - 1) / S), cz0 = Math.floor(G.z0 / S), cz1 = Math.floor((G.z0 + n - 1) / S)
            for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
                const y = meshY(cx, cz)
                for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) {
                    const i = cx * S + xi - G.x0, j = cz * S + zi - G.z0
                    if (i < 0 || j < 0 || i >= n || j >= n) continue
                    if (G.sd[at(i, j)] <= 0 || Math.abs(G.h[at(i, j)] - G.hb[at(i, j)]) < 0.02) continue   // the ring the pad moved, not the asphalt overlay
                    mesh = Math.max(mesh, Math.abs(y[zi * N + xi] - G.h[at(i, j)]))
                }
            }
            }
            Object.assign(row, { at: [xo, zo], dh: +ring.dh.toFixed(2), toe: +ring.toe.toFixed(1), capped: ring.capped,
                                 wIn: +wIn.toFixed(2), wOut: +wOut.toFixed(2), otherPad, baseMoved: +baseMoved.toFixed(2),
                                 wallH: +wallH.toFixed(2), profGrade: +gMax.toFixed(2), reversals, cause, mesh: mesh == null ? null : +mesh.toFixed(3) })
        }
        rows.push(row)
        if (KEEP) { mkdirSync(KEEP, { recursive: true }); writeFileSync(`${KEEP}/${s}-${pi}.json`, JSON.stringify({ ...row, q, x0: G.x0, z0: G.z0, n, h: [...G.h].map(v => +v.toFixed(3)), hb: [...G.hb].map(v => +v.toFixed(3)) })) }
    }
    for (const r of rows) { const line = JSON.stringify(r); console.log(line); if (OUT) appendFileSync(OUT, line + '\n') }
    console.error(`seed ${s}: ${poiPads.length} poi + ${campPads.length} camp pads, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

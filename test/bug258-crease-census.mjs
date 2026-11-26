// BUG-258 rainy-day script (NOT a gate): creases in the rendered terrain mesh, and what makes each one.
//
//   node test/bug258-crease-census.mjs site <seed> <x> <z> [half=48]   one window around a mark, every crease listed
//   node test/bug258-crease-census.mjs census <seed...>                 the player's story region per seed, sampled
//
// The terrain mesh is a 1 m grid (CHUNK_SIZE 64, GRID_SAMPLES 65) whose vertices sit on integer world metres and carry
// analyticHeight (MESH == PHYSICS: the carve table calls the same _sampleCarveWorld). Each cell is two triangles split
// along (x, z+1)–(x+1, z) (THREE.PlaneGeometry after rotateX(−π/2)). A CREASE is a mesh edge whose two triangles'
// normals differ by ≥ T_DEG: a slope jump the 1 m grid draws as a zigzag (and, through the per-vertex slope colours
// rock 0.3–0.6 / grass 0.16, as a stepped colour boundary). Connected crease edges are one SEGMENT.
//
// Each crease edge is classed by which source it survives the removal of (the composed surface re-sampled with one
// source switched off on this instance only; nothing in src/ changes):
//   natural   the raw ground alone already has it (rawD ≥ 0.6·D) — the ridged noise's 1 − |n| is a true crease
//   poiPad    the POI/camp bench (_withPoiPad) — switching road._padsAll off moves D by > 40 %
//   jpad      a junction pad's carve (_mergeCarve) — _junctionPadCarve off
//   stream    the FEAT-18 stream channel under the road blend — the water carve off
//   union     two road passes composed by _carveCrossSectionBlended's max/min (BUG-64) — rivals off
//   own       none of the above: one road's own cross-section (shoulder, bank, toe, polar cap)
// The census samples 64 m windows (chunks) of the player's region (spawnDecision → REGION_RADIUS_M): EW_N windows
// at random among chunks a road's earthwork can reach, NAT_N among the rest, and scales each stratum to the region.
import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { REGION_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { RoadSystem } from '../src/road.js'
import { PoiSystem } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const T_DEG = +(process.env.T_DEG ?? 12), EW_N = +(process.env.EW_N ?? 40), NAT_N = +(process.env.NAT_N ?? 12)
const S = 64, REACH = 50   // earthwork reach from a centreline (FEAT-77 foot 18 m + DEEP_BANK_TOE_EXTRA 18 m, plus slack)

// The player's story region, built as test/lib/story-region.mjs builds it (spawn → region road → POIs on its pads).
export function buildWorld (s) {
  const seed = parseWorldSeed(s), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
  const road = new RoadSystem(seed, P)
  wirePondNoGo(road, seed, P); road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
  const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
  const terrain = makeTerrainHeadless(seed, P, road)
  const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
  const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
  poi.build(C, REGION_RADIUS_M, rep.mainNodes)
  return { seed, C, road }
}

export function freeWorld (s, x, z) {
  const seed = parseWorldSeed(s), road = new RoadSystem(seed, P)
  wirePondNoGo(road, seed, P); road.setRadius(1500); road.update(new THREE.Vector3(x, 0, z))
  return { seed, C: spawnDecision(seed, P), road }
}

export function rig (seed, road) {
  const water = new WaterSystem(seed, P, makeTerrainHeadless(seed, P, null).rawHeightWorld)
  const k = water.k, reach = k.streamWidth * Math.max(k.widthFlatScale ?? 1, 1) + k.streamBankWidth, RR = 512
  const waterCarve = {
    streamsNear: (x0, z0, x1, z1) => water.streamsInBBox(x0, z0, x1, z1),
    maxReach: () => reach,
    sampleAt: (x, z, streams, raw) => water.streamCarveSample(x, z, streams ?? water.streamsInBBox(x - RR, z - RR, x + RR, z + RR), raw),
  }
  const terr = makeTerrainHeadless(seed, P, road, waterCarve)
  // Source switches, on this instance only.
  const pads = road._padsAll, jp = road._junctionPadCarve, blended = road._carveCrossSectionBlended
  const off = {
    poiPad: () => { road._padsAll = null },
    jpad: () => { road._junctionPadCarve = () => null },
    stream: () => { terr.self._waterCarve = null },
    union: () => { road._carveCrossSectionBlended = function (nr, ...a) { return blended.call(this, nr && { ...nr, rivals: [] }, ...a) } },
  }
  const restore = () => { road._padsAll = pads; delete road._junctionPadCarve; delete road._carveCrossSectionBlended; terr.self._waterCarve = waterCarve; void jp }
  return { terr, off, restore, road }
}

// Heights on the (n+1)² vertex grid of a window with corner (x0, z0).
// `need` (optional): only those vertex ids are sampled, the rest stay NaN (their edges are never read).
export const grid = (f, x0, z0, n, need) => {
  const W = n + 1, h = new Float64Array(W * W).fill(NaN)
  if (need) for (const v of need) h[v] = f(x0 + v % W, z0 + Math.floor(v / W))
  else for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) h[j * W + i] = f(x0 + i, z0 + j)
  return h
}

// Every interior mesh edge with its dihedral (deg): {a, b} vertex ids, d. Triangles per cell (i, j):
// T1 = (i,j)(i,j+1)(i+1,j), T2 = (i,j+1)(i+1,j+1)(i+1,j); normal (−gx, 1, −gz).
export function dihedrals (h, n) {
  const W = n + 1, H = (i, j) => h[j * W + i]
  const n1 = (i, j) => [H(i + 1, j) - H(i, j), H(i, j + 1) - H(i, j)]
  const n2 = (i, j) => [H(i + 1, j + 1) - H(i, j + 1), H(i + 1, j + 1) - H(i + 1, j)]
  const ang = (p, q) => { const c = (p[0] * q[0] + p[1] * q[1] + 1) / Math.sqrt((p[0] * p[0] + p[1] * p[1] + 1) * (q[0] * q[0] + q[1] * q[1] + 1)); return Math.acos(Math.min(1, c)) * 180 / Math.PI }
  const out = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t1 = n1(i, j), t2 = n2(i, j)
    out.push({ a: (j + 1) * W + i, b: j * W + i + 1, d: ang(t1, t2), i, j, t: 0 })                                   // diagonal
    if (i + 1 < n) out.push({ a: j * W + i + 1, b: (j + 1) * W + i + 1, d: ang(t2, n1(i + 1, j)), i, j, t: 1 })     // x = i+1 line
    if (j + 1 < n) out.push({ a: (j + 1) * W + i, b: (j + 1) * W + i + 1, d: ang(t2, n1(i, j + 1)), i, j, t: 2 })   // z = j+1 line
  }
  return out
}

// One window: crease segments with class, sharpness and length.
export function scanWindow (ctx, x0, z0, n) {
  const { terr, off, restore, road } = ctx
  const hc = grid(terr.analyticHeight, x0, z0, n), ec = dihedrals(hc, n)
  const hot = ec.map((e, k) => k).filter((k) => ec[k].d >= T_DEG)
  if (!hot.length) return []
  // The variants only need the vertices of the cells either side of a hot edge.
  const need = new Set(), W = n + 1
  const cell = (i, j) => { for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) need.add((j + b) * W + i + a) }
  for (const k of hot) { const e = ec[k]; cell(e.i, e.j); if (e.t === 1) cell(e.i + 1, e.j); if (e.t === 2) cell(e.i, e.j + 1) }
  const er = dihedrals(grid(terr.rawHeightWorld, x0, z0, n, need), n)
  const alt = {}
  for (const c of ['poiPad', 'jpad', 'stream', 'union']) { off[c](); alt[c] = dihedrals(grid(terr.analyticHeight, x0, z0, n, need), n); restore() }
  const cls = (k) => {
    const D = ec[k].d
    if (er[k].d >= 0.6 * D) return 'natural'
    for (const c of ['poiPad', 'jpad', 'stream', 'union']) if (Math.abs(alt[c][k].d - D) > 0.4 * D) return c
    return 'own'
  }
  // Segments: union-find over hot edges sharing a vertex.
  const par = new Map(), find = (v) => { while (par.get(v) !== v) { par.set(v, par.get(par.get(v))); v = par.get(v) } return v }
  for (const k of hot) for (const v of [ec[k].a, ec[k].b]) if (!par.has(v)) par.set(v, v)
  for (const k of hot) { const a = find(ec[k].a), b = find(ec[k].b); if (a !== b) par.set(a, b) }
  const segs = new Map()
  for (const k of hot) {
    const r = find(ec[k].a); let s = segs.get(r)
    if (!s) segs.set(r, s = { edges: 0, dmax: 0, ds: [], cls: {}, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, at: null, raw: 0, dh: 0 })
    const c = cls(k); s.cls[c] = (s.cls[c] ?? 0) + 1; s.edges++; s.ds.push(ec[k].d)
    for (const v of [ec[k].a, ec[k].b]) { const x = x0 + v % W, z = z0 + Math.floor(v / W); s.x0 = Math.min(s.x0, x); s.x1 = Math.max(s.x1, x); s.z0 = Math.min(s.z0, z); s.z1 = Math.max(s.z1, z) }
    if (ec[k].d > s.dmax) { const v = ec[k].a; s.dmax = ec[k].d; s.at = [x0 + v % W, z0 + Math.floor(v / W)]; s.dh = Math.abs(hc[ec[k].a] - hc[ec[k].b]) }
  }
  return [...segs.values()].map((s) => {
    s.ds.sort((a, b) => a - b)
    const top = Object.entries(s.cls).sort((a, b) => b[1] - a[1])[0][0]
    // Where it sits: lateral from the resolved run, its coverage, how far the carve moved the ground, rival count.
    const [x, z] = s.at, o = {}, h = terr.analyticHeight(x, z, undefined, undefined, o), raw = terr.rawHeightWorld(x, z)
    const nr = road._resolveRoadSurface(x, z)
    // A STEP is a discontinuity of the function itself, not a sharp crease: across ±1.5 m of the max point on 8
    // bearings, the ground jumps > 0.5 m within 0.1 m. stepLat = the resolver's lateral on the carved (higher-|cut|)
    // side of the jump: ≈ 36 m is the resolver footprint (_resolveFootHW) cutting a bank off.
    let jump = 0, stepLat = null
    if (s.dmax >= 40) for (let k = 0; k < 8; k++) {
      const ux = Math.cos(k * Math.PI / 8), uz = Math.sin(k * Math.PI / 8)
      let prev = terr.analyticHeight(x - 1.5 * ux, z - 1.5 * uz)
      for (let t = -1.4; t <= 1.5001; t += 0.1) {
        const hx = x + t * ux, hz = z + t * uz, cur = terr.analyticHeight(hx, hz)
        if (Math.abs(cur - prev) > Math.max(0.5, jump)) {
          jump = Math.abs(cur - prev)
          const a = [hx - 0.1 * ux, hz - 0.1 * uz], b = [hx, hz]
          const ca = Math.abs(terr.analyticHeight(...a) - terr.rawHeightWorld(...a)), cb = Math.abs(cur - terr.rawHeightWorld(hx, hz))
          const q = ca > cb ? a : b, nq = road._resolveRoadSurface(q[0], q[1])
          stepLat = nq ? +Math.hypot(q[0] - nq.point.x, q[1] - nq.point.z).toFixed(1) : null
        }
        prev = cur
      }
    }
    return { cls: jump > 0.5 ? 'step' : top, jump: +jump.toFixed(2), stepLat, mix: s.cls, edges: s.edges, len: +Math.hypot(s.x1 - s.x0, s.z1 - s.z0).toFixed(1),
      dmax: +s.dmax.toFixed(1), dmed: +s.ds[s.ds.length >> 1].toFixed(1), x, z, dh: +s.dh.toFixed(2),
      lat: nr ? +Math.hypot(x - nr.point.x, z - nr.point.z).toFixed(1) : null, riv: nr?.rivals?.length ?? 0, end: !!nr?.endRadial,
      w: +(o.blendW ?? 0).toFixed(2), cut: +(h - raw).toFixed(1) }
  })
}

// Chunks a road's earthwork can reach (centreline within REACH of the chunk).
function earthworkChunks (road) {
  const set = new Set()
  for (const [, e] of road._network) {
    const p = e.points; if (!p || p.length < 2) continue
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = Math.hypot(b.x - a.x, b.z - a.z), m = Math.max(1, Math.ceil(L / 8))
      for (let t = 0; t <= m; t++) {
        const x = a.x + (b.x - a.x) * t / m, z = a.z + (b.z - a.z) * t / m
        for (let cx = Math.floor((x - REACH) / S); cx <= Math.floor((x + REACH) / S); cx++)
          for (let cz = Math.floor((z - REACH) / S); cz <= Math.floor((z + REACH) / S); cz++) set.add(cx + ',' + cz)
      }
    }
  }
  return set
}

function rng (s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const main = import.meta.url === `file://${process.argv[1]}`
const [mode, ...args] = main ? process.argv.slice(2) : []
if (mode === 'site') {
  const [s, X, Z, H] = args, half = +(H ?? 48), t = Date.now()
  // FREE=1: free roam (no region, no POI pads) — the roads streamed round the mark itself, as the game streams them.
  const W = process.env.FREE ? freeWorld(s, +X, +Z) : buildWorld(s), ctx = rig(W.seed, W.road)
  console.log(`${process.env.FREE ? 'free roam' : 'story region'} seed ${s} spawn (${W.C.x.toFixed(0)}, ${W.C.z.toFixed(0)}) mark (${X}, ${Z}) ${Math.hypot(X - W.C.x, Z - W.C.z).toFixed(0)} m from spawn; built ${Date.now() - t} ms`)
  const x0 = Math.round(+X - half), z0 = Math.round(+Z - half), t1 = Date.now()
  const segs = scanWindow(ctx, x0, z0, 2 * half)
  console.log(`window ${2 * half} m: ${segs.length} crease segments ≥ ${T_DEG}° (scan ${Date.now() - t1} ms)`)
  for (const g of segs.filter((g) => g.edges >= 3).sort((a, b) => b.len * b.dmax - a.len * a.dmax)) console.log(JSON.stringify(g))
} else if (mode === 'summary') {
  // node test/bug258-crease-census.mjs summary <census.jsonl…> — per world, by class, each stratum scaled to the region.
  const { readFileSync } = await import('node:fs')
  const rows = args.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  const MIN_LEN = +(process.env.MIN_LEN ?? 3), by = {}, bins = [12, 20, 30, 45, 75]
  for (const r of rows) for (let g of r.segs) {
    if (g.len < MIN_LEN || g.dmax < +(process.env.DMIN ?? 0) || (process.env.ST && g.st !== process.env.ST)) continue
    // sub-classes: a stream channel's own bank vs where a road's carve also reaches; a road's own section by where
    // it sits (core edge / shoulder fillet out to 10.5 m, the bank beyond, a run end's polar cap)
    const cls = g.cls === 'stream' ? (g.w > 0.01 ? 'stream×road' : 'stream') : g.cls === 'own' ? (g.end ? 'own:end' : g.lat != null && g.lat <= 10.5 ? 'own:core' : 'own:bank')
      : g.cls === 'step' ? (g.stepLat != null && g.stepLat >= 34 ? 'step:footprint' : 'step:other') : g.cls
    g = { ...g, cls }
    const scale = g.st === 'ew' ? r.ewChunks / r.ewSampled : r.natChunks / r.natSampled
    const b = by[g.cls] ??= { n: 0, m: 0, ds: [], ls: [], bin: bins.map(() => 0), sites: [] }
    b.n += scale; b.m += scale * g.len; b.ds.push(g.dmax); b.ls.push(g.len)
    b.bin[bins.findLastIndex((t) => g.dmax >= t)] += scale
    b.sites.push({ seed: r.seed, x: g.x, z: g.z, dmax: g.dmax, len: g.len, lat: g.lat, cut: g.cut })
  }
  const W = rows.length, tot = Object.values(by).reduce((a, b) => a + b.m, 0), q = (a, f) => a.sort((x, y) => x - y)[Math.floor(f * (a.length - 1))]
  console.log(`${W} worlds; creases ≥ ${T_DEG}° and ≥ ${MIN_LEN} m long; per world (stratified estimate)`)
  console.log('class    segs/world  m/world  share-of-m  dmax med/p90/max  len med/p90/max  per-world segs by dmax ' + bins.map((t) => '≥' + t).join(' '))
  for (const [c, b] of Object.entries(by).sort((a, b) => b[1].m - a[1].m))
    console.log(`${c.padEnd(8)} ${(b.n / W).toFixed(0).padStart(10)} ${(b.m / W).toFixed(0).padStart(8)} ${(100 * b.m / tot).toFixed(0).padStart(9)} %  ${q(b.ds, 0.5).toFixed(0)}/${q(b.ds, 0.9).toFixed(0)}/${q(b.ds, 1).toFixed(0)}°  ${q(b.ls, 0.5).toFixed(0)}/${q(b.ls, 0.9).toFixed(0)}/${q(b.ls, 1).toFixed(0)} m  ${b.bin.map((v) => (v / W).toFixed(0)).join(' ')}`)
  if (process.env.SITES) for (const [c, b] of Object.entries(by)) for (const st of b.sites.sort((a, z) => z.dmax * z.len - a.dmax * a.len).slice(0, +process.env.SITES)) console.log('site', c, JSON.stringify(st))
} else if (mode === 'census') {
  for (const s of args) {
    const t = Date.now(), W = buildWorld(s), ctx = rig(W.seed, W.road), tb = Date.now() - t
    const inRegion = (cx, cz) => Math.hypot((cx + 0.5) * S - W.C.x, (cz + 0.5) * S - W.C.z) <= REGION_RADIUS_M
    const ew = [...earthworkChunks(W.road)].map((k) => k.split(',').map(Number)).filter(([cx, cz]) => inRegion(cx, cz))
    const ewSet = new Set(ew.map((c) => c.join(','))), nat = []
    const R0 = Math.ceil(REGION_RADIUS_M / S) + 1, c0x = Math.floor(W.C.x / S), c0z = Math.floor(W.C.z / S)
    for (let cx = c0x - R0; cx <= c0x + R0; cx++) for (let cz = c0z - R0; cz <= c0z + R0; cz++) if (inRegion(cx, cz) && !ewSet.has(cx + ',' + cz)) nat.push([cx, cz])
    const r = rng(seedFor(W.seed, 'bug258'))
    const pick = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a.slice(0, n) }
    const out = { seed: s, sx: +W.C.x.toFixed(0), sz: +W.C.z.toFixed(0), ewChunks: ew.length, natChunks: nat.length, build: tb, segs: [] }
    const t2 = Date.now()
    for (const [stratum, arr, n] of [['ew', ew, EW_N], ['nat', nat, NAT_N]]) {
      const sample = pick(arr, n); out[stratum + 'Sampled'] = sample.length
      for (const [cx, cz] of sample) for (const g of scanWindow(ctx, cx * S, cz * S, S)) if (g.edges >= 3) out.segs.push({ st: stratum, ...g })
    }
    out.scan = Date.now() - t2
    console.log(JSON.stringify(out))
  }
}

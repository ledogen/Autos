/**
 * src/terrain.js — TerrainSystem for RangerSim
 *
 * Responsibilities:
 *  - Chunk ring management (5×5, RING_RADIUS=2, 64 m tiles)
 *  - Heightmap generation via Blob classic Web Worker (simplex noise inlined)
 *  - Frame-spread geometry build (PERF-02: ms-budgeted, nearest-first; MAX_BUILDS_PER_FRAME hard cap)
 *  - O(1) bilinear height query + central-difference normal for physics pipeline
 *  - analyticHeight/analyticNormal: main-thread direct analytic sampling (no chunk lookup)
 *    — used by queryContacts/queryVertexContacts for physics contacts (no chunk-seam gap)
 *  - reinitWorker(worldSeed, params): sends init message to Worker, rebuilds noise closures
 *  - rebuildAllChunksFromWorker(): Path B — disposes all chunks and re-requests from Worker
 *
 * Physics contract: analyticHeight never returns 0 for unloaded chunks.
 *   sampleHeight bilinear path retained for P7-2 height-agreement test only.
 *   sampleHeight multiplies by params.terrainAmplitude so results match geometry.
 * Rendering contract: chunk meshes use shared MeshPhongMaterial — do NOT dispose per-chunk.
 *
 * Anti-patterns: do NOT use Raycaster for height queries (O(N²)); do NOT call
 *                computeVertexNormals from physics (rendering only).
 *
 * Threat mitigations:
 *   T-06-01: BUILD_MS_BUDGET (+ MAX_BUILDS_PER_FRAME cap) bounds main-thread geometry build cost per frame
 *   T-06-03: geometry.dispose() called in _updateChunkRing before chunkMap.delete
 *   T-07-03-SYNC: WORKER_SOURCE is the sole source of the terrain Worker (no separate file
 *                 mirror); its carve/height/seed helpers stay byte-synced with their originals.
 */

import * as THREE from 'three'
// Plan 09-11: potholeNoise, signedCurvature, roadQuality removed from terrain.js —
// pothole/curvature are not needed on the terrain mesh carve path.
// Plan 09-22: crownProfile re-imported — D3 carve inherits the ribbon cross-section
// (crownProfile + camberProfile tilt) so the carved trough tilts with the ribbon →
// uniform clearance on banked turns (fixes inside-edge clip / outside-edge gap).
import { crownProfile } from './road-carve.js'
import { perfAdd } from './perf.js'  // TEMP perf triage (D-arc)

// ── Module constants ───────────────────────────────────────────────────────

export const CHUNK_SIZE    = 64   // world units (metres) per chunk side
export const GRID_SAMPLES  = 65   // vertices per side (64 cells), avoids seams
const        RING_RADIUS          = 2   // chunks in each direction → 5×5 = 25 total (DEFAULT; runtime-tunable via setRingRadius)
const        RING_KEEP_MARGIN     = 1   // PERF-02: keep (don't dispose) chunks within ring+this — hysteresis kills boundary dispose↔rebuild thrash
const        MAX_BUILDS_PER_FRAME = 4   // hard safety cap on geometry builds/recarves per frame (BUILD_MS_BUDGET is the primary limiter)
const        BUILD_MS_BUDGET      = 3.0 // PERF-02: per-frame ms budget for geometry build + re-carve — adapts to machine speed (vs a fixed count)
const        MAX_REQUESTS_PER_FRAME = 8 // PERF-02: cap worker `generate` dispatches per frame — bounds the postMessage flood at large rings (raised for the deeper warm rings at Far/Ultra)

// ── Embedded worker source ─────────────────────────────────────────────────
// The terrain Worker's full source as a string, spun up as a Blob classic worker (see the
// constructor). This string IS the worker — the single source of truth (no file mirror).
// The worker context has no importmap — all code must be self-contained (no import/export).

const WORKER_SOURCE = `
// Classic Blob worker source for TerrainSystem (embedded as WORKER_SOURCE in src/terrain.js)
//
// Responsibilities:
//  - Receive {type:'init', worldSeed, params} messages — initialize seeded noise closures
//  - Receive {type:'generate', cx, cz, key} messages — generate 65×65 heightmap
//  - Post {key, cx, cz, heights} with heights.buffer as a transferable
//
// This file is NOT an ES6 module. It is read as a string by terrain.js and
// embedded in a Blob URL classic worker. Do NOT add import/export statements.
//
// Minimal simplex noise 2D implementation extracted from simplex-noise@4.0.3
// Original source: https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js
// MIT License — Copyright (c) 2024 Jonas Wagner

// ── Seed utilities (copied verbatim from src/seed.js — no export keyword) ──
// SYNC: keep byte-identical with seed.js function bodies (no export).

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0
  const s = String(input)
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) | 0) >>> 0
  return djb2(s)
}

function seedFor(worldSeed, domainTag, ...coords) {
  let h = djb2(domainTag)
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Minimal simplex-noise@4.0.3 subset (2D only) ──────────────────────────

const SQRT3 = Math.sqrt(3.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;

const fastFloor = (x) => Math.floor(x) | 0;

const grad2 = new Float64Array([
    1, 1, -1, 1,  1, -1, -1, -1,
    1, 0, -1,  0,  1,  0, -1,  0,
    0, 1,  0, -1,  0,  1,  0, -1
]);

function buildPermutationTable(random) {
    const tableSize = 512;
    const p = new Uint8Array(tableSize);
    for (let i = 0; i < tableSize / 2; i++) {
        p[i] = i;
    }
    for (let i = 0; i < tableSize / 2 - 1; i++) {
        const r = i + ~~(random() * (256 - i));
        const aux = p[i];
        p[i] = p[r];
        p[r] = aux;
    }
    for (let i = 256; i < tableSize; i++) {
        p[i] = p[i - 256];
    }
    return p;
}

function createNoise2D(random) {
    if (random === undefined) random = Math.random;
    const perm = buildPermutationTable(random);
    const permGrad2x = new Float64Array(perm).map(function(v) { return grad2[(v % 12) * 2]; });
    const permGrad2y = new Float64Array(perm).map(function(v) { return grad2[(v % 12) * 2 + 1]; });

    return function noise2D(x, y) {
        let n0 = 0;
        let n1 = 0;
        let n2 = 0;
        const s = (x + y) * F2;
        const i = fastFloor(x + s);
        const j = fastFloor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else          { i1 = 0; j1 = 1; }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const gi0 = ii + perm[jj];
            t0 *= t0;
            n0 = t0 * t0 * (permGrad2x[gi0] * x0 + permGrad2y[gi0] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const gi1 = ii + i1 + perm[jj + j1];
            t1 *= t1;
            n1 = t1 * t1 * (permGrad2x[gi1] * x1 + permGrad2y[gi1] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const gi2 = ii + 1 + perm[jj + 1];
            t2 *= t2;
            n2 = t2 * t2 * (permGrad2x[gi2] * x2 + permGrad2y[gi2] * y2);
        }
        return 70.0 * (n0 + n1 + n2);
    };
}

// ── Height function (shared with Worker — keep in sync) ──────────────────
// Three-layer height: coarse ridged-multifractal + fine FBM + regional modulator.
// Returns RAW height (no terrainAmplitude multiply — amplitude applied at geometry setY
// and in sampleHeight/analyticHeight, preserving the existing contract).
// SYNC: keep byte-identical with terrain.js module-scope block below.

function coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp  = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp  *= gain
    }
    return h
}

function fineHeight(wx, wz, noiseFine, params) {
    const { fineAmplitude, fineFreq } = params
    return (
        noiseFine(wx * fineFreq, wz * fineFreq) * fineAmplitude +
        noiseFine(wx * fineFreq * 2.1, wz * fineFreq * 2.1) * fineAmplitude * 0.5
    )
}

function regionalModulator(wx, wz, noiseRegional, params) {
    const { regionalStrength, regionalScale } = params
    const raw = noiseRegional(wx * (1 / regionalScale), wz * (1 / regionalScale))
    const t = (raw + 1) * 0.5
    return (1.0 - regionalStrength) + regionalStrength * t
}

function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
    const coarse = coarseHeight(wx, wz, noiseCoarse, params)
    const reg    = regionalModulator(wx, wz, noiseRegional, params)
    const fine   = fineHeight(wx, wz, noiseFine, params) * reg
    return coarse + fine
}

// ── Road carve pure functions (CARVE SYNC) ────────────────────────────────
// Function bodies copied verbatim from src/road-carve.js (no export keyword).
// SYNC RULE: any edit here must be reflected in road-carve.js (the canonical originals).
// Same discipline as the height() / seed utility sync (T-07-03-SYNC).
//
// carveTable layout: Float32Array [blendW_0, gradeY_preamp_0, blendW_1, gradeY_preamp_1, ...]
// gradeY_preamp = design grade Y / terrainAmplitude (pre-amplitude) so the Worker can blend
// without knowing terrainAmplitude. gradeY_preamp * amp = world-space design grade Y.

function sampleCarve(wx, wz, carveTable, N, originX, originZ, cellSize) {
    const lx = wx - originX
    const lz = wz - originZ
    const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cellSize)))
    const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cellSize)))
    const fx = (lx / cellSize) - xi
    const fz = (lz / cellSize) - zi
    const i00 = (zi     * N +  xi   ) * 2
    const i10 = (zi     * N + (xi+1)) * 2
    const i01 = ((zi+1) * N +  xi   ) * 2
    const i11 = ((zi+1) * N + (xi+1)) * 2
    const w00 = (1-fx) * (1-fz), w10 = fx * (1-fz)
    const w01 = (1-fx) *    fz,  w11 = fx *    fz
    const blendW = carveTable[i00]*w00 + carveTable[i10]*w10 + carveTable[i01]*w01 + carveTable[i11]*w11
    const gradeY = carveTable[i00+1]*w00 + carveTable[i10+1]*w10 + carveTable[i01+1]*w01 + carveTable[i11+1]*w11
    return { blendW, gradeY }
}

// ── Worker constants ───────────────────────────────────────────────────────

const GRID_SAMPLES = 65
const CHUNK_SIZE   = 64
const CELL_SIZE    = CHUNK_SIZE / (GRID_SAMPLES - 1)

// Three seeded noise closures — initialized via 'init' message before any 'generate'.
let noiseCoarse, noiseFine, noiseRegional
// Worker params — set on 'init', used in 'generate'.
let _workerParams = null

// ── arcPrimitiveConnect search scratch (module-scope, reused + generation-stamped) ──────────────
// The cold network stream routes ~80 connections at once (spawn lag). Per-call Map/Set/object-per-node
// allocation + hashing + GC dominated that. These typed arrays are indexed by state id and allocated
// ONCE (grown as needed), reused across every call. A per-call generation stamp (_apcGen) marks which
// entries are live this call, so we never memset the (large) arrays between calls.
let _apcCap = 0
let _apcG, _apcGStamp, _apcClosed, _apcX, _apcZ, _apcTh, _apcSh, _apcKi, _apcParent
let _apcGen = 0
const _apcHPri = [], _apcHSt = []   // heap as parallel arrays (reset length each call; no per-node alloc)
function _apcEnsure(n) {
    if (n <= _apcCap) return
    _apcCap = n
    _apcG = new Float64Array(n); _apcGStamp = new Uint32Array(n); _apcClosed = new Uint32Array(n)
    _apcX = new Float64Array(n); _apcZ = new Float64Array(n); _apcTh = new Float64Array(n)
    _apcSh = new Float64Array(n); _apcKi = new Int8Array(n); _apcParent = new Int32Array(n)
}

// ── Dubins shortest path (BUG-12 terminal connector) ───────────────────────────────────────────
// Returns dense [x,z] points (excluding the start, including the exact goal) from pose (x0,z0,th0)
// to pose (x1,z1,th1) using arcs of radius \`rho\` (left/right) and straights — so curvature is
// piecewise-constant and EVERYWHERE ≥ rho. Used to terminate an arc-router segment exactly at the
// canonical anchor pose: unlike a cubic Hermite (whose curvature spikes for large heading changes),
// this rounds even a switchback-apex turn into a valid-radius hairpin (≥ rho), never a fold. Pure.
const _DUBmod = (x) => { const t = x % (Math.PI * 2); return t < 0 ? t + Math.PI * 2 : t }

// Shortest Dubins word from pose (x0,z0,th0) to (x1,z1,th1) at radius rho. Returns the chosen
// { len, segs:[[kSign,lenR],...] } (segs in rho units; kSign: +1 left, −1 right, 0 straight) or null.
// Shared by dubinsPath (dense points) and dubinsPrimitives (typed primitives) so the geometry agrees.
function _dubinsBest(x0, z0, th0, x1, z1, th1, rho) {
    const dx = x1 - x0, dz = z1 - z0
    const D = Math.hypot(dx, dz)
    const d = D / rho
    const theta = _DUBmod(Math.atan2(dz, dx))
    const a = _DUBmod(th0 - theta), b = _DUBmod(th1 - theta)
    const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b), cab = Math.cos(a - b)
    const words = []
    // LSL
    { const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb)
      if (p2 >= 0) { const tmp = d + sa - sb, t = _DUBmod(-a + Math.atan2(cb - ca, tmp)), p = Math.sqrt(p2), q = _DUBmod(b - Math.atan2(cb - ca, tmp)); words.push({ len: t + p + q, segs: [[1, t], [0, p], [1, q]] }) } }
    // RSR
    { const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa)
      if (p2 >= 0) { const tmp = d - sa + sb, t = _DUBmod(a - Math.atan2(ca - cb, tmp)), p = Math.sqrt(p2), q = _DUBmod(-b + Math.atan2(ca - cb, tmp)); words.push({ len: t + p + q, segs: [[-1, t], [0, p], [-1, q]] }) } }
    // LSR
    { const p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb)
      if (p2 >= 0) { const p = Math.sqrt(p2), tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p), t = _DUBmod(-a + tmp), q = _DUBmod(-b + tmp); words.push({ len: t + p + q, segs: [[1, t], [0, p], [-1, q]] }) } }
    // RSL
    { const p2 = -2 + d * d + 2 * cab - 2 * d * (sa + sb)
      if (p2 >= 0) { const p = Math.sqrt(p2), tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p), t = _DUBmod(a - tmp), q = _DUBmod(b - tmp); words.push({ len: t + p + q, segs: [[-1, t], [0, p], [1, q]] }) } }
    // RLR
    { const tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8
      if (Math.abs(tmp) <= 1) { const p = _DUBmod(2 * Math.PI - Math.acos(tmp)), t = _DUBmod(a - Math.atan2(ca - cb, d - sa + sb) + p / 2), q = _DUBmod(a - b - t + p); words.push({ len: t + p + q, segs: [[-1, t], [1, p], [-1, q]] }) } }
    // LRL
    { const tmp = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8
      if (Math.abs(tmp) <= 1) { const p = _DUBmod(2 * Math.PI - Math.acos(tmp)), t = _DUBmod(-a + Math.atan2(-ca + cb, d + sa - sb) + p / 2), q = _DUBmod(b - a - t + p); words.push({ len: t + p + q, segs: [[1, t], [-1, p], [1, q]] }) } }
    if (!words.length) return null
    let best = words[0]; for (const w of words) if (w.len < best.len) best = w
    return best
}

// Dense [x,z] points (excluding start, including exact goal) for the shortest Dubins path. Pure.
function dubinsPath(x0, z0, th0, x1, z1, th1, rho, ds) {
    const best = _dubinsBest(x0, z0, th0, x1, z1, th1, rho)
    if (!best) return null
    const out = []
    let x = x0, z = z0, th = th0
    for (const [kSign, lenR] of best.segs) {
        const L = lenR * rho
        if (L < 1e-9) continue
        const k = kSign / rho
        const n = Math.max(1, Math.ceil(L / ds))
        for (let i = 1; i <= n; i++) {
            const s = L * i / n
            if (kSign === 0) { out.push([x + s * Math.cos(th), z + s * Math.sin(th)]) }
            else { const th2 = th + k * s; out.push([x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k]) }
        }
        if (kSign === 0) { x += L * Math.cos(th); z += L * Math.sin(th) }
        else { const th2 = th + k * L; x += (Math.sin(th2) - Math.sin(th)) / k; z -= (Math.cos(th2) - Math.cos(th)) / k; th = th2 }
    }
    return out
}

// Typed primitive descriptors {x0,z0,theta0,length,kappa0,kappa1} for the shortest Dubins path —
// the exact same arcs/straights as dubinsPath, carried as primitives (curvature ≥ 1/rho by
// construction) instead of flattened points. Used by arcPrimitiveConnect's primitive terminal.
// Plain descriptors (no Centerline import) keep road-carve dependency-free for the CARVE-SYNC copy.
function dubinsPrimitives(x0, z0, th0, x1, z1, th1, rho) {
    const best = _dubinsBest(x0, z0, th0, x1, z1, th1, rho)
    if (!best) return null
    const prims = []
    let x = x0, z = z0, th = th0
    for (const [kSign, lenR] of best.segs) {
        const L = lenR * rho
        if (L < 1e-9) continue
        const k = kSign === 0 ? 0 : kSign / rho
        prims.push({ x0: x, z0: z, theta0: th, length: L, kappa0: k, kappa1: k })
        if (kSign === 0) { x += L * Math.cos(th); z += L * Math.sin(th) }
        else { const th2 = th + k * L; x += (Math.sin(th2) - Math.sin(th)) / k; z -= (Math.cos(th2) - Math.cos(th)) / k; th = th2 }
    }
    return prims
}

/**
 * arcPrimitiveConnect — hybrid-A* router between two anchors using ARC MOTION PRIMITIVES.
 *
 * Replaces the 8-grid cell A* whose 45°-per-cell turns produced sub-floor corners that the
 * post-hoc fillet/cleanup stack could not repair (folds). Here every search expansion is a
 * fixed-length ARC at a curvature in {0 (straight), ±1/gentleR, ±1/hardR}. Because the hardest
 * primitive has radius hardR and consecutive primitives are G1-continuous (each starts at the
 * previous arc's end heading), the emitted centerline is min-turn-radius-VALID BY CONSTRUCTION:
 * dense XZ radius ≥ hardR everywhere except short endpoint stubs. No fillet/relaxation needed.
 *
 * State = (position-cell, heading-bin). Cost mirrors _protoEdgeCost semantics:
 *   wDist·L + wGrade·grade² + wOver·max(0,grade−maxGrade) + wAlt·height + wCurv·κ²·L
 * The wCurv·κ²·L term (curvature SQUARED — QUAL-05) makes the straight primitive (κ=0) cheapest and,
 * integrated over a turn, costs wCurv·Δθ/R → a TIGHTER radius costs MORE for the same heading change,
 * so the router prefers gentle sweeps and only spends a tight radius where the grade terms make it
 * worth it (terrain-driven). Long near-straights on
 * gentle ground; the grade terms make tight switchbacks worth their curvature cost up a steep
 * pass → variety is TERRAIN-DRIVEN and deterministic (no Math.random). Heuristic = wDist·‖·→b‖.
 *
 * Pure/deterministic (D-16): lattice search, stable heap tie-break, no random/Date/session state.
 * Window-invariant by construction when called per anchor-pair (independent of stream center).
 * NOT part of CARVE SYNC — main-thread centerline geometry only.
 *
 * @param {number} ax @param {number} az — start anchor (XZ)
 * @param {number} bx @param {number} bz — goal anchor (XZ)
 * @param {(x:number,z:number)=>number} heightFn — terrain height sampler (coarseHeight)
 * @param {object} [opts] — hardR, gentleR, stepLen, hbins, cell, margin, emitDs, maxNodes + cost weights
 * @returns {Array<{x:number,y:number,z:number}>} dense valid-radius centerline from a to b (y = heightFn)
 */
function arcPrimitiveConnect(ax, az, bx, bz, heightFn, opts = {}) {
    const hardR    = opts.hardR    ?? 8       // m — tightest turn (hardest primitive); ≥ geometric floor
    const gentleR  = opts.gentleR  ?? 30      // m — gentle turn radius (fallback palette member)
    const stepLen  = opts.stepLen  ?? 8       // m — STRAIGHT primitive length (turn primitives are fixed-ANGLE; see below)
    const hbins    = opts.hbins    ?? 24      // heading discretization — fewer states = faster cold route
    const cell     = opts.cell     ?? 8       // m — position lattice cell
    const margin   = opts.margin   ?? 200     // m — detour room around the a–b bbox (wrap a peak)
    const emitDs   = opts.emitDs   ?? 4       // m — arc emission spacing (≥ this keeps 3-pt circumradius on the floor circle; finer just multiplies downstream slice/ribbon/carve cost)
    const maxNodes = opts.maxNodes ?? 200000  // expansion cap (never hang)
    // ── FIXED-ANGLE motion primitives (QUAL-05 follow-up: large sweeping radii) ──────────────────────
    // Each TURN primitive turns a FIXED angle \`turnAngle\` at radius R, so its arc length = R·turnAngle
    // (large R → long gentle arc, small R → short tight arc) — and every turn lands exactly one heading
    // step away, so even a 200 m sweep is representable in the lattice (a fixed-LENGTH step at 200 m would
    // turn <1° and be invisible). \`radii\` (largest→smallest) is the curvature palette; the router prefers
    // the largest radius that fits the heading change + grade, giving sweeping turns on mild ground and
    // tight switchbacks only where grade forces them. gradeSamples>1 samples grade ALONG the (long) arc
    // so the search isn't blind to intra-arc steepness. Falls back to the old [gentleR,hardR] behaviour.
    const radii        = opts.radii        ?? [gentleR, hardR]
    const turnAngle    = opts.turnAngle    ?? (2 * Math.PI / hbins)   // one heading bin per turn primitive
    const gradeSamples = opts.gradeSamples ?? 1
    const wDist    = opts.wDist    ?? 1
    const wAlt     = opts.wAlt     ?? 0.85
    const wGrade   = opts.wGrade   ?? 400
    const wOver    = opts.wOver    ?? 8000
    const maxGrade = opts.maxGrade ?? 0.15
    const wCurv    = opts.wCurv    ?? 120      // QUAL-05: curvature penalty weight; cost = wCurv·κ²·L (squared → tighter radius costs more). Bare fallback only; the game passes roadWTurn (8000).
    const wHeur    = opts.wHeur    ?? 1.5       // weighted-A* heuristic inflation (>1 = greedier, far
                                               // fewer node expansions → faster streaming; paths stay near-optimal)
    // BUG-12: canonical join headings. The segment STARTS along startHeading (so its DEPARTURE from
    // the anchor is the canonical heading) and, when goalHeading is set, its ARRIVAL is blended into
    // the canonical heading over the last \`goalBlend\` metres (terminal Hermite below). Two segments
    // sharing an anchor each target the SAME canonical H there → they meet G1, no sharp corner. The
    // search itself runs FREE (undistorted, valley-true); only the start heading + terminal blend are
    // canonical. undefined → legacy straight-to-goal, no blend (byte-identical to pre-BUG-12).
    const startHeading = opts.startHeading
    const goalHeading  = opts.goalHeading
    const goalBlend    = opts.goalBlend ?? 20   // m — distance over which the arrival is blended into goalHeading

    const minX = Math.min(ax, bx) - margin, maxX = Math.max(ax, bx) + margin
    const minZ = Math.min(az, bz) - margin, maxZ = Math.max(az, bz) + margin
    const NX = Math.max(2, Math.ceil((maxX - minX) / cell)) + 1
    const NZ = Math.max(2, Math.ceil((maxZ - minZ) / cell)) + 1
    const TAU = Math.PI * 2
    const binOf = (th) => ((Math.round(th / TAU * hbins) % hbins) + hbins) % hbins
    const cxOf  = (x) => Math.max(0, Math.min(NX - 1, Math.round((x - minX) / cell)))
    const czOf  = (z) => Math.max(0, Math.min(NZ - 1, Math.round((z - minZ) / cell)))
    const cellOf = (x, z) => czOf(z) * NX + cxOf(x)
    const stateOf = (x, z, th) => cellOf(x, z) * hbins + binOf(th)

    // PERF: cache terrain height per lattice cell (compute heightFn once per cell, not per node
    // expansion). _coarseHeight is multi-octave ridged noise — recomputing it for every one of the
    // hundreds of thousands of node expansions was the streaming-stutter cost. Search cost uses the
    // cell-center height (same approach as the old grid A*); emitted point Y stays exact (heightFn).
    const hH = new Float64Array(NX * NZ), hSeen = new Uint8Array(NX * NZ)
    const hAt = (x, z) => {
        const ci = cellOf(x, z)
        if (!hSeen[ci]) { hH[ci] = heightFn(minX + (ci % NX) * cell, minZ + ((ci / NX) | 0) * cell); hSeen[ci] = 1 }
        return hH[ci]
    }

    // Bounded valley-seeking altitude cost (D-arc REVISED²). Reference = the straight a→b altitude
    // baseline (linear height interp along the chord). δ = nH − baseline; cost = wAlt·max(0, δ +
    // valleyCap). So:
    //   • ABOVE baseline (δ>0): cost grows → route AROUND ridges (peak avoidance / pass-crossing).
    //   • BELOW baseline, down to valleyCap (−valleyCap ≤ δ ≤ 0): cost shrinks → SEEK the low ground
    //     (the valley-following "spine" / personality).
    //   • DEEPER than valleyCap (δ < −valleyCap): cost saturates at 0 — the CAP. No further reward,
    //     so a far/deep basin can't pull the search into a kilometre detour the way the old absolute
    //     \`wAlt·nH\` global magnet did (the wander that forced the now-deleted cleanup stack).
    // Cost stays ≥ 0 (A*-safe — a true negative "reward" edge would break the priority queue).
    // For equal-height anchors baseline≡ha, so DETOURS-AROUND-PEAK (arc-router.mjs) is unchanged.
    // Pure fn of the anchor pair (+ valleyCap) → window-invariant.
    const valleyCap = opts.valleyDepthCap ?? 40   // m — depth below baseline that still earns reward
    const ha = hAt(ax, az), hb = hAt(bx, bz)
    const _abx = bx - ax, _abz = bz - az
    const _abLen2 = _abx * _abx + _abz * _abz || 1
    const baselineAt = (x, z) => {
        let t = ((x - ax) * _abx + (z - az) * _abz) / _abLen2
        if (t < 0) t = 0; else if (t > 1) t = 1
        return ha + t * (hb - ha)
    }

    // Curvature palette: straight (κ=0) + ± each radius. primLen(k): straight = stepLen; turns = the
    // fixed-angle arc length R·turnAngle = turnAngle/|k| (so larger radius ⇒ longer, gentler arc).
    const kappas = [0]
    for (const R of radii) { kappas.push(1 / R, -1 / R) }
    const primLen = (k) => (Math.abs(k) < 1e-12) ? stepLen : (turnAngle / Math.abs(k))

    const arcEnd = (x, z, th, k, L) => {
        if (Math.abs(k) < 1e-12) return [x + L * Math.cos(th), z + L * Math.sin(th), th]
        const th2 = th + k * L
        return [x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k, th2]
    }
    // Dense points along an arc (excludes the start point, includes the end) → push [x,z] to \`out\`.
    const arcPoints = (x, z, th, k, L, out) => {
        const n = Math.max(1, Math.ceil(L / emitDs))
        for (let i = 1; i <= n; i++) {
            const s = L * i / n
            if (Math.abs(k) < 1e-12) { out.push([x + s * Math.cos(th), z + s * Math.sin(th)]); continue }
            const th2 = th + k * s
            out.push([x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k])
        }
    }

    // Typed-array lattice with a generation stamp — same algorithm as a Map/Set/heap-of-arrays A*,
    // but no per-call allocation/clears (this is the cold-stream speedup). State id = cellOf*hbins+binOf.
    // Heap comparison is PRIORITY-ONLY (matches the prior implementation exactly → identical routes).
    const NSTATES = NX * NZ * hbins
    _apcEnsure(NSTATES)
    const gen = ++_apcGen
    const G = _apcG, GS = _apcGStamp, CL = _apcClosed
    const SX = _apcX, SZ = _apcZ, STh = _apcTh, SSh = _apcSh, SKi = _apcKi, SP = _apcParent
    const HP = _apcHPri, HS = _apcHSt
    HP.length = 0; HS.length = 0
    let hlen = 0
    const hpush = (pri, st) => {
        let i = hlen++
        HP[i] = pri; HS[i] = st
        while (i > 0) { const p = (i - 1) >> 1; if (HP[p] <= HP[i]) break
            const tp = HP[p], ts = HS[p]; HP[p] = HP[i]; HS[p] = HS[i]; HP[i] = tp; HS[i] = ts; i = p }
    }
    const hpopState = () => {
        const top = HS[0]; hlen--
        if (hlen > 0) {
            HP[0] = HP[hlen]; HS[0] = HS[hlen]; let i = 0
            for (;;) { let l = 2 * i + 1, r = 2 * i + 2, m = i
                if (l < hlen && HP[l] < HP[m]) m = l
                if (r < hlen && HP[r] < HP[m]) m = r
                if (m === i) break
                const tp = HP[m], ts = HS[m]; HP[m] = HP[i]; HS[m] = HS[i]; HP[i] = tp; HS[i] = ts; i = m }
        }
        return top
    }

    const heur = (x, z) => wHeur * wDist * Math.hypot(bx - x, bz - z)
    const th0 = startHeading ?? Math.atan2(bz - az, bx - ax)
    const goalR = Math.max(cell, stepLen), goalR2 = goalR * goalR
    const startState = stateOf(ax, az, th0)
    G[startState] = 0; GS[startState] = gen
    SX[startState] = ax; SZ[startState] = az; STh[startState] = th0; SSh[startState] = hAt(ax, az)
    SP[startState] = -1; SKi[startState] = 0
    hpush(heur(ax, az), startState)

    let goalState = -1, expanded = 0
    let bestState = startState, bestD2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az)
    while (hlen > 0 && expanded < maxNodes) {
        const sid = hpopState()
        if (CL[sid] === gen) continue
        CL[sid] = gen
        const cx = SX[sid], cz = SZ[sid], cth = STh[sid], csh = SSh[sid], cg = G[sid]
        const dgx = bx - cx, dgz = bz - cz, d2 = dgx * dgx + dgz * dgz
        if (d2 < bestD2) { bestD2 = d2; bestState = sid }
        if (d2 <= goalR2) { goalState = sid; break }
        expanded++
        for (let ki = 0; ki < kappas.length; ki++) {
            const k = kappas[ki]
            const L = primLen(k)   // fixed-angle: straight = stepLen, turns = turnAngle/|k| (∝ radius)
            const [nx, nz, nth] = arcEnd(cx, cz, cth, k, L)
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue
            const nst = stateOf(nx, nz, nth)
            if (CL[nst] === gen) continue
            const nH = hAt(nx, nz)
            // Grade along the primitive. Endpoint-to-endpoint by default; multi-point MAX along the arc
            // when gradeSamples>1, so a long large-radius arc isn't blind to intra-arc steepness.
            let grade
            if (gradeSamples > 1 && Math.abs(k) >= 1e-12) {
                let prevH = csh, gm = 0
                const nseg = Math.max(1, Math.min(gradeSamples, Math.ceil(L / 8)))
                for (let gi = 1; gi <= nseg; gi++) {
                    const ss = L * gi / nseg
                    const th2 = cth + k * ss
                    const gx = cx + (Math.sin(th2) - Math.sin(cth)) / k
                    const gz = cz - (Math.cos(th2) - Math.cos(cth)) / k
                    const gh = hAt(gx, gz)
                    const seg = Math.abs(gh - prevH) / (L / nseg)
                    if (seg > gm) gm = seg
                    prevH = gh
                }
                grade = gm
            } else {
                grade = Math.abs(nH - csh) / L
            }
            // Per-METRE accrual × L (primitives now vary in length) so cost is length-consistent.
            const ng = cg + L * (wDist + wGrade * grade * grade + wOver * Math.max(0, grade - maxGrade)
                     + wAlt * Math.max(0, nH - baselineAt(nx, nz) + valleyCap) + wCurv * k * k)
            if (GS[nst] !== gen || ng < G[nst]) {
                G[nst] = ng; GS[nst] = gen
                SX[nst] = nx; SZ[nst] = nz; STh[nst] = nth; SSh[nst] = nH; SP[nst] = sid; SKi[nst] = ki
                hpush(ng + heur(nx, nz), nst)
            }
        }
    }

    // Fallback: if the goal was never captured (capped/blocked), end at the closest expanded node.
    const endState = goalState !== -1 ? goalState : bestState
    // Walk the parent chain, then re-integrate each primitive from its parent's stored pose so the
    // emitted polyline lies exactly on the valid-radius arcs (G1 across joints).
    const chain = []
    for (let st = endState; st !== -1; st = SP[st]) chain.push(st)
    chain.reverse()

    // ── Primitive emission (Road Overhaul, Phase A) ────────────────────────────────────────────
    // Return the search result as TYPED PRIMITIVES instead of dense points. Each chain step IS an
    // arc primitive (start pose = parent's stored pose, curvature = kappas[SKi], length = stepLen),
    // so curvature is ≥ 1/hardR by construction — no Catmull-Rom re-fit downstream, no fold. The
    // terminal mirrors the dense path: legacy → a straight line stub to the anchor (C0); heading-
    // continuous → cut back ~goalBlend of whole arcs and replace with a Dubins primitive run into
    // the canonical goalHeading. Window-invariant: a pure fn of this anchor-pair's search + the
    // anchor-derived headings (independent of stream center / emission density).
    if (opts.emitPrimitives) {
        const prims = []
        const pushArc = (x, z, th, k, L) => { if (L > 1e-6) prims.push({ x0: x, z0: z, theta0: th, length: L, kappa0: k, kappa1: k }) }
        if (goalHeading == null) {
            for (let i = 1; i < chain.length; i++) {
                const par = chain[i - 1]
                const kc = kappas[SKi[chain[i]]]
                pushArc(SX[par], SZ[par], STh[par], kc, primLen(kc))
            }
            // C0 straight stub to the exact anchor (matches legacy points terminal).
            const ex = SX[endState], ez = SZ[endState]
            const dx = bx - ex, dz = bz - ez, L = Math.hypot(dx, dz)
            pushArc(ex, ez, Math.atan2(dz, dx), 0, L)
        } else {
            // Drop trailing whole arcs until ≥ goalBlend is freed, then Dubins from the cut pose.
            let acc = 0, cutIdx = chain.length - 1
            while (cutIdx > 0 && acc < goalBlend) { acc += primLen(kappas[SKi[chain[cutIdx]]]); cutIdx-- }
            for (let i = 1; i <= cutIdx; i++) {
                const par = chain[i - 1]
                const kc = kappas[SKi[chain[i]]]
                pushArc(SX[par], SZ[par], STh[par], kc, primLen(kc))
            }
            const cs = chain[cutIdx]
            const cx = SX[cs], cz = SZ[cs], cth = STh[cs]
            const dub = dubinsPrimitives(cx, cz, cth, bx, bz, goalHeading, hardR)
            if (dub) for (const p of dub) pushArc(p.x0, p.z0, p.theta0, p.kappa0, p.length)
            else { const dx = bx - cx, dz = bz - cz, L = Math.hypot(dx, dz); pushArc(cx, cz, Math.atan2(dz, dx), 0, L) }
        }
        return prims
    }

    const pts2d = [[ax, az]]
    for (let i = 1; i < chain.length; i++) {
        const par = chain[i - 1]
        const kc = kappas[SKi[chain[i]]]
        arcPoints(SX[par], SZ[par], STh[par], kc, primLen(kc), pts2d)
    }
    // BUG-12 terminal. Legacy (no goalHeading): pin the exact anchor with a straight stub (C0 only).
    // Heading-continuous: the free search arrives near the anchor at its valley-true (uncontrolled)
    // heading; pinning it straight to the anchor hairpins (a sub-floor cusp that centripetal-CR then
    // amplifies), and a cubic-Hermite blend spikes its curvature on a big heading change. Instead,
    // cut back \`goalBlend\` metres of arc and replace that tail with a DUBINS path (radius hardR) from
    // the cut pose to the EXACT anchor at the canonical goalHeading. Dubins curvature is piecewise
    // constant and everywhere ≥ hardR, so even a switchback-apex turn becomes a valid-radius hairpin,
    // never a fold. The next segment starts at the same anchor with startHeading == this goalHeading
    // → G1 join. Window-invariant: a pure function of this segment's own (per-anchor-pair) search +
    // the anchor-derived canonical headings.
    if (goalHeading == null) {
        pts2d.push([bx, bz])
    } else {
        let acc = 0, cut = pts2d.length - 1
        while (cut > 0) {
            acc += Math.hypot(pts2d[cut][0] - pts2d[cut - 1][0], pts2d[cut][1] - pts2d[cut - 1][1])
            cut--
            if (acc >= goalBlend) break
        }
        const p0 = pts2d[cut]
        const t0 = cut > 0
            ? Math.atan2(p0[1] - pts2d[cut - 1][1], p0[0] - pts2d[cut - 1][0])
            : th0   // whole-segment terminal → leave along the canonical start heading
        pts2d.length = cut + 1   // drop the tail we are about to replace
        const dub = dubinsPath(p0[0], p0[1], t0, bx, bz, goalHeading, hardR, emitDs)
        if (dub) for (const q of dub) pts2d.push(q)
        else pts2d.push([bx, bz])
    }

    const out = []
    for (let i = 0; i < pts2d.length; i++) {
        const x = pts2d[i][0], z = pts2d[i][1]
        if (out.length) { const lp = out[out.length - 1]; if ((x - lp.x) ** 2 + (z - lp.z) ** 2 < 1e-6) continue }
        out.push({ x, y: heightFn(x, z), z })
    }
    return out
}
// ROUTE SYNC END (verbatim mirror of road-carve.js — route-worker-sync.mjs enforces)
// (PERF-03 Workstream A: the road-carve.js ROUTE SYNC region — arcPrimitiveConnect + dubins helpers
//  + search scratch — is spliced in here VERBATIM. Do not hand-edit; mirror road-carve.js and the
//  route-worker-sync.mjs gate enforces byte-equality.)

console.log('[terrain-worker] ready — awaiting init message')

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        const { worldSeed, params } = e.data
        _workerParams = params
        noiseCoarse   = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
        noiseFine     = createNoise2D(mulberry32(seedFor(worldSeed, 'fine')))
        noiseRegional = createNoise2D(mulberry32(seedFor(worldSeed, 'regional')))
        console.log('[terrain-worker] init complete. worldSeed =', worldSeed)
        return
    }

    if (e.data.type === 'route') {
        // PERF-03 WS-A: off-thread road routing. Pre-warms the main thread's per-connection centerline
        // cache so the synchronous _streamNetwork finds cache hits and never pays the arc-search cost on
        // a macro-cell crossing. heightFn = the SAME seeded coarse height the main thread routes against
        // (noiseCoarse from seedFor(worldSeed,'coarse'); _workerParams coarse fields) → the worker's
        // prims are byte-identical to the main-thread synchronous fallback (ROUTE SYNC guarantees it).
        // Not initialized yet (route raced ahead of 'init'): echo the keys with prims:null so the main
        // thread RELEASES them from _pendingRoutes and re-warms after init (else they'd stick pending).
        if (!noiseCoarse) { self.postMessage({ routed: true, epoch: e.data.epoch, results: e.data.jobs.map(function (j) { return { key: j.key, prims: null } }) }); return }
        const _hf = function (x, z) { return coarseHeight(x, z, noiseCoarse, _workerParams) }
        const results = []
        for (const job of e.data.jobs) {
            const prims = arcPrimitiveConnect(job.ax, job.az, job.bx, job.bz, _hf, job.opts)
            results.push({ key: job.key, prims })
        }
        self.postMessage({ routed: true, epoch: e.data.epoch, results })
        return
    }

    if (e.data.type !== 'generate') return

    if (!noiseCoarse) {
        console.warn('[terrain-worker] generate received before init — skipping key', e.data.key)
        return
    }

    // CARVE SYNC: destructure carveTable (Float32Array Transferable, may be undefined/null).
    // carveTable stores [blendW, gradeY_preamp] per vertex (pre-amplitude design grade).
    // The Worker receives and acknowledges the carveTable (T-09-02 Transferable mitigation)
    // but DOES NOT bake carve into heights — heights remain RAW (pre-amplitude, pre-carve).
    // The main thread _flushPendingQueue applies the carve blend from chunk.carveData after
    // receiving raw heights — this ensures chunk.heights is never overwritten (Pitfall 1).
    // CARVE SYNC: carveTable validation present; blend applied identically by main-thread paths.
    const { cx, cz, key, carveTable } = e.data
    const N    = GRID_SAMPLES
    const S    = CHUNK_SIZE
    const cell = CELL_SIZE

    const heights  = new Float32Array(N * N)
    const originX  = cx * S
    const originZ  = cz * S

    for (let zi = 0; zi < N; zi++) {
        for (let xi = 0; xi < N; xi++) {
            const wx = originX + xi * cell
            const wz = originZ + zi * cell
            // Raw height — no carve baked in. Carve applied by main thread in _flushPendingQueue.
            heights[zi * N + xi] = height(wx, wz, noiseCoarse, noiseFine, noiseRegional, _workerParams)
        }
    }

    // Transfer heights buffer to main thread (zero-copy transferable)
    self.postMessage({ key, cx, cz, heights }, [heights.buffer])
}
`

// ── Height function (shared with Worker — keep in sync) ──────────────────
// Three-layer height: coarse ridged-multifractal + fine FBM + regional modulator.
// Returns RAW height (no terrainAmplitude multiply).
// SYNC RULE: keep byte-identical with the same block inside WORKER_SOURCE above.

function coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp  = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp  *= gain
    }
    return h
}

function fineHeight(wx, wz, noiseFine, params) {
    const { fineAmplitude, fineFreq } = params
    return (
        noiseFine(wx * fineFreq, wz * fineFreq) * fineAmplitude +
        noiseFine(wx * fineFreq * 2.1, wz * fineFreq * 2.1) * fineAmplitude * 0.5
    )
}

function regionalModulator(wx, wz, noiseRegional, params) {
    const { regionalStrength, regionalScale } = params
    const raw = noiseRegional(wx * (1 / regionalScale), wz * (1 / regionalScale))
    const t = (raw + 1) * 0.5
    return (1.0 - regionalStrength) + regionalStrength * t
}

function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
    const coarse = coarseHeight(wx, wz, noiseCoarse, params)
    const reg    = regionalModulator(wx, wz, noiseRegional, params)
    const fine   = fineHeight(wx, wz, noiseFine, params) * reg
    return coarse + fine
}

// ── TerrainSystem class ────────────────────────────────────────────────────

export class TerrainSystem {
    /**
     * Create and start the TerrainSystem.
     *
     * @param {THREE.Scene} scene     - The Three.js scene to add chunk meshes to.
     * @param {object}      params    - Vehicle params object (reads terrainAmplitude, coarseAmplitude,
     *                                  coarseFreq, coarseOctaves, ridgeSharpness, fineAmplitude,
     *                                  fineFreq, regionalStrength, regionalScale, terrainAmplitude).
     * @param {number}      worldSeed - Unsigned 32-bit seed integer (from parseWorldSeed).
     *                                  Drives all three noise layers deterministically.
     */
    constructor(scene, params, worldSeed) {
        this._scene   = scene
        this._params  = params
        this._worldSeed = worldSeed ?? 0

        // Draw-distance (Phase 3): visible ring radius in chunks (runtime-tunable via setRingRadius).
        // _warmMargin extends the GENERATED ring one chunk beyond the visible edge so terrain is built
        // before it enters view — nearest-first ordering (PERF-02) still fills visible chunks first.
        this._ringRadius = RING_RADIUS
        this._warmMargin = 1

        // Private state
        this._chunkMap      = new Map()   // key → { mesh, heights, carveData? }
        this._pendingWorker = new Set()   // keys requested but not yet received
        this._pendingQueue  = []          // FIFO of received {key,cx,cz,heights} awaiting geometry build

        // Main-thread analytic noise closures (seeded same way as Worker — deterministic agreement)
        this._noiseCoarse   = null
        this._noiseFine     = null
        this._noiseRegional = null

        // Phase 9: Road carve reference — set via setRoadSystem() after both systems are constructed.
        // Kept null until set; all carve paths guard with this._roadSystem?.queryNearest check.
        this._roadSystem    = null

        // Shared terrain material — one instance, reused across all chunks.
        // vertexColors:true enables the 5-zone feathered material system (D-09/D-10/D-11,
        // Plan 09-05). Per-vertex colors written in _flushPendingQueue.
        // Do NOT dispose this per-chunk (matches wheelMat shared pattern).
        this._material = new THREE.MeshPhongMaterial({ vertexColors: true })

        // Spawn Blob classic worker from inlined source string
        // RESEARCH.md Pattern 3: classic worker avoids module-worker CORS restrictions
        const blob    = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
        const blobURL = URL.createObjectURL(blob)
        this._worker  = new Worker(blobURL)
        URL.revokeObjectURL(blobURL)  // safe to revoke after Worker construction

        // Worker message handler: push received heightmaps into FIFO queue.
        // The key deliberately stays reserved in _pendingWorker here — it is only
        // removed once _flushPendingQueue actually builds and tracks the chunk in
        // _chunkMap. This keeps the !_pendingWorker.has(key) guard in
        // _updateChunkRing effective for the full request→built window, preventing
        // the duplicate-request race that orphaned spawn-chunk meshes.
        this._worker.onmessage = (e) => {
            // PERF-03 WS-A: route replies (off-thread road routing) are tagged `routed`; forward them
            // to the RoadSystem's centerline-cache pre-warm. Everything else is a heightmap.
            if (e.data.routed) {
                this._roadSystem?.ingestRoutedConnections(e.data.results, e.data.epoch)
                return
            }
            const { key, cx, cz, heights } = e.data
            this._pendingQueue.push({ key, cx, cz, heights })
        }

        // Initialize Worker and main-thread noise closures with the starting seed.
        this.reinitWorker(this._worldSeed, params)
    }

    /**
     * Enable or disable terrain streaming.
     * When disabled, update() early-returns — _updateChunkRing and _flushPendingQueue do not run.
     * Existing chunk meshes remain in the scene (not disposed) so they can be restored instantly.
     * Called by grid-world mode (D-18 / D-19): disable on enterGridWorld, re-enable on returnToWorld.
     *
     * @param {boolean} flag - true = streaming active (default); false = streaming paused.
     */
    setEnabled(flag) {
        this._enabled = flag
    }

    /**
     * Set the visible chunk-ring radius (chunks in each direction) — the draw-distance lever.
     * The generated ring extends one warm-margin chunk beyond this so new terrain finishes building
     * before it enters view (no edge pop-in). Growing requests new chunks on the next update();
     * shrinking disposes the now-out-of-ring chunks via the existing dispose loop. Called by the
     * draw-distance presets (main.js applyDrawDistance).
     * @param {number} n — ring radius in chunks (≥ 1)
     * @param {number} [warmMargin] — rings to generate BEYOND the visible ring (pop-in lead). Scales
     *   with draw distance: higher tiers see further (lighter fog) so they need a deeper warm ring to
     *   keep the build frontier out past the visible edge. Omit to leave the current margin unchanged.
     */
    setRingRadius(n, warmMargin) {
        this._ringRadius = Math.max(1, Math.floor(n))
        if (warmMargin != null) this._warmMargin = Math.max(0, Math.floor(warmMargin))
    }

    /**
     * Return the set of active chunk keys ("X,Z") currently loaded in the chunk ring.
     * Used by RoadMeshSystem.syncToChunkRing() to co-locate road tile lifetime with
     * terrain chunk lifetime (SURF-01 streaming lifecycle).
     *
     * @returns {Set<string>}
     */
    getActiveChunkKeys() {
        return new Set(this._chunkMap.keys())
    }

    /**
     * Show or hide all currently-loaded chunk meshes without disposing them.
     * Used by grid-world mode to hide Sierra terrain while keeping chunks in memory
     * so they reappear immediately on returnToWorld without requiring re-streaming.
     *
     * @param {boolean} flag - true = visible (default); false = hidden.
     */
    setChunksVisible(flag) {
        for (const [, chunk] of this._chunkMap) {
            chunk.mesh.visible = flag
        }
    }

    /**
     * Update chunk ring and build pending geometries. Call once per render frame,
     * OUTSIDE the physics fixed-step accumulator (render rate only).
     *
     * @param {{ x: number, y: number, z: number }} carPos - Current car/camera world position.
     */
    update(carPos) {
        // Streaming paused (grid-world mode) — no-op to prevent chunk ring changes while in grid world.
        if (this._enabled === false) return
        const { cx: ccx, cz: ccz } = this._worldToChunk(carPos.x, carPos.z)
        let _pt = performance.now()
        this._updateChunkRing(ccx, ccz)
        perfAdd('terrain.updateChunkRing', performance.now() - _pt)   // TEMP: includes dispatch-path carve + re-carve pass
        _pt = performance.now()
        this._flushPendingQueue(ccx, ccz)
        perfAdd('terrain.flushPendingQueue', performance.now() - _pt) // TEMP: mesh build (geometry+carve+normals+colors)
    }

    /**
     * Re-initialize the Worker and main-thread noise closures for a new world seed / params.
     * Sends {type:'init', worldSeed, params} to the Worker; builds three seeded noise closures
     * on the main thread so analyticHeight/analyticNormal are immediately available.
     *
     * @param {number} worldSeed - Unsigned 32-bit seed.
     * @param {object} params    - Terrain params object (same as constructor).
     */
    reinitWorker(worldSeed, params) {
        this._worldSeed = worldSeed
        this._params    = params

        // Build main-thread noise closures (same seedFor derivation as Worker)
        // Import-compatible: djb2/seedFor/mulberry32/createNoise2D used from module scope
        // (they are declared as module-level functions matching the Worker copies).
        this._noiseCoarse   = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'coarse')))
        this._noiseFine     = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'fine')))
        this._noiseRegional = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'regional')))

        // Send init to Worker — Worker reinitializes its own three noise closures.
        // Pass ONLY the structured-cloneable terrain-layer fields. The live params object
        // accumulates non-cloneable runtime scratch (e.g. main.js attaches a _rotateVector
        // function and typed-array suspension buffers). Cloning the whole object throws a
        // DataCloneError, which silently aborts the regenerate before rebuildAllChunksFromWorker
        // runs — freezing the visible mesh while physics (reads params locally, no clone)
        // keeps updating. terrainAmplitude is intentionally omitted: it is applied on the
        // main thread in _flushPendingQueue, not inside the Worker height() function.
        const workerParams = {
            coarseAmplitude:  params.coarseAmplitude,
            coarseFreq:       params.coarseFreq,
            coarseOctaves:    params.coarseOctaves,
            ridgeSharpness:   params.ridgeSharpness,
            fineAmplitude:    params.fineAmplitude,
            fineFreq:         params.fineFreq,
            regionalStrength: params.regionalStrength,
            regionalScale:    params.regionalScale
        }
        this._worker.postMessage({ type: 'init', worldSeed, params: workerParams })
    }

    /**
     * Attach the RoadSystem reference so analyticHeight/_flushPendingQueue can apply
     * the road carve (SURF-04/SURF-05). Must be called after both TerrainSystem and
     * RoadSystem are constructed (main.js wires them up).
     *
     * @param {object|null} roadSystem — RoadSystem instance, or null to detach.
     */
    setRoadSystem(roadSystem) {
        this._roadSystem = roadSystem ?? null
    }

    /**
     * PERF-03 WS-A: dispatch road route jobs to the terrain Worker (which already holds the seeded
     * coarse noise routes are computed against). The Worker runs arcPrimitiveConnect per job and
     * replies `{routed, epoch, results}`, forwarded to RoadSystem.ingestRoutedConnections via onmessage.
     * RoadSystem owns the route semantics; TerrainSystem just owns the Worker transport.
     * @param {Array<object>} jobs — route specs {key, ax, az, bx, bz, opts}
     * @param {number} epoch — RoadSystem route epoch (echoed back for stale-reply rejection)
     */
    postRouteJobs(jobs, epoch) {
        this._worker.postMessage({ type: 'route', jobs, epoch })
    }

    /**
     * Path B rebuild: dispose ALL built chunk meshes, clear all state, re-request ring
     * on the next update() call. Use after seed/coarse-param changes.
     * The _pendingWorker race-fix ordering is preserved: _pendingWorker is cleared here
     * so all keys are releasable, and the next update() will re-request the ring cleanly.
     */
    rebuildAllChunksFromWorker() {
        console.log(`[terrain] rebuildAllChunksFromWorker — disposing ${this._chunkMap.size} chunks (FULL terrain regen)`)  // TEMP probe (D-arc)
        // Dispose all built chunk meshes and remove from scene
        for (const [, chunk] of this._chunkMap) {
            this._scene.remove(chunk.mesh)
            chunk.mesh.geometry.dispose()
        }
        this._chunkMap.clear()

        // Clear pending state — Worker will process new generate requests after reinit
        this._pendingWorker.clear()
        this._pendingQueue.length = 0
    }

    /**
     * Sample terrain height at world-space (wx, wz) analytically.
     * Uses the same three-layer formula as the Worker — never returns 0 for unloaded chunks.
     * Multiplies by terrainAmplitude to match visual geometry.
     * Used by queryContacts and queryVertexContacts (fixes chunk-seam gap — RESEARCH §Pitfall 6).
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Height in metres (with terrainAmplitude applied).
     */
    /**
     * Sample terrain height at world-space (wx, wz) with NO carve hook applied.
     * Returns exactly the `raw` value from analyticHeight — height()*terrainAmplitude — but
     * skips the _sampleCarveWorld blend entirely. This is the carve-free design-grade input
     * source for _smoothDesignGrade (CR-04 fix): feeding the smoothing window a carve-inclusive
     * value caused crown/camber/pothole to be baked into the design grade and then re-added
     * downstream (double-count). rawHeightWorld removes that structural error.
     *
     * Lives only on the main-thread TerrainSystem class — NOT in the worker (WORKER_SOURCE).
     * The Worker already stores raw heights and applies no carve blend; this method is a
     * thin main-thread wrapper and never belongs in the Worker CARVE SYNC body.
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Raw (carve-free) terrain height in metres (terrainAmplitude applied).
     */
    rawHeightWorld(wx, wz) {
        if (!this._noiseCoarse) throw new Error('rawHeightWorld called before reinitWorker — call-order bug')
        return height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params) * (this._params.terrainAmplitude ?? 1.0)
    }

    // nrHint (optional): a precomputed roadSystem.carveHint(wx,wz) result, threaded through so a tight
    // cluster of samples (analyticNormal's ±0.5 m offsets, queryContacts' height+normal for one wheel)
    // shares ONE road tile-scan instead of re-querying per call. undefined = query internally (legacy).
    analyticHeight(wx, wz, nrHint) {
        // Precondition: reinitWorker (called synchronously in the constructor) must have built
        // the noise closures. Throw rather than silently returning 0 — a 0 here would seat the
        // truck at sea level inside the terrain and violate the "never returns 0" contract (WR-07).
        if (!this._noiseCoarse) throw new Error('analyticHeight called before reinitWorker — call-order bug')
        const raw = height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params) * (this._params.terrainAmplitude ?? 1.0)

        // Phase 9 carve hook (SURF-04): blend road design grade into terrain height at on-road positions.
        // CARVE SYNC: identical blend formula as _flushPendingQueue, sampleHeight, and Worker height loop.
        // rawAmp is passed to _sampleCarveWorld to avoid re-calling analyticHeight (infinite recursion).
        if (this._roadSystem) {
            const c = this._roadSystem._sampleCarveWorld(wx, wz, raw, nrHint)
            if (c && c.blendW > 1e-6) return raw + c.blendW * (c.gradeY - raw)
        }
        return raw
    }

    /**
     * Compute terrain surface normal at world-space (wx, wz) using central-difference
     * over analyticHeight. Returns a plain {x, y, z} unit normal.
     * Uses analyticHeight (not sampleHeight) so normal and height are always consistent
     * (fixes normal/height mismatch noted in RESEARCH §Unified Architecture).
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {{ x: number, y: number, z: number }} Unit normal pointing away from surface.
     */
    analyticNormal(wx, wz, nrHint) {
        const EPS = 0.5
        // PERF (contact path): find the road run ONCE (at the center) and reuse it for all 4 offsets,
        // collapsing ~5 road queries/wheel-contact → 1. The offsets project onto this run, so the
        // finite difference still captures grade + crown/camber accurately (sub-mm projection error
        // over ±0.5 m). When called WITHOUT a hint, derive one here so any normal-only caller benefits.
        const hint = (nrHint !== undefined) ? nrHint
            : (this._roadSystem ? this._roadSystem.carveHint(wx, wz) : null)
        const hL  = this.analyticHeight(wx - EPS, wz, hint)
        const hR  = this.analyticHeight(wx + EPS, wz, hint)
        const hD  = this.analyticHeight(wx,       wz - EPS, hint)
        const hU  = this.analyticHeight(wx,       wz + EPS, hint)
        const nx  = -(hR - hL) / (2 * EPS)
        const ny  = 1
        const nz  = -(hU - hD) / (2 * EPS)
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
        return { x: nx/len, y: ny/len, z: nz/len }
    }

    /**
     * Sample terrain height at a world-space (wx, wz) position.
     * Uses bilinear interpolation on the chunk's Float32Array heightmap.
     * Retained for the P7-2 height-agreement test — NOT used by physics contacts.
     * Physics uses analyticHeight (no chunk-seam gap).
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Height in metres. Returns 0 when chunk not yet loaded.
     */
    sampleHeight(wx, wz) {
        const { cx, cz } = this._worldToChunk(wx, wz)
        const chunk = this._chunkMap.get(this._chunkKey(cx, cz))
        if (!chunk || !chunk.heights) return 0  // chunk not loaded — flat ground fallback

        const N    = GRID_SAMPLES
        const S    = CHUNK_SIZE
        const cell = S / (N - 1)  // 1.0 m

        // Local coordinates within chunk (0..CHUNK_SIZE)
        const lx = wx - cx * S
        const lz = wz - cz * S

        // Integer grid indices, clamped to valid cell range
        const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cell)))
        const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cell)))

        // Fractional part within cell
        const fx = (lx / cell) - xi
        const fz = (lz / cell) - zi

        // 4-corner bilinear sample (raw worker values)
        const h00 = chunk.heights[ zi      * N +  xi   ]
        const h10 = chunk.heights[ zi      * N + (xi+1)]
        const h01 = chunk.heights[(zi + 1) * N +  xi   ]
        const h11 = chunk.heights[(zi + 1) * N + (xi+1)]

        // Bilinear interpolation
        const raw = h00 * (1-fx) * (1-fz)
                  + h10 *    fx  * (1-fz)
                  + h01 * (1-fx) *    fz
                  + h11 *    fx  *    fz

        // Apply amplitude to match visual geometry (also applied in _flushPendingQueue)
        const rawAmp = raw * (this._params.terrainAmplitude ?? 1.0)

        // Phase 9 carve hook (SURF-04/SURF-05): same blend as analyticHeight (height-agreement path).
        // CARVE SYNC: identical blend formula as analyticHeight, _flushPendingQueue, Worker height loop.
        if (chunk.carveData) {
            // Reuse xi, zi, fx, fz already computed above (same lx/lz/cell).
            const i00  = (zi       * N +  xi   ) * 2
            const i10  = (zi       * N + (xi+1)) * 2
            const i01  = ((zi + 1) * N +  xi   ) * 2
            const i11  = ((zi + 1) * N + (xi+1)) * 2
            const cw00 = (1-fx) * (1-fz), cw10 = fx * (1-fz)
            const cw01 = (1-fx) * fz,     cw11 = fx * fz
            const cd   = chunk.carveData
            const blendW = cd[i00]*cw00 + cd[i10]*cw10 + cd[i01]*cw01 + cd[i11]*cw11
            // gradeY_preamp → world-space by multiplying by amp (CARVE SYNC)
            const gradeY = (cd[i00+1]*cw00 + cd[i10+1]*cw10 + cd[i01+1]*cw01 + cd[i11+1]*cw11) * (this._params.terrainAmplitude ?? 1.0)
            if (blendW > 1e-6) return rawAmp + blendW * (gradeY - rawAmp)
        }
        return rawAmp
    }

    /**
     * Compute terrain surface normal at world-space (wx, wz) using central-difference
     * finite differences over sampleHeight. Returns a plain {x, y, z} object.
     * NOTE: Only call this when you specifically need bilinear-based normal (e.g. debug HUD).
     * Physics contacts use analyticNormal for consistency with analyticHeight.
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {{ x: number, y: number, z: number }} Unit normal vector pointing away from surface.
     */
    sampleNormal(wx, wz) {
        const EPS = 0.5  // metres — half-cell probe distance
        const hL  = this.sampleHeight(wx - EPS, wz)
        const hR  = this.sampleHeight(wx + EPS, wz)
        const hD  = this.sampleHeight(wx,       wz - EPS)
        const hU  = this.sampleHeight(wx,       wz + EPS)

        // Central-difference normal: normalize(-dh/dx, 1, -dh/dz) in Y-up space
        const nx  = -(hR - hL) / (2 * EPS)
        const ny  = 1
        const nz  = -(hU - hD) / (2 * EPS)
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
        return { x: nx/len, y: ny/len, z: nz/len }
    }

    // ── Private methods ────────────────────────────────────────────────────

    /**
     * Convert chunk grid coordinates to a string key.
     * @private
     */
    _chunkKey(cx, cz) {
        return `${cx},${cz}`
    }

    /**
     * Convert world coordinates to chunk grid coordinates.
     * @private
     */
    _worldToChunk(wx, wz) {
        return {
            cx: Math.floor(wx / CHUNK_SIZE),
            cz: Math.floor(wz / CHUNK_SIZE)
        }
    }

    /**
     * Update the 5×5 chunk ring around the car's current chunk.
     * Disposes out-of-ring chunks (geometry only — material is shared).
     * Requests new in-ring chunks from the worker if not already loaded/pending.
     *
     * @param {number} ccx - Car's current chunk X.
     * @param {number} ccz - Car's current chunk Z.
     * @private
     */
    _updateChunkRing(ccx, ccz) {
        const ringRadius  = this._ringRadius ?? RING_RADIUS
        const buildRadius = ringRadius + (this._warmMargin ?? 0)   // Phase 3: generate one warm ring beyond visible

        // Build the target set of keys to REQUEST/build (visible ring + warm margin).
        const needed = new Set()
        for (let dx = -buildRadius; dx <= buildRadius; dx++) {
            for (let dz = -buildRadius; dz <= buildRadius; dz++) {
                needed.add(this._chunkKey(ccx + dx, ccz + dz))
            }
        }

        // T-06-03 + PERF-02 hysteresis: dispose a chunk only once it falls OUTSIDE ring+keepMargin
        // (Chebyshev distance), not the instant it leaves the build ring. Without the margin, idling
        // on a chunk boundary dispose↔rebuilds the edge row every frame (a stutter that feels random).
        const keepRadius = buildRadius + RING_KEEP_MARGIN
        for (const [key, chunk] of this._chunkMap) {
            const ci = key.indexOf(',')
            const kx = +key.slice(0, ci), kz = +key.slice(ci + 1)
            if (Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) > keepRadius) {
                this._scene.remove(chunk.mesh)
                chunk.mesh.geometry.dispose()  // T-06-03: explicit GPU memory release
                this._chunkMap.delete(key)
            }
        }

        // D1 (plan 09-19): version-mismatch re-carve pass (fixes bug #6 — slider-no-rebuild-carve).
        // Any live chunk whose builtRoadGeneration differs from the current road generation was
        // carved against an old route (e.g. after maxGrade slider re-routes). Re-build its carve
        // table on the main thread and re-apply the blend to the existing mesh Y positions.
        // This is an in-place recarve — no worker round-trip; no new geometry allocation needed
        // because GRID_SAMPLES and CHUNK_SIZE are fixed, and chunk.heights holds the raw heights.
        // Frame-spread: cap re-carves at MAX_BUILDS_PER_FRAME per ring-sync tick (same discipline
        // as _flushPendingQueue) so a sudden re-route doesn't spike the main thread.
        // CARVE SYNC: carve never enters the worker (WORKER_SOURCE) — it is a post-read main-thread blend.
        if (this._roadSystem) {
            const currentRoadGen = this._roadSystem.roadGeneration()
            const recarveDeadline = performance.now() + BUILD_MS_BUDGET   // PERF-02: time-slice, not fixed count
            let recarved = 0
            for (const [key, chunk] of this._chunkMap) {
                if (recarved >= MAX_BUILDS_PER_FRAME || performance.now() >= recarveDeadline) break
                if (chunk.builtRoadGeneration === currentRoadGen) continue
                const [cx, cz] = key.split(',').map(Number)
                const newCarveData = this._buildCarveTable(cx, cz, chunk.heights)   // PERF-03 #1: reuse stored raw heights
                // Re-apply heights + carve blend to the mesh Y positions (same formula as _flushPendingQueue).
                const amp = this._params.terrainAmplitude ?? 1.0
                const N   = GRID_SAMPLES
                const pos = chunk.mesh.geometry.attributes.position
                for (let i = 0; i < N * N; i++) {
                    const raw = chunk.heights[i] * amp
                    if (newCarveData) {
                        const blendW = newCarveData[i * 2]
                        const gradeY = newCarveData[i * 2 + 1] * amp
                        pos.setY(i, raw + blendW * (gradeY - raw))
                    } else {
                        pos.setY(i, raw)
                    }
                }
                pos.needsUpdate = true
                this._computeGridNormals(chunk.mesh.geometry)  // PERF-03: grid-FD normals
                this._writeChunkVertexColors(chunk.mesh.geometry, newCarveData, chunk.heights, amp)
                // Stamp the new generation so we don't re-carve this chunk again until the next re-route.
                chunk.carveData = newCarveData ?? null
                chunk.builtRoadGeneration = currentRoadGen
                recarved++
            }
        }

        // Request new chunks not yet loaded or pending.
        // PERF-03 #0: do NOT build/transfer the carve table here. The Worker's `generate` handler
        // ignores any carveTable it receives (heights stay RAW — see WORKER_SOURCE: "DOES NOT bake
        // carve into heights"); the carve blend is applied on the main thread in _flushPendingQueue,
        // which builds the table itself. Building it here was pure waste — and worse, transferring the
        // buffer CONSUMED it, forcing _flushPendingQueue to rebuild from scratch (the chunk was carve-
        // tabled twice). Send a bare generate; _flushPendingQueue owns the single carve-table build.
        // PERF-02: request missing chunks NEAREST-FIRST, budgeted per frame. The worker processes
        // `generate` messages FIFO, so posting nearest-first makes replies (and thus the build queue)
        // arrive nearest-first → the area under/ahead of the truck fills before the periphery (no
        // visible hole where it matters). Remaining chunks ride the next tick — _pendingWorker dedups,
        // so no extra bookkeeping. MAX_REQUESTS_PER_FRAME bounds the postMessage flood at large rings.
        const missing = []
        for (const key of needed) {
            if (!this._chunkMap.has(key) && !this._pendingWorker.has(key)) {
                const ci = key.indexOf(',')
                const cx = +key.slice(0, ci), cz = +key.slice(ci + 1)
                const dx = cx - ccx, dz = cz - ccz
                missing.push({ key, cx, cz, d2: dx * dx + dz * dz })
            }
        }
        missing.sort((a, b) => a.d2 - b.d2)
        const reqBudget = Math.min(missing.length, MAX_REQUESTS_PER_FRAME)
        for (let i = 0; i < reqBudget; i++) {
            const { key, cx, cz } = missing[i]
            this._pendingWorker.add(key)
            this._worker.postMessage({ type: 'generate', cx, cz, key })
        }
    }

    /**
     * Re-apply the current terrainAmplitude to all already-built chunk geometries.
     * Called when the debug amplitude slider changes so visuals update immediately
     * instead of waiting for chunks to cycle out of the ring.
     * Path A: instant Y-rescale, no Worker round-trip.
     */
    rebuildAllChunks() {
        const amp = this._params.terrainAmplitude ?? 1.0
        const N = GRID_SAMPLES
        for (const [, chunk] of this._chunkMap) {
            const pos = chunk.mesh.geometry.attributes.position
            for (let i = 0; i < N * N; i++) {
                pos.setY(i, chunk.heights[i] * amp)
            }
            pos.needsUpdate = true
            this._computeGridNormals(chunk.mesh.geometry)  // PERF-03: grid-FD normals
            // Re-write vertex colors after Y + normals are updated (D-09/D-10/D-11).
            this._writeChunkVertexColors(chunk.mesh.geometry, chunk.carveData, chunk.heights, amp)
        }
    }

    /**
     * Build the per-chunk carve table for chunk (cx, cz).
     * Returns a Float32Array(GRID_SAMPLES * GRID_SAMPLES * 2) with layout:
     *   [blendW_0, gradeY_0, blendW_1, gradeY_1, ...]  (row-major: index = zi*N + xi)
     * Returns null if no road system is attached or no road is within range of this chunk.
     *
     * The table is a pure function of (cx, cz, roadSystem, params) — never mutates chunk.heights.
     * It is rebuilt fresh per generate request (buffer is consumed by postMessage Transferable)
     * and again in _flushPendingQueue for the _chunkMap reference copy (Pitfall 5 prevention).
     *
     * SURF-05: carveData stored on the chunk is NEVER written into chunk.heights (post-read blend).
     * @private
     */
    // PERF-03 #1: `rawHeights` (optional) is the Worker's already-computed raw 65×65 noise grid for this
    // chunk (row-major, pre-amplitude). When provided, the per-vertex loop reuses rawHeights[zi*N+xi]
    // instead of re-evaluating the multi-octave `height()` noise — byte-identical (same fn, same inputs),
    // just not recomputed. Available now that the table is built in _flushPendingQueue (has the heights)
    // and the re-carve path (chunk.heights). Callers without it (none currently) fall back to height().
    _buildCarveTable(cx, cz, rawHeights = null) {
        if (!this._roadSystem) return null

        const N    = GRID_SAMPLES
        const S    = CHUNK_SIZE
        const cell = S / (N - 1)
        const amp  = this._params.terrainAmplitude ?? 1.0
        const p    = this._params

        const halfWidth       = p.roadHalfWidth      ?? 5
        const shoulderWidth   = p.roadShoulderWidth   ?? 2.5
        const fillHeight      = p.roadFillHeight      ?? 2.0
        const fillSlope       = p.roadFillSlope       ?? 3.0
        const cutSlope        = p.roadCutSlope        ?? 1.0
        const crownHeight     = p.crownHeight         ?? 0.05
        // D3 (plan 09-22): carve inherits the ribbon cross-section. carveTargetY now includes
        // crownProfile(uLat) + camberTilt(uLat, camberProfile(arcS)) so the trough tilts
        // WITH the ribbon → uniform clearanceMargin on banked turns (fixes clip/gap, bug #5).
        const clearanceMargin = p.roadClearanceMargin ?? 0.5
        const carveExtraWidth = p.roadCarveExtraWidth ?? 3.0

        // Maximum lateral extent to bother querying: ribbon + shoulder + max fill toe + extra width
        // fillToe = halfWidth + shoulderWidth + fillHeight * fillSlope
        const maxExt = halfWidth + shoulderWidth + fillHeight * fillSlope + 4 + carveExtraWidth

        const originX = cx * S
        const originZ = cz * S

        // Quick bounding-box check: does any road come within maxExt of this chunk?
        // (Runs ONCE per chunk — not the lag. The lag was per-vertex queryNearest below, now removed.)
        const chunkCX = originX + S * 0.5
        const chunkCZ = originZ + S * 0.5
        const queryRadius = maxExt + S * 0.71  // half-diagonal of chunk + maxExt
        const nearest = this._roadSystem.queryNearest(chunkCX, chunkCZ, queryRadius)
        if (!nearest) return null  // no road near this chunk

        // ── Plan 09-16: Pre-sample spline points ONCE per chunk (SURF-04 perf fix) ──
        //
        // collectChunkSplinePoints performs the same tile-block scan as queryNearest but
        // samples every nearby spline at ~1.5 m arc intervals into a flat [x,y,z,...] array.
        // This is the SINGLE getPointAt site on the carve path — it runs outside the vertex
        // loop so the 4225-vertex inner loop never calls getPointAt or queryNearest.
        //
        // The search radius (queryRadius) is the same value used for the chunk early-reject
        // above, which already includes points slightly beyond the chunk edge.  This means
        // adjacent chunks share the same set of spline samples near their shared boundary →
        // continuous carved trough, no seam steps (SURF-05 continuity preserved).
        // D3 (plan 09-22): collectChunkSplinePoints now returns { pts, sampleArcS, sampleRunKeys }
        // sampleArcS[i] and sampleRunKeys[i] give the arc-length and run key for pts[i*5..i*5+4].
        // Used to read camberProfile(arcS, runKey) for the D3 cross-section-inheriting carve target.
        const _ptC = performance.now()
        const { pts: samples, sampleArcS, sampleRunKeys, sampleCamberSign } = this._roadSystem.collectChunkSplinePoints(chunkCX, chunkCZ, queryRadius)
        perfAdd('carve.collectSplines', performance.now() - _ptC)
        if (samples.length === 0) return null  // early-reject passed but no actual points sampled

        const table = new Float32Array(N * N * 2)
        let anyNonZero = false

        // D3 refinement (plan 09-22): footprint bound coupled to min-turn-radius.
        // Min inter-arm separation at a hairpin ≈ 2·minRadius (D0 arc-fillet arms
        // separate by ~2·minRadius). Each arm's carve footprint is bounded to ≤ ½ that
        // separation = minRadius so adjacent arms' footprints can't overlap → no mutual
        // undermining by construction. NEW COUPLING: carve footprint ↔ min-turn-radius —
        // if roadMinTurnRadius is widened, carve footprint widens with it; if narrowed,
        // they must be sized together to preserve the no-overlap guarantee.
        //
        // Widened carve-core half-width: the blendW=1 zone extends beyond the ribbon by
        // carveExtraWidth so the flat trough bed is wider than the ribbon + skirt edge.
        const minRadius      = (this._roadSystem._params?.roadMinTurnRadius ?? 12)
        const carveHalfWidth = Math.min(halfWidth + carveExtraWidth, minRadius)

        // ── Per-vertex inner loop ────────────────────────────────────────────────
        // PERF CONTRACT (Plan 09-16 / SURF-04):
        //   • ZERO getPointAt calls   — splines already sampled above (collectChunkSplinePoints)
        //   • ZERO queryNearest calls — nearest point found by plain squared-distance search
        //   • ZERO arrow-closure allocations — no => expressions, no new objects per vertex
        // The single getPointAt site for this function is collectChunkSplinePoints (pre-loop above).
        //
        // D4 (plan 09-20): samples stride = 5 ([x,y,z,tx,tz]); apply the SAME footprint-preference
        // arm-disambiguation as queryNearest — prefer the sample whose footprint the vertex is
        // interior to (|signedLat| ≤ footprintHW) over the globally-nearest exterior sample.
        // Keeps carve and physics consistent at switchbacks (no carve-arm vs physics-arm mismatch).
        //
        // D3 (plan 09-22): after selecting bi, compute signedLat from the chosen sample's tangent;
        // read camberProfile(arcS, runKey) from the pre-built D2 profile (O(1) binary-search,
        // cached on RoadSystem — no per-vertex spline eval). Crown + tilt fold into carveTargetY.
        const carveFootprintHW = (p.roadHalfWidth ?? 5) + (p.roadShoulderWidth ?? 2.5)
        const STRIDE = 5  // D4: stride widened from 3 to 5 ([x,y,z,tx,tz])

        // PERF (D-arc): conservative per-chunk lateral bound so the inner loop can SKIP the expensive
        // per-vertex work (full height() + runProfile + camberProfile) for vertices that are too far
        // from any road to ever be carved. The widest possible fill/cut toe is
        //   halfWidth + shoulderWidth + maxDelta·max(fillSlope,cutSlope), maxDelta = max |roadY − terrainY|.
        // Bound maxDelta from the road sample Y range vs the chunk's terrain range (corners+center, 5
        // height() calls), + a generous margin. extBestD2 (true nearest) beyond this ⇒ table = 0 anyway,
        // so skipping is loss-free except on extreme causeways (cosmetic; revisit if seen).
        let _rYmin = Infinity, _rYmax = -Infinity
        for (let si = 1; si < samples.length; si += STRIDE) { const y = samples[si]; if (y < _rYmin) _rYmin = y; if (y > _rYmax) _rYmax = y }
        let _tMin = Infinity, _tMax = -Infinity
        for (let c = 0; c < 5; c++) {
            const sx = (c & 1), sz = (c >> 1) & 1, mid = c === 4 ? 0.5 : 0
            const th = height(originX + (mid || sx) * S, originZ + (mid || sz) * S, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params) * amp
            if (th < _tMin) _tMin = th; if (th > _tMax) _tMax = th
        }
        const _maxDelta = Math.max(Math.abs(_rYmax - _tMin), Math.abs(_rYmax - _tMax), Math.abs(_rYmin - _tMin), Math.abs(_rYmin - _tMax))
        const _maxToe = halfWidth + shoulderWidth + _maxDelta * Math.max(fillSlope, cutSlope) + cell * 2
        const _maxToe2 = _maxToe * _maxToe

        for (let zi = 0; zi < N; zi++) {
            for (let xi = 0; xi < N; xi++) {
                const wx = originX + xi * cell
                const wz = originZ + zi * cell
                const idx = (zi * N + xi) * 2

                // D4: track two parallel bests (mirrors queryNearest D4 arm-disambiguation).
                // extBestD2 — globally nearest regardless of footprint.
                // intBestD2 — nearest among samples where |signedLat| ≤ footprintHW (interior).
                let extBestD2 = Infinity, intBestD2 = Infinity
                let extBi = 0, intBi = 0
                for (let si = 0; si < samples.length; si += STRIDE) {
                    const sdx = samples[si]     - wx
                    const sdz = samples[si + 2] - wz
                    const d2  = sdx * sdx + sdz * sdz
                    if (d2 < extBestD2) { extBestD2 = d2; extBi = si }
                    if (d2 < intBestD2) {
                        // signedLat = sdx_fwd*tz − sdz_fwd*tx where sdx_fwd = sample − query = -sdx
                        const tx = samples[si + 3], tz = samples[si + 4]
                        const signedLat = (-sdx) * tz - (-sdz) * tx
                        if (Math.abs(signedLat) <= carveFootprintHW) { intBestD2 = d2; intBi = si }
                    }
                }
                // PERF (D-arc): skip the expensive per-vertex work for vertices beyond the widest
                // possible carve toe. extBestD2 is the TRUE nearest (global, footprint-agnostic), so if
                // it exceeds the conservative bound the vertex cannot be carved → table = 0, continue.
                if (extBestD2 > _maxToe2) { table[idx] = 0; table[idx + 1] = 0; continue }

                // Prefer interior sample; fall back to exterior if no interior found.
                const bi = (intBestD2 < Infinity) ? intBi : extBi
                const bestD2 = (intBestD2 < Infinity) ? intBestD2 : extBestD2

                // XZ distance to nearest road point.
                const latDist = Math.sqrt(bestD2)

                // Raw terrain height at this vertex (world-space, with amplitude).
                const rawPre = rawHeights ? rawHeights[zi * N + xi]
                    : height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params)
                const rawH   = rawPre * amp

                // ── D3 (plan 09-22): carve target inherits the ribbon cross-section ──
                // Formula: carveTargetY = roadY(arcS) + crownProfile(uLat) + camberTilt − clearanceMargin
                //
                // signedLat: re-derive from chosen sample's tangent (same sign convention as D4 inner loop
                // and queryNearest — sdx_fwd = sample − query = -sdx, so signedLat = (-sdx)*tz − (-sdz)*tx).
                // This is O(1): two multiplies, using pre-sampled tangent from flat array.
                //
                // camberAngle: read from D2 camberProfile cache — O(log N) binary search (pre-built per run,
                // no per-vertex spline eval). sampleArcS / sampleRunKeys parallel arrays from collectChunkSplinePoints.
                //
                // The trough tilts WITH the ribbon → clearanceMargin is uniform regardless of banking angle
                // (fixes bug #5: at 6°×5m = 0.52m > 0.5m clearance under a flat carve).
                const biIdx   = bi / STRIDE   // sample index (integer)
                const biTx    = samples[bi + 3], biTz = samples[bi + 4]
                const sdxBi   = samples[bi] - wx, sdzBi = samples[bi + 2] - wz
                const signedLat = (-sdxBi) * biTz - (-sdzBi) * biTx

                const arcS   = sampleArcS[biIdx]
                const runKey = sampleRunKeys[biIdx]

                // P2 (09-27): replace nearest-discrete-sample ny = samples[bi+1] with the run-global
                // continuous profile gradeY. Both adjacent chunks read the SAME runProfile by the SAME
                // arcS → shared boundary vertices match → the chunk-boundary foundation step is gone
                // (BUG-14 carve path closed). roadY is world-space (post-amplitude), exactly like the
                // old samples[bi+1] it replaces, so the amplitude convention below is UNCHANGED.
                // Previous: const ny = samples[bi + 1]
                const roadY = this._roadSystem.runProfile(arcS, runKey).gradeY

                // BUG-10: run-frame camber × per-sample sign → slice-frame angle (matches ribbon + physics).
                const camberAngle = (sampleCamberSign ? sampleCamberSign[biIdx] : 1) * this._roadSystem.camberProfile(arcS, runKey)

                const crownY = crownProfile(signedLat, halfWidth, crownHeight)
                const tiltY  = signedLat * Math.sin(camberAngle)

                // carveTargetY = ribbon_surface − clearanceMargin (uniform clearance on banked turns)
                let carveTargetY = roadY + crownY + tiltY - clearanceMargin

                // ── D3 refinement: max-floor guard (plan 09-22) ──────────────────────
                // Where geometry forces two arms closer than the footprint bound, this vertex
                // may lie inside the footprint of BOTH arm A (intBi / the chosen bi) and arm B
                // (extBi / the globally nearest). If arm B is at a HIGHER elevation, we must
                // NOT carve below the floor it needs — a lower arm's cut cannot remove an upper
                // arm's support (D3 refinement, SURF-04).
                //
                // When intBi != extBi, extBi is a different arm. Compute its carveTargetY and
                // apply a MAX floor: the higher arm wins. We accept a managed steep bank between
                // arms at the transition (only degenerate vertical seams are disallowed — SURF-05).
                //
                // PERF CONTRACT: the guard is one float array read + a single O(log N) camberProfile
                // + runProfile call on extBi (only when extBi != intBi); no per-vertex allocation.
                if (intBestD2 < Infinity && extBi !== intBi) {
                    const extIdx = extBi / STRIDE
                    const eTx = samples[extBi + 3], eTz = samples[extBi + 4]
                    const sdxExt = samples[extBi] - wx, sdzExt = samples[extBi + 2] - wz
                    const signedLatExt  = (-sdxExt) * eTz - (-sdzExt) * eTx
                    // P2 (09-27): exterior grade also from runProfile — same continuous source.
                    // Previous: const enyExt = samples[extBi + 1]
                    const roadYExt      = this._roadSystem.runProfile(sampleArcS[extIdx], sampleRunKeys[extIdx]).gradeY
                    const camberExt     = (sampleCamberSign ? sampleCamberSign[extIdx] : 1) * this._roadSystem.camberProfile(sampleArcS[extIdx], sampleRunKeys[extIdx])
                    const maxFloor      = roadYExt + crownProfile(signedLatExt, halfWidth, crownHeight) +
                                          signedLatExt * Math.sin(camberExt) - clearanceMargin
                    if (maxFloor > carveTargetY) carveTargetY = maxFloor
                }

                // BUG-13: NO fill cap. Capping carveTargetY at rawH + fillHeight pulled the carved
                // foundation (and physics) down to follow the terrain on causeways taller than
                // fillHeight, leaving a gap under the ribbon and dropping the collision surface so the
                // truck fell through. The foundation now rises to the full road grade and meets the
                // ribbon (height-agreement with road-mesh.js designGradeY + _sampleCarveWorld). The fill
                // shoulder can be steep on tall causeways — cosmetic follow-up; road stays solid/driveable.

                // Compute fill/cut toe distances (SURF-05 continuity — shoulder rejoins terrain).
                const cappedDelta = Math.max(0, carveTargetY - rawH)
                const fillToe = halfWidth + shoulderWidth + cappedDelta * fillSlope
                const cutDelta = Math.max(0, rawH - carveTargetY)
                const cutToe  = halfWidth + shoulderWidth + cutDelta * cutSlope
                const toeExt  = Math.max(fillToe, cutToe)

                if (latDist > toeExt) {
                    // Beyond the fill/cut toe — unaffected terrain.
                    table[idx]     = 0
                    table[idx + 1] = 0
                    continue
                }

                // Blend weight: 1 across the widened carve core, shoulder ramp beyond.
                // The core is carveHalfWidth (= halfWidth + carveExtraWidth) wide so the flat
                // trough bed is wider than the ribbon + skirt. The shoulder ramp still uses
                // shoulderWidth to blend back to raw terrain (SURF-05 continuity retained).
                let blendW
                if (latDist < carveHalfWidth) {
                    blendW = 1.0
                } else {
                    blendW = Math.max(0.0, 1.0 - (latDist - carveHalfWidth) / shoulderWidth)
                }

                // Store carveTargetY as pre-amplitude (Worker uses raw heights; main thread
                // reads back and blends against the amplitude-scaled raw height).
                const gradeY_preamp = amp > 0 ? carveTargetY / amp : carveTargetY

                table[idx]     = blendW
                table[idx + 1] = gradeY_preamp
                if (blendW > 1e-6) anyNonZero = true
            }
        }

        // TEMP perf probe (D-arc): log carve cost for this chunk — collect(spline sampling) vs the
        // per-vertex loop — plus how many road sample points fell in range (windier road = more).
        return anyNonZero ? table : null
    }

    /**
     * Write per-vertex colors for the 5-zone feathered material system (D-09/D-10/D-11).
     *
     * Called from _flushPendingQueue AFTER _computeGridNormals() so the normal attribute
     * is available for cliff slope detection (D-11).
     *
     * Zone priority (all blended/feathered — no hard lines, D-09):
     *   General terrain → lerp → Natural cliff  (driven by slope, D-11)
     *   General terrain → lerp → Engineered cutout (driven by blendW where delta<0, D-10)
     *   General terrain → lerp → Dirt foundation  (driven by blendW where delta>0, D-07)
     * Cut/fill zones are further feathered by blendW (from carve system, free side effect).
     * Cutout color is distinct from natural cliff color (D-10).
     *
     * @param {THREE.BufferGeometry} geom      — geometry with position + normal attributes
     * @param {Float32Array|null}    carveData — [blendW, gradeY_preamp, ...] per vertex (or null)
     * @param {Float32Array}         heights   — raw pre-amplitude heights per vertex
     * @param {number}               amp       — terrainAmplitude
     * @private
     */
    _writeChunkVertexColors(geom, carveData, heights, amp) {
        const N = GRID_SAMPLES

        // Cliff thresholds from params (D-11). Fall back to defaults if not in params.
        const cliffLo = this._params.roadCliffSlopeLo ?? 0.3
        const cliffHi = this._params.roadCliffSlopeHi ?? 0.6

        const nrmAttr = geom.attributes.normal
        const nVerts = N * N

        const colorArr = new Float32Array(nVerts * 3)

        // Color constants (linear RGB — D-09/D-10/D-11):
        // General terrain: warm brown
        const GT_R = 0.72, GT_G = 0.60, GT_B = 0.47
        // Natural cliff: weathered grey (distinct from cutout — D-10)
        const CL_R = 0.60, CL_G = 0.58, CL_B = 0.55
        // Engineered cutout: uniform grey-tan (man-made/uniform — D-10)
        const CO_R = 0.55, CO_G = 0.50, CO_B = 0.42
        // Dirt foundation (fill embankment): warm tan
        const DF_R = 0.65, DF_G = 0.55, DF_B = 0.38

        for (let i = 0; i < nVerts; i++) {
            const idx3 = i * 3

            // ── Slope for cliff blend (D-11) ────────────────────────────────
            // slope = 1 - normal.y; near 0 = flat, near 1 = vertical
            const ny = nrmAttr ? nrmAttr.getY(i) : 1.0
            const slope = 1.0 - Math.max(0.0, Math.min(1.0, ny))
            // smoothstep(cliffLo, cliffHi, slope)
            let cliffBlend = 0
            if (slope >= cliffHi) {
                cliffBlend = 1.0
            } else if (slope > cliffLo) {
                const tC = (slope - cliffLo) / (cliffHi - cliffLo)
                cliffBlend = tC * tC * (3 - 2 * tC)
            }

            // ── Road zone blend (cutout/dirt from carveData) ─────────────────
            let carveZoneBlend = 0  // 0 = general terrain; 1 = fully in cutout or dirt zone
            let isFill = false      // true = dirt foundation; false = engineered cutout

            if (carveData) {
                const blendW = carveData[i * 2]
                if (blendW > 1e-6) {
                    const gradeY = carveData[i * 2 + 1] * amp
                    const rawH   = heights[i] * amp
                    const delta  = gradeY - rawH  // positive = fill, negative = cut
                    isFill = delta > 0
                    carveZoneBlend = blendW
                }
            }

            // ── Color blend pipeline ─────────────────────────────────────────
            // Start with general terrain, then apply cliff blend, then apply road-zone blend.
            // Road zone blend uses cutout vs dirt depending on delta sign.
            // Order: road-zone overrides cliff (engineered face reads man-made, not wild — D-10).

            // Step 1: general terrain → cliff (natural slope)
            let r = GT_R + (CL_R - GT_R) * cliffBlend
            let g = GT_G + (CL_G - GT_G) * cliffBlend
            let b = GT_B + (CL_B - GT_B) * cliffBlend

            // Step 2: blend road zone on top (feathered by blendW — free from carve system)
            if (carveZoneBlend > 1e-6) {
                const zr = isFill ? DF_R : CO_R
                const zg = isFill ? DF_G : CO_G
                const zb = isFill ? DF_B : CO_B
                r = r + (zr - r) * carveZoneBlend
                g = g + (zg - g) * carveZoneBlend
                b = b + (zb - b) * carveZoneBlend
            }

            colorArr[idx3    ] = r
            colorArr[idx3 + 1] = g
            colorArr[idx3 + 2] = b
        }

        geom.setAttribute('color', new THREE.BufferAttribute(colorArr, 3))
    }

    /**
     * PERF-03 (Workstream B): write per-vertex normals from central differences over the carved
     * height GRID (the position attribute's Y values), replacing THREE's computeVertexNormals()
     * face-normal pass. ~65×65 reads + one normalize per vertex — far cheaper than building and
     * averaging face normals — and because it reads the POST-carve Y it preserves carve-aware shading
     * (the road trough / fill embankment still light correctly). One-sided differences at the 64-wide
     * chunk border: equivalent to today, since each chunk builds normals independently → chunk-seam
     * normals are already discontinuous. Convention matches analyticNormal/sampleNormal:
     * n = normalize(-dh/dx, 1, -dh/dz). Vertex layout is row-major i = zi*N + xi (xi→+x, zi→+z),
     * the same layout pos.setY uses, so grid-index differences map directly to world x/z.
     *
     * @param {THREE.BufferGeometry} geom — geometry whose position.Y holds the carved heights
     * @private
     */
    _computeGridNormals(geom) {
        const N    = GRID_SAMPLES
        const cell = CHUNK_SIZE / (N - 1)
        const pos  = geom.attributes.position
        let   nrm  = geom.attributes.normal
        if (!nrm || nrm.count !== N * N) {
            nrm = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3)
            geom.setAttribute('normal', nrm)
        }
        const inv2c = 1 / (2 * cell)
        for (let zi = 0; zi < N; zi++) {
            for (let xi = 0; xi < N; xi++) {
                const i = zi * N + xi
                let dhx, dhz
                if      (xi === 0)     dhx = (pos.getY(i + 1) - pos.getY(i))     / cell
                else if (xi === N - 1) dhx = (pos.getY(i)     - pos.getY(i - 1)) / cell
                else                   dhx = (pos.getY(i + 1) - pos.getY(i - 1)) * inv2c
                if      (zi === 0)     dhz = (pos.getY(i + N) - pos.getY(i))     / cell
                else if (zi === N - 1) dhz = (pos.getY(i)     - pos.getY(i - N)) / cell
                else                   dhz = (pos.getY(i + N) - pos.getY(i - N)) * inv2c
                const nx = -dhx, ny = 1, nz = -dhz
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
                nrm.setXYZ(i, nx / len, ny / len, nz / len)
            }
        }
        nrm.needsUpdate = true
    }

    /**
     * Build up to MAX_BUILDS_PER_FRAME chunk geometries from the pending FIFO queue.
     * Spreading builds across frames prevents frame spikes at chunk boundaries.
     * T-06-01: capped at 2 builds/frame.
     * @private
     */
    _flushPendingQueue(ccx = 0, ccz = 0) {
        const _tFlush = performance.now()  // TEMP perf probe (D-arc) — terrain mesh build cost
        const deadline = _tFlush + BUILD_MS_BUDGET   // PERF-02: time-slice the build (vs a fixed count)
        // PERF-02: nearest-first drain. Replies usually arrive nearest-first already (worker FIFO over
        // nearest-first dispatch), but sort defensively so a future worker pool / out-of-order arrival
        // still builds the truck's surroundings before the periphery.
        if (this._pendingQueue.length > 1) {
            this._pendingQueue.sort((a, b) =>
                ((a.cx - ccx) ** 2 + (a.cz - ccz) ** 2) - ((b.cx - ccx) ** 2 + (b.cz - ccz) ** 2))
        }
        let built = 0
        // Deadline checked AFTER the first build so at least one chunk always lands per frame.
        while (this._pendingQueue.length > 0 && built < MAX_BUILDS_PER_FRAME &&
               (built === 0 || performance.now() < deadline)) {
            const { key, cx, cz, heights } = this._pendingQueue.shift()
            built++

            const N = GRID_SAMPLES
            const S = CHUNK_SIZE

            // PlaneGeometry(S, S, N-1, N-1): creates a 65×65 vertex grid in XY plane
            // rotateX(-PI/2): rotates to XZ plane (Three.js Y-up)
            const geom = new THREE.PlaneGeometry(S, S, N - 1, N - 1)
            geom.rotateX(-Math.PI / 2)

            // Overwrite Y values from heights Float32Array (row-major: heights[zi*N+xi])
            // Apply terrainAmplitude to match sampleHeight so physics contact surface
            // matches visual geometry at all amplitude settings.
            // Phase 9 carve hook (SURF-05): blend road design grade using chunk.carveData.
            // CARVE SYNC: identical blend formula as analyticHeight, sampleHeight, Worker height loop.
            // Build carveData for this chunk now (main thread has road access; Worker received a
            // Transferable copy already consumed — we rebuild here for the _chunkMap reference path).
            let _pt = performance.now()
            const carveData = this._buildCarveTable(cx, cz, heights)   // PERF-03 #1: reuse the Worker's raw heights
            perfAdd('flush.buildCarveTable', performance.now() - _pt)
            const pos = geom.attributes.position
            const amp = this._params.terrainAmplitude ?? 1.0
            for (let i = 0; i < N * N; i++) {
                // heights[i] is pre-amplitude (raw from Worker, possibly with pre-amp carve from Worker).
                // Apply amp to get world-space height; then if carveData available on main thread,
                // verify and apply carve. The carveData[i*2+1] is gradeY_preamp — multiply by amp.
                // CARVE SYNC: raw + blendW*(gradeY-raw) — identical to analyticHeight and sampleHeight.
                const raw = heights[i] * amp
                if (carveData) {
                    const blendW = carveData[i * 2]
                    const gradeY = carveData[i * 2 + 1] * amp  // gradeY_preamp → world-space
                    pos.setY(i, raw + blendW * (gradeY - raw))
                } else {
                    pos.setY(i, raw)
                }
            }
            pos.needsUpdate = true
            _pt = performance.now()
            this._computeGridNormals(geom)  // PERF-03: grid-FD normals (rendering only; physics uses analyticNormal)
            perfAdd('flush.gridNormals', performance.now() - _pt)

            // ── 5-zone feathered vertex colors (D-09/D-10/D-11, Plan 09-05) ─────
            // Zones (no hard lines — all feathered, D-09):
            //   1. General terrain:    warm brown (0.72, 0.60, 0.47)
            //   2. Natural cliff:      slope-driven grey (0.60, 0.58, 0.55) via smoothstep(D-11)
            //   3. Engineered cutout:  uniform grey-tan (0.55, 0.50, 0.42) where delta<0, blendW>0 (D-10)
            //   4. Dirt foundation:    warm tan (0.65, 0.55, 0.38) where delta>0, blendW>0 (D-07)
            //   Asphalt lives on the road-mesh.js ribbon (not on terrain chunks).
            // Cutout/dirt zones are feathered by carveData blendW (free from the carve system).
            // Cliff is feathered by slope smoothstep(roadCliffSlopeLo, roadCliffSlopeHi, slope).
            _pt = performance.now()
            this._writeChunkVertexColors(geom, carveData, heights, amp)
            perfAdd('flush.writeVertexColors', performance.now() - _pt)

            const mesh = new THREE.Mesh(geom, this._material)
            // Center the chunk mesh at the chunk's world-space origin + half-size offset
            mesh.position.set(cx * S + S / 2, 0, cz * S + S / 2)
            mesh.receiveShadow = true

            // Idempotent build guard: if a stale entry already exists for this key
            // (defensive — normally prevented by the _pendingWorker reservation, but
            // guards against any future double-build path), dispose its geometry so it
            // cannot accumulate as an orphaned untracked mesh in the scene.
            // Do NOT dispose this._material — it is the shared MeshPhongMaterial.
            if (this._chunkMap.has(key)) {
                const stale = this._chunkMap.get(key)
                this._scene.remove(stale.mesh)
                stale.mesh.geometry.dispose()  // T-06-03: explicit GPU memory release
            }

            this._scene.add(mesh)

            // Store mesh, raw heights (heights used by sampleHeight for P7-2 test),
            // carveData (used by sampleHeight carve blend path), and builtRoadGeneration
            // (D1, plan 09-19: the road generation at which this chunk's carve was built;
            // _updateChunkRing re-carves chunks whose stored version ≠ roadGeneration()).
            this._chunkMap.set(key, {
                mesh, heights, carveData: carveData ?? null,
                builtRoadGeneration: this._roadSystem?.roadGeneration() ?? -1,
            })

            // Release the pending reservation only after _chunkMap is updated.
            // This is the single authoritative release point — the key is held in
            // _pendingWorker from the moment the worker is posted until here, so
            // _updateChunkRing's !_pendingWorker.has(key) guard stays effective
            // for the entire request→built window (closes the duplicate-request race).
            this._pendingWorker.delete(key)
        }
        // TEMP perf probe (D-arc): terrain mesh build is the suspected page-load cost (independent of
        // the road). Track cumulative build time + chunk count + remaining queue depth.
        if (built > 0) {
            this._flushMs = (this._flushMs || 0) + (performance.now() - _tFlush)
            this._flushN  = (this._flushN  || 0) + built
            console.log(`[terrain build] +${built} chunks this frame | total ${this._flushN} chunks, ${this._flushMs.toFixed(0)}ms cumulative | queue left ${this._pendingQueue.length}`)
        }
    }
}

// ── Module-scope noise utilities for analyticHeight/analyticNormal ─────────
// These are the main-thread equivalents of the Worker seed utilities.
// Named with _underscore prefix to distinguish from the worker-source function bodies above.
// They are used only by TerrainSystem.reinitWorker() to build the main-thread noise closures.

function _djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function _seedFor(worldSeed, domainTag, ...coords) {
  let h = _djb2(domainTag)
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}

function _mulberry32(seed) {
  return function () {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Simplex noise for main-thread analytic sampling (same algorithm as Worker copy above)
const _SQRT3 = Math.sqrt(3.0)
const _F2 = 0.5 * (_SQRT3 - 1.0)
const _G2 = (3.0 - _SQRT3) / 6.0
const _fastFloor = (x) => Math.floor(x) | 0
const _grad2 = new Float64Array([
    1, 1, -1, 1,  1, -1, -1, -1,
    1, 0, -1,  0,  1,  0, -1,  0,
    0, 1,  0, -1,  0,  1,  0, -1
])

function _buildPermutationTable(random) {
    const tableSize = 512
    const p = new Uint8Array(tableSize)
    for (let i = 0; i < tableSize / 2; i++) p[i] = i
    for (let i = 0; i < tableSize / 2 - 1; i++) {
        const r = i + ~~(random() * (256 - i))
        const aux = p[i]; p[i] = p[r]; p[r] = aux
    }
    for (let i = 256; i < tableSize; i++) p[i] = p[i - 256]
    return p
}

function _createNoise2D(random) {
    if (random === undefined) random = Math.random
    const perm = _buildPermutationTable(random)
    const permGrad2x = new Float64Array(perm).map(v => _grad2[(v % 12) * 2])
    const permGrad2y = new Float64Array(perm).map(v => _grad2[(v % 12) * 2 + 1])
    return function noise2D(x, y) {
        let n0 = 0, n1 = 0, n2 = 0
        const s = (x + y) * _F2
        const i = _fastFloor(x + s)
        const j = _fastFloor(y + s)
        const t = (i + j) * _G2
        const x0 = x - (i - t), y0 = y - (j - t)
        let i1, j1
        if (x0 > y0) { i1 = 1; j1 = 0 } else { i1 = 0; j1 = 1 }
        const x1 = x0 - i1 + _G2, y1 = y0 - j1 + _G2
        const x2 = x0 - 1.0 + 2.0 * _G2, y2 = y0 - 1.0 + 2.0 * _G2
        const ii = i & 255, jj = j & 255
        let t0 = 0.5 - x0*x0 - y0*y0
        if (t0 >= 0) { const gi0 = ii + perm[jj]; t0 *= t0; n0 = t0 * t0 * (permGrad2x[gi0] * x0 + permGrad2y[gi0] * y0) }
        let t1 = 0.5 - x1*x1 - y1*y1
        if (t1 >= 0) { const gi1 = ii + i1 + perm[jj + j1]; t1 *= t1; n1 = t1 * t1 * (permGrad2x[gi1] * x1 + permGrad2y[gi1] * y1) }
        let t2 = 0.5 - x2*x2 - y2*y2
        if (t2 >= 0) { const gi2 = ii + 1 + perm[jj + 1]; t2 *= t2; n2 = t2 * t2 * (permGrad2x[gi2] * x2 + permGrad2y[gi2] * y2) }
        return 70.0 * (n0 + n1 + n2)
    }
}

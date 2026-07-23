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
// QUAL-07: crownProfile no longer imported — the crown/camber fold moved into the one shared
// RoadSystem._carveCrossSection; the mesh resolves (signedLat, arcS) per vertex and calls it.
import { addWorldVaryings } from './terrain-detail.js'  // FEAT-05: procedural fbm mottle + bump
import { perfAdd } from './perf.js'  // TEMP perf triage (D-arc)

// ── Module constants ───────────────────────────────────────────────────────

export const CHUNK_SIZE    = 64   // world units (metres) per chunk side
export const GRID_SAMPLES  = 65   // vertices per side (64 cells), avoids seams
const        RING_RADIUS          = 2   // chunks in each direction → 5×5 = 25 total (DEFAULT; runtime-tunable via setRingRadius)
const        RING_KEEP_MARGIN     = 1   // PERF-02: keep (don't dispose) chunks within ring+this — hysteresis kills boundary dispose↔rebuild thrash
const        GEOM_POOL_MAX        = 32  // PERF-05: recycled chunk-geometry pool cap. Steady driving keeps it near-empty (build≈evict); it fills only transiently on a full-ring regen, where the cap bounds retained memory. Recycling kills the per-chunk PlaneGeometry alloc + the non-deterministic GC pause (~16% of dropped-frame time on slow GPUs).
const        MAX_BUILDS_PER_FRAME = 1   // PERF-05: one chunk build/recarve per frame. On slow GPUs a single chunk's carve already blows BUILD_MS_BUDGET, so building 2+ in a frame only deepens the hitch; capping at 1 bounds the worst frame and evens the physics-substep catch-up. Fast machines still fill the ring at 60 chunks/s. (BUILD_MS_BUDGET remains the adaptive limiter.)
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

// ── (routing removed — QUAL-08) ─────────────────────────────────────────────────────────────
// The road router (arcPrimitiveConnect + dubins + search scratch — the ROUTE SYNC region) moved to
// its OWN Worker, src/road-worker.js (ROAD_WORKER_SOURCE). Terrain is heightfield-only now so route
// jobs can never starve terrain generate (BUG-26). Do NOT reintroduce routing here.

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
        this._initialFillDone = false     // PERF-13: false → burst budgets until the first full ring lands
        this._chunkMap      = new Map()   // key → { mesh, heights, carveData? }
        this._pendingWorker = new Set()   // keys requested but not yet received
        this._pendingQueue  = []          // FIFO of received {key,cx,cz,heights} awaiting geometry build
        this._geomPool      = []          // PERF-05: recycled chunk BufferGeometry (65×65 XZ plane; only Y/normal/color change per chunk) — avoids per-chunk PlaneGeometry alloc + GC

        // Main-thread analytic noise closures (seeded same way as Worker — deterministic agreement)
        this._noiseCoarse   = null
        this._noiseFine     = null
        this._noiseRegional = null

        // Phase 9: Road carve reference — set via setRoadSystem() after both systems are constructed.
        // Kept null until set; all carve paths guard with this._roadSystem?.queryNearest check.
        this._roadSystem    = null

        // FEAT-18: stream channel carve hook — set via setWaterCarve() (main.js injects a pure
        // sampler over WaterSystem; terrain never imports water.js). null = no stream carve
        // (headless gates / pre-wiring) → every height path byte-unchanged.
        this._waterCarve    = null

        // Shared terrain material — one instance, reused across all chunks.
        // vertexColors:true enables the 5-zone feathered material system (D-09/D-10/D-11,
        // Plan 09-05). Per-vertex colors written in _flushPendingQueue.
        // Do NOT dispose this per-chunk (matches wheelMat shared pattern).
        this._material = new THREE.MeshPhongMaterial({ vertexColors: true })

        // FEAT-05: per-pixel procedural detail on top of the per-vertex biome colour — fbm
        // albedo mottle + a normal bump that ramps in with rockiness (steep OR above-treeline),
        // so granite reads bumpy and meadow reads smooth. Uniforms are live-tunable from the
        // debug panel; uDetailScale=0 is the PERF-05 kill-switch. Single shared material →
        // shader compiles once (not per chunk).
        this._terrainUniforms = {
            uDetailScale: { value: params.terrainDetailScale    ?? 1.0  },
            uNoiseScale:  { value: params.terrainNoiseScale      ?? 0.15 },
            uMottle:      { value: params.terrainMottleStrength  ?? 0.22 },
            uBump:        { value: params.terrainBumpStrength    ?? 0.7  },
            uCliffLo:     { value: params.roadCliffSlopeLo       ?? 0.3  },
            uCliffHi:     { value: params.roadCliffSlopeHi       ?? 0.6  },
            uTreeLo:      { value: params.terrainTreelineLo      ?? 60   },
            uTreeHi:      { value: params.terrainTreelineHi      ?? 105  },
            // PERF-07: baked prop-shadow atlas (toroidal clipmap; prop-shadow-bake.js). setShadowAtlas
            // wires the live texture + strength; uShadowStrength 0 (default / headless) skips the sample.
            uShadowAtlas:    { value: null },
            uShadowAtlasN:   { value: 16.0 },   // ATLAS_N — tiles per side
            uShadowTilePx:   { value: 128.0 },  // TILE_PX — texels per tile (for the in-tile blur)
            uShadowStrength: { value: 0.0 },
            // QUAL-18: baked shadows dissolve with view distance (LOD) so the far ring softens into
            // fog instead of ending on a line. View-space distance in metres.
            uShadowFadeStart:{ value: 150.0 },
            uShadowFadeEnd:  { value: 240.0 },
        }
        this._material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this._terrainUniforms)
            addWorldVaryings(shader)
            shader.fragmentShader = 'uniform float uDetailScale, uNoiseScale, uMottle, uBump, uCliffLo, uCliffHi, uTreeLo, uTreeHi;\n' +
                'uniform sampler2D uShadowAtlas; uniform float uShadowAtlasN, uShadowTilePx, uShadowStrength, uShadowFadeStart, uShadowFadeEnd;\n' + shader.fragmentShader
            // Albedo mottle (after vColor is folded into diffuseColor).
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                if (uDetailScale > 0.0) {
                    float td_n = tdFbm(vWorldPos.xz * uNoiseScale);
                    diffuseColor.rgb *= 1.0 + uMottle * uDetailScale * (td_n - 0.5);
                }
                // PERF-07: baked prop-shadow atlas. World XZ → toroidal tile (cx,cz mod N) → atlas UV
                // (a pure fn of position, so no per-chunk uniform). A 5-tap in-tile blur softens the
                // 0.5 m/texel silhouette; inTile is clamped to the tile interior so linear filtering
                // never bleeds across the (non-adjacent) neighbouring atlas tile.
                if (uShadowStrength > 0.0) {
                    vec2 sh_cf   = vWorldPos.xz / ${CHUNK_SIZE.toFixed(1)};
                    vec2 sh_tile = mod(floor(sh_cf), uShadowAtlasN);
                    vec2 sh_in   = fract(sh_cf);
                    float sh_htx = 0.5 / uShadowTilePx;                 // half-texel in tile-UV units
                    float sh_stp = 1.0 / uShadowTilePx;                 // one texel in tile-UV units
                    float sh_a = 0.0;
                    vec2 sh_off[5];
                    sh_off[0] = vec2(0.0);        sh_off[1] = vec2( sh_stp, 0.0); sh_off[2] = vec2(-sh_stp, 0.0);
                    sh_off[3] = vec2(0.0, sh_stp); sh_off[4] = vec2(0.0, -sh_stp);
                    for (int si = 0; si < 5; si++) {
                        vec2 sh_c = clamp(sh_in + sh_off[si], sh_htx, 1.0 - sh_htx);
                        sh_a += texture2D(uShadowAtlas, (sh_tile + sh_c) / uShadowAtlasN).r;   // atlas is R8 (PERF-21)
                    }
                    sh_a *= 0.2;                                        // average of the 5 taps
                    // QUAL-18: fade the baked shadow out with view distance (LOD dissolve).
                    float sh_fade = 1.0 - smoothstep(uShadowFadeStart, uShadowFadeEnd, length(vViewPosition));
                    diffuseColor.rgb *= 1.0 - sh_a * uShadowStrength * sh_fade;
                }`
            )
            // Normal bump (after the geometric normal is established). Rockiness = max(steepness,
            // altitude) so the bump is granite-only; flat low meadow stays smooth.
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                `#include <normal_fragment_begin>
                if (uDetailScale > 0.0) {
                    float td_slp = 1.0 - clamp(vWorldNrm.y, 0.0, 1.0);
                    float td_rock = max(smoothstep(uCliffLo, uCliffHi, td_slp),
                                        smoothstep(uTreeLo, uTreeHi, vWorldPos.y));
                    if (td_rock > 0.001) {
                        vec2 td_p = vWorldPos.xz * uNoiseScale;
                        float td_e = 0.6;
                        float td_h0 = tdFbm(td_p);
                        float td_hx = tdFbm(td_p + vec2(td_e, 0.0));
                        float td_hz = tdFbm(td_p + vec2(0.0, td_e));
                        vec3 td_wb = vec3(-(td_hx - td_h0), 0.0, -(td_hz - td_h0)) * (uBump * uDetailScale * td_rock);
                        normal = normalize(normal + mat3(viewMatrix) * td_wb);
                    }
                }`
            )
        }
        this._material.customProgramCacheKey = () => 'feat05-alpine-terrain'

        // PERF-19.2: spawn a small POOL of identical Blob workers (was a single worker). The
        // ready→ring-complete fill is bound by the SERIAL per-chunk `generate` cadence, not the
        // build budget (PERF-13), so fanning `generate` requests across N workers cuts that trickle
        // ~N×. All workers share the byte-identical WORKER_SOURCE (same seeded noise → identical
        // heightfields regardless of which worker serves a chunk), push into the SAME _pendingQueue
        // (replies carry the chunk key; _flushPendingQueue sorts nearest-first, so out-of-order
        // arrival across the pool is already handled), and are round-robined below. Pool size leaves
        // headroom for the main thread + the separate road worker; a 1-worker fallback keeps
        // low-core machines at parity with the old single-worker behaviour.
        // RESEARCH.md Pattern 3: classic worker avoids module-worker CORS restrictions.
        const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
        const poolSize = Math.max(1, Math.min(3, cores - 2))
        const blob    = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
        const blobURL = URL.createObjectURL(blob)
        this._workers = []
        this._rrCursor = 0            // round-robin dispatch cursor across the pool
        // Worker message handler: push received heightmaps into the shared FIFO queue.
        // The key deliberately stays reserved in _pendingWorker here — it is only
        // removed once _flushPendingQueue actually builds and tracks the chunk in
        // _chunkMap. This keeps the !_pendingWorker.has(key) guard in
        // _updateChunkRing effective for the full request→built window, preventing
        // the duplicate-request race that orphaned spawn-chunk meshes.
        const onMsg = (e) => {
            const { key, cx, cz, heights } = e.data
            this._pendingQueue.push({ key, cx, cz, heights })
        }
        for (let i = 0; i < poolSize; i++) {
            const w = new Worker(blobURL)
            w.onmessage = onMsg
            this._workers.push(w)
        }
        URL.revokeObjectURL(blobURL)  // safe to revoke after all Worker constructions

        // Initialize every Worker and the main-thread noise closures with the starting seed.
        this.reinitWorker(this._worldSeed, params)
    }

    /**
     * PERF-07: wire the baked prop-shadow atlas into the shared terrain material. `tex` is the
     * atlas texture (prop-shadow-bake.js), `atlasN`/`tilePx` its layout, `strength` the shadow
     * darkness (0 disables the sample). Called by main.js once the bake system exists; no-op paths
     * (headless, realtime-shadow mode) simply never call it, so uShadowStrength stays 0.
     */
    setShadowAtlas(tex, atlasN, tilePx, strength) {
        this._terrainUniforms.uShadowAtlas.value    = tex
        this._terrainUniforms.uShadowAtlasN.value   = atlasN
        this._terrainUniforms.uShadowTilePx.value   = tilePx
        this._terrainUniforms.uShadowStrength.value = strength
    }

    /** QUAL-18: baked-shadow view-distance dissolve bounds (m). Params: FLORA_PARAMS.shadows. */
    setShadowFade(start, end) {
        this._terrainUniforms.uShadowFadeStart.value = start
        this._terrainUniforms.uShadowFadeEnd.value   = Math.max(end, start + 1)
    }

    /**
     * Enable or disable terrain streaming.
     * When disabled, update() early-returns — _updateChunkRing and _flushPendingQueue do not run.
     * Existing chunk meshes remain in the scene (not disposed) so they can be restored instantly.
     * Called by the FEAT-31 testing lab: disable on enterLab, re-enable on exitLab.
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
     * Quality presets (main.js applyQuality).
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
     * Used by the FEAT-31 testing lab to hide terrain while keeping chunks in memory
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
        // Streaming paused (FEAT-31 testing lab) — no-op to prevent chunk ring changes while there.
        if (this._enabled === false) return
        const { cx: ccx, cz: ccz } = this._worldToChunk(carPos.x, carPos.z)
        let _pt = performance.now()
        this._updateChunkRing(ccx, ccz)
        perfAdd('terrain.updateChunkRing', performance.now() - _pt)   // TEMP: includes dispatch-path carve + re-carve pass
        _pt = performance.now()
        this._flushPendingQueue(ccx, ccz)
        perfAdd('terrain.flushPendingQueue', performance.now() - _pt) // TEMP: mesh build (geometry+carve+normals+colors)
        // PERF-13: initial-fill burst ends once the first full generated ring is built — from then
        // on the strict per-frame budgets own the frame (hitches only matter once the player can see).
        if (!this._initialFillDone) {
            const n = 2 * (this._ringRadius + this._warmMargin) + 1
            if (this._chunkMap.size >= n * n) this._initialFillDone = true
        }
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
        // PERF-19.2: reinit ALL pool workers so a seed/param change re-seeds every worker's noise.
        for (const w of this._workers) w.postMessage({ type: 'init', worldSeed, params: workerParams })
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
     * FEAT-18: attach the stream-channel carve sampler (main.js injects it over WaterSystem —
     * terrain.js never imports water.js, same decoupling as the road carve's setRoadSystem).
     * The carve is blended MAIN-THREAD ONLY (the Worker returns raw heights — see WORKER_SOURCE
     * "DOES NOT bake carve into heights"), so no WORKER_SOURCE mirror exists or is needed.
     *
     * THE height composition (CAUSEWAY, 2026-07-16 — MESH and PHYSICS are now IDENTICAL):
     *     hStream = raw + sw·(bedY − raw)          stream channel cuts RAW terrain
     *     surface = hStream + bw·(gradeY − hStream) road carve fills the cut back to gradeY,
     *                                               un-suppressed, in sampleHeight + the three
     *                                               chunk-Y writers (_composeCarvedY) AND
     *                                               analyticHeight (physics)
     * At a crossing the road embankment fills the channel to grade, forming a continuous causeway;
     * the stream is culverted under it (the water ribbon is suppressed over the crossing by BUG-33)
     * and resumes on the far side. The road RIBBON mesh seats on the filled terrain like everywhere
     * else — no floating deck, no raw channel-wall notch. Replaced the old (1−sw) notch-and-bridge
     * composition, which left the road embankment un-graded inside the channel (a dark vertical cut
     * at the deck edges).
     *
     * @param {object|null} waterCarve — { streamsNear(x0,z0,x1,z1)→streams,
     *   sampleAt(x,z,streams?,raw?)→{blendW,bedY} } (bedY + raw WORLD-space), or null to detach.
     */
    setWaterCarve(waterCarve) {
        this._waterCarve = waterCarve ?? null
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
            this._releaseChunkGeometry(chunk.mesh.geometry)  // PERF-05: recycle for the imminent re-stream
        }
        this._chunkMap.clear()
        this._initialFillDone = false   // PERF-13: a full regen is a load — burst the refill too

        // Clear pending state — Worker will process new generate requests after reinit
        this._pendingWorker.clear()
        this._pendingQueue.length = 0
    }

    /**
     * PERF-05: acquire a chunk geometry. The X/Z grid layout, UVs, and index buffer are identical for
     * every chunk (the chunk's world position lives on the mesh, not the geometry), so an evicted chunk's
     * geometry is reusable as-is — the build loop overwrites position.Y, then _computeGridNormals and
     * _writeChunkVertexColors overwrite the normal + color attributes. Pulling from the pool avoids a
     * fresh PlaneGeometry allocation + rotateX + the eventual GC pause every chunk (the non-deterministic
     * cost that surfaces as random hitches on slow hardware). Index + UV buffers are also never re-uploaded.
     * @private
     */
    _acquireChunkGeometry() {
        const pooled = this._geomPool.pop()
        if (pooled) return pooled
        const geom = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, GRID_SAMPLES - 1, GRID_SAMPLES - 1)
        geom.rotateX(-Math.PI / 2)  // XY plane → XZ (Three.js Y-up); baked once, never re-applied on reuse
        return geom
    }

    /**
     * PERF-05: return an evicted chunk geometry to the pool for reuse (replaces the former per-eviction
     * geometry.dispose()). Only geometries removed from the scene and about to leave _chunkMap are passed
     * here, so a live geometry can never enter the pool. Over the cap → dispose, so a full-ring regen
     * burst can't grow the pool without bound.
     * @private
     */
    _releaseChunkGeometry(geom) {
        if (this._geomPool.length < GEOM_POOL_MAX) this._geomPool.push(geom)
        else geom.dispose()
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

        // FEAT-18: stream channel carve of the RAW terrain (see setWaterCarve for the composition).
        let hs = raw
        if (this._waterCarve) {
            const s = this._waterCarve.sampleAt(wx, wz, undefined, raw)
            if (s.blendW > 1e-6) hs = raw + s.blendW * (s.bedY - raw)
        }

        // Phase 9 carve hook (SURF-04): blend road design grade into terrain height at on-road positions.
        // CARVE SYNC: identical blend formula as _flushPendingQueue, sampleHeight, and Worker height loop.
        // rawAmp is passed to _sampleCarveWorld to avoid re-calling analyticHeight (infinite recursion).
        // FEAT-18 CAUSEWAY: the road carve fills the stream-carved terrain back to gradeY, un-suppressed
        // — at a crossing the road core pulls the surface to gradeY (a filled embankment causeway; the
        // channel holds off-road, and the blend is smooth between). MESH == PHYSICS: the terrain mesh
        // (_composeCarvedY / sampleHeight) uses this same un-suppressed blend, so the ribbon deck seats
        // on the filled terrain and collision agrees with the rendered surface.
        if (this._roadSystem) {
            const c = this._roadSystem._sampleCarveWorld(wx, wz, raw, nrHint)
            if (c && c.blendW > 1e-6) return hs + c.blendW * (c.gradeY - hs)
        }
        return hs
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
        // FEAT-18 CAUSEWAY: composed with the per-chunk stream table exactly as the mesh Y write —
        // the road carve fills the channel back to gradeY un-suppressed (see _composeCarvedY), so
        // MESH == PHYSICS (analyticHeight) here.
        const i00  = (zi       * N +  xi   ) * 2
        const i10  = (zi       * N + (xi+1)) * 2
        const i01  = ((zi + 1) * N +  xi   ) * 2
        const i11  = ((zi + 1) * N + (xi+1)) * 2
        const cw00 = (1-fx) * (1-fz), cw10 = fx * (1-fz)
        const cw01 = (1-fx) * fz,     cw11 = fx * fz
        let hs = rawAmp
        if (chunk.streamData) {
            const sd = chunk.streamData
            const sw = sd[i00]*cw00 + sd[i10]*cw10 + sd[i01]*cw01 + sd[i11]*cw11
            if (sw > 1e-6) {
                const bedY = sd[i00+1]*cw00 + sd[i10+1]*cw10 + sd[i01+1]*cw01 + sd[i11+1]*cw11  // world-space
                hs = rawAmp + sw * (bedY - rawAmp)
            }
        }
        if (chunk.carveData) {
            const cd   = chunk.carveData
            const blendW = cd[i00]*cw00 + cd[i10]*cw10 + cd[i01]*cw01 + cd[i11]*cw11
            // gradeY_preamp → world-space by multiplying by amp (CARVE SYNC)
            const gradeY = (cd[i00+1]*cw00 + cd[i10+1]*cw10 + cd[i01+1]*cw01 + cd[i11+1]*cw11) * (this._params.terrainAmplitude ?? 1.0)
            if (blendW > 1e-6) return hs + blendW * (gradeY - hs)
        }
        return hs
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
                this._releaseChunkGeometry(chunk.mesh.geometry)  // PERF-05: recycle (was T-06-03 dispose)
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
                // FEAT-18: chunk.streamData is reused as-is — streams are a pure fn of (seed, water
                // params), independent of the road generation this pass reconciles.
                const amp = this._params.terrainAmplitude ?? 1.0
                const N   = GRID_SAMPLES
                const pos = chunk.mesh.geometry.attributes.position
                for (let i = 0; i < N * N; i++) {
                    pos.setY(i, this._composeCarvedY(chunk.heights[i] * amp, newCarveData, chunk.streamData, i, amp))
                }
                pos.needsUpdate = true
                chunk.mesh.geometry.computeBoundingSphere()  // PERF-05 pooling fix: keep frustum-cull bounds in sync with re-carved Y
                this._computeGridNormals(chunk.mesh.geometry)  // PERF-03: grid-FD normals
                this._writeChunkVertexColors(chunk.mesh.geometry, newCarveData, chunk.heights, amp, cx, cz)
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
        // PERF-19.2: scale the per-frame dispatch budget with the pool size so N workers stay fed
        // (an 8/frame cap would leave a 3-worker pool starved — dispatch, not generation, would
        // become the limiter). ×1 for the single-worker fallback = the old PERF-02 behaviour.
        const reqBudget = Math.min(missing.length, MAX_REQUESTS_PER_FRAME * this._workers.length)
        // PERF-19.2: round-robin the nearest-first requests across the worker pool so N chunks
        // generate concurrently. Nearest-first ordering is preserved in aggregate (adjacent chunks
        // land on different workers and finish in ~parallel); _flushPendingQueue re-sorts on drain.
        for (let i = 0; i < reqBudget; i++) {
            const { key, cx, cz } = missing[i]
            this._pendingWorker.add(key)
            const w = this._workers[this._rrCursor]
            this._rrCursor = (this._rrCursor + 1) % this._workers.length
            w.postMessage({ type: 'generate', cx, cz, key })
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
        for (const [key, chunk] of this._chunkMap) {
            const [cx, cz] = key.split(',').map(Number)
            const pos = chunk.mesh.geometry.attributes.position
            // Re-apply the road carve blend (raw + blendW*(gradeY-raw)) — same formula as
            // _flushPendingQueue / the re-carve path. Without it the mesh snaps back to RAW
            // height and buries the road trough (the ribbon stays at graded Y). CARVE SYNC.
            // FEAT-18 known debug-slider limitation: chunk.streamData bedY is WORLD-space, baked at
            // build amp — after an amplitude change the channel bed is stale until the chunk cycles
            // (water detection itself is amp-baked the same way; ponds drift too). Dev-slider only.
            const carveData = chunk.carveData
            for (let i = 0; i < N * N; i++) {
                pos.setY(i, this._composeCarvedY(chunk.heights[i] * amp, carveData, chunk.streamData, i, amp))
            }
            pos.needsUpdate = true
            chunk.mesh.geometry.computeBoundingSphere()  // PERF-05 pooling fix: keep frustum-cull bounds in sync with re-carved Y
            this._computeGridNormals(chunk.mesh.geometry)  // PERF-03: grid-FD normals
            // Re-write vertex colors after Y + normals are updated (D-09/D-10/D-11).
            this._writeChunkVertexColors(chunk.mesh.geometry, carveData, chunk.heights, amp, cx, cz)
        }
    }

    /**
     * FEAT-18: per-chunk stream-channel table — the stream analogue of _buildCarveTable.
     * Layout Float32Array [sw_0, bedY_0, sw_1, bedY_1, ...] (row-major, index = zi*N + xi).
     * bedY is WORLD-space (WaterSystem heights already include terrainAmplitude), unlike
     * carveData's pre-amp gradeY — so it is NOT amp-rescaled at blend time. null when no water
     * is wired or no stream channel touches the chunk (the common case — cheap bbox reject).
     * Pure fn of (cx, cz, waterSystem) → window-invariant. @private
     */
    _buildStreamTable(cx, cz, rawHeights) {
        if (!this._waterCarve) return null
        const N = GRID_SAMPLES, S = CHUNK_SIZE, cell = S / (N - 1)
        const ox = cx * S, oz = cz * S
        // m — must cover the widest channel + bank so any channel reaching into the chunk is
        // fetched. FEAT-24 widths are slope-scaled, so the bound comes from the injected hook
        // (main.js computes it from the water params); 16 covers the pre-FEAT-24 defaults.
        const PAD = Math.max(16, this._waterCarve.maxReach ? this._waterCarve.maxReach() : 0)
        const streams = this._waterCarve.streamsNear(ox - PAD, oz - PAD, ox + S + PAD, oz + S + PAD)
        if (!streams || streams.length === 0) return null
        const amp = this._params.terrainAmplitude ?? 1.0
        const table = new Float32Array(N * N * 2)
        let touched = false
        for (let zi = 0; zi < N; zi++) {
            for (let xi = 0; xi < N; xi++) {
                const idx = zi * N + xi
                // raw world-space height — the multi-channel min-composition tie-breaker.
                const s = this._waterCarve.sampleAt(ox + xi * cell, oz + zi * cell, streams, rawHeights[idx] * amp)
                if (s.blendW > 1e-6) {
                    table[idx * 2] = s.blendW; table[idx * 2 + 1] = s.bedY
                    touched = true
                }
            }
        }
        return touched ? table : null
    }

    /**
     * FEAT-18: THE mesh vertex-height composition (see setWaterCarve for the derivation) — shared
     * by the three mesh Y-write loops (_flushPendingQueue, recarve, rebuildAllChunks) so they can
     * never drift. raw + streamData bedY world-space; carveData gradeY pre-amp (×amp here). @private
     *
     * CAUSEWAY (2026-07-16): the road carve is composed over the stream-carved terrain WITHOUT
     * suppression — where a road core covers a channel it fills the cut back to gradeY, forming a
     * continuous embankment causeway (the stream is culverted under the crossing; the water ribbon
     * is suppressed there by BUG-33). This makes MESH == PHYSICS (analyticHeight uses the same
     * un-suppressed blend), so the road ribbon deck seats on the terrain instead of floating over a
     * raw channel-wall notch. Replaced the old (1−sw) notch-and-bridge composition.
     */
    _composeCarvedY(raw, carveData, streamData, i, amp) {
        let h = raw
        if (streamData) {
            const sw = streamData[i * 2]
            if (sw > 1e-6) h = raw + sw * (streamData[i * 2 + 1] - raw)
        }
        if (carveData) {
            const bw = carveData[i * 2]
            if (bw > 1e-6) h = h + bw * (carveData[i * 2 + 1] * amp - h)
        }
        return h
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
        const fillSlope       = p.roadFillSlope       ?? 3.0
        const cutSlope        = p.roadCutSlope        ?? 1.0
        // QUAL-07: crown/camber/clearance fold + fill/cut toe + blend now live in the ONE shared
        // RoadSystem._carveCrossSection (the same fn physics uses). The per-vertex loop only RESOLVES
        // (signedLat, arcS) and calls it; crownHeight/clearanceMargin/maxEmbankmentToe/carveHalfWidth are
        // read inside that fn. carveExtraWidth stays here for the conservative query-radius bound (maxExt).
        const carveExtraWidth   = p.roadCarveExtraWidth  ?? 3.0
        const maxEmbankmentToe  = p.roadMaxEmbankmentToe ?? 10

        // Maximum lateral extent to bother querying: ribbon + carve core + the capped embankment apron.
        // Mirrors the toe cap in _carveCrossSection (carveHalfWidth + maxEmbankmentToe) — the real bound
        // on how far the fill/cut bank spreads — so no carved vertex is ever missed by this early-reject.
        const maxExt = halfWidth + shoulderWidth + carveExtraWidth + maxEmbankmentToe + 4

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
        // QUAL-07: only `pts` is needed now — as a cheap per-vertex distance probe to SKIP the precise
        // resolve for vertices too far from any road. The actual surface comes from _resolveRoadSurface.
        const _ptC = performance.now()
        const { pts: samples } = this._roadSystem.collectChunkSplinePoints(chunkCX, chunkCZ, queryRadius)
        // QUAL-16: append deg-2 connector centreline points so the per-vertex distance SKIP below doesn't
        // drop a connector's outer flank (far from every RUN sample) → its fill/cut bench gets carved
        // (mesh == collision; no wall at the asphalt edge). Same stride-5 layout as the run samples.
        const _connSamples = this._roadSystem.collectConnectorSamples(chunkCX, chunkCZ, queryRadius)
        for (let k = 0; k < _connSamples.length; k++) samples.push(_connSamples[k])
        perfAdd('carve.collectSplines', performance.now() - _ptC)
        if (samples.length === 0) return null  // early-reject passed but no actual points sampled

        const table = new Float32Array(N * N * 2)
        let anyNonZero = false

        // QUAL-07: the carve-core half-width (= halfWidth + carveExtraWidth, capped at minRadius so
        // adjacent hairpin arms can't undermine each other) is computed inside _carveCrossSection now —
        // the per-vertex loop just resolves (signedLat, arcS) and calls it.

        // ── Per-vertex inner loop ────────────────────────────────────────────────
        // QUAL-07: each carve-band vertex resolves via _resolveRoadSurface (the physics resolver) + the
        // shared _carveCrossSection, so the mesh == the collision surface. The cheap squared-distance
        // probe over `samples` (no getPointAt — those were taken once in collectChunkSplinePoints) only
        // SKIPS far vertices so the heavier resolve runs on the carve band, not all 4225 vertices.
        const STRIDE = 5  // samples stride: [x, y, z, tx, tz]

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

                // PERF skip: cheap nearest-sample distance bounds the precise resolve to the carve band.
                // A vertex farther than the widest possible fill/cut toe from ANY road sample can't be
                // carved, so it never needs the (heavier) _resolveRoadSurface call below.
                let extBestD2 = Infinity
                for (let si = 0; si < samples.length; si += STRIDE) {
                    const sdx = samples[si] - wx, sdz = samples[si + 2] - wz
                    const d2 = sdx * sdx + sdz * sdz
                    if (d2 < extBestD2) extBestD2 = d2
                }
                if (extBestD2 > _maxToe2) { table[idx] = 0; table[idx + 1] = 0; continue }

                // Raw terrain height at this vertex (world-space, with amplitude).
                const rawPre = rawHeights ? rawHeights[zi * N + xi]
                    : height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params)
                const rawH   = rawPre * amp

                // ── QUAL-07: resolve EXACTLY like physics → mesh == collision BY CONSTRUCTION ──
                // The mesh resolves the road via the SAME _resolveRoadSurface physics uses (nearest
                // footprint-interior RUN, continuous polyline projection → run-global arcS + true
                // perpendicular signedLat, with the BUG-21 apex-sliver fallback), then the SAME
                // _carveCrossSection. So the rendered dirt surface IS the analyticHeight surface the truck
                // and props ride — no float, no floating rocks. Because physics is continuous+smooth, the
                // tessellation is too (this is NOT the hand-rolled point-to-segment projection that tore
                // the mesh — it's physics' own resolver). No mesh-only D3 max-floor: physics doesn't do it,
                // and _resolveRoadSurface already picks ONE run, so we match _sampleCarveWorld exactly.
                const nr = this._roadSystem._resolveRoadSurface(wx, wz)
                let cs = null
                if (nr) {
                    const dx = wx - nr.point.x, dz = wz - nr.point.z
                    const arcSEff   = (nr.arcS ?? 0) + dx * nr.tangent.x + dz * nr.tangent.z
                    const signedLat = dx * nr.tangent.z - dz * nr.tangent.x
                    cs = this._roadSystem._carveCrossSection(signedLat, arcSEff, nr.runKey ?? '', nr.camberSign ?? 1, rawH)
                }
                // QUAL-16: compose the deg-2 kink CONNECTOR's full cross-section over the run surface —
                // identical composition to _sampleCarveWorld (mesh == collision). Connector grade
                // dominates its core (one flat graded bench, no wall/sawtooth at the asphalt edge from the
                // cliff-y run-vs-run surface at a sharp kink) and feathers back to the run grade at its toe.
                const co = this._roadSystem._connectorCarve(wx, wz, rawH)
                if (co) {
                    const domGrade = cs ? co.gradeY * co.dom + cs.gradeY * (1 - co.dom) : co.gradeY
                    cs = { blendW: Math.max(cs ? cs.blendW : 0, co.blendW), gradeY: domGrade }
                }
                if (!cs) { table[idx] = 0; table[idx + 1] = 0; continue }

                table[idx]     = cs.blendW
                table[idx + 1] = amp > 0 ? cs.gradeY / amp : cs.gradeY
                if (cs.blendW > 1e-6) anyNonZero = true
            }
        }

        // TEMP perf probe (D-arc): log carve cost for this chunk — collect(spline sampling) vs the
        // per-vertex loop — plus how many road sample points fell in range (windier road = more).
        return anyNonZero ? table : null
    }

    /**
     * FEAT-05 meadows: per-vertex LOCAL-MEAN raw-terrain height — the low-pass landform used to
     * derive relative elevation (rel = rawHeight - localMean). Negative rel = a local basin where
     * water collects → meadow; rel ≈ 0 = a flat bench → fertile/forest.
     *
     * Seam-free + deterministic: sampled from rawHeightWorld() (a pure fn of world coords, carve-free
     * so road cuts never read as meadows) on a coarse grid that extends a HALO of `terrainRelRadius`
     * beyond the chunk, then box-blurred (separable) so in-chunk nodes always average a FULL window of
     * real neighbour terrain — no chunk-edge discontinuity. Cheap: ~(baseNodes+2·halo)² height evals
     * per chunk (≈360 at defaults), not one per vertex. Returns world-space metres (amp applied).
     *
     * @param {number} cx - chunk X index
     * @param {number} cz - chunk Z index
     * @returns {Float32Array} N·N local-mean heights (row-major i = zi·N + xi), world-space metres
     * @private
     */
    _localMeanGrid(cx, cz) {
        const N = GRID_SAMPLES, S = CHUNK_SIZE
        const cell   = S / (N - 1)
        const STRIDE = 8                                   // low-res grid: every 8th cell
        const R      = this._params.terrainRelRadius ?? 40 // m — neighbourhood radius
        const halo   = Math.max(1, Math.ceil(R / (cell * STRIDE)))
        const base   = Math.floor((N - 1) / STRIDE) + 1    // in-chunk low-res nodes per side
        const LN     = base + 2 * halo

        // Sample raw landform at each low-res node (incl. halo into neighbour chunks).
        const lr = new Float32Array(LN * LN)
        for (let jz = 0; jz < LN; jz++) {
            const wz = cz * S + (jz - halo) * STRIDE * cell
            for (let jx = 0; jx < LN; jx++) {
                const wx = cx * S + (jx - halo) * STRIDE * cell
                lr[jz * LN + jx] = this.rawHeightWorld(wx, wz)
            }
        }

        // Separable box-blur (kernel radius = halo) → local mean. Edge count-clamping only affects
        // halo-border nodes, which are never bilerp'd into the chunk interior.
        const tmp = new Float32Array(LN * LN)
        for (let z = 0; z < LN; z++) for (let x = 0; x < LN; x++) {
            let s = 0, c = 0
            for (let k = -halo; k <= halo; k++) { const xx = x + k; if (xx >= 0 && xx < LN) { s += lr[z * LN + xx]; c++ } }
            tmp[z * LN + x] = s / c
        }
        const blur = new Float32Array(LN * LN)
        for (let z = 0; z < LN; z++) for (let x = 0; x < LN; x++) {
            let s = 0, c = 0
            for (let k = -halo; k <= halo; k++) { const zz = z + k; if (zz >= 0 && zz < LN) { s += tmp[zz * LN + x]; c++ } }
            blur[z * LN + x] = s / c
        }

        // Bilerp the blurred low-res grid to per-vertex resolution.
        const out = new Float32Array(N * N)
        for (let zi = 0; zi < N; zi++) {
            const fz = zi / STRIDE + halo
            const iz = Math.min(LN - 2, Math.floor(fz)), tz = fz - iz
            for (let xi = 0; xi < N; xi++) {
                const fx = xi / STRIDE + halo
                const ix = Math.min(LN - 2, Math.floor(fx)), tx = fx - ix
                const m00 = blur[iz * LN + ix],       m10 = blur[iz * LN + ix + 1]
                const m01 = blur[(iz + 1) * LN + ix], m11 = blur[(iz + 1) * LN + ix + 1]
                out[zi * N + xi] = (m00 * (1 - tx) + m10 * tx) * (1 - tz)
                                 + (m01 * (1 - tx) + m11 * tx) * tz
            }
        }
        return out
    }

    /**
     * Write per-vertex colors for the 5-zone feathered material system (D-09/D-10/D-11).
     *
     * Called from _flushPendingQueue AFTER _computeGridNormals() so the normal attribute
     * is available for cliff slope detection (D-11).
     *
     * Zone priority (all blended/feathered — no hard lines, D-09):
     *   dirt → vegetation → granite rock  (vegetation = fertile↔meadow by relative elevation;
     *     rock driven by slope cliff band D-11 OR above-treeline altitude — FEAT-05)
     *   → Engineered cutout (driven by blendW where delta<0, D-10)
     *   → Dirt foundation  (driven by blendW where delta>0, D-07)
     * Cut/fill zones are further feathered by blendW (from carve system, free side effect).
     * Cutout color is distinct from natural cliff/rock color (D-10).
     *
     * @param {THREE.BufferGeometry} geom      — geometry with position + normal attributes
     * @param {Float32Array|null}    carveData — [blendW, gradeY_preamp, ...] per vertex (or null)
     * @param {Float32Array}         heights   — raw pre-amplitude heights per vertex
     * @param {number}               amp       — terrainAmplitude
     * @param {number}               cx        — chunk X index (for the meadow local-mean grid)
     * @param {number}               cz        — chunk Z index
     * @private
     */
    _writeChunkVertexColors(geom, carveData, heights, amp, cx, cz) {
        const N = GRID_SAMPLES

        // Cliff thresholds from params (D-11). Fall back to defaults if not in params.
        const cliffLo = this._params.roadCliffSlopeLo ?? 0.3
        const cliffHi = this._params.roadCliffSlopeHi ?? 0.6

        const nrmAttr = geom.attributes.normal
        const nVerts = N * N

        const colorArr = new Float32Array(nVerts * 3)

        // ── Alpine biome palette (FEAT-05) — decoded from params as LINEAR RGB (/255) ───
        // Replaces the old desert warm-brown set. Natural biome is dirt→grass→rock, selected
        // by slope + altitude (treeline); engineered cut/fill zones still override via carve.
        const p = this._params
        const _hx = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]
        const [DT_R, DT_G, DT_B] = _hx(p.terrainDirtColor   ?? 0x66543d) // dirt — the "general" mid
        const [GR_R, GR_G, GR_B] = _hx(p.terrainGrassColor  ?? 0x4c5e38) // FERTILE/forest green (flat bench)
        const [MD_R, MD_G, MD_B] = _hx(p.terrainMeadowColor ?? 0x5c7a30) // MEADOW green (local basins)
        const [RK_R, RK_G, RK_B] = _hx(p.terrainRockColor   ?? 0x808287) // granite (steep OR above treeline)
        const [CO_R, CO_G, CO_B] = _hx(p.terrainCutoutColor ?? 0x757066) // engineered cut face (D-10)
        const [DF_R, DF_G, DF_B] = _hx(p.terrainFillColor   ?? 0x6b5740) // dirt fill foundation (D-07)
        // Biome thresholds (slope = 1 - normal.y; altitude = raw terrain world Y).
        const grassSlopeMax = p.terrainGrassSlopeMax ?? 0.16
        const treeLo = p.terrainTreelineLo ?? 60
        const treeHi = p.terrainTreelineHi ?? 105
        // Relative-elevation thresholds (meadow). rel = worldH - localMean.
        const relLo = p.terrainMeadowRelLo ?? -12
        const relHi = p.terrainMeadowRelHi ?? -2
        const localMean = this._localMeanGrid(cx, cz)  // per-vertex low-pass landform (seam-free)
        const smooth = (e0, e1, x) => {
            if (x <= e0) return 0; if (x >= e1) return 1
            const t = (x - e0) / (e1 - e0); return t * t * (3 - 2 * t)
        }

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

            // ── Color blend pipeline (FEAT-05 alpine biome) ──────────────────
            // Natural biome: dirt (mid) → grass (flat + below treeline) → rock (steep OR
            // above treeline), then the engineered road cut/fill zone overrides on top.

            // Altitude (raw terrain, pre-carve — embankments don't change biome by their cut Y).
            const worldH = heights[i] * amp
            // Vegetated where it's both flat enough AND below treeline.
            const vegBlend = (1 - smooth(grassSlopeMax * 0.5, grassSlopeMax, slope))
                           * (1 - smooth(treeLo, treeHi, worldH))
            // Within vegetated ground, relative elevation splits MEADOW (local basin, water collects)
            // from FERTILE/forest (flat bench). rel below relLo → full meadow; at/above relHi → fertile.
            const rel = worldH - localMean[i]
            const meadowness = 1 - smooth(relLo, relHi, rel)
            const VG_R = GR_R + (MD_R - GR_R) * meadowness
            const VG_G = GR_G + (MD_G - GR_G) * meadowness
            const VG_B = GR_B + (MD_B - GR_B) * meadowness
            // Rock from steepness (the cliff band) OR from altitude (bare granite above treeline).
            const rockBlend = Math.max(cliffBlend, smooth(treeLo, treeHi, worldH))

            // Step 1: dirt → vegetation (fertile/meadow) → rock
            let r = DT_R + (VG_R - DT_R) * vegBlend
            let g = DT_G + (VG_G - DT_G) * vegBlend
            let b = DT_B + (VG_B - DT_B) * vegBlend
            r = r + (RK_R - r) * rockBlend
            g = g + (RK_G - g) * rockBlend
            b = b + (RK_B - b) * rockBlend

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
        // PERF-13: burst mode during the initial fill — nobody sees a hitch before the world exists,
        // so spend ~a frame per tick building (8 chunks / 16 ms vs the steady 1 / 3 ms) and cut the
        // ready→ring-complete trickle. Reverts to the strict PERF-02/05 budgets once the ring lands
        // (and re-arms on rebuildAllChunksFromWorker — a full regen is a load, not play).
        const burst = !this._initialFillDone
        const maxBuilds = burst ? 8 : MAX_BUILDS_PER_FRAME
        const deadline = performance.now() + (burst ? 16 : BUILD_MS_BUDGET)   // PERF-02: time-slice the build (vs a fixed count)
        // PERF-02: nearest-first drain. Replies usually arrive nearest-first already (worker FIFO over
        // nearest-first dispatch), but sort defensively so a future worker pool / out-of-order arrival
        // still builds the truck's surroundings before the periphery.
        if (this._pendingQueue.length > 1) {
            this._pendingQueue.sort((a, b) =>
                ((a.cx - ccx) ** 2 + (a.cz - ccz) ** 2) - ((b.cx - ccx) ** 2 + (b.cz - ccz) ** 2))
        }
        let built = 0
        // Deadline checked AFTER the first build so at least one chunk always lands per frame.
        while (this._pendingQueue.length > 0 && built < maxBuilds &&
               (built === 0 || performance.now() < deadline)) {
            const { key, cx, cz, heights } = this._pendingQueue.shift()
            built++

            const N = GRID_SAMPLES
            const S = CHUNK_SIZE

            // PERF-05: pooled 65×65 XZ-plane geometry (recycled across chunks; fresh only on pool miss).
            // The X/Z grid + UV + index are chunk-invariant — only Y (below), normals, and colors change.
            const geom = this._acquireChunkGeometry()

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
            // FEAT-18: stream-channel table (null when no channel touches the chunk — the common case).
            _pt = performance.now()
            const streamData = this._buildStreamTable(cx, cz, heights)
            perfAdd('flush.buildStreamTable', performance.now() - _pt)
            const pos = geom.attributes.position
            const amp = this._params.terrainAmplitude ?? 1.0
            for (let i = 0; i < N * N; i++) {
                // heights[i] is pre-amplitude (raw from Worker). Apply amp for world-space, then the
                // shared stream+road composition (_composeCarvedY — FEAT-18 + CARVE SYNC formula,
                // identical to analyticHeight's mesh branch and sampleHeight).
                pos.setY(i, this._composeCarvedY(heights[i] * amp, carveData, streamData, i, amp))
            }
            pos.needsUpdate = true
            // PERF-05 pooling fix: a recycled geometry carries the PREVIOUS chunk's cached
            // boundingSphere; Three.js only auto-computes it when null, so without this the new
            // (displaced-Y) chunk is frustum-culled against stale bounds → terrain holes that pop
            // in/out as the camera moves. Recompute from the freshly written positions.
            geom.computeBoundingSphere()
            _pt = performance.now()
            this._computeGridNormals(geom)  // PERF-03: grid-FD normals (rendering only; physics uses analyticNormal)
            perfAdd('flush.gridNormals', performance.now() - _pt)

            // ── Alpine biome vertex colors (FEAT-05; D-09/D-10/D-11 feathering kept) ─────
            // Natural biome (all feathered, D-09): dirt → vegetation → granite, where vegetation
            // splits into FERTILE/forest vs MEADOW by relative elevation (local basins read meadow).
            // Selected by slope (cliff band, D-11), absolute altitude (treeline), and rel = worldH -
            // localMean. Engineered cut/fill zones override via carveData blendW (D-10/D-07, free).
            // Asphalt lives on the road-mesh.js ribbon (not on terrain chunks).
            _pt = performance.now()
            this._writeChunkVertexColors(geom, carveData, heights, amp, cx, cz)
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
                this._releaseChunkGeometry(stale.mesh.geometry)  // PERF-05: recycle (was T-06-03 dispose)
            }

            this._scene.add(mesh)

            // Store mesh, raw heights (heights used by sampleHeight for P7-2 test),
            // carveData (used by sampleHeight carve blend path), and builtRoadGeneration
            // (D1, plan 09-19: the road generation at which this chunk's carve was built;
            // _updateChunkRing re-carves chunks whose stored version ≠ roadGeneration()).
            this._chunkMap.set(key, {
                mesh, heights, carveData: carveData ?? null,
                streamData: streamData ?? null,   // FEAT-18: stream table (sampleHeight + recarve/amp paths reuse it)
                builtRoadGeneration: this._roadSystem?.roadGeneration() ?? -1,
            })

            // Release the pending reservation only after _chunkMap is updated.
            // This is the single authoritative release point — the key is held in
            // _pendingWorker from the moment the worker is posted until here, so
            // _updateChunkRing's !_pendingWorker.has(key) guard stays effective
            // for the entire request→built window (closes the duplicate-request race).
            this._pendingWorker.delete(key)
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

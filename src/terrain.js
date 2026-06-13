/**
 * src/terrain.js — TerrainSystem for RangerSim
 *
 * Responsibilities:
 *  - Chunk ring management (5×5, RING_RADIUS=2, 64 m tiles)
 *  - Heightmap generation via Blob classic Web Worker (simplex noise inlined)
 *  - Frame-spread geometry build (MAX_BUILDS_PER_FRAME=2 per frame)
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
 *   T-06-01: MAX_BUILDS_PER_FRAME=2 caps main-thread geometry build cost per frame
 *   T-06-03: geometry.dispose() called in _updateChunkRing before chunkMap.delete
 *   T-07-03-SYNC: WORKER_SOURCE and terrain-worker.js edited in the same commit;
 *                 byte-equality check in Task 1 automated verify block.
 */

import * as THREE from 'three'
// Plan 09-11: crownProfile, potholeNoise, signedCurvature, roadQuality removed from
// terrain.js — crown/camber/pothole are no longer folded into the terrain mesh carve.
// They are retained in road.js _sampleCarveWorld (physics) and road-mesh.js sweepRibbon
// (visual ribbon). The terrain carve only produces the trough floor (below-margin target).

// ── Module constants ───────────────────────────────────────────────────────

export const CHUNK_SIZE    = 64   // world units (metres) per chunk side
export const GRID_SAMPLES  = 65   // vertices per side (64 cells), avoids seams
const        RING_RADIUS         = 2   // chunks in each direction → 5×5 = 25 total
const        MAX_BUILDS_PER_FRAME = 2  // T-06-01: cap geometry builds per frame

// ── Embedded worker source ─────────────────────────────────────────────────
// Content of src/terrain-worker.js embedded verbatim as a Blob classic worker.
// The worker context has no importmap — all code must be self-contained.
// SYNC RULE: every edit to WORKER_SOURCE must immediately be reflected in terrain-worker.js.
//            Both files are edited in the same commit (T-07-03-SYNC mitigation).

const WORKER_SOURCE = `
// src/terrain-worker.js — Classic Blob worker source for TerrainSystem
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
// SYNC RULE: any edit here must be reflected in road-carve.js AND terrain-worker.js.
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
//            Any edit here must be reflected in WORKER_SOURCE AND terrain-worker.js.

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
        this._updateChunkRing(ccx, ccz)
        this._flushPendingQueue()
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
     * Path B rebuild: dispose ALL built chunk meshes, clear all state, re-request ring
     * on the next update() call. Use after seed/coarse-param changes.
     * The _pendingWorker race-fix ordering is preserved: _pendingWorker is cleared here
     * so all keys are releasable, and the next update() will re-request the ring cleanly.
     */
    rebuildAllChunksFromWorker() {
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
     * Lives only on the main-thread TerrainSystem class — NOT mirrored in terrain-worker.js.
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

    analyticHeight(wx, wz) {
        // Precondition: reinitWorker (called synchronously in the constructor) must have built
        // the noise closures. Throw rather than silently returning 0 — a 0 here would seat the
        // truck at sea level inside the terrain and violate the "never returns 0" contract (WR-07).
        if (!this._noiseCoarse) throw new Error('analyticHeight called before reinitWorker — call-order bug')
        const raw = height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params) * (this._params.terrainAmplitude ?? 1.0)

        // Phase 9 carve hook (SURF-04): blend road design grade into terrain height at on-road positions.
        // CARVE SYNC: identical blend formula as _flushPendingQueue, sampleHeight, and Worker height loop.
        // rawAmp is passed to _sampleCarveWorld to avoid re-calling analyticHeight (infinite recursion).
        if (this._roadSystem) {
            const c = this._roadSystem._sampleCarveWorld(wx, wz, raw)
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
    analyticNormal(wx, wz) {
        const EPS = 0.5
        const hL  = this.analyticHeight(wx - EPS, wz)
        const hR  = this.analyticHeight(wx + EPS, wz)
        const hD  = this.analyticHeight(wx,       wz - EPS)
        const hU  = this.analyticHeight(wx,       wz + EPS)
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
        // Build the target set of keys needed in this ring
        const needed = new Set()
        for (let dx = -RING_RADIUS; dx <= RING_RADIUS; dx++) {
            for (let dz = -RING_RADIUS; dz <= RING_RADIUS; dz++) {
                needed.add(this._chunkKey(ccx + dx, ccz + dz))
            }
        }

        // T-06-03: Dispose chunks that fell out of the ring (geometry only, not material)
        for (const [key, chunk] of this._chunkMap) {
            if (!needed.has(key)) {
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
        // CARVE SYNC: carve never enters terrain-worker.js — it is a post-read main-thread blend.
        if (this._roadSystem) {
            const currentRoadGen = this._roadSystem.roadGeneration()
            let recarved = 0
            for (const [key, chunk] of this._chunkMap) {
                if (recarved >= MAX_BUILDS_PER_FRAME) break
                if (chunk.builtRoadGeneration === currentRoadGen) continue
                const [cx, cz] = key.split(',').map(Number)
                const newCarveData = this._buildCarveTable(cx, cz)
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
                chunk.mesh.geometry.computeVertexNormals()
                this._writeChunkVertexColors(chunk.mesh.geometry, newCarveData, chunk.heights, amp)
                // Stamp the new generation so we don't re-carve this chunk again until the next re-route.
                chunk.carveData = newCarveData ?? null
                chunk.builtRoadGeneration = currentRoadGen
                recarved++
            }
        }

        // Request new chunks not yet loaded or pending
        for (const key of needed) {
            if (!this._chunkMap.has(key) && !this._pendingWorker.has(key)) {
                const [cx, cz] = key.split(',').map(Number)
                this._pendingWorker.add(key)
                // Phase 9 (SURF-05 / T-09-02): build carve table on main thread (has road access) and
                // send it as a Transferable alongside the generate message.
                // A FRESH table is built per-chunk because postMessage transfers (consumes) the buffer.
                // If no road system is attached, send null carveTable — Worker applies no carve.
                const carveTable = this._buildCarveTable(cx, cz)
                if (carveTable) {
                    this._worker.postMessage({ type: 'generate', cx, cz, key, carveTable }, [carveTable.buffer])
                } else {
                    this._worker.postMessage({ type: 'generate', cx, cz, key })
                }
            }
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
            chunk.mesh.geometry.computeVertexNormals()
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
    _buildCarveTable(cx, cz) {
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
        // Plan 09-11: cheap below-margin carve params (crown/camber/pothole removed from terrain mesh;
        // they are retained in road.js _sampleCarveWorld for physics and road-mesh.js for the visual ribbon).
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
        const samples = this._roadSystem.collectChunkSplinePoints(chunkCX, chunkCZ, queryRadius)
        if (samples.length === 0) return null  // early-reject passed but no actual points sampled

        const table = new Float32Array(N * N * 2)
        let anyNonZero = false

        // Widened carve-core half-width: the blendW=1 zone extends beyond the ribbon by
        // carveExtraWidth so the flat trough bed is wider than the ribbon + skirt edge.
        const carveHalfWidth = halfWidth + carveExtraWidth

        // ── Per-vertex inner loop ────────────────────────────────────────────────
        // PERF CONTRACT (Plan 09-16 / SURF-04):
        //   • ZERO getPointAt calls   — splines already sampled above (collectChunkSplinePoints)
        //   • ZERO queryNearest calls — nearest point found by plain squared-distance search
        //   • ZERO arrow-closure allocations — no => expressions, no new objects per vertex
        // The single getPointAt site for this function is collectChunkSplinePoints (pre-loop above).
        for (let zi = 0; zi < N; zi++) {
            for (let xi = 0; xi < N; xi++) {
                const wx = originX + xi * cell
                const wz = originZ + zi * cell
                const idx = (zi * N + xi) * 2

                // Find the nearest pre-sampled road point by squared XZ distance.
                // Lateral sign is not needed: the carve blend is symmetric around the centerline.
                let bestD2 = Infinity
                let bi = 0
                for (let si = 0; si < samples.length; si += 3) {
                    const sdx = samples[si]     - wx
                    const sdz = samples[si + 2] - wz
                    const d2  = sdx * sdx + sdz * sdz
                    if (d2 < bestD2) { bestD2 = d2; bi = si }
                }

                const nx = samples[bi]
                const ny = samples[bi + 1]
                const nz = samples[bi + 2]

                // XZ distance to nearest road point — replaces the old signedLat magnitude.
                // (nx, nz unused beyond bestD2, kept for clarity / future tangent extension.)
                void nx; void nz
                const latDist = Math.sqrt(bestD2)

                // Raw terrain height at this vertex (world-space, with amplitude).
                const rawPre = height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params)
                const rawH   = rawPre * amp

                // ── Plan 09-16: Per-vertex carve target from nearest road point Y ──
                // ny is the actual spline Y at the nearest sample — accurate even mid-tile on
                // steep or curving sections (fixes SURF-05 road-below-ground).  The old 4-corner
                // bilinear approximation is replaced by this single nearest-point lookup.
                // clearanceMargin ensures the terrain floor sits BELOW the ribbon.
                let carveTargetY = ny - clearanceMargin

                // Fill cap: never raise terrain more than roadFillHeight above raw terrain.
                const delta = carveTargetY - rawH
                if (delta > fillHeight) carveTargetY = rawH + fillHeight

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

        return anyNonZero ? table : null
    }

    /**
     * Write per-vertex colors for the 5-zone feathered material system (D-09/D-10/D-11).
     *
     * Called from _flushPendingQueue AFTER computeVertexNormals() so the normal attribute
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
     * Build up to MAX_BUILDS_PER_FRAME chunk geometries from the pending FIFO queue.
     * Spreading builds across frames prevents frame spikes at chunk boundaries.
     * T-06-01: capped at 2 builds/frame.
     * @private
     */
    _flushPendingQueue() {
        let built = 0
        while (this._pendingQueue.length > 0 && built < MAX_BUILDS_PER_FRAME) {
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
            const carveData = this._buildCarveTable(cx, cz)
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
            geom.computeVertexNormals()  // for rendering only; physics uses analyticNormal()

            // ── 5-zone feathered vertex colors (D-09/D-10/D-11, Plan 09-05) ─────
            // Zones (no hard lines — all feathered, D-09):
            //   1. General terrain:    warm brown (0.72, 0.60, 0.47)
            //   2. Natural cliff:      slope-driven grey (0.60, 0.58, 0.55) via smoothstep(D-11)
            //   3. Engineered cutout:  uniform grey-tan (0.55, 0.50, 0.42) where delta<0, blendW>0 (D-10)
            //   4. Dirt foundation:    warm tan (0.65, 0.55, 0.38) where delta>0, blendW>0 (D-07)
            //   Asphalt lives on the road-mesh.js ribbon (not on terrain chunks).
            // Cutout/dirt zones are feathered by carveData blendW (free from the carve system).
            // Cliff is feathered by slope smoothstep(roadCliffSlopeLo, roadCliffSlopeHi, slope).
            this._writeChunkVertexColors(geom, carveData, heights, amp)

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

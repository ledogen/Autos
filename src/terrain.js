/**
 * src/terrain.js — TerrainSystem for RangerSim
 *
 * Responsibilities:
 *  - Chunk ring management (5×5, RING_RADIUS=2, 64 m tiles)
 *  - Heightmap generation via Blob classic Web Worker (simplex noise inlined)
 *  - Frame-spread geometry build (MAX_BUILDS_PER_FRAME=2 per frame)
 *  - O(1) bilinear height query + central-difference normal for physics pipeline
 *
 * Physics contract: sampleHeight returns 0 when chunk not loaded (safe = flat ground fallback).
 *   sampleHeight multiplies by params.terrainAmplitude so physics contact surface matches
 *   visual geometry at all amplitude settings.
 * Rendering contract: chunk meshes use shared MeshPhongMaterial — do NOT dispose per-chunk.
 *
 * Anti-patterns: do NOT use Raycaster for height queries (O(N²)); do NOT call
 *                computeVertexNormals from physics (rendering only).
 *
 * Threat mitigations:
 *   T-06-01: MAX_BUILDS_PER_FRAME=2 caps main-thread geometry build cost per frame
 *   T-06-03: geometry.dispose() called in _updateChunkRing before chunkMap.delete
 */

import * as THREE from 'three'

// ── Module constants ───────────────────────────────────────────────────────

export const CHUNK_SIZE    = 64   // world units (metres) per chunk side
export const GRID_SAMPLES  = 65   // vertices per side (64 cells), avoids seams
const        RING_RADIUS         = 2   // chunks in each direction → 5×5 = 25 total
const        MAX_BUILDS_PER_FRAME = 2  // T-06-01: cap geometry builds per frame

// ── Embedded worker source ─────────────────────────────────────────────────
// Content of src/terrain-worker.js embedded verbatim as a Blob classic worker.
// The worker context has no importmap — all code must be self-contained.
// See RESEARCH.md Pattern 3 for the Blob spawn architecture.

const WORKER_SOURCE = `
// src/terrain-worker.js — Classic Blob worker source for TerrainSystem
//
// Responsibilities:
//  - Receive {type:'generate', cx, cz, key} messages from the main thread
//  - Generate a 65x65 heightmap using 3-octave simplex FBM noise
//  - Post {key, cx, cz, heights} with heights.buffer as a transferable
//
// This file is NOT an ES6 module. It is read as a string by terrain.js and
// embedded in a Blob URL classic worker. Do NOT add import/export statements.
//
// Minimal simplex noise 2D implementation extracted from simplex-noise@4.0.3
// Original source: https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js
// MIT License -- Copyright (c) 2024 Jonas Wagner
// See RESEARCH.md Pattern 3 as authoritative architecture reference.

// Minimal simplex-noise@4.0.3 subset (2D only)

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

// Worker constants

const GRID_SAMPLES = 65
const CHUNK_SIZE   = 64
const CELL_SIZE    = CHUNK_SIZE / (GRID_SAMPLES - 1)

// Deterministic seed ensures seamless chunk boundaries (RESEARCH.md §Pitfall 3)
const noise2D = createNoise2D(function() { return 0.5; })

// Verify noise at worker startup (lattice-point origin = 0 in standard simplex)
const _originCheck = noise2D(0, 0)
if (isNaN(_originCheck)) {
    console.error('[terrain-worker] ERROR: noise2D(0,0) is NaN')
} else {
    console.log('[terrain-worker] ready. noise2D(0,0) =', _originCheck, '(expected 0)')
}

self.onmessage = function(e) {
    const { type, cx, cz, key } = e.data
    if (type !== 'generate') return

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
            const h =
                noise2D(wx * 0.02, wz * 0.02) * 4.0 +
                noise2D(wx * 0.06, wz * 0.06) * 1.5 +
                noise2D(wx * 0.15, wz * 0.15) * 0.5
            heights[zi * N + xi] = h
        }
    }

    self.postMessage({ key, cx, cz, heights }, [heights.buffer])
}
`

// ── TerrainSystem class ────────────────────────────────────────────────────

export class TerrainSystem {
    /**
     * Create and start the TerrainSystem.
     *
     * @param {THREE.Scene} scene - The Three.js scene to add chunk meshes to.
     * @param {object}      params - Vehicle params object; reads params.terrainAmplitude (default 1.0).
     *                               terrainAmplitude is a live multiplier: changing it affects both
     *                               future geometry builds and sampleHeight queries immediately.
     */
    constructor(scene, params) {
        this._scene   = scene
        this._params  = params

        // Private state
        this._chunkMap      = new Map()   // key → { mesh, heights }
        this._pendingWorker = new Set()   // keys requested but not yet received
        this._pendingQueue  = []          // FIFO of received {key,cx,cz,heights} awaiting geometry build

        // Shared terrain material — one instance, reused across all chunks
        // Do NOT dispose this per-chunk (matches wheelMat shared pattern)
        this._material = new THREE.MeshPhongMaterial({ color: 0xb89060 })

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
    }

    /**
     * Update chunk ring and build pending geometries. Call once per render frame,
     * OUTSIDE the physics fixed-step accumulator (render rate only).
     *
     * @param {{ x: number, y: number, z: number }} carPos - Current car world position.
     */
    update(carPos) {
        const { cx: ccx, cz: ccz } = this._worldToChunk(carPos.x, carPos.z)
        this._updateChunkRing(ccx, ccz)
        this._flushPendingQueue()
    }

    /**
     * Sample terrain height at a world-space (wx, wz) position.
     * Uses bilinear interpolation on the chunk's Float32Array heightmap.
     * Multiplies raw noise height by params.terrainAmplitude so the physics
     * contact surface always matches the visual geometry at any amplitude setting.
     *
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Height in metres. Returns 0 when chunk not yet loaded (safe flat-ground fallback).
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
        return raw * (this._params.terrainAmplitude ?? 1.0)
    }

    /**
     * Compute terrain surface normal at world-space (wx, wz) using central-difference
     * finite differences. Returns a plain {x, y, z} object (callers construct Vector3).
     * Always returns an upward-biased normal (y > 0).
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
     * See RESEARCH.md Pattern 2.
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

        // Request new chunks not yet loaded or pending
        for (const key of needed) {
            if (!this._chunkMap.has(key) && !this._pendingWorker.has(key)) {
                const [cx, cz] = key.split(',').map(Number)
                this._pendingWorker.add(key)
                this._worker.postMessage({ type: 'generate', cx, cz, key })
            }
        }
    }

    /**
     * Build up to MAX_BUILDS_PER_FRAME chunk geometries from the pending FIFO queue.
     * Spreading builds across frames prevents frame spikes at chunk boundaries.
     * T-06-01: capped at 2 builds/frame.
     * See RESEARCH.md Pattern 6.
     * @private
     */
    /**
     * Re-apply the current terrainAmplitude to all already-built chunk geometries.
     * Called when the debug amplitude slider changes so visuals update immediately
     * instead of waiting for chunks to cycle out of the ring.
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
        }
    }

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
            const pos = geom.attributes.position
            const amp = this._params.terrainAmplitude ?? 1.0
            for (let i = 0; i < N * N; i++) {
                pos.setY(i, heights[i] * amp)
            }
            pos.needsUpdate = true
            geom.computeVertexNormals()  // for rendering only; physics uses sampleNormal()

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

            // Store mesh and raw heights (heights used by sampleHeight for physics queries)
            this._chunkMap.set(key, { mesh, heights })

            // Release the pending reservation only after _chunkMap is updated.
            // This is the single authoritative release point — the key is held in
            // _pendingWorker from the moment the worker is posted until here, so
            // _updateChunkRing's !_pendingWorker.has(key) guard stays effective
            // for the entire request→built window (closes the duplicate-request race).
            this._pendingWorker.delete(key)
        }
    }
}

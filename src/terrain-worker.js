// src/terrain-worker.js — Classic Blob worker source for TerrainSystem
//
// Responsibilities:
//  - Receive {type:'generate', cx, cz, key} messages from the main thread
//  - Generate a 65×65 heightmap using 3-octave simplex FBM noise
//  - Post {key, cx, cz, heights} with heights.buffer as a transferable
//
// This file is NOT an ES6 module. It is read as a string by terrain.js and
// embedded in a Blob URL classic worker. Do NOT add import/export statements.
//
// Minimal simplex noise 2D implementation extracted from simplex-noise@4.0.3
// Original source: https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js
// MIT License — Copyright (c) 2024 Jonas Wagner
// See RESEARCH.md Pattern 3 as authoritative architecture reference.

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

// ── Worker constants ───────────────────────────────────────────────────────

const GRID_SAMPLES = 65   // vertices per chunk side (64 cells + 1)
const CHUNK_SIZE   = 64   // world units (metres) per chunk side
const CELL_SIZE    = CHUNK_SIZE / (GRID_SAMPLES - 1)  // 1.0 m per sample

// Deterministic seed: () => 0.5 produces a fixed permutation table so that
// chunk boundaries computed in separate worker messages are seamless.
// See RESEARCH.md §Pitfall 3 and §A6.
const noise2D = createNoise2D(function() { return 0.5; })

// Verify noise is valid at worker startup (lattice-point origin should be 0)
const _originCheck = noise2D(0, 0)
if (isNaN(_originCheck)) {
    console.error('[terrain-worker] ERROR: noise2D(0,0) is NaN — simplex init failed')
} else {
    console.log('[terrain-worker] ready. noise2D(0,0) =', _originCheck, '(expected 0)')
}

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = function(e) {
    const { type, cx, cz, key } = e.data
    if (type !== 'generate') return

    const N    = GRID_SAMPLES
    const S    = CHUNK_SIZE
    const cell = CELL_SIZE

    const heights  = new Float32Array(N * N)
    const originX  = cx * S
    const originZ  = cz * S

    // 3-octave FBM per RESEARCH.md Pattern 3:
    //   Octave 1: feature size ~50 m, amplitude 4.0 m  (major hills)
    //   Octave 2: feature size ~17 m, amplitude 1.5 m  (secondary terrain)
    //   Octave 3: feature size ~7 m,  amplitude 0.5 m  (surface roughness)
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

    // Transfer heights buffer to main thread (zero-copy transferable)
    self.postMessage({ key, cx, cz, heights }, [heights.buffer])
}

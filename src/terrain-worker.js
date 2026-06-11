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

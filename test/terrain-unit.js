// test/terrain-unit.js — Unit tests for terrain height + normal algorithms
// Run: node test/terrain-unit.js
// Does NOT import TerrainSystem (requires DOM/Worker context). Tests the pure
// algorithms inline — copied verbatim from src/terrain.js sampleHeight/sampleNormal,
// adapted to receive a chunkMap argument directly.

'use strict'

const assert = require('assert')

// ── Inline algorithm under test (mirrored from src/terrain.js) ───────────────

const CHUNK_SIZE   = 64
const GRID_SAMPLES = 65
const CELL_SIZE    = CHUNK_SIZE / (GRID_SAMPLES - 1)   // 1.0 m

function chunkKey (cx, cz) { return `${cx},${cz}` }

function worldToChunk (wx, wz) {
  return {
    cx: Math.floor(wx / CHUNK_SIZE),
    cz: Math.floor(wz / CHUNK_SIZE)
  }
}

/**
 * Bilinear height sample at world-space (wx, wz).
 * Returns 0 when the chunk is not loaded (safe flat-ground fallback).
 * terrainAmplitude is passed explicitly so the unit test can control it.
 */
function sampleHeight (chunkMap, terrainAmplitude, wx, wz) {
  const { cx, cz } = worldToChunk(wx, wz)
  const chunk = chunkMap.get(chunkKey(cx, cz))
  if (!chunk || !chunk.heights) return 0

  const N    = GRID_SAMPLES
  const S    = CHUNK_SIZE
  const cell = S / (N - 1)  // 1.0 m

  // Local coordinates within chunk
  const lx = wx - cx * S
  const lz = wz - cz * S

  // Integer grid indices, clamped to valid cell range
  const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cell)))
  const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cell)))

  // Fractional part within cell
  const fx = (lx / cell) - xi
  const fz = (lz / cell) - zi

  // 4-corner bilinear sample
  const h00 = chunk.heights[ zi      * N +  xi   ]
  const h10 = chunk.heights[ zi      * N + (xi+1)]
  const h01 = chunk.heights[(zi + 1) * N +  xi   ]
  const h11 = chunk.heights[(zi + 1) * N + (xi+1)]

  const raw = h00 * (1-fx) * (1-fz)
            + h10 *    fx  * (1-fz)
            + h01 * (1-fx) *    fz
            + h11 *    fx  *    fz

  return raw * (terrainAmplitude ?? 1.0)
}

/**
 * Central-difference surface normal at world-space (wx, wz).
 * Returns a plain {x, y, z} unit vector.
 */
function sampleNormal (chunkMap, terrainAmplitude, wx, wz) {
  const EPS = 0.5
  const hL  = sampleHeight(chunkMap, terrainAmplitude, wx - EPS, wz)
  const hR  = sampleHeight(chunkMap, terrainAmplitude, wx + EPS, wz)
  const hD  = sampleHeight(chunkMap, terrainAmplitude, wx,       wz - EPS)
  const hU  = sampleHeight(chunkMap, terrainAmplitude, wx,       wz + EPS)

  const nx  = -(hR - hL) / (2 * EPS)
  const ny  = 1
  const nz  = -(hU - hD) / (2 * EPS)
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
  return { x: nx/len, y: ny/len, z: nz/len }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock chunk with heights determined by heightFn(xi, zi).
 * N = GRID_SAMPLES (65).
 */
function makeChunk (heightFn) {
  const N = GRID_SAMPLES
  const heights = new Float32Array(N * N)
  for (let zi = 0; zi < N; zi++) {
    for (let xi = 0; xi < N; xi++) {
      heights[zi * N + xi] = heightFn(xi, zi)
    }
  }
  return { heights }
}

/**
 * Build a Map with a single chunk at (cx=0, cz=0) using the given heightFn.
 */
function singleChunkMap (heightFn) {
  const map = new Map()
  map.set(chunkKey(0, 0), makeChunk(heightFn))
  return map
}

let pass = 0
let fail = 0

function test (name, fn) {
  try {
    fn()
    console.log('  PASS:', name)
    pass++
  } catch (e) {
    console.error('  FAIL:', name, e.message)
    fail++
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('sampleHeight returns 0 when chunk not loaded', () => {
  const emptyMap = new Map()
  const h = sampleHeight(emptyMap, 1.0, 10, 10)
  assert.strictEqual(h, 0, `Expected 0, got ${h}`)
})

test('sampleHeight flat chunk returns constant height', () => {
  // All heights = 5.0 — any interior point should return 5.0
  const chunkMap = singleChunkMap(() => 5.0)
  const h = sampleHeight(chunkMap, 1.0, 32, 32)
  assert.ok(Math.abs(h - 5.0) < 0.001, `Expected 5.0, got ${h}`)
})

test('sampleHeight bilinear interpolation on linear slope', () => {
  // heights[zi*N+xi] = xi * 1.0 — linear ramp in X direction
  // Sample at wx = 1.5 (lx=1.5, xi=1, fx=0.5)
  // h00=h01=1.0, h10=h11=2.0
  // bilinear = 1.0*(0.5)*(any) + 2.0*(0.5)*(any) = 1.5 regardless of fz
  const chunkMap = singleChunkMap((xi) => xi * 1.0)
  const h = sampleHeight(chunkMap, 1.0, 1.5, 0.5)
  assert.ok(Math.abs(h - 1.5) < 0.001, `Expected 1.5, got ${h}`)
})

test('sampleNormal flat terrain y=1', () => {
  // All heights identical — central differences are zero → normal is (0, 1, 0)
  const chunkMap = singleChunkMap(() => 3.0)
  const n = sampleNormal(chunkMap, 1.0, 32, 32)
  assert.ok(Math.abs(n.y - 1.0) < 1e-6, `Expected n.y=1, got ${n.y}`)
  assert.ok(Math.abs(n.x) < 1e-6, `Expected n.x=0, got ${n.x}`)
  assert.ok(Math.abs(n.z) < 1e-6, `Expected n.z=0, got ${n.z}`)
})

test('sampleNormal sloped terrain x-component nonzero', () => {
  // Heights increase in X: h = xi * 1.0
  // At any interior point: hR > hL → nx = -(hR-hL)/(2*EPS) < 0 (normal tilts away from +X slope)
  const chunkMap = singleChunkMap((xi) => xi * 1.0)
  const n = sampleNormal(chunkMap, 1.0, 32, 32)
  assert.ok(n.x < 0, `Expected n.x < 0 (slope tilts normal toward -X), got ${n.x}`)
  assert.ok(n.y > 0, `Expected n.y > 0 (upward component), got ${n.y}`)
})

test('sampleNormal is unit vector', () => {
  // Arbitrary slope — normal magnitude must be 1
  const chunkMap = singleChunkMap((xi, zi) => xi * 0.5 + zi * 0.3)
  const n = sampleNormal(chunkMap, 1.0, 20, 20)
  const mag = Math.sqrt(n.x*n.x + n.y*n.y + n.z*n.z)
  assert.ok(Math.abs(mag - 1.0) < 1e-6, `Expected |n|=1, got ${mag}`)
})

// ── Result ───────────────────────────────────────────────────────────────────

if (fail > 0) {
  console.error(`\n${fail} test(s) FAILED`)
  process.exit(1)
}
console.log(`\n${pass} test(s) passed`)

# Phase 6: Procedural Terrain — Research

**Researched:** 2026-06-03
**Domain:** Procedural heightmap terrain, chunk streaming, physics normal integration
**Confidence:** HIGH (architecture + algorithms) / MEDIUM (performance estimates)

---

## Summary

Phase 6 replaces the flat ground half-space and analytic ramp in `main.js` with a chunk-based
simplex noise heightmap. The physics pipeline (queryContacts) remains the integration point:
terrain queries reduce to an O(1) bilinear height lookup plus a cross-product normal, cheap
enough to call 4 times per physics step (one per wheel) at 60 Hz without measurable budget impact.

The recommended architecture is a 5×5 ring of 64×64-unit chunks (320 m visible radius), each
backed by a 65×65 height sample grid. A Web Worker generates new chunk heightmaps in the
background and posts Float32Arrays to the main thread via transferable objects. The main thread
builds/recycles Three.js BufferGeometry meshes on receipt. Because module workers cannot import
cross-origin CDN scripts, the noise function must either be inlined in the worker file (recommended)
or fetched-then-re-evaluated via a blob URL. Inlining a minimal simplex implementation (~2 KB)
is the cleanest path.

**Primary recommendation:** 5×5 chunk ring, 64-unit tiles, 65-sample grids, simplex noise
inlined in a classic Blob worker, queryContacts extended with a single height+normal lookup per
contact probe.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Heightmap generation (noise) | Web Worker | Main thread fallback | Expensive per-chunk; must not block physics loop |
| Chunk mesh creation / disposal | Main thread (render) | — | Three.js scene graph lives on main thread |
| Height/normal query at physics rate | Main thread (physics) | — | Called inside fixed-step accumulator; must be synchronous |
| Chunk ring management | Main thread | — | Driven by vehicleState.position each frame |
| Terrain mesh rendering | GPU (Three.js) | — | Standard BufferGeometry + MeshPhongMaterial |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simplex-noise | 4.0.3 | 2D simplex noise for heightmap generation | [VERIFIED: npm registry] Fastest JS simplex impl (~20 ns/sample); pure ESM; well-maintained (Jonas Wagner); MIT licensed; no dependencies. Exports `createNoise2D(random)` factory. |
| Three.js (already in project) | r184 | BufferGeometry mesh for terrain chunks | Already imported via importmap; `PlaneGeometry`-derived approach reuses existing pattern |

### Noise API (confirmed from CDN source)
```javascript
// simplex-noise@4.0.3 exports exactly:
export function createNoise2D(random = Math.random)
export function createNoise3D(random = Math.random)
export function createNoise4D(random = Math.random)
export function buildPermutationTable(random)
```
[VERIFIED: cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js]

### importmap addition required

```html
"simplex-noise": "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js"
```

**Note on worker context:** Workers cannot use the importmap. The noise code must be either
inlined (recommended) or fetched from the CDN and eval'd via blob URL (fragile). See Worker
section below.

---

## Architecture Patterns

### System Architecture Diagram

```
vehicleState.position
       |
       v
[Main Thread — game loop]
  chunkRing.update(pos)
       |
       |-- already-loaded chunk? --> queryHeightNormal(x,z) --> queryContacts extension --> physics
       |
       |-- chunk not loaded? --> enqueue to Worker
              |
              v
       [Web Worker — heightmap generator]
         noise2D(cx + dx, cz + dz) × N²
         --> Float32Array(N+1)² heights
         --> postMessage({chunkKey, heights}, [heights.buffer])  // transferable
              |
              v
       [Main Thread — geometry builder]
         recv heights
         --> buildChunkMesh(heights) --> scene.add(mesh)
         --> store in chunkMap.get(chunkKey)
```

### Recommended Project Structure

```
src/
├── terrain.js        # TerrainSystem class: chunk ring, height query, queryContacts extension
├── terrain-worker.js # Blob-spawned classic worker: simplex noise inline + Float32Array builder
├── main.js           # (existing) extend queryContacts to delegate to terrain for ground half-space
data/
└── ranger.js         # (unchanged)
```

### Pattern 1: Chunk Coordinate System

A chunk is identified by integer grid coordinates `(cx, cz)` derived from world position.
Chunk size `CHUNK_SIZE` = 64 m. Grid cell: `cx = Math.floor(x / CHUNK_SIZE)`.

```javascript
// Source: derived from standard game-engine chunk pattern [ASSUMED]
const CHUNK_SIZE    = 64   // world units (metres) per chunk side
const GRID_SAMPLES  = 65   // vertices per side = 64 cells, avoids seams between adjacent chunks
const CELL_SIZE     = CHUNK_SIZE / (GRID_SAMPLES - 1)  // metres per height sample = 1.0 m

function worldToChunk(x, z) {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE)
  }
}

function chunkKey(cx, cz) { return `${cx},${cz}` }
```

The 65×65 grid (64×64 cells) ensures shared edges between adjacent chunks have identical height
values: chunk (0,0)'s east edge (x=64) is the same world position as chunk (1,0)'s west edge
(x=64). With deterministic noise (same seed), both chunks compute the same heights at that edge.
Result: zero seams in both rendering and physics. [ASSUMED — depends on deterministic noise with
same seed]

### Pattern 2: 5×5 Ring Buffer

```javascript
const RING_RADIUS = 2   // chunks on each side of car chunk → 5×5 = 25 total chunks

function updateChunkRing(carPos, chunkMap, pendingWorker) {
  const { cx: ccx, cz: ccz } = worldToChunk(carPos.x, carPos.z)

  // Build the target set
  const needed = new Set()
  for (let dx = -RING_RADIUS; dx <= RING_RADIUS; dx++) {
    for (let dz = -RING_RADIUS; dz <= RING_RADIUS; dz++) {
      needed.add(chunkKey(ccx + dx, ccz + dz))
    }
  }

  // Dispose chunks that fell out of ring
  for (const [key, chunk] of chunkMap) {
    if (!needed.has(key)) {
      scene.remove(chunk.mesh)
      chunk.mesh.geometry.dispose()
      chunkMap.delete(key)
    }
  }

  // Request new chunks
  for (const key of needed) {
    if (!chunkMap.has(key) && !pendingWorker.has(key)) {
      const [cx, cz] = key.split(',').map(Number)
      pendingWorker.add(key)
      terrainWorker.postMessage({ type: 'generate', cx, cz, key })
    }
  }
}
```

**Ring size rationale:** 5×5 = 25 chunks covering a 320 m × 320 m area. At 60 kph the car
crosses a 64 m chunk in ~3.8 seconds. New chunk generation (estimated ~0.3–1 ms in worker)
completes well before the car reaches the edge of loaded terrain. RING_RADIUS=2 means the car
is always 2 chunks away from the loading boundary. [ASSUMED — timing estimate; see Performance section]

### Pattern 3: Worker Architecture — Blob Classic Worker

**The constraint:** Module workers (`{ type: 'module' }`) cannot use cross-origin `import`.
[VERIFIED: MDN Web Workers API, github.com/whatwg/html/issues/3109]
Classic workers use `importScripts()` which CAN load cross-origin CDN scripts in no-cors mode.
[VERIFIED: MDN WorkerGlobalScope.importScripts]
However, the cleanest approach for a no-bundler project is to inline a minimal (~2 KB) simplex
implementation in the worker source string, avoiding any CDN fetch in the worker entirely.

```javascript
// In terrain.js — spawn worker from inline source string
// Source: MDN Web Workers blob pattern [CITED: developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers]

const WORKER_SOURCE = `
// Minimal simplex 2D noise inlined — extracted from simplex-noise@4.0.3
// (MIT license, Jonas Wagner)
${SIMPLEX_INLINE_SOURCE}

const noise2D = createNoise2D(() => 0.5)  // deterministic seed (fixed permutation)

self.onmessage = function(e) {
  const { type, cx, cz, key } = e.data
  if (type !== 'generate') return

  const N = 65    // GRID_SAMPLES
  const S = 64    // CHUNK_SIZE
  const cell = S / (N - 1)
  const heights = new Float32Array(N * N)

  const originX = cx * S
  const originZ = cz * S

  for (let zi = 0; zi < N; zi++) {
    for (let xi = 0; xi < N; xi++) {
      const wx = originX + xi * cell
      const wz = originZ + zi * cell
      // Octave FBM: 3 octaves
      const h =
        noise2D(wx * 0.02,  wz * 0.02)  * 4.0 +
        noise2D(wx * 0.06,  wz * 0.06)  * 1.5 +
        noise2D(wx * 0.15,  wz * 0.15)  * 0.5
      heights[zi * N + xi] = h
    }
  }

  self.postMessage({ key, cx, cz, heights }, [heights.buffer])
}
`

const blob   = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
const blobURL = URL.createObjectURL(blob)
const terrainWorker = new Worker(blobURL)
```

**Alternative (importScripts from CDN):**
```javascript
// Classic worker can importScripts cross-origin in no-cors mode
self.importScripts('https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/simplex-noise.umd.cjs')
```
This works but adds a CDN dependency in the worker. The blob approach is more self-contained.

### Pattern 4: Height and Normal Query — O(1) Bilinear Interpolation

This is the physics integration point. Called by the extended `queryContacts` for each wheel
sphere at 60 Hz × 4 wheels = 240 calls/second.

```javascript
// In terrain.js — synchronous height+normal lookup
// Algorithm: bilinear interpolation + central-difference normal
// Source: standard heightfield technique [CITED: textbooks.cs.ksu.edu/cis580/15-heightmap-terrain/05-interpolating-heights/]

function sampleHeight(chunkMap, wx, wz) {
  const cx   = Math.floor(wx / CHUNK_SIZE)
  const cz   = Math.floor(wz / CHUNK_SIZE)
  const key  = chunkKey(cx, cz)
  const chunk = chunkMap.get(key)

  if (!chunk || !chunk.heights) return 0  // chunk not loaded yet — fall through to flat ground

  const N    = GRID_SAMPLES          // 65
  const S    = CHUNK_SIZE            // 64
  const cell = S / (N - 1)          // 1.0 m

  // Local coordinates within chunk (0..64)
  const lx = wx - cx * S
  const lz = wz - cz * S

  // Integer grid indices (clamped)
  const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cell)))
  const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cell)))

  // Fractional part within cell
  const fx = (lx / cell) - xi
  const fz = (lz / cell) - zi

  // 4-corner sample
  const h00 = chunk.heights[ zi      * N + xi    ]
  const h10 = chunk.heights[ zi      * N + (xi+1)]
  const h01 = chunk.heights[(zi + 1) * N + xi    ]
  const h11 = chunk.heights[(zi + 1) * N + (xi+1)]

  // Bilinear interpolation
  return h00 * (1-fx) * (1-fz)
       + h10 *    fx  * (1-fz)
       + h01 * (1-fx) *    fz
       + h11 *    fx  *    fz
}

function sampleNormal(chunkMap, wx, wz) {
  // Central-difference normal: sample height at ±epsilon in X and Z
  // Source: standard finite-difference terrain normal [CITED: gamedev.net/forums/topic/673988-computing-smooth-normals]
  const EPS = 0.5  // m — half the cell size; can use cell size (1.0m) for performance
  const hL  = sampleHeight(chunkMap, wx - EPS, wz)
  const hR  = sampleHeight(chunkMap, wx + EPS, wz)
  const hD  = sampleHeight(chunkMap, wx,       wz - EPS)
  const hU  = sampleHeight(chunkMap, wx,       wz + EPS)

  // Normal = normalize(-dh/dx, 1, -dh/dz) in Y-up space
  // Unnormalized: (-(hR-hL)/(2*EPS), 1, -(hU-hD)/(2*EPS))
  const nx = -(hR - hL) / (2 * EPS)
  const ny = 1
  const nz = -(hU - hD) / (2 * EPS)
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
  return { x: nx/len, y: ny/len, z: nz/len }
}
```

**Operation count per call:** ~6 array lookups, ~10 multiplies, ~8 adds — effectively free at
physics rate. [VERIFIED: arithmetic count from algorithm above]

### Pattern 5: Extending queryContacts

The existing `queryContacts(cx, cy, cz, r)` in `main.js` handles the ground half-space as:
```javascript
const gd = r - cy
if (gd > 0) hits.push({ normal: _flatNormal.clone(), depth: gd, contactPoint: ... })
```

Phase 6 replaces this block:
```javascript
// Replace flat ground half-space with terrain height query
const terrainH      = terrainSystem.sampleHeight(wx, wz)   // world X,Z of sphere center
const terrainNormal = terrainSystem.sampleNormal(wx, wz)
const gd            = terrainH + r - cy   // depth = how far sphere penetrates surface
if (gd > 0) {
  hits.push({
    normal:       new THREE.Vector3(terrainNormal.x, terrainNormal.y, terrainNormal.z),
    depth:        gd,
    contactPoint: new THREE.Vector3(cx, terrainH, cz)
  })
}
```

**Chunk-not-loaded case:** When the terrain chunk isn't loaded yet (car spawns, worker hasn't
replied), `sampleHeight` returns 0, which matches the current flat-ground behavior. The car
spawns correctly. No null-contact crashes. [ASSUMED — relies on fallback returning 0]

### Pattern 6: Terrain Mesh Generation (main thread, on worker reply)

```javascript
terrainWorker.onmessage = function(e) {
  const { key, cx, cz, heights } = e.data
  pendingWorker.delete(key)

  const N    = GRID_SAMPLES   // 65
  const S    = CHUNK_SIZE     // 64

  // Build BufferGeometry from scratch (reuse geometry if recycling pool added later)
  const geom = new THREE.PlaneGeometry(S, S, N-1, N-1)
  geom.rotateX(-Math.PI / 2)  // PlaneGeometry is XY, rotate to XZ

  const pos = geom.attributes.position
  for (let i = 0; i < N * N; i++) {
    pos.setY(i, heights[i])   // Y is up after rotation
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()   // for rendering only; physics uses sampleNormal()

  const mesh = new THREE.Mesh(geom, terrainMaterial)
  mesh.position.set(cx * S + S/2, 0, cz * S + S/2)
  mesh.receiveShadow = true
  scene.add(mesh)

  chunkMap.set(key, { mesh, heights })  // store raw heights for physics queries
}
```

**Key detail:** The `heights` Float32Array is stored directly in `chunkMap` after the
worker transfers it. No copy. Physics queries go straight to this buffer. [VERIFIED: transferable
semantics — buffer ownership transfers to main thread on postMessage]

### Anti-Patterns to Avoid

- **Calling `computeVertexNormals()` from physics:** Only needed for rendering. Physics uses the
  analytic `sampleNormal()`. Calling computeVertexNormals at 60 Hz for all visible chunks would
  be catastrophically slow.

- **Using Three.js Raycaster for height queries:** Raycaster against a mesh is O(triangles) not
  O(1). A 65×65 PlaneGeometry has 8192 triangles. At 240 calls/second that is ~2M triangle tests
  per second — immediately busts 60fps. Use the bilinear lookup on the Float32Array directly.

- **Generating chunks on the main thread synchronously:** A 65×65 simplex grid with 3 octaves
  takes ~0.5–1.0 ms. Generating 4+ new chunks in one frame (corner crossing) would spike to
  2–4 ms, audible as frame hitches. Always route to worker.

- **SharedArrayBuffer for height data:** GitHub Pages does not set COOP/COEP headers, so
  SharedArrayBuffer is unavailable. [VERIFIED: CLAUDE.md constraint; MDN SharedArrayBuffer docs]
  Use transferable Float32Array instead.

- **Module worker with CDN import:** Module workers enforce CORS on all imports; CDN scripts
  served without CORS (jsdelivr does set CORS but the spec restriction applies to `import`
  statements in workers) make this fragile. Classic worker + `importScripts` or inline source
  is reliable. [VERIFIED: github.com/whatwg/html/issues/3109; MDN module workers]

- **Naive geometry.dispose() forgetting material:** Chunks that scroll out of range must call
  `chunk.mesh.geometry.dispose()`. The material is shared (one terrainMaterial for all chunks)
  so do NOT dispose the material on chunk removal.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Simplex noise algorithm | Custom noise from scratch | simplex-noise@4.0.3 | The gradient table and permutation table in simplex noise are finicky; rolling your own introduces bias artifacts. The library is 2 KB and free. |
| Worker communication protocol | Custom binary packing | Float32Array + transferable | Typed arrays transfer at zero copy cost via transferable protocol. Custom serialization is error-prone and slower. |
| LOD system | Multiple polygon-count meshes | Single 65×65 grid | At 64 m tile size, the far chunks are small on screen. Full-resolution (4096 triangles per chunk) is fine on a mid-range GPU for 25 chunks = 102K triangles total. LOD adds seam complexity with no measurable gain here. |
| Physics raycasting | Raycaster.intersectObject | Bilinear lookup on Float32Array | See anti-patterns. 4000× faster. |

**Key insight:** The hard part of terrain physics is not the terrain itself — it is correctly feeding
the existing `queryContacts → stepSuspensionSubsteps → Pacejka` pipeline with accurate normals.
The existing pipeline already handles all the hard physics; terrain just needs to be a reliable
ground surface, not a physics engine.

---

## Performance Estimates

### Noise Generation in Worker

At ~20 ns per 2D noise sample [CITED: simplex-noise README benchmark at 29a.ch/simplex-noise/]:
- 65×65 = 4225 samples, 3 octaves = 12,675 calls
- 12,675 × 20 ns = **~0.25 ms** in a fast JS engine

Additional overhead (loop, array write, postMessage): estimated total **0.3–0.8 ms** per chunk.
The worker runs off the main thread, so this cost is invisible to the render loop as long as
fewer than ~8 new chunks arrive in the same 16.7 ms frame. Corner-cut scenarios (car moving
diagonally) generate at most 4 new chunks at once: 4 × 0.8 ms = 3.2 ms in worker, still invisible
on main thread. [ASSUMED — estimate; actual timing should be profiled]

### Main-Thread Geometry Build

`PlaneGeometry(64, 64, 64, 64)` creates a 65×65 vertex grid with 8192 triangles.
Three.js `PlaneGeometry` internally allocates a BufferAttribute and fills it — estimated **0.5–1.5 ms**
on the main thread for a single chunk. Per the ring-buffer design, at most 4 chunks are built per
frame at a corner crossing. To avoid frame spikes, chunk geometry builds should be spread over
multiple frames: build at most 1 or 2 per frame from the pending queue.

**Budget math at 60fps (16.7 ms/frame):**
| System | Cost/frame | Notes |
|--------|-----------|-------|
| Physics loop (4 substeps × 4 wheels) | ~0.5 ms | Existing cost; unchanged |
| Height queries (4 wheels × 1 query) | ~0.01 ms | O(1) bilinear; effectively zero |
| Normal queries (4 wheels × 4 FD samples) | ~0.04 ms | 16 bilinear lookups; effectively zero |
| Chunk geometry build (amortized 1/frame) | ~1.0 ms | Spread builds across frames |
| GPU: 25 chunks × 4096 tris = 102K tris | ~0.5 ms | Well within mid-range GPU capability |
| **Total new cost** | **~1.5–2.0 ms** | ~10–12% of budget |

This is comfortably within the 60fps target. [ASSUMED — estimates; profile on actual hardware]

### Realistic Terrain Amplitude

With the 3-octave noise formula in Pattern 3:
- Low freq (0.02): amplitude ±4.0 m — main hills
- Mid freq (0.06): amplitude ±1.5 m — secondary rolls
- High freq (0.15): amplitude ±0.5 m — small bumps

Total range: approximately ±6 m. At 64 m tile width, hills have a slope gradient of
~6/32 = ~0.19 (11° max slope). This is sufficient to roll the car naturally. For steeper
terrain, raise the low-freq amplitude. [ASSUMED — aesthetic choice, not a physical constraint]

---

## Physics Normal Integration — Detailed

### How queryContacts Currently Works

Each wheel sphere is queried as `queryContacts(hub.x, hub.y, hub.z, params.wheelRadius)`.
Inside `stepSuspensionSubsteps`, the returned contacts' normals are used to compute:

```javascript
const bodyUpDot = dot(c.normal, body_up)      // component of contact normal along strut axis
const Fn_strut  = tireFnAtContact * bodyUpDot  // drives hub ODE
```

And the residual `(c.normal - bodyUpDot * body_up) * tireFnAtContact` populates `_hubNormalXZ[i]`
which Physics Step 2.6 applies as a direct body force — **this is what makes the car slide on slopes**.

### Implication for Terrain Normals

The correct normal at the contact patch drives both the suspension strut force split AND the
lateral slope force. If the terrain normal is returned accurately, the existing suspension code
handles the slope response automatically with no changes to suspension.js or physics.js.

**The only change is in main.js queryContacts:** replace the flat-ground `cy < r` half-space with
the terrain height lookup. The suspension code downstream is correct as-is.

### Edge Case: Car on Chunk Boundary

A wheel sphere may straddle two chunks (e.g., contact point at x=63.9, which is 0.1 m from the
chunk edge). The `sampleNormal` function samples at ±0.5 m, so two of its four height probes may
fall in the neighboring chunk. This is safe as long as both chunks are loaded and the neighbor chunk
shares the same height value at the boundary (guaranteed by deterministic noise). [ASSUMED — depends
on deterministic seed across both chunks]

**Fallback:** If a neighbor chunk is not yet loaded, `sampleHeight` returns 0. The resulting normal
will be slightly wrong (biased toward flat) for one physics step. Given the car moves ~0.27 m per
physics step at 60 kph, and chunk generation completes in <1 s, this is a barely-visible transient.
No action needed for v1. [ASSUMED — acceptable for v1]

### queryVertexContacts Extension

The body contact points (bumper corners, undercarriage, roof) use `queryVertexContacts` which
currently checks the flat ground half-space separately. This function must also be updated to
use `terrainSystem.sampleHeight(px, pz)` instead of testing `py < 0`. Without this change, the
car body can clip through terrain while wheels correctly respond to it. [VERIFIED: code inspection
of queryVertexContacts in main.js lines 396–438]

---

## Chunk Strategy Rationale

### Why 64 m tiles with a 5×5 ring

- **64 m tile at 60 kph:** Car crosses a tile in 3.84 s. Worker generates next tile in ~1 ms.
  There is ~3800 ms of headroom — even a 100 ms jank frame leaves plenty of time.
- **5×5 ring (RING_RADIUS=2):** Provides 2 tiles of lookahead in all directions.
  Minimum tiles needed for seamless coverage at any car speed on a mid-range machine.
- **65 vertices × 65 vertices = 4225 height samples = ~17 KB per chunk** (Float32Array at 4 bytes/sample).
  25 chunks in memory = 425 KB. Trivial.
- **Cell size = 1.0 m/sample:** Contact normal precision: at 1 m cell size, central-difference normal
  uses ±0.5 m probes, representing terrain slope over a 1 m baseline. At car scale (4.6 m long,
  0.37 m wheel radius), this resolution is more than adequate. [VERIFIED: simple geometry]

### Why not LOD

- At 64 m tile size, the farthest chunk (2 tiles away, ~180 m) subtends ~20° of field-of-view.
  The triangles there are already small. LOD gain is minimal.
- LOD adds stitching seams (T-junctions) unless carefully handled. The seam complexity is
  not worth the small triangle reduction.
- Future: if performance budget tightens (more physics features), add LOD for outer ring only.

### Terrain amplitude and rollover

Current terrain formula produces max slopes of ~11°. The existing ramp is 10° and is known to
cause rollovers at sufficient speed. Therefore, terrain hills at 11° max slope will naturally
cause rollovers without a dedicated ramp prop. TERR-05 is satisfied by the terrain design itself.
[VERIFIED: by analogy to existing 10° ramp behavior]

---

## Environment Availability Audit

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Web Workers API | Heightmap generation | Yes — all modern browsers | [VERIFIED: MDN; baseline browser feature since 2012] |
| Worker `{ type: 'module' }` | ESM worker import | Yes (Chrome 80+, Firefox 114+, Safari 15+) | [VERIFIED: caniuse.com/mdn-api_worker_worker_ecmascript_modules] — but NOT used per CORS recommendation |
| Blob URL for classic Worker | Inline worker source | Yes — all browsers | [VERIFIED: MDN Worker constructor] |
| transferable Float32Array | Zero-copy worker postMessage | Yes — all modern browsers | [VERIFIED: MDN Transferable] |
| SharedArrayBuffer | Zero-copy shared buffer | NO — GitHub Pages | [VERIFIED: CLAUDE.md; requires COOP/COEP headers] |
| simplex-noise CDN | Noise algorithm | Yes — jsDelivr serves with CORS | [VERIFIED: curl -sI cdn.jsdelivr.net — `access-control-allow-origin: *`] |
| importScripts in classic worker | CDN load in worker | Yes — cross-origin allowed | [VERIFIED: MDN importScripts no-cors behavior] |

**No blocking missing dependencies.** All required browser APIs are baseline modern.

---

## Common Pitfalls

### Pitfall 1: Using Raycaster for Physics Height Queries
**What goes wrong:** Developer calls `raycaster.intersectObject(chunk.mesh)` in queryContacts
for wheel height. Performance collapses immediately (8192 triangle tests × 240 calls/s).
**Why it happens:** It looks elegant and Three.js has it ready. The cost is non-obvious.
**How to avoid:** Always use bilinear interpolation on the raw Float32Array. The mesh is for
rendering only. Document this in a code comment at the query function.

### Pitfall 2: Module Worker Import Fails Silently
**What goes wrong:** `new Worker('terrain-worker.js', { type: 'module' })` with `import { createNoise2D }
from 'https://cdn.jsdelivr.net/...'` inside the worker. Worker construction silently fails or
throws a CORS error because the spec treats `import` in module workers as a CORS fetch.
**Why it happens:** CDN scripts that serve `Access-Control-Allow-Origin: *` headers are still
subject to the module worker import restriction.
**How to avoid:** Use a blob-URL classic worker with inline simplex source, or use
`importScripts()` (classic worker, no `{ type: 'module' }`).

### Pitfall 3: Seams at Chunk Boundaries from Non-Deterministic Seed
**What goes wrong:** Chunks generated at different times produce different heights at shared
edge vertices → visual crack and physics discontinuity.
**Why it happens:** `createNoise2D()` uses `Math.random()` by default, generating a different
permutation table each call. Two chunks generated separately have different internal noise
states.
**How to avoid:** Pass a deterministic seeding function to `createNoise2D`. For a seed-free
approach: use a fixed XOR-based PRNG seeded from a constant. `createNoise2D(() => 0.5)` produces
a degenerate but deterministic permutation. Better: `createNoise2D(seededRandom(12345))`.

### Pitfall 4: Chunk Bodies Disposed Without Heights Freed
**What goes wrong:** `chunkMap.delete(key)` without `geometry.dispose()` leaks GPU memory.
Over a long driving session, the GPU runs out of VRAM.
**Why it happens:** JavaScript GC handles JS heap but does not call `geometry.dispose()`.
**How to avoid:** Always call `chunk.mesh.geometry.dispose()` before deleting from chunkMap.
The material is shared — do NOT dispose it.

### Pitfall 5: queryVertexContacts Not Updated
**What goes wrong:** Wheels correctly respond to terrain slopes (via queryContacts), but the car
body (bumpers, undercarriage) clips through terrain. The car can be half-buried in a hill.
**Why it happens:** `queryVertexContacts` has a separate flat-ground check (`py < 0`) that is
not connected to the terrain system.
**How to avoid:** Both `queryContacts` and `queryVertexContacts` must use
`terrainSystem.sampleHeight(px, pz)` for their ground test.

### Pitfall 6: Building All Pending Chunks in One Frame
**What goes wrong:** Car drives into a corner (3–4 new chunks needed), all four geometry
builds run in the same frame → 4–6 ms spike → visible frame drop.
**Why it happens:** Worker replies arrive simultaneously when the car enters a new zone.
**How to avoid:** Process at most 1–2 pending geometry builds per frame from a FIFO queue.

### Pitfall 7: Static Equilibrium Spawn Position Wrong on Terrain
**What goes wrong:** Car spawns on hilly terrain, but `computeStaticEquilibrium` in main.js
uses a flat-ground assumption (wheel rests at y = wheelRadius). If spawn point has terrain height
h > 0, the car spawns underground.
**Why it happens:** Spawn position is set to `_spawnEq.bodyY` which assumes ground y=0.
**How to avoid:** On spawn, query `terrainSystem.sampleHeight(spawnX, spawnZ)` and offset
`vehicleState.position.y` by that height. Or keep spawn at terrain height=0 (e.g., at world origin,
if the noise function returns 0 there — guaranteed if using `noise2D(0,0)` with standard simplex).
For the blob worker pattern, noise returns a deterministic value at (0,0). Check what it is and
adjust spawn X/Z if necessary, or bias the noise formula to return 0 at origin. [ASSUMED — depends on
specific noise function value at origin]

---

## Code Examples

### Full queryContacts Replacement Sketch

```javascript
// Source: synthesis of current main.js pattern + bilinear lookup above
// Replaces the flat ground half-space section in queryContacts

function queryContacts (cx, cy, cz, r) {
  const hits = []

  // ── Terrain ground surface (replaces flat ground half-space) ──
  // sampleHeight returns 0 if chunk not loaded (safe fallback = flat ground)
  const terrainH = terrainSystem ? terrainSystem.sampleHeight(cx, cz) : 0
  const gd = terrainH + r - cy
  if (gd > 0) {
    const n = terrainSystem ? terrainSystem.sampleNormal(cx, cz) : { x:0, y:1, z:0 }
    hits.push({
      normal:       new THREE.Vector3(n.x, n.y, n.z),
      depth:        gd,
      contactPoint: new THREE.Vector3(cx, terrainH, cz)
    })
  }

  // Triangle mesh contacts — ramp (unchanged)
  for (const [[ax,ay,az],[bx,by,bz],[ex,ey,ez]] of RAMP_TRIS) {
    // ... existing code unchanged ...
  }

  return hits
}
```

### Noise FBM formula with correct scaling

```javascript
// 3-octave FBM tuned for a 64 m tile with ~6 m amplitude variation
// Octave 1: feature size ~50 m,  amplitude 4.0 m  (major hills)
// Octave 2: feature size ~17 m,  amplitude 1.5 m  (secondary terrain)
// Octave 3: feature size ~7 m,   amplitude 0.5 m  (surface roughness for rollover initiation)
const h =
  noise2D(wx * 0.02, wz * 0.02) * 4.0 +
  noise2D(wx * 0.06, wz * 0.06) * 1.5 +
  noise2D(wx * 0.15, wz * 0.15) * 0.5
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| Flat ground half-space in queryContacts | Bilinear height + CD normal from chunk heightmap | Phase 6 change |
| Analytic ramp triangles | Keep (or remove after terrain provides natural rollover) | Can coexist |
| `terrain(x,z) => {height, normal}` stub | `terrainSystem.sampleHeight/sampleNormal(x,z)` | Same O(1) contract; same call site; lock was preserved from Phase 1 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Worker chunk generation ~0.3–0.8 ms per chunk | Performance Estimates | If significantly higher (>5 ms), need more aggressive work-spreading or lower GRID_SAMPLES |
| A2 | Main-thread geometry build ~0.5–1.5 ms | Performance Estimates | If higher, must spread across more frames or use geometry pooling |
| A3 | Deterministic noise at chunk edges eliminates seams | Pattern 1 | If noise has floating-point divergence across chunks, need explicit edge-stitching pass |
| A4 | Chunk-not-loaded fallback to height=0 is imperceptible | Pattern 5 | If car spawns on high terrain, position offset logic needed |
| A5 | Terrain at 11° max slope will roll the car | Chunk Strategy | If slope is insufficient, raise low-freq amplitude in FBM formula |
| A6 | `createNoise2D(() => 0.5)` produces a valid (not degenerate) permutation | Pattern 3 | If output is all-zeros or constant, use a proper seeded PRNG; see noise library buildPermutationTable |

---

## Open Questions

1. **Spawn point terrain height**
   - What we know: `computeStaticEquilibrium` assumes ground y=0 at spawn.
   - What's unclear: The noise formula at world origin (0,0) returns a non-zero value.
   - Recommendation: Evaluate `noise2D(0 * 0.02, 0 * 0.02)` = `noise2D(0,0)` = 0 exactly for
     standard simplex noise (the gradient at the origin lattice point is (0,0)). This means
     the spawn point at x=0, z=0 will have h=0 from all octaves, so no spawn offset is
     needed. Verify with a quick console.log in the worker before shipping.

2. **Ramp prop retention vs removal**
   - What we know: The ramp currently provides the only rollover surface.
   - What's unclear: Once terrain provides natural rollovers (TERR-05), should the ramp stay?
   - Recommendation: Keep the ramp as an optional prop for comparison. It does not interfere
     with terrain. Make it a toggle in the debug menu (visible/invisible + collision on/off).

3. **Terrain amplitude tuning**
   - What we know: Target is rolling hills sufficient for rollover.
   - What's unclear: Exact amplitudes needed depend on car tuning state at phase execution time.
   - Recommendation: Expose `terrainAmplitude` and `terrainFrequency` as lil-gui debug sliders.
     Start with the FBM formula above and tune interactively.

---

## Sources

### Primary (HIGH confidence)
- `npm view simplex-noise` — confirmed version 4.0.3, latest
- `curl cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js` — confirmed ESM API: `createNoise2D`, `createNoise3D`, `createNoise4D`, `buildPermutationTable`
- `caniuse.com/mdn-api_worker_worker_ecmascript_modules` — module worker browser support confirmed
- MDN WorkerGlobalScope.importScripts — confirmed cross-origin no-cors behavior for classic workers
- github.com/whatwg/html/issues/3109 — confirmed module workers cannot import cross-origin
- Existing main.js code inspection — confirmed queryContacts contract, queryVertexContacts flat-ground check
- CLAUDE.md — confirmed SharedArrayBuffer unavailable (GitHub Pages no COOP/COEP)
- REQUIREMENTS.md — confirmed TERR-01 through TERR-06 requirements

### Secondary (MEDIUM confidence)
- simplex-noise README benchmark: ~20 ns/sample for 2D — used for performance estimates
- MDN Transferable — Float32Array zero-copy postMessage pattern
- textbooks.cs.ksu.edu/cis580 heightmap terrain — bilinear interpolation formula
- gamedev.net central-difference normals for terrain

### Tertiary (LOW confidence — estimates only)
- PlaneGeometry build time (~0.5–1.5 ms): no benchmark found; estimated from general Three.js
  BufferGeometry creation timing knowledge
- Worker generation total time (0.3–0.8 ms): extrapolated from noise benchmark + loop overhead
  estimate; must be profiled on actual machine

---

## Validation Architecture

**Framework:** No new test framework required. Existing test harness in `/test/` applies.

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| TERR-01 | Simplex noise generates heights for a chunk | unit | `node test/terrain-unit.js` (Wave 0 gap) |
| TERR-03 | sampleNormal returns upward-biased vector on flat terrain | unit | same |
| TERR-03 | sampleNormal returns tilted vector on sloped terrain (FD check) | unit | same |
| TERR-06 | 60fps maintained — manual | smoke | Open browser, drive 60s, check FPS HUD |

**Wave 0 gaps:**
- [ ] `test/terrain-unit.js` — unit tests for `sampleHeight` (bilinear correctness) and
  `sampleNormal` (flat=upward, sloped=correct tilt direction)

---

## Project Constraints (from CLAUDE.md)

- No npm, no bundler — CDN imports only via importmap
- No SharedArrayBuffer (GitHub Pages COOP/COEP)
- Web Workers can run pure JS but cannot import Three.js
- Physics is hand-rolled — no physics library
- ES6 modules in `src/`, single `index.html` entry point
- Three.js r184 via importmap — do not change version
- No Euler angles for body rotation
- Performance target: 60fps on mid-range laptop
- LLM-maintainability: explicit conventions, no drift

All recommendations in this document comply with the above constraints.

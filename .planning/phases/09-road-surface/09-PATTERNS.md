# Phase 9: Road Surface - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/road-carve.js` | utility (pure-fn module) | transform | `src/terrain.js` WORKER_SOURCE height fn + seed utility copies | exact (same Worker-safe no-import discipline) |
| `src/road-mesh.js` | service (mesh builder) | batch/transform | `src/road.js` `_buildDebugLine` + `_sliceNetwork` tile-building | role-match |
| `src/terrain.js` | service (extend) | batch + request-response | self — `analyticHeight`, `sampleHeight`, `_flushPendingQueue`, `_updateChunkRing` | exact |
| `src/terrain-worker.js` | config (byte-mirror) | batch | self — Worker `height()` loop + message handler | exact |
| `src/road.js` | service (extend) | event-driven streaming | self — `_streamNetwork`, `_sliceNetwork`, `_removeSelfCrossings`/`_segXZ`, `_tiles`/`_tileObjects` | exact |
| `src/debug.js` | utility (extend) | request-response | self — Roads folder `fireRoadParam` pattern (lines 196–215) | exact |
| `data/ranger.js` | config (extend) | — | self — Phase 8 road params block (lines 187–232) | exact |

---

## Pattern Assignments

### `src/road-carve.js` (utility, pure-fn, NO imports)

**Analog:** `src/terrain.js` WORKER_SOURCE embedded seed utilities (lines 62–94) and `height()` function (lines 216–221 inside WORKER_SOURCE / 317–322 main-thread copy).

**The governing rule:** This file must contain zero `import`/`export` at the top level of the functions that get embedded. The pattern is copy-body-as-string. See the WORKER_SOURCE discipline below.

**Worker-safe discipline pattern** (terrain.js lines 44–55):
```javascript
// This file is NOT an ES6 module. It is read as a string by terrain.js and
// embedded in a Blob URL classic worker. Do NOT add import/export statements.
```

**No-import pure-function pattern** (terrain.js WORKER_SOURCE lines 62–94):
```javascript
// ── Seed utilities (copied verbatim from src/seed.js — no export keyword) ──
// SYNC: keep byte-identical with seed.js function bodies (no export).
function djb2(str) { ... }
function seedFor(worldSeed, domainTag, ...coords) { ... }
function mulberry32(seed) { ... }
```

**Height function pure-function pattern** (terrain.js lines 317–322 — the main-thread copy):
```javascript
function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
    const coarse = coarseHeight(wx, wz, noiseCoarse, params)
    const reg    = regionalModulator(wx, wz, noiseRegional, params)
    const fine   = fineHeight(wx, wz, noiseFine, params) * reg
    return coarse + fine
}
```

**The SYNC RULE comment to copy** (terrain.js lines 281–282):
```javascript
// SYNC RULE: keep byte-identical with the same block inside WORKER_SOURCE above.
//            Any edit here must be reflected in WORKER_SOURCE AND terrain-worker.js.
```

**road-carve.js must follow this exact pattern:**
- `sampleCarve(wx, wz, carveTable, N, originX, originZ, cellSize)` — no imports, pure math
- `crownProfile(uLat, params)` — no imports, pure math
- The module exports these functions for main-thread use
- The function BODIES (no `export` keyword) are copied verbatim into WORKER_SOURCE

**SYNC comment template for road-carve.js:**
```javascript
// road-carve.js — Worker-safe pure functions for road surface carve blend.
// NO imports — suitable for embedding verbatim in terrain.js WORKER_SOURCE.
// SYNC RULE: any edit here must be reflected in:
//   (1) terrain.js WORKER_SOURCE carve section
//   (2) terrain-worker.js carve section
// Same discipline as the height() / seed utility sync (T-07-03-SYNC).
```

---

### `src/road-mesh.js` (service, batch)

**Analog:** `src/road.js` debug line builder (lines 1148–1168) for the Three.js `BufferGeometry` mesh-from-spline pattern; `_sliceNetwork` / `_assignSlice` (lines 1025–1144) for tile-keyed iteration over `this._tiles`.

**Import style** (road.js lines 35–37):
```javascript
import * as THREE from 'three'
import { seedFor, mulberry32 } from './seed.js'
import { createNoise2D } from 'simplex-noise'
```

road-mesh.js only needs:
```javascript
import * as THREE from 'three'
import { CHUNK_SIZE } from './terrain.js'
import { RoadSystem } from './road.js'
```

**Debug line / geometry-from-spline pattern** (road.js lines 1156–1161):
```javascript
function _buildDebugLine(spline, color = 0xffaa00) {
    const pts = spline.getPoints(64)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color, depthTest: true })
    return new THREE.Line(geo, mat)
}
```

**Tile-key iteration pattern** (road.js lines 1034–1035, 1140–1143):
```javascript
for (const [runKey, { points }] of this._network) { ... }
// and per-tile array:
let arr = this._tiles.get(key)
if (!arr) { arr = []; this._tiles.set(key, arr) }
arr.push({ spline, points: clean, waypoints: clean, runKey, runWeight, spanScore })
```

**Mesh position / scene lifecycle pattern** (terrain.js lines 698–717):
```javascript
const mesh = new THREE.Mesh(geom, this._material)
mesh.position.set(cx * S + S / 2, 0, cz * S + S / 2)
mesh.receiveShadow = true
// ...
this._scene.add(mesh)
this._chunkMap.set(key, { mesh, heights })
```

**Geometry dispose on evict pattern** (terrain.js lines 630–635):
```javascript
for (const [key, chunk] of this._chunkMap) {
    if (!needed.has(key)) {
        this._scene.remove(chunk.mesh)
        chunk.mesh.geometry.dispose()  // T-06-03: explicit GPU memory release
        this._chunkMap.delete(key)
    }
}
```

**Shared material (do NOT dispose per-mesh)** (terrain.js lines 353–354):
```javascript
// Shared terrain material — one instance, reused across all chunks
// Do NOT dispose this per-chunk (matches wheelMat shared pattern)
this._material = new THREE.MeshPhongMaterial({ color: 0xb89060 })
```

road-mesh.js road material equivalent:
```javascript
this._material = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.FrontSide })
```

**MAX_BUILDS_PER_FRAME cap pattern** (terrain.js lines 673–675):
```javascript
_flushPendingQueue() {
    let built = 0
    while (this._pendingQueue.length > 0 && built < MAX_BUILDS_PER_FRAME) {
```

**GC-free scratch vector pattern** (road.js lines 44–45):
```javascript
// Using a single reusable scratch vector for the per-sample distance check avoids
// per-sample Vector3 allocation (RESEARCH anti-pattern; GC pressure kills frame time).
const _scratchPt = new THREE.Vector3()
```

---

### `src/terrain.js` (extend — `analyticHeight`, `sampleHeight`, `_flushPendingQueue`, `_updateChunkRing`)

**Analog:** self — these are the exact functions being extended.

**`analyticHeight` current body** (terrain.js lines 486–493) — P9 adds `_roadCarve` hook after line 491:
```javascript
analyticHeight(wx, wz) {
    if (!this._noiseCoarse) throw new Error('analyticHeight called before reinitWorker — call-order bug')
    const raw = height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params)
    return raw * (this._params.terrainAmplitude ?? 1.0)
}
```

**`analyticNormal` current body** (terrain.js lines 505–516) — unchanged; automatically picks up carve because it calls `analyticHeight`:
```javascript
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
```

**`_flushPendingQueue` Y-write loop** (terrain.js lines 690–695) — P9 wraps this in carve blend:
```javascript
const pos = geom.attributes.position
const amp = this._params.terrainAmplitude ?? 1.0
for (let i = 0; i < N * N; i++) {
    pos.setY(i, heights[i] * amp)
}
pos.needsUpdate = true
geom.computeVertexNormals()  // for rendering only; physics uses analyticNormal()
```

**`_updateChunkRing` postMessage call** (terrain.js line 643) — P9 adds `carveTable` as Transferable:
```javascript
this._worker.postMessage({ type: 'generate', cx, cz, key })
// P9 extends to:
// this._worker.postMessage({ type: 'generate', cx, cz, key, carveTable }, [carveTable.buffer])
```

**Worker params allowlist pattern** (terrain.js lines 444–454) — pattern for what IS and IS NOT passed to Worker:
```javascript
// Pass ONLY the structured-cloneable terrain-layer fields. The live params object
// accumulates non-cloneable runtime scratch [...] Cloning the whole object throws a
// DataCloneError, which silently aborts the regenerate [...]
const workerParams = {
    coarseAmplitude:  params.coarseAmplitude,
    // ... only plain numbers ...
}
this._worker.postMessage({ type: 'init', worldSeed, params: workerParams })
```

**`rebuildAllChunks` pattern for path-A in-place rebuild** (terrain.js lines 654–665) — model for a carve-only live-update path:
```javascript
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
```

**`sampleHeight` bilinear interpolation pattern** (terrain.js lines 528–563) — model for `sampleCarve` bilinear lookup in road-carve.js:
```javascript
const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cell)))
const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cell)))
const fx = (lx / cell) - xi
const fz = (lz / cell) - zi
const h00 = chunk.heights[ zi      * N +  xi   ]
const h10 = chunk.heights[ zi      * N + (xi+1)]
const h01 = chunk.heights[(zi + 1) * N +  xi   ]
const h11 = chunk.heights[(zi + 1) * N + (xi+1)]
const raw = h00 * (1-fx) * (1-fz) + h10 * fx * (1-fz)
          + h01 * (1-fx) *    fz  + h11 * fx *    fz
```

---

### `src/terrain-worker.js` (byte-mirror, extend)

**Analog:** self — byte-identical mirror of WORKER_SOURCE. The only rule is "edit both in the same commit."

**Worker message handler pattern** (terrain-worker.js lines 194–230):
```javascript
self.onmessage = function(e) {
    if (e.data.type === 'init') {
        const { worldSeed, params } = e.data
        _workerParams = params
        noiseCoarse   = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
        // ...
        return
    }
    if (e.data.type !== 'generate') return
    if (!noiseCoarse) {
        console.warn('[terrain-worker] generate received before init — skipping key', e.data.key)
        return
    }
    const { cx, cz, key } = e.data
    // ... build heights Float32Array ...
    self.postMessage({ key, cx, cz, heights }, [heights.buffer])
}
```

P9 extends to also destructure `carveTable` from `e.data` and use it in the height loop. The `carveTable` buffer is transferred (already consumed as Transferable on the main thread; the Worker receives it and can read it).

**The WORKER_SOURCE Blob spawn pattern** (terrain.js lines 358–361):
```javascript
const blob    = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
const blobURL = URL.createObjectURL(blob)
this._worker  = new Worker(blobURL)
URL.revokeObjectURL(blobURL)  // safe to revoke after Worker construction
```

**SYNC RULE comment to maintain** (terrain.js lines 25–26):
```javascript
// T-07-03-SYNC: WORKER_SOURCE and terrain-worker.js edited in the same commit;
//               byte-equality check in Task 1 automated verify block.
```

---

### `src/road.js` (extend — `_streamNetwork`, `_segXZ`, new `_detectJunctions`, new `_smoothDesignGrade`)

**Analog:** self — these are the exact areas being modified.

**`_segXZ` helper** (road.js lines 718–729) — currently a closure inside `_removeSelfCrossings`; P9 promotes it to module scope:
```javascript
const _segXZ = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const ex = bx - ax, ez = bz - az
    const fx = dx - cx, fz = dz - cz
    const denom = ex * fz - ez * fx
    if (Math.abs(denom) < 1e-10) return null  // parallel/collinear
    const t = ((cx - ax) * fz - (cz - az) * fx) / denom
    const u = ((cx - ax) * ez - (cz - az) * ex) / denom
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
        return { x: ax + t * ex, z: az + t * ez }
    }
    return null
}
```

**`_streamNetwork` cache-clear pattern** (road.js lines 914–918) — junction cache must be cleared at the same point:
```javascript
this._network.clear()
// A real re-stream invalidates the previous slice; _sliceNetwork re-slices on next call.
this._slicedFrom = null
if (this._tiles) this._tiles.clear()
if (this._tileObjects) this._tileObjects.clear()
// P9 adds: if (this._junctions) this._junctions.clear()
```

**Network key format** (road.js line 978):
```javascript
this._network.set(`${mz}:${runIndex}`, { points: run.map(p => p.clone()) })
```

**Purity/determinism comment pattern** (road.js lines 886–888):
```javascript
// Pure function of (worldSeed, center, params) → identical inputs yield identical polylines.
```

**`_sliceNetwork` identity guard + `_slicedFrom` memoization** (road.js lines 1026–1028):
```javascript
if (this._slicedFrom === this._network && this._tiles.size > 0) return this._tiles
```

`_detectJunctions` should follow this same pattern:
```javascript
_detectJunctions() {
    if (this._junctionsFrom === this._network && this._junctions.size > 0) return this._junctions
    this._junctions.clear()
    // ... pairwise _segXZ over this._network runs ...
    this._junctionsFrom = this._network
    return this._junctions
}
```

**Module-scope scratch / allocation discipline** (road.js lines 44–45):
```javascript
const _scratchPt = new THREE.Vector3()
```

**`_lerpVec3` helper** (road.js lines 55–61) — model for boundary interpolation in design-grade smoothing:
```javascript
function _lerpVec3(a, b, t) {
    return new THREE.Vector3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
    )
}
```

**`CatmullRomCurve3` usage** (road.js line 1140):
```javascript
const spline = new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
```

Ribbon sweep uses `spline.getPointAt(u)` / `spline.getTangentAt(u)` (arc-length-correct API).

---

### `src/debug.js` (extend — Roads folder new sliders)

**Analog:** self — Roads folder (lines 196–215).

**`fireRoadParam` pattern** (debug.js lines 209–215):
```javascript
const fireRoadParam = () => { if (typeof callbacks.onRoadParamChange === 'function') callbacks.onRoadParamChange() }
roadFolder.add(params, 'roadWAlt',   0, 3,     0.05).name('wAlt (stay low)').onChange(fireRoadParam)
roadFolder.add(params, 'roadWGrade', 0, 2000,  20  ).name('wGrade (gentle)').onChange(fireRoadParam)
```

**P9 new sliders follow the exact same pattern** — bind directly to `params`, fire a callback, callback lives in `main.js`:
```javascript
const fireRoadSurface = () => { if (typeof callbacks.onRoadSurfaceChange === 'function') callbacks.onRoadSurfaceChange() }
roadFolder.add(params, 'roadWidth',           6, 14,   0.5).name('Road Width (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'crownHeight',       0.0, 0.2, 0.005).name('Crown Height (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'camberStrength',     50, 500,  10  ).name('Camber Strength (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'roadFillHeight',    0.0, 4.0,  0.1 ).name('Max Fill Height (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'roadCutSlope',      0.5, 2.0,  0.05).name('Cut Slope (H:V)').onChange(fireRoadSurface)
roadFolder.add(params, 'roadFillSlope',     1.5, 5.0,  0.1 ).name('Fill Slope (H:V)').onChange(fireRoadSurface)
roadFolder.add(params, 'roadShoulderWidth', 1.0, 6.0,  0.5 ).name('Shoulder Width (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'designGradeWindow',  10, 150,  5   ).name('Design Grade Window (m)').onChange(fireRoadSurface)
roadFolder.add(params, 'roadFilletRadius',  0.5, 10.0, 0.5 ).name('Junction Fillet R (m)').onChange(fireRoadSurface)
```

**UI-only state pattern** (debug.js lines 197–200):
```javascript
const _roadState = { roadViz: false }
roadFolder.add(_roadState, 'roadViz').name('Show Road Splines').onChange(v => {
    if (typeof callbacks.onRoadVizToggle === 'function') callbacks.onRoadVizToggle(v)
})
```

**Callback contract comment** (debug.js lines 186–195):
```javascript
// Callback contract (callbacks = {} default — never throws if not provided):
//   callbacks.onRoadVizToggle(v: boolean) — show/hide road splines (setDebugVisible)
//   callbacks.onRoadParamChange()          — debounced re-route (invalidateCache + rebuild)
```

P9 adds `callbacks.onRoadSurfaceChange()` to the contract comment block.

**`initDebug` function signature** (debug.js line 44):
```javascript
export function initDebug (params, callbacks = {}, options = {}) {
```

---

### `data/ranger.js` (extend — new road surface params)

**Analog:** self — Phase 8 road params block (lines 187–232).

**Param comment style** (ranger.js lines 196–201):
```javascript
// maxRoadGrade: SOFT target grade the over-cap penalty measures against (rise/run ratio).
// Exceeding it is penalized (roadWOver·excess), NOT blocked — the route climbs steep ground
// only when wrapping around would cost more. D-09 default 0.15 (15%).
maxRoadGrade: 0.15,   // ratio (15%) — SOFT over-cap target (D-02 REVISED; never a hard block)
```

Each new param needs:
1. A multi-line comment block explaining the domain (what it controls, why the default)
2. An inline trailing comment with units and the decision reference (e.g., `// m — D-04`)

**Phase heading comment** (ranger.js line 187):
```javascript
// ── Phase 8 Road Routing — D-09 LOCKED cost model (valley-trunk core) ─────
```

P9 adds:
```javascript
// ── Phase 9 Road Surface — D-04/D-05/D-07/D-08/D-13 road surface params ───
roadWidth: 10,            // m — total paved width (D-04)
roadHalfWidth: 5,         // m — half roadWidth (derived; keep in sync)
crownHeight: 0.05,        // m — centerline crown above edge (D-04 / A12)
camberStrength: 200,      // m·rad/rad — curvature→camber gain (D-04 / A4)
roadFillHeight: 2.0,      // m — max fill embankment height cap (D-07)
roadCutSlope: 1.0,        // H:V ratio — cut face slope (D-08 / A3)
roadFillSlope: 3.0,       // H:V ratio — fill embankment slope (D-08 / A3)
roadShoulderWidth: 2.5,   // m — blend/shoulder zone width (D-05)
designGradeWindow: 50,    // m — sliding-window smoothing half-width (D-06 / A2)
roadFilletRadius: 5,      // m — junction corner fillet radius (D-13 / A5)
```

---

## Shared Patterns

### Worker-Safe Pure-Function Discipline
**Source:** `src/terrain.js` WORKER_SOURCE block (lines 44–276) + main-thread copy block (lines 278–322)
**Apply to:** `src/road-carve.js` (entire file), the carve section of WORKER_SOURCE, the carve section of `terrain-worker.js`

The discipline:
1. Write pure functions in `road-carve.js` with `export` keywords
2. Copy only the function bodies (no `export`, no `import`) into WORKER_SOURCE's carve section
3. Write byte-identical copies into `terrain-worker.js` carve section
4. Add the SYNC RULE comment at both the export site and both copy sites

### Chunk Key Format
**Source:** `src/terrain.js` line 597, `src/road.js` line 1124
**Apply to:** `src/road-mesh.js`, `src/road.js` junction cache
```javascript
const key = `${cx},${cz}`   // terrain.js style
const key = `${tileX},${tileZ}`  // road.js _assignSlice style — same format
```
Both use `"X,Z"` string keys for `Map` lookups. Road mesh tiles must use the same key format as terrain chunks so road tile lifetime can be co-located with chunk lifetime.

### Determinism / Purity Comment
**Source:** `src/road.js` line 714, `src/terrain.js` lines 281–282
**Apply to:** Every new function in `road-carve.js`, `_detectJunctions`, `_smoothDesignGrade`, ribbon sweep
```javascript
// Pure function of its input — no Math.random, no Date, no session state → deterministic (D-03).
// SYNC RULE: keep byte-identical with [...] Any edit here must be reflected in [...].
```

### Float32Array Transferable Pattern
**Source:** `src/terrain.js` line 274 (Worker side), line 370–371 (main-thread receive)
**Apply to:** Carve table postMessage in `terrain.js` `_updateChunkRing`, Worker message handler in `terrain-worker.js`
```javascript
// Worker side (terrain-worker.js line 230):
self.postMessage({ key, cx, cz, heights }, [heights.buffer])

// Main-thread send (P9 extension of terrain.js line 643):
this._worker.postMessage({ type: 'generate', cx, cz, key, carveTable }, [carveTable.buffer])
```
NEVER pass `carveTable` without the Transferable array — DataCloneError risk (see memory `project_terrain_worker_constraints`).

### Debug Slider Callback Pattern
**Source:** `src/debug.js` lines 209–215
**Apply to:** All new P9 sliders in `debug.js`, corresponding callback wiring in `main.js`
```javascript
const fireRoadSurface = () => { if (typeof callbacks.onRoadSurfaceChange === 'function') callbacks.onRoadSurfaceChange() }
// Debounce lives in main.js (consistent with D-09 / rebuildTerrainFull convention).
```

### `MeshPhongMaterial` with `vertexColors`
**Source:** `src/terrain.js` line 354 (shared material instance)
**Apply to:** `src/road-mesh.js` road ribbon material
```javascript
// Shared road material — one instance, reused across all road tiles.
// Do NOT dispose this per-tile (matches terrain._material shared pattern).
this._material = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.FrontSide })
```

---

## Test Harness Pattern

**Source:** `test/test-road.html` (lines 1–355)

All P9 browser harnesses (`test/test-road-carve.html`, `test/test-road-mesh.html`) must follow this exact structure:

**importmap block** (test-road.html lines 7–15) — copy verbatim, do NOT modify CDN versions:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "simplex-noise": "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js"
  }
}
</script>
```

**Style block** (test-road.html lines 16–19):
```html
<style>
  body { font-family: monospace; background: #111; color: #eee; padding: 1em; }
  h1 { font-size: 1.1em; }
  p { font-size: 0.85em; color: #aaa; }
</style>
```

**Test body instruction** (test-road.html lines 22–27):
```html
<h1>RangerSim [Test Name]</h1>
<p>Open DevTools console to see PASS/FAIL results.</p>
```

**Test function pattern** (test-road.html lines 42–88):
```javascript
;(function testName() {
    // ... setup ...
    assert('TEST-NN description: detail', booleanExpression)
})()
```

**Assert helper** (imported from `test/road-test-harness.js` or inlined):
```javascript
function assert(label, cond) {
    console.log((cond ? 'PASS' : 'FAIL') + ' ' + label)
}
```

The carve height-agreement test (`test/test-road-carve.html`) — the phase EXIT GATE — must assert:
```javascript
// At 5+ on-road positions: analyticHeight(wx, wz) ≈ mesh vertex Y at (wx, wz)
// Tolerance: < 0.01 m (sub-centimetre agreement)
assert(`SURF-05 carve-continuity (${wx.toFixed(0)},${wz.toFixed(0)}): delta=${delta.toFixed(4)}m < 0.01m`, delta < 0.01)
```

---

## No Analog Found

All seven files have close analogs in the codebase. No files require falling back to RESEARCH.md examples alone.

---

## Metadata

**Analog search scope:** `src/`, `data/`, `test/`
**Files scanned:** 12 source files, 2 test harnesses
**Pattern extraction date:** 2026-06-11

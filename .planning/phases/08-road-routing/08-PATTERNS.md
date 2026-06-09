# Phase 8: Road Routing - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 5 (new/modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/road.js` | service/generator | CRUD + lazy-cache | `src/terrain.js` (TerrainSystem class + per-tile Map cache + pure-function noise init) | role-match (same lazy tile-cache generator pattern, different algorithm) |
| `src/main.js` — `resolveSpawn` body | utility | request-response | `src/main.js` `resolveSpawn` (existing body, same call site) | exact (body swap at same call site, same signature) |
| `src/main.js` — import + wiring | config/entry | request-response | `src/main.js` lines 18–27 (existing import block) + lines 692–704 (initDebug wiring) | exact (add one import line; add one callback key to existing `_gui` call) |
| `src/debug.js` — Roads folder | config | request-response | `src/debug.js` lines 126–181 (terrainFolder + coarseFolder sub-folder pattern) | exact (addFolder + add + onChange callbacks) |
| `test/test-road.html` | test | request-response | No analog — project has no existing test HTML files | none (use RESEARCH.md browser-assertion pattern) |

---

## Pattern Assignments

### `src/road.js` (service/generator, lazy-cache CRUD)

**Analog:** `src/terrain.js`

**Imports pattern** (`src/terrain.js` lines 29, then module-scope constants 32–37):
```javascript
import * as THREE from 'three'
// road.js adds:
import { seedFor, mulberry32 } from './seed.js'
// terrain.js does NOT import seed.js — it has private _seedFor/_mulberry32 copies
// road.js CAN import from seed.js because road.js is a regular ES6 module (not inlined in a Blob)
// Do NOT import from terrain.js private fields — build own _noiseCoarse closure via seedFor

export const CHUNK_SIZE = 64   // re-export or import from terrain.js (already exported)
```

**Class + constructor pattern** (`src/terrain.js` lines 326–376):
```javascript
export class TerrainSystem {
    constructor(scene, params, worldSeed) {
        this._scene     = scene
        this._params    = params
        this._worldSeed = worldSeed ?? 0

        // Private state
        this._chunkMap      = new Map()   // key → { mesh, heights }
        this._pendingWorker = new Set()
        this._pendingQueue  = []

        // Main-thread analytic noise closures (seeded same way as Worker)
        this._noiseCoarse   = null
        this._noiseFine     = null
        this._noiseRegional = null
        // ...
        this.reinitWorker(this._worldSeed, params)
    }
```

**road.js follows the same shape:**
```javascript
export class RoadSystem {
    constructor(worldSeed, params) {
        this._worldSeed  = worldSeed
        this._params     = params
        this._tileCache  = new Map()   // key: "tX,tZ" → { waypoints, spline }
        this._debugLines = []          // THREE.Line objects added to scene
        this._scene      = null        // set via init(scene)
        this._noiseCoarse = null       // built by _reinitNoise()
        this._reinitNoise(worldSeed, params)
    }
```

**Noise closure init pattern** (`src/terrain.js` lines 425–455, `reinitWorker`):
```javascript
reinitWorker(worldSeed, params) {
    this._worldSeed = worldSeed
    this._params    = params

    // Build main-thread noise closures (same seedFor derivation as Worker)
    this._noiseCoarse   = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'coarse')))
    this._noiseFine     = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'fine')))
    this._noiseRegional = _createNoise2D(_mulberry32(_seedFor(worldSeed, 'regional')))
    // ...
}
```

**road.js equivalent** — road.js builds its OWN `_noiseCoarse` via the public `seedFor` import (not terrain.js's private `_seedFor`). Same derivation, different import path:
```javascript
_reinitNoise(worldSeed, params) {
    // Must use seedFor('coarse') with the same args as TerrainSystem._noiseCoarse
    // so the grade math uses the same raw coarseHeight values as terrain.js.
    // road.js imports seedFor/mulberry32 from seed.js (public); createNoise2D from simplex-noise.
    this._noiseCoarse = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
    this._worldSeed = worldSeed
    this._params = params
}
```

**Tile cache lookup (lazy generation) pattern** (`src/terrain.js` lines 630–640 `_updateChunkRing`, adapted):
```javascript
// terrain.js lazy pattern — key-guarded Map lookup:
if (!this._chunkMap.has(key) && !this._pendingWorker.has(key)) {
    this._pendingWorker.add(key)
    this._worker.postMessage({ type: 'generate', cx, cz, key })
}
// road.js equivalent (synchronous — no worker):
_getTile(tileX, tileZ) {
    const key = `${tileX},${tileZ}`
    if (!this._tileCache.has(key)) {
        this._tileCache.set(key, this._routeTile(tileX, tileZ))
    }
    return this._tileCache.get(key)
}
```

**Cache invalidation + rebuild pattern** (`src/terrain.js` lines 463–474, `rebuildAllChunksFromWorker`):
```javascript
rebuildAllChunksFromWorker() {
    // Dispose all built chunk meshes and remove from scene
    for (const [, chunk] of this._chunkMap) {
        this._scene.remove(chunk.mesh)
        chunk.mesh.geometry.dispose()
    }
    this._chunkMap.clear()
    this._pendingWorker.clear()
    this._pendingQueue.length = 0
}
```

**road.js invalidate equivalent:**
```javascript
invalidateCache() {
    // Remove debug lines from scene and dispose geometries
    for (const line of this._debugLines) {
        if (this._scene) this._scene.remove(line)
        line.geometry.dispose()
    }
    this._debugLines = []
    this._tileCache.clear()
}
```

**Pure coarseHeight function pattern** (`src/terrain.js` lines 183–199, module-scope function inside WORKER_SOURCE — same body also at lines 284–318):
```javascript
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
```

**road.js usage:** Copy this function verbatim into `road.js` as a module-scope private function. Call it as `_coarseHeight(wx, wz, this._noiseCoarse, this._params)`. Do NOT call `terrainSystem.analyticHeight` (multiplies by `terrainAmplitude` — amplitude-dependent grade, Pitfall 3 in RESEARCH.md).

**Debug line build pattern** (Three.js r184, confirmed in project via `src/main.js` and `src/terrain.js` which both use `THREE.BufferGeometry`):
```javascript
// road.js — build debug centerline from spline
function _buildDebugLine(spline, color = 0xffaa00) {
    const pts = spline.getPoints(64)              // 65 Vector3 samples
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color, depthTest: true })
    return new THREE.Line(geo, mat)
}
// Toggle (from lil-gui onChange):
// line.visible = enabled
// Prefer .visible toggle over dispose/recreate to avoid GC pressure at 60fps
```

**File header / module comment pattern** (`src/terrain.js` lines 1–28):
```javascript
/**
 * src/road.js — RoadSystem for RangerSim v1.1
 *
 * Responsibilities:
 *  - Per-tile A* road routing over raw coarseHeight (never sampleHeight or analyticHeight)
 *  - Seeded tile-edge waypoints via seedFor("roads", tileX, tileZ) for seam continuity
 *  - THREE.CatmullRomCurve3 per tile segment with ghost control points (C1 across seams)
 *  - Lazy tile generation, cached in Map<"tX,tZ", TileRoad>; invalidated on param change
 *  - queryNearest(wx, wz) → { point, tangent } for resolveSpawn and Phase 9
 *  - Debug line visualization toggled via road.visible flag (set from debug.js checkbox)
 *
 * Anti-patterns: NEVER call terrainSystem.sampleHeight (chunk-load-dependent).
 *                NEVER call terrainSystem.analyticHeight (amplitude-scaled — grade off by amplitude).
 *                NEVER call road.js from inside the physics fixed-timestep loop.
 *                NEVER allocate new THREE.Vector3 per frame in queryNearest.
 */
```

---

### `src/main.js` — `resolveSpawn` body swap (utility, request-response)

**Analog:** `src/main.js` lines 104–174 (current `resolveSpawn` body — this is the call site being swapped)

**Existing call-site contract** (`src/main.js` lines 104–174):
```javascript
// ── resolveSpawn (D-14 / D-16) ──────────────────────────────────────────────
// Phase 7 SEAM COMMENT — Phase 8 swaps the body of this function to a road-graph probe
// (nearest road node + tangent heading) at this SAME call site. DO NOT change the signature
// (worldSeed, params) → { position: THREE.Vector3, heading: number }.
//
function resolveSpawn (wseed, params) {
  // ... Phase 7 terrain-only body ...
  return {
    position: new THREE.Vector3(chosenX, surfaceY, chosenZ),
    heading
  }
}
```

**Phase 8 body must preserve:**
- Same function name: `resolveSpawn`
- Same parameters: `(wseed, params)`
- Same return shape: `{ position: THREE.Vector3, heading: number }`
- Same seam comment updated to reference Phase 8 completion

**Pattern for eager tile generation before query** (derived from RESEARCH.md Pitfall 5):
```javascript
function resolveSpawn (wseed, params) {
  // Phase 8: probe nearest road node + tangent heading (D-07 / D-16).
  // Eagerly generate the 3×3 spawn-region tiles so nearestPoint has data.
  const spawnSeed = seedFor(wseed, 'spawn')
  const baseX = ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200
  const baseZ = (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
  const baseTX = Math.floor(baseX / CHUNK_SIZE)
  const baseTZ = Math.floor(baseZ / CHUNK_SIZE)
  for (let dtx = -1; dtx <= 1; dtx++) {
    for (let dtz = -1; dtz <= 1; dtz++) {
      roadSystem.ensureTile(baseTX + dtx, baseTZ + dtz)
    }
  }
  const nearest = roadSystem.queryNearest(baseX, baseZ)
  if (nearest) {
    const surfaceY = terrainSystem.analyticHeight(nearest.point.x, nearest.point.z)
    return {
      position: new THREE.Vector3(nearest.point.x, surfaceY, nearest.point.z),
      heading: Math.atan2(nearest.tangent.x, nearest.tangent.z)
    }
  }
  // Fallback: terrain-only (console.warn)
  console.warn('[resolveSpawn] No road node found — falling back to terrain-only spawn')
  // ... terrain-only fallback (copy Phase 7 body here) ...
}
```

---

### `src/main.js` — import block + `_gui` wiring (config, request-response)

**Analog:** `src/main.js` lines 18–27 (import block) and lines 692–697 (`initDebug` call)

**Import block pattern** (`src/main.js` lines 18–27):
```javascript
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from './physics.js'
import { getBodyContactPoints } from './suspension.js'
import { updateVehicle, SPAWN_STATE } from './vehicle.js'
import { updateCamera, getCameraMode, getFreecamPosition } from './camera.js'
import { initDebug, updatePacejkaCurve, updateTravelBars, updateSlipVectors } from './debug.js'
import { captureFrame, toggleRecording, openInitialCondition } from './logger.js'
import { TerrainSystem } from './terrain.js'
import { parseWorldSeed, seedFor } from './seed.js'
// Phase 8 adds:
import { RoadSystem } from './road.js'
```

**`initDebug` callback wiring pattern** (`src/main.js` lines 692–697):
```javascript
const _gui = initDebug(RANGER_PARAMS, {
  setRampVisible:      (v) => { rampMesh.visible = v },
  rebuildTerrain:      ()  => { if (terrainSystem) terrainSystem.rebuildAllChunks() },
  rebuildTerrainFull:  ()  => debouncedRebuildFull(),
  changeSeed:          (v) => { worldSeed = parseWorldSeed(v); debouncedRebuildFull() }
  // Phase 8 adds:
  // onRoadVizToggle:  (v) => { if (roadSystem) roadSystem.setDebugVisible(v) },
  // onRoadParamChange: () => debouncedRoadRebuild(),
}, { initialSeed: _urlSeed ?? 'lone-pine' })
```

**TerrainSystem instantiation as reference** (`src/main.js` lines 704–710):
```javascript
// Phase 8 equivalent — instantiate after scene exists, before _reseatTruckAtSpawn:
terrainSystem = new TerrainSystem(scene, RANGER_PARAMS, worldSeed)
scene.remove(ground)
// Phase 8 adds (after terrainSystem, before _reseatTruckAtSpawn):
roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
roadSystem.init(scene)
_reseatTruckAtSpawn()
```

**Debounce pattern** (`src/main.js` lines 181–183):
```javascript
// Existing debounce for terrain full rebuild (Path B, ~150ms):
let _rebuildDebounceTimer = null
function debouncedRebuildFull () {
  clearTimeout(_rebuildDebounceTimer)
  // ...
}
// road.js cache invalidation follows the same 150ms debounce:
let _roadRebuildDebounceTimer = null
function debouncedRoadRebuild () {
  clearTimeout(_roadRebuildDebounceTimer)
  _roadRebuildDebounceTimer = setTimeout(() => {
    if (roadSystem) {
      roadSystem.invalidateCache()
      roadSystem.buildDebugLines()   // rebuild visible debug lines for current view
    }
  }, 150)
}
```

---

### `src/debug.js` — Roads folder (config, request-response)

**Analog:** `src/debug.js` lines 126–181 (terrainFolder + coarseFolder sub-folder pattern)

**Folder creation pattern** (`src/debug.js` lines 126–131):
```javascript
const terrainFolder = gui.addFolder('Terrain')
terrainFolder.add(params, 'terrainAmplitude', 0, 3.0, 0.05).name('Terrain Amplitude (Y-scale)').onChange(() => {
  if (typeof callbacks.rebuildTerrain === 'function') callbacks.rebuildTerrain()
})
terrainFolder.add(params, 'rampEnabled').name('Ramp Visible').onChange(v => {
  if (typeof callbacks.setRampVisible === 'function') callbacks.setRampVisible(v)
})
```

**road.js debug folder — copy this pattern exactly:**
```javascript
// ── Roads folder (Phase 8 / D-03 / D-05) ────────────────────────────────────
// Road viz checkbox + max-grade slider. Both fire callbacks unconditionally;
// debounce lives in main.js (same convention as rebuildTerrainFull).
const roadFolder = gui.addFolder('Roads')
const _roadState = { roadViz: false }
roadFolder.add(_roadState, 'roadViz').name('Show Road Splines').onChange(v => {
  if (typeof callbacks.onRoadVizToggle === 'function') callbacks.onRoadVizToggle(v)
})
roadFolder.add(params, 'maxRoadGrade', 0.04, 0.20, 0.01).name('Max Grade (ratio)').onChange(() => {
  if (typeof callbacks.onRoadParamChange === 'function') callbacks.onRoadParamChange()
})
// Optional: expose cost weights for tuning (A4 in RESEARCH.md assumptions):
// roadFolder.add(params, 'roadSlopePenalty', 10, 200, 5).name('Slope Penalty').onChange(...)
// roadFolder.add(params, 'roadAltWeight', 0, 1.0, 0.01).name('Alt Weight').onChange(...)
```

**Key conventions from analog:**
- `_roadState` local object (like `_seedState` line 139, `_coarseFreqKm` line 153) — use for properties that are NOT on `params` (e.g., the viz toggle boolean, which is UI-only state).
- Callback guard: `if (typeof callbacks.X === 'function')` — never call blindly (line 128, 131, 148, etc.).
- `onChange` not `onFinishChange` for sliders (immediate feedback); `onFinishChange` only for text fields (line 140).
- Folder placed AFTER the Terrain folder in `initDebug` — do not reorder existing sliders.

**`initDebug` function signature** (`src/debug.js` lines 44–45):
```javascript
export function initDebug (params, callbacks = {}, options = {}) {
  const gui = new GUI({ title: 'RangerSim Debug' })
  gui.domElement.style.display = 'none'
```

Phase 8 adds `callbacks.onRoadVizToggle` and `callbacks.onRoadParamChange` to the existing `callbacks` object — no signature change needed since `callbacks = {}` is already a default parameter.

---

### `test/test-road.html` (test, request-response)

**Analog:** No analog exists in the codebase. The project has no existing test HTML files.

**Use RESEARCH.md browser-assertion pattern** (RESEARCH.md Validation Architecture section):
- Create `test/test-road.html` as a standalone HTML file with `<script type="module">`.
- Import `src/road.js`, `src/seed.js` via relative path with the same importmap as `index.html`.
- Log `PASS` / `FAIL` per assertion to `console.log`.
- No Jest, no Vitest — browser console only.

**Reference pattern from RESEARCH.md:**
```html
<!-- test/test-road.html -->
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">{ "imports": { "three": "..." } }</script>
</head>
<body>
<script type="module">
import { RoadSystem } from '../src/road.js'
import { parseWorldSeed } from '../src/seed.js'

function assert(label, condition) {
  console.log(condition ? `PASS: ${label}` : `FAIL: ${label}`)
}

// ROAD-01: determinism
const ws = parseWorldSeed('lone-pine')
const r1 = new RoadSystem(ws, PARAMS)
const r2 = new RoadSystem(ws, PARAMS)
const p1 = r1._getTile(0,0).spline.getPoint(0.5)
const p2 = r2._getTile(0,0).spline.getPoint(0.5)
assert('ROAD-01 determinism', p1.distanceTo(p2) < 0.001)
// ... etc.
</script>
</body>
</html>
```

---

## Shared Patterns

### Tile cache key convention
**Source:** `src/terrain.js` lines 343, 630 (`_chunkMap`, `_chunkKey`)
**Apply to:** `src/road.js` `_tileCache`
```javascript
// terrain.js uses a _chunkKey() helper:
_chunkKey(cx, cz) { return `${cx},${cz}` }
// road.js: use the same template-literal key format inline:
const key = `${tileX},${tileZ}`
```

### seedFor usage for domain-tagged sub-seeds
**Source:** `src/seed.js` lines 57–67
**Apply to:** `src/road.js` everywhere a per-tile seed is derived
```javascript
// Pattern: seedFor(worldSeed, domainTag, ...coords) → uint32
// roads trunk:  seedFor(worldSeed, "roads",      tileX, tileZ)
// roads spur:   seedFor(worldSeed, "roads-spur", tileX, tileZ)
// Then: const rng = mulberry32(tileSeed); rng() → [0,1)
// Domain tag "roads" is NOT yet used — safe to introduce in Phase 8.
```

### Callback-guarded onChange
**Source:** `src/debug.js` lines 128, 131, 148 (pattern throughout)
**Apply to:** All new `addFolder` / `add(...).onChange(...)` calls in `src/debug.js`
```javascript
// Always guard the callback:
.onChange(v => {
  if (typeof callbacks.onRoadVizToggle === 'function') callbacks.onRoadVizToggle(v)
})
// Never: .onChange(v => callbacks.onRoadVizToggle(v))  ← throws if callback absent
```

### Module-scope `let` for system singleton
**Source:** `src/main.js` lines 36–37
**Apply to:** `src/main.js` `roadSystem` declaration
```javascript
// terrain pattern:
let terrainSystem = null
// road equivalent:
let roadSystem = null
```

### JSDoc on every export
**Source:** `src/terrain.js` lines 326–376 (TerrainSystem constructor JSDoc), lines 420–424 (`reinitWorker` JSDoc)
**Apply to:** Every exported class method in `src/road.js`
```javascript
/**
 * Return the nearest point on any road spline within search radius.
 *
 * @param {number} wx — world X coordinate (metres)
 * @param {number} wz — world Z coordinate (metres)
 * @param {number} [radiusM=200] — search radius in metres
 * @returns {{ point: THREE.Vector3, tangent: THREE.Vector3 } | null}
 */
queryNearest(wx, wz, radiusM = 200) { ... }
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `test/test-road.html` | test | request-response | No existing test HTML files in project; use RESEARCH.md browser-assertion pattern |

---

## Metadata

**Analog search scope:** `src/` (all 11 files)
**Files scanned:** `src/terrain.js` (809 lines), `src/seed.js` (84 lines), `src/debug.js` (538 lines), `src/main.js` (1012 lines)
**Pattern extraction date:** 2026-06-09

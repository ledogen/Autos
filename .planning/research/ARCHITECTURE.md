# Architecture Research — v1.1 Mountains & Roads

**Domain:** Browser-based 6DOF car physics simulation — adding seeded layered terrain, switchback road routing, road surface ribbon, free-fly camera, and POI anchor hooks to a shipped sim.
**Project:** RangerSim
**Researched:** 2026-06-05
**Confidence:** HIGH — derived from direct reading of live src/terrain.js, src/main.js, src/camera.js, .planning/v1.1-BLUEPRINT-DRAFT.md, and sibling research files. MEDIUM for road tile-graph integration specifics (no shipped code yet).

---

## Standard Architecture

### System Overview (v1.1)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  index.html (importmap → CDN Three.js r184)                                   │
│                                                                                │
│  src/main.js ─────────────────────────────────────────────────────────────────│
│    │  Fixed-step accumulator (1/60 s). queryContacts + queryVertexContacts.   │
│    │  Passes sampleHeight/sampleNormal callbacks to stepPhysics.              │
│    │                                                                           │
│    ├─ src/seed.js ──────────── xmur3 + splitmix32 + seedFor() + stringToSeed()│
│    │                           Pure functions. Zero imports. Worker-paste-able.│
│    │                                                                           │
│    ├─ src/terrain.js ───────── TerrainSystem: chunk ring, WORKER_SOURCE blob, │
│    │   │                       sampleHeight (bilinear Float32Array),           │
│    │   │                       sampleNormal (central-diff), rebuildAllChunks   │
│    │   │                                                                       │
│    │   └─ [WORKER_SOURCE] ──── Blob classic worker (no importmap).            │
│    │        Contains verbatim paste of:                                        │
│    │          createNoise2D + buildPermutationTable (existing simplex)         │
│    │          xmur3 + splitmix32 + seedFor() (pasted from seed.js)             │
│    │        Receives {type:'init', worldSeed}  → seeds 3 noise fns             │
│    │        Receives {type:'generate', cx, cz, key} → posts Float32Array       │
│    │                                                                           │
│    ├─ src/road.js ──────────── RoadGraph: tile-keyed A* routing over pure      │
│    │                           coarseHeight(x,z) fn; CatmullRomCurve3 splines; │
│    │                           per-tile Map (never evicted with chunks);       │
│    │                           roadCarveWeight(x,z) → Float32 blend [0..1]     │
│    │                                                                           │
│    ├─ src/road-mesh.js ──────── ribbon BufferGeometry build; CanvasTexture      │
│    │                            asphalt; road surface height query (uses        │
│    │                            road.js splines + terrain.sampleHeight);        │
│    │                            roadSurfaceHeight(x,z) for physics integration │
│    │                                                                           │
│    ├─ src/camera.js ─────────── updateCamera(); modes: 'chase'|'cockpit'|'fly' │
│    │                            Free-cam: WASD + look; writes only freeCamPos/ │
│    │                            freeCamQuat; never touches vehicleState         │
│    │                                                                           │
│    ├─ src/vehicle.js, physics.js, suspension.js, tire.js ── (unchanged v1.0)  │
│    └─ src/debug.js ──────────── world-seed slider + URL param wiring (P7)      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (v1.1 changes in bold)

| Module | Responsibility | Changed in v1.1? |
|--------|---------------|-----------------|
| `src/seed.js` | **xmur3 hasher, splitmix32 PRNG, seedFor(worldSeed, tag, ...coords), stringToSeed()** | **NEW** |
| `src/terrain.js` | Chunk ring, WORKER_SOURCE blob, sampleHeight, sampleNormal, rebuildAllChunks | **MODIFIED** — worldSeed wired in; WORKER_SOURCE gains seed.js functions + 3-layer height formula; sampleHeight gains post-read road carve blend |
| `src/road.js` | **Deterministic tile-keyed road tile-graph; A* routing over coarseHeight; CatmullRomCurve3 splines; roadCarveWeight(x,z) spatial index; POI anchor emit** | **NEW** |
| `src/road-mesh.js` | **Road ribbon BufferGeometry; CanvasTexture asphalt; roadSurfaceHeight(x,z); crown + camber normals** | **NEW** |
| `src/camera.js` | Chase + cockpit camera modes | **MODIFIED** — adds 'fly' mode; free-cam WASD/look; mode-gated input; snap-free exit |
| `src/main.js` | RAF loop, queryContacts, queryVertexContacts, scene, TerrainSystem init | **MODIFIED** — worldSeed init from URL; free-cam input gate; sampleHeight now calls road carve blend; debug wiring for seed |
| `src/debug.js` | lil-gui sliders, HUD | **MODIFIED** — seed string controller + URL replaceState; free-cam HUD overlay |
| `src/vehicle.js`, `src/physics.js`, `src/suspension.js`, `src/tire.js` | 6DOF physics pipeline | UNCHANGED |
| `data/ranger.js` | Ford Ranger specs | UNCHANGED |

---

## The No-Bundler Shared-Height Problem — Concrete Mechanism

This is the central integration challenge: the Blob Worker cannot use `import`. The same height formula and PRNG code must run in both the Worker and the main-thread physics sampler without divergence.

### The Mechanism: Verbatim Paste + Single Authoritative Source

**How it works:**

`src/seed.js` is the authoritative ES6 module source for `xmur3`, `splitmix32`, `seedFor()`, and `stringToSeed()`. Main-thread code imports it normally. `terrain.js` also maintains a paste block inside `WORKER_SOURCE` that is a verbatim copy of the pure-function bodies from `seed.js` — no `import`/`export` keywords, just the raw function definitions.

The height formula — the layered noise arithmetic that produces `height(wx, wz)` — lives in exactly one prose location: the `WORKER_SOURCE` string. The main-thread `sampleHeight` does NOT recompute this formula. It reads from the `Float32Array` that the Worker produced. The Worker IS the single source of truth for raw terrain heights.

Road carve is the only post-Worker modification. It is a blend function `roadCarveBlend(x,z)` defined in `src/road.js` and applied post-read in two places: inside `_flushPendingQueue` (when writing vertex Y positions into mesh geometry) and inside `sampleHeight` (applied to the bilinear-interpolated raw height before returning). Both call the same function from the same module.

```
Source of truth hierarchy:

  Raw terrain height:   WORKER_SOURCE height formula → Float32Array → sampleHeight (read-only bilinear)
  Road carve blend:     road.js roadCarveBlend(x,z)  → applied in _flushPendingQueue AND sampleHeight
  Final surface height: sampleHeight = (raw * amp) + roadCarveBlend blend toward road elevation
```

**Concrete file structure:**

```javascript
// src/seed.js — authoritative ES6 module
// Pure functions only. Exported for main-thread use; pasted verbatim into WORKER_SOURCE.

function xmur3(str) { ... }         // ~10 lines
function splitmix32(seed) { ... }   // ~10 lines

export function seedFor(worldSeed, domainTag, ...coords) {
    const key = String(worldSeed) + ':' + domainTag + ':' + coords.join(',')
    const hash = xmur3(key); hash(); hash(); hash()
    return splitmix32(hash())
}
export function stringToSeed(s) { ... }
```

```javascript
// Inside terrain.js WORKER_SOURCE string — the paste block:
//
// ── PASTE FROM src/seed.js — keep in sync manually ──────────────────────────
// These functions are duplicated from src/seed.js because the Blob classic
// worker cannot use ES module imports. When seed.js changes, update here too.
// Last synced: [date]
function xmur3(str) { ... }
function splitmix32(seed) { ... }
function seedFor(worldSeed, domainTag, ...coords) { ... }
// ── END PASTE ────────────────────────────────────────────────────────────────
```

The Worker also contains the complete height formula — `createNoise2D` instances for coarse, fine, and regional layers — initialized once on the `{type:'init', worldSeed}` message and reused for all subsequent `generate` requests.

**Tradeoffs of this mechanism:**

| Concern | Verbatim Paste | Alternative: Module Worker |
|---------|---------------|--------------------------|
| No-build-system compatible | YES — Blob classic worker works on any HTTP server including GitHub Pages | NO — `type:'module'` workers are not supported on Firefox (as of 2026) and require actual HTTP URL-reachable modules, not importmap aliases |
| Single source of truth | PARTIAL — the formula is truly single-source (only in WORKER_SOURCE). The seed functions exist in two places but one is the authority | YES — a real module would be imported by both |
| Sync risk | LOW if the comment policy is enforced. The WORKER_SOURCE paste is inert dead code until worldSeed changes. The paste only needs to match when the function signature or algorithm changes — rare. | None |
| Debug ease | Easy — the WORKER_SOURCE is a string literal; inspect it with console.log or search | Same |
| Cross-browser | All modern browsers support Blob + classic Worker | Module Workers: Chrome-only reliable as of mid-2026 |

**Verdict:** Verbatim paste is the correct mechanism for this project. Module Workers are blocked by Firefox support gaps and the no-build-system constraint. The risk is managed by a sync-date comment and a determinism test in P7 that catches divergence automatically.

**Rule:** The height formula (the noise arithmetic in `self.onmessage`) lives only in `WORKER_SOURCE`. The PRNG/seed functions live in `seed.js` (authority) and are pasted into `WORKER_SOURCE`. The road carve blend function lives in `road.js` and is called from both `_flushPendingQueue` and `sampleHeight` — never pasted into the Worker (the Worker does not do road carve; it only computes raw terrain heights).

---

## Deterministic Infinite Road Tile-Graph — Shape and Spatial Index

### Tile-Graph Structure

A road tile-graph tile is a 64×64 m unit (matching the terrain chunk grid). Each tile stores:
- **Entry/exit waypoints on each edge** — fixed positions on the N/S/E/W edges, derived from `seedFor(worldSeed, "edge", tileX, tileZ, edgeId)`. Both the tile that owns the edge and the neighboring tile that shares it derive the waypoint using the same function. They will agree without communicating.
- **A routed path** — ordered `THREE.Vector3[]` control points from the entry waypoint to the exit waypoint, computed by A* over `coarseHeight(x,z)` with slope-weighted cost and a hard grade cap. Switchbacks emerge when the grade cap forces the router to zigzag.
- **A `THREE.CatmullRomCurve3` spline** — fitted through the control points. The entry and exit tangents are constrained to match the incoming tangent from adjacent tiles (C1 continuity enforcement).
- **POI anchors** — `{position, tangent, type}` objects, one or more per tile, placed at low-slope road-adjacent sites via `seedFor(worldSeed, "poi", tileX, tileZ)`.

```javascript
// road.js — tile record shape
const roadTile = {
    tileKey: '3,7',                         // tileX,tileZ string key
    spline: THREE.CatmullRomCurve3,         // fitted through waypoints
    controlPoints: THREE.Vector3[],          // A* output, world coords
    entryTangent: THREE.Vector3,             // from previous tile; constrains spline start
    exitTangent: THREE.Vector3,              // constrains spline end; given to next tile
    poiAnchors: [{position, tangent, type}], // seeded data contract only
}
```

### The Pure coarseHeight(x,z) Function

Road routing must never call `terrainSystem.sampleHeight(x, z)` — that function depends on which chunks are loaded, breaking the determinism contract. Instead, `road.js` exports and uses a `coarseHeight(x,z)` function that is a pure function of `(worldSeed, x, z)`, recomputing the coarse noise layer directly (no chunk cache). It is cheap — one `createNoise2D` call per sample, ~5 µs.

```javascript
// road.js (module scope) — initialized once after worldSeed is known
let _coarseNoise = null

export function initCoarseHeight(worldSeed) {
    // Same permutation as the Worker's coarse layer; seedFor uses identical key
    _coarseNoise = createNoise2D(seedFor(worldSeed, "coarse"))
}

export function coarseHeight(wx, wz) {
    // Ridged multifractal, same octaves/amplitudes as Worker COARSE layer only
    // Does NOT include fine layer or regional roughness — those are suspension texture,
    // not relevant to road routing grade calculations.
    const r0 = 1.0 - Math.abs(_coarseNoise(wx * 0.02, wz * 0.02))
    const r1 = 1.0 - Math.abs(_coarseNoise(wx * 0.04, wz * 0.04)) * 0.5
    return (r0 + r1) * COARSE_AMPLITUDE
}
```

`coarseHeight` also serves as the coarse octave inside the Worker's height formula — both share the same permutation because both call `seedFor(worldSeed, "coarse")` through the same (or pasted-verbatim) `seedFor` function.

### Spatial Index Integration with Chunk Streaming

The road tile-graph is stored in a `Map<string, roadTile>` on the main thread — separate from `TerrainSystem._chunkMap`. It is never evicted when a terrain chunk leaves the ring. Roads are persistent; terrain chunks are recycled.

Integration with the existing chunk pipeline:

```
_updateChunkRing(ccx, ccz):
  for each key in needed:
    if not in _chunkMap and not in _pendingWorker:
      ① roadGraph.ensureTile(cx, cz)   ← NEW: compute and cache road tile synchronously
                                          (pure fn, fast, no I/O — done before worker post)
      ② _pendingWorker.add(key)
      ③ _worker.postMessage({type:'generate', cx, cz, key, worldSeed})
```

`roadGraph.ensureTile(cx, cz)` runs synchronously on the main thread before the Worker is posted. Since it calls only `coarseHeight` (pure, cheap) and A* on a 64×64 grid (max ~64 nodes, sub-millisecond), it does not spike the frame. The road tile is always ready when `_flushPendingQueue` builds the mesh — no double-build from late road data.

Road carve queries in `sampleHeight` use a per-chunk `Float32Array` carve-weight map (65×65, matching the terrain grid) stored alongside `chunk.heights` in `_chunkMap`. It is built during `_flushPendingQueue` by evaluating `road.roadCarveWeight(wx, wz)` once per vertex. Lookup at physics time is a single bilinear on this second array — O(1), same cost as the terrain height lookup.

---

## Road Carve Integration — Where It Hooks In (Mesh-Physics Agreement)

This is the highest-risk integration point. The rule from PITFALLS.md is: carve is a post-read blend, never baked into `chunk.heights`.

### Data Flow

```
Worker Float32Array heights (raw terrain) → chunk.heights  [NEVER modified after storage]
                                                 │
                          ┌──────────────────────┤
                          │ _flushPendingQueue   │        road.roadCarveWeight(wx, wz)
                          │                      ▼               │
                          │  vertex Y = (heights[i] * amp)       │
                          │           + carveBlend(wx,wz,        │
                          │               roadSurfaceY, weight)  │◄──────────────────────
                          │                                       │
                          │ sampleHeight(wx,wz)                  │
                          │  raw = bilinear(chunk.heights)        │
                          │  return carveBlend(raw*amp,           │
                          │           roadSurfaceY,weight)  ◄─────
                          └──────────────────────────────────────
```

Both paths call the same `carveBlend(terrainH, roadH, weight)` function. The function is:

```javascript
// road.js — exported pure function
export function carveBlend(terrainH, roadH, weight) {
    // cut-biased: road can only carve down, never fill up
    const carvingRoadH = Math.min(roadH, terrainH)
    return terrainH * (1 - weight) + carvingRoadH * weight
}
```

`roadCarveWeight(wx, wz)` returns the smoothstep-tapered blend weight (1.0 on centerline, 0.0 beyond shoulder + taper zone). `roadSurfaceHeight(wx, wz)` evaluates the road ribbon elevation at that point via the spline + crown formula. Both are provided by `road.js` / `road-mesh.js`.

The per-chunk carve-weight `Float32Array` is built once in `_flushPendingQueue` and stored as `chunk.carveWeights`. `sampleHeight` bilinearly samples this array for the weight — the same O(1) path used for terrain heights. The road surface height is NOT cached per-chunk; it is recomputed from the spline on each `sampleHeight` call. This is acceptable because spline evaluation is fast (~10 µs) and the road contact zone is small (18 probes × 10 µs = 0.18 ms budget, within the 0.2 ms cap from PITFALLS.md).

If road surface height evaluation proves too slow under profiling, it can be cached into a second `Float32Array` per chunk alongside `chunk.carveWeights` — same build pattern, same bilinear lookup. This optimization should not be pre-applied; measure first.

### queryContacts and queryVertexContacts Changes

Both functions in `main.js` currently call `terrainSystem.sampleHeight(px, pz)` and `terrainSystem.sampleNormal(px, pz)`. In v1.1 these calls are unchanged — the carve blend is integrated into `sampleHeight` and `sampleNormal` already accounts for it (central-diff on the blended height). No changes to the queryContacts function signature or callers in `stepPhysics`.

Road surface normals (crown + camber) require one additional check: if the probe is within the road corridor, `sampleNormal` returns the road surface normal rather than the raw terrain central-difference normal. This is handled by a `isOnRoad(wx, wz)` boolean (fast AABB test against road tile bounding boxes) inside `sampleNormal`. When true, the road normal is returned from `road-mesh.roadNormalAt(wx, wz)`.

---

## Free-Fly Camera Integration

### Where it Slots In

`camera.js` already uses a `cameraMode` string variable ('chase' | 'cockpit'). Free-cam adds a third mode: 'fly'. The `updateCamera(camera, vehicleState, dt)` export gains an additional branch, extending the existing if/else chain. No signature change.

Free-cam input (WASD for movement, mouse for look) is handled inside `camera.js` using module-level event listeners, exactly as the existing drag-orbit mouse handlers work. The key concern from PITFALLS.md is input isolation: camera.js event listeners must not write to `vehicleState`.

The free-cam state is module-local:
```javascript
// camera.js additions (module scope)
let freeCamPos    = new THREE.Vector3()    // world position of free cam
let freeCamYaw    = 0                      // radians
let freeCamPitch  = 0                      // radians
const FLY_SPEED   = 20                     // m/s baseline
```

### Input Gating in main.js

The physics loop in `main.js` calls `updateVehicle(vehicleState, RANGER_PARAMS, PHYSICS_DT)` which reads keyboard input. When free-cam is active, the car must receive zero throttle/brake/steer (it idles to a stop via rolling resistance and tire damping). The gate is:

```javascript
// main.js — inside fixed-step accumulator
import { getCameraMode } from './camera.js'

// Before updateVehicle:
if (getCameraMode() === 'fly') {
    // Force all car inputs to neutral — car idles while free-cam is active
    vehicleState.throttle = 0
    vehicleState.brake    = 0
    vehicleState.steerAngle = 0
}
const resetRequested = updateVehicle(vehicleState, RANGER_PARAMS, PHYSICS_DT)
```

`getCameraMode()` is already exported from `camera.js` (line 116 of the current source).

### Snap-Free Mode Exit

When toggling from 'fly' back to 'chase', the chase camera's internal position state is stale. On the first chase frame, set camera position hard before the exponential follow runs:

```javascript
// camera.js — inside updateCamera, on mode transition to chase
if (prevMode === 'fly' && cameraMode === 'chase') {
    const yawQ = ...  // yaw-only from vehicleState.quaternion
    const goalOffset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(yawQ)
    camera.position.copy(vehicleState.position).add(goalOffset)  // hard snap
    orbitTheta = ... ; orbitPhi = ...  // re-sync orbit angles
}
```

---

## Module Additions vs Modifications

### New Modules

| Module | Phase | Imports | Imported By |
|--------|-------|---------|------------|
| `src/seed.js` | P7 | Nothing | `main.js`, `terrain.js` (indirectly via paste in WORKER_SOURCE), `road.js` |
| `src/road.js` | P8 | `three` (CatmullRomCurve3), `src/seed.js` | `main.js`, `terrain.js` (_flushPendingQueue), `road-mesh.js` |
| `src/road-mesh.js` | P9 | `three`, `src/road.js` | `main.js` |

The dependency direction rule from STACK.md ("dependency direction is strictly one-way") is preserved: seed.js has no imports; road.js imports seed.js and THREE; road-mesh.js imports road.js and THREE. None of the new modules import from the physics pipeline (tire.js, suspension.js, physics.js, vehicle.js).

### Modified Modules

| Module | What Changes |
|--------|-------------|
| `src/terrain.js` | WORKER_SOURCE: adds seed.js paste block, worldSeed init message, 3-layer ridged height formula replacing flat 3-octave fBm. TerrainSystem: adds `worldSeed` param to constructor; `_updateChunkRing` calls `roadGraph.ensureTile` before Worker post; `_flushPendingQueue` builds `chunk.carveWeights` and applies carve blend to vertex Y; `sampleHeight` applies carve blend post-bilinear; `sampleNormal` calls `isOnRoad` and returns road normal when true. |
| `src/camera.js` | Adds 'fly' mode to `cameraMode`; module-scope freeCamPos/freeCamYaw/freeCamPitch state; WASD + mouse look handlers (mode-gated); hard-snap logic on return to chase; `getCameraMode()` already exported. |
| `src/main.js` | worldSeed from URLSearchParams; passes worldSeed to TerrainSystem constructor; input gate (`if getCameraMode() === 'fly'`); `queryContacts`/`queryVertexContacts` unchanged (carve is inside sampleHeight); debug panel wiring for seed slider + resetWorld callback. |
| `src/debug.js` | World-seed string controller; URL replaceState on seed change; free-cam overlay (HUD dim). |

---

## Build Integration Order (P7 → P10)

The order below is driven by dependency: each phase's work depends on the previous phase's contracts being established.

### Phase 7 — Free-Cam + Seeded Layered Terrain

**Dependency gate:** Free-cam must ship first within P7 so terrain is observable during tuning.

1. **seed.js** — implement and freeze `seedFor()` / `stringToSeed()`. Write determinism test. No other P7 code runs until this passes.
2. **camera.js** — add 'fly' mode. Test: toggle fly, drive 30 s, return; car is intact; no camera snap.
3. **terrain.js WORKER_SOURCE** — paste seed.js functions; add worldSeed init message; replace the fixed `() => 0.5` stub with seeded PRNGs for three noise layers; add ridged multifractal coarse layer formula.
4. **terrain.js main thread** — wire worldSeed into TerrainSystem constructor; wire `terrainAmplitude` behavior (unchanged).
5. **main.js** — URLSearchParams seed read; debug panel seed slider; resetWorld on seed change.
6. **Height-agreement test** — assert `sampleHeight(x,z)` == bilinear of `chunk.heights * amp` at 5 world positions. Must pass before P7 closes.

**P7 exports as contracts for P8:** `seedFor(worldSeed, tag, ...coords)`, `coarseHeight(wx,wz)` (pure, no chunk deps), and a working 3-layer `height(wx,wz)` formula inside WORKER_SOURCE.

### Phase 8 — Road Routing

**Dependency gate:** `coarseHeight(wx,wz)` from P7 must exist. Pure, no chunk dependency.

1. **road.js** — implement `initCoarseHeight(worldSeed)`, `coarseHeight(wx,wz)`, tile-keyed A* router with grade-weighted cost and switchback emergence.
2. **terrain.js** — wire `roadGraph.ensureTile(cx,cz)` into `_updateChunkRing` before Worker post.
3. **Debug spline visualization** — `THREE.Line` per tile using spline points. Verify no kinks at tile seam boundaries (multiples of 64m). Verify no self-crossing switchback arms.
4. **Determinism test for routing** — same seed + same drive path → identical splines on two page loads.

**P8 ships:** queryable CatmullRomCurve3 splines per tile, debug-visualized, no mesh yet.

### Phase 9 — Road Surface

**Dependency gate:** P8 splines must be stable. The carve blend design must be specified before any mesh or physics code is written (per PITFALLS.md Pitfall 5).

1. **road.js additions** — `roadCarveWeight(wx,wz)` smoothstep blend; `roadSurfaceHeight(wx,wz)` ribbon elevation; `isOnRoad(wx,wz)` corridor test; `roadNormalAt(wx,wz)` crown+camber normal.
2. **terrain.js** — `_flushPendingQueue` builds `chunk.carveWeights` Float32Array; applies carve blend to vertex Y. `sampleHeight` applies carve post-bilinear. `sampleNormal` returns road normal inside corridor.
3. **road-mesh.js** — ribbon BufferGeometry; CanvasTexture asphalt; road Mesh added to scene.
4. **Height-agreement test extended to on-road positions** — assert carve is identical in mesh and sampleHeight.
5. **Shoulder test** — `sampleHeight` at (63.0, z), (64.0, z), (65.0, z) across a chunk seam shows no cliff.

### Phase 10 — POI Hooks + Polish

**Dependency gate:** P9 stable road surface.

1. **road.js additions** — `poiAnchors[]` on each tile record; `seedFor(worldSeed, "poi", tileX, tileZ)` drives placement. Expose `getRoadTile(tileX, tileZ).poiAnchors` as the data contract API.
2. **Stretch: pothole/crack micro-noise** — additive noise term applied only within road corridor in `roadSurfaceHeight`. Must be baked into carve heights (not re-evaluated per physics call) or proven to be within the 0.2 ms/frame physics budget.

---

## Data Flow Diagrams

### Terrain Height Data Flow (v1.1)

```
worldSeed
    │
    ├── seedFor("coarse") → createNoise2D (Worker) → ridged FBM coarse layer
    ├── seedFor("fine")   → createNoise2D (Worker) → 3-octave fBm fine layer
    └── seedFor("regional") → createNoise2D (Worker) → low-freq regional multiplier
                                                  │
                                     Worker height formula → Float32Array
                                                  │
                                         postMessage to main thread
                                                  │
                                     _flushPendingQueue:
                                       chunk.heights = Float32Array   ← NEVER modified
                                       chunk.carveWeights = road.roadCarveWeight(x,z) per vertex
                                       vertex Y = carveBlend(heights[i]*amp, roadSurfaceH, weight)
                                                  │
                                                  ▼
                              sampleHeight(wx,wz):
                                bilinear(chunk.heights) * amp  →  carveBlend  →  return
                                                  │
                              queryContacts / queryVertexContacts → stepPhysics
```

### Road Tile Lifecycle

```
_updateChunkRing sees new tile (cx,cz):
    │
    ├── roadGraph.ensureTile(cx,cz)     ← synchronous, pure, fast
    │       │
    │       └── coarseHeight(x,z) (pure fn, no chunk deps)
    │           → A* route → CatmullRomCurve3 spline
    │           → tile stored in roadGraph.Map (never evicted)
    │
    └── worker.postMessage({type:'generate', cx, cz, key, worldSeed})
            │
            └── Worker → Float32Array → _pendingQueue → _flushPendingQueue
                    │
                    └── chunk.carveWeights built from roadGraph.roadCarveWeight(x,z)
                        chunk stored in _chunkMap
```

---

## Anti-Patterns

### Anti-Pattern 1: Recomputing Noise in sampleHeight

**What people do:** Add a fallback `noise2D(wx,wz)` call inside `sampleHeight` for "consistency" when a chunk isn't loaded, or inline the new layered formula directly in `sampleHeight` to avoid the chunk cache.
**Why it's wrong:** `sampleHeight` is called 18+ times per physics step at 60 Hz. Three-layer noise is ~9 noise evaluations per call = ~9,720 evaluations/frame. This adds ~0.5–1 ms per frame. The current system is O(1) bilinear on a Float32Array: ~5 ns per call.
**Do this instead:** Always read from `chunk.heights`. When chunk is not loaded, return 0 (the existing safe fallback). Never call noise from main-thread hot path.

### Anti-Pattern 2: Modifying chunk.heights for Road Carve

**What people do:** Apply road carve by subtracting from `chunk.heights[i]` values directly, keeping a single array.
**Why it's wrong:** `rebuildAllChunks()` re-scales all vertex Y positions from `chunk.heights * amp`. If carve is baked in, it gets rescaled with the terrain amplitude, double-scaling the carved depth whenever the debug amplitude slider is moved. There is no way to reverse the carve to update it when roads change.
**Do this instead:** Keep `chunk.heights` as the raw Worker output, always unmodified. Store carve in `chunk.carveWeights`. Apply carve as a post-read blend in `sampleHeight` and during `_flushPendingQueue` vertex write.

### Anti-Pattern 3: Routing Over terrainSystem.sampleHeight

**What people do:** Route roads using `terrainSystem.sampleHeight(x,z)` because it already exists and "has all the height data."
**Why it's wrong:** `sampleHeight` returns 0 for unloaded chunks. Road routing depends on which chunks happen to be loaded at the moment routing runs. Same seed, different chunk-load order = different roads.
**Do this instead:** Route over `coarseHeight(wx,wz)` — a pure function of `(worldSeed, x, z)` with no chunk dependencies. Always available, always deterministic.

### Anti-Pattern 4: Module Worker Instead of Blob Classic Worker

**What people do:** Attempt to use `{type: 'module'}` in the Worker constructor to allow `import` statements, solving the shared-code problem cleanly.
**Why it's wrong:** Module Workers are not supported in Firefox as of mid-2026. The project must work on all modern browsers, not just Chrome. GitHub Pages serves the project to general users.
**Do this instead:** Verbatim paste of `seed.js` pure functions into `WORKER_SOURCE`. Mark with sync-date comment. Enforce the determinism test that catches drift.

### Anti-Pattern 5: Writing vehicleState from camera.js Free-Cam WASD

**What people do:** Reuse the car's WASD input handler for free-cam movement, writing directly to `vehicleState.position`.
**Why it's wrong:** On free-cam exit, the car has teleported. The physics integrator resumes from an incorrect position, causing a collision spike. The vehicle and camera states are decoupled by design.
**Do this instead:** Free-cam maintains its own `freeCamPos` and `freeCamQuat` state entirely within `camera.js`. It never touches `vehicleState`.

### Anti-Pattern 6: O(N) Road Spline Iteration in sampleHeight

**What people do:** Call a `findNearestRoadSegment(wx, wz)` function inside `sampleHeight` that iterates all spline segments.
**Why it's wrong:** O(segments) × 18 probes × 60 Hz = catastrophic. 200 segments × 1,080 calls/s × 50 ns/segment = ~11 ms/frame.
**Do this instead:** Build the per-chunk `chunk.carveWeights` Float32Array once at mesh-build time. Lookup is O(1) bilinear, same as terrain height.

---

## Integration Points Against Real Modules

| Integration | Real Module | Hook Point | Change |
|-------------|-------------|-----------|--------|
| worldSeed → Worker | `terrain.js` WORKER_SOURCE | Add `{type:'init', worldSeed}` message; Worker stores seed, initializes 3 noise fns before first generate | Worker gains init handler and seed-derived PRNGs |
| worldSeed → URL param | `main.js` | `URLSearchParams` parse before TerrainSystem constructor | New: 5-line URL read |
| Road tile ensure before Worker post | `terrain.js` `_updateChunkRing` | Insert `roadGraph.ensureTile(cx,cz)` before `_worker.postMessage(...)` | New: 1-line call |
| Carve weights build | `terrain.js` `_flushPendingQueue` | After storing `chunk.heights`, build `chunk.carveWeights` Float32Array from `road.roadCarveWeight` | New: ~10 line loop, same pattern as heights |
| Carve blend in vertex write | `terrain.js` `_flushPendingQueue` | `pos.setY(i, carveBlend(heights[i]*amp, roadSurfaceH, weight))` replaces `pos.setY(i, heights[i]*amp)` | ~3 line change |
| Carve blend in sampleHeight | `terrain.js` `sampleHeight` | After bilinear raw compute, before `return`: `return carveBlend(raw*amp, roadSurfaceH, weight)` | ~5 line change |
| Road normal in sampleNormal | `terrain.js` `sampleNormal` | Before central-diff: `if (road.isOnRoad(wx,wz)) return road.roadNormalAt(wx,wz)` | ~3 line change |
| Free-cam input gate | `main.js` physics loop | Before `updateVehicle(...)`: if fly mode, zero throttle/brake/steer on vehicleState | ~5 line addition |
| Free-cam mode | `camera.js` `updateCamera` | Add 'fly' branch to if/else; module-level freeCamPos/freeCamYaw state; WASD listeners | ~60 line addition, no signature change |
| Seed slider + URL update | `debug.js` | lil-gui `onFinishChange` → `window.history.replaceState` + `resetWorld(newSeed)` | ~15 line addition |

---

## Scalability Considerations

This is a browser sim, not a web service. "Scale" here means terrain/road complexity vs 60fps budget.

| Concern | Current Headroom | v1.1 Risk | Mitigation |
|---------|-----------------|-----------|------------|
| `sampleHeight` per physics frame | ~5 ns × 18 probes = ~90 ns/frame | Carve blend adds ~10 ns/probe = ~180 ns/frame total | Acceptable; stays well under 0.2 ms budget |
| Road spline evaluation in sampleHeight | N/A today | ~10 µs × 18 = 180 µs/frame if not cached | Cache carveWeights as Float32Array; only evaluate spline at chunk-build time for carveWeights. Surface height for physics: evaluate spline per-call only when isOnRoad() is true (most probes are off-road). |
| A* routing per new tile | N/A today | Sub-millisecond at 64×64 coarse grid, synchronous before Worker post | No issue. If switchback routes require wider search, cap the grid resolution or limit search depth. |
| Road tile-graph memory | N/A today | ~1 KB per tile record (spline + control points + tangents + POI). 100 tiles = 100 KB | Trivial. Road tiles are never evicted; a 10-minute drive generates ~200 tiles = ~200 KB. |
| Worker noise computation | ~0.5–0.7 ms/chunk for 3-layer formula | Acceptable; Worker runs off main thread | If the player sprints across tile corners (4 chunks simultaneously), the `MAX_BUILDS_PER_FRAME = 2` cap absorbs the queue. Worker backlog grows but main thread stays smooth. |

---

## Sources

- `src/terrain.js` (live codebase, 2026-06-05): WORKER_SOURCE structure, _updateChunkRing, _flushPendingQueue, sampleHeight bilinear, rebuildAllChunks amplitude path, _pendingWorker reservation guard.
- `src/main.js` (live codebase, 2026-06-05): queryContacts, queryVertexContacts, fixed-step accumulator, TerrainSystem init, camera wiring.
- `src/camera.js` (live codebase, 2026-06-05): cameraMode string, getCameraMode() export, existing drag-orbit module-level state pattern.
- `.planning/v1.1-BLUEPRINT-DRAFT.md` (2026-06-04): Phase structure, "#1 correctness constraint" (unified height fn), HARD RULE (pure function of worldSeed + coords), carried-forward constraints.
- `.planning/research/STACK.md` v1.1 section (2026-06-05): seed.js module proposed, road.js + road-mesh.js proposed, WORKER_SOURCE paste mechanism, CatmullRomCurve3 confirmed core Three.js, CanvasTexture asphalt pattern.
- `.planning/research/PITFALLS.md` (2026-06-05): Mesh/physics divergence paths, road carve must be post-read blend, routing must use pure coarseHeight, O(1) carve lookup requirement, free-cam state isolation, chunk rebuild thrash prevention.
- `.planning/PROJECT.md` (2026-06-05): Module responsibility table, key decisions log, coordinate system convention.
- MDN Web Workers API: module worker browser support gaps (confirmed Firefox does not support module workers as of mid-2026). https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker

---
*Architecture research for: v1.1 Mountains & Roads (RangerSim)*
*Researched: 2026-06-05*

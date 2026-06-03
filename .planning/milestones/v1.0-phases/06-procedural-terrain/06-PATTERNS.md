# Phase 6: Procedural Terrain — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/terrain.js` | service | request-response (sync query) + event-driven (worker receive) | `src/main.js` (terrain stub + ramp geometry, lines 289–479) | role-match (logic extracted from main into own module) |
| `src/terrain-worker.js` | utility | batch (Float32Array generation) | none — no workers exist yet | no analog |
| `src/main.js` (modified) | entry-point | request-response | `src/main.js` itself — existing queryContacts / queryVertexContacts (lines 396–479) | exact (in-place modification) |
| `data/ranger.js` or `data/vehicles.js` (possibly modified) | config | — | `data/ranger.js` / `data/vehicles.js` (lines 1–30) | exact |

---

## Pattern Assignments

### `src/terrain.js` (service, request-response + event-driven)

**Analog:** `src/main.js` — existing terrain stub, ramp geometry definitions, and queryContacts/queryVertexContacts functions (lines 289–479)

**Imports pattern** — matches all other `src/*.js` files:
```javascript
// src/terrain.js
import * as THREE from 'three'
```
No other imports needed. TerrainSystem is self-contained. THREE is available via importmap.
Do NOT import Three.js inside the worker (blob context — importmap unavailable).

**Module export pattern** (matches `src/vehicle.js` lines 23–54, `src/physics.js` line 111):
```javascript
// Named class export — matches the "named export" convention used throughout src/
export class TerrainSystem { ... }
```
No default exports in this codebase. All exports are named.

**Scene mutation pattern** — TerrainSystem needs `scene` reference. Follow how debug.js receives
`params` and camera.js receives nothing (pure computation). Pass `scene` into the constructor,
not as a global:
```javascript
// src/camera.js line 1 pattern — pure function, no scene ref needed in module scope
// src/main.js lines 499–500 — passes params ref into initDebug; same pattern for terrain:
//   const terrainSystem = new TerrainSystem(scene, RANGER_PARAMS)
```

**Blob worker spawn pattern** — no existing analog in codebase; use RESEARCH.md Pattern 3.
Key constraint from CLAUDE.md: no Web Workers for physics (but terrain generation is not
physics — it is background geometry work; this constraint targets physics integration only).

**Height/normal query pattern** — the existing `terrain()` stub (lines 322–330) is the locked
interface this replaces. The new `sampleHeight`/`sampleNormal` methods must fulfill the same
contract (`terrain(x,z)` currently returns `{ height, normal }`):
```javascript
// src/main.js lines 322–330 — existing stub (LOCKED SIGNATURE per M1-13 comment)
function terrain (x, z) {
  if (Math.abs(x) > RAMP_WIDTH / 2) return { height: 0, normal: _flatNormal }
  const distIntoRamp = RAMP_START_Z - z
  if (distIntoRamp > 0 && distIntoRamp <= RAMP_LENGTH) {
    return { height: distIntoRamp * Math.tan(RAMP_ANGLE), normal: _rampNormal }
  }
  return { height: 0, normal: _flatNormal }
}
window.terrain = terrain
```
The new TerrainSystem exposes `sampleHeight(wx, wz)` and `sampleNormal(wx, wz)` as separate
methods (per RESEARCH.md Pattern 4 and Pattern 5). Return `0` / `{x:0,y:1,z:0}` when chunk
not loaded — matches the existing fallback-to-flat-ground behavior.

**Chunk ring update pattern** — called each frame before physics, analogous to how
`syncMeshesToState(vehicleState)` is called each frame (main.js line 588):
```javascript
// src/main.js lines 588–598 — per-frame non-physics update pattern to copy:
syncMeshesToState(vehicleState)
// Snap ground and grid to car position so they appear infinite.
const CELL = 2
const snapX = Math.round(vehicleState.position.x / CELL) * CELL
const snapZ = Math.round(vehicleState.position.z / CELL) * CELL
ground.position.x = snapX
ground.position.z = snapZ
grid.position.x   = snapX
grid.position.z   = snapZ
```
`terrainSystem.update(vehicleState.position)` belongs OUTSIDE the fixed accumulator (render
rate), same as `syncMeshesToState`. Chunk streaming is visual/async; it must not block physics.

**Geometry disposal pattern** — no existing chunk recycling, but the existing ramp mesh shows
how Three.js mesh creation works. The anti-pattern to avoid: when evicting a chunk, always
call `chunk.mesh.geometry.dispose()` but NOT `material.dispose()` (material is shared across
all terrain chunks). See RESEARCH.md Pitfall 4.

**THREE.PlaneGeometry + rotation pattern** (from main.js lines 144–154 and 484–491):
```javascript
// Flat ground (main.js lines 144–154):
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
)
ground.rotation.x = -Math.PI / 2   // PlaneGeometry is XY-plane; rotate to XZ
ground.receiveShadow = true
scene.add(ground)

// Ramp mesh (main.js lines 484–491):
const rampMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(RAMP_WIDTH, RAMP_LENGTH),
  new THREE.MeshPhongMaterial({ color: 0x885522, side: THREE.DoubleSide })
)
rampMesh.rotation.x = -Math.PI / 2 + RAMP_ANGLE
rampMesh.receiveShadow = true
scene.add(rampMesh)
```
Terrain chunks use the same `PlaneGeometry(S, S, N-1, N-1)` + `rotateX(-Math.PI/2)` approach,
then overwrite per-vertex Y values from the heights Float32Array (RESEARCH.md Pattern 6).

**Shadow pattern** — copy `receiveShadow = true` from ground/ramp. Terrain chunks are the
ground; they receive shadows. They do NOT need `castShadow`.

**Shared terrain material** — declare one `MeshPhongMaterial` at class construction, reuse
across all chunk meshes:
```javascript
// Matches the shared wheelMat pattern (main.js lines 184–185):
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
// ... wheelMeshes all share wheelMat
```
For terrain use `MeshPhongMaterial` (matches existing ground and ramp materials).

---

### `src/terrain-worker.js` (utility, batch)

**Analog:** None — no existing workers in codebase.

**Pattern source:** RESEARCH.md Pattern 3 (Blob classic worker) is the authoritative reference.

**Key constraint:** This file is NOT imported as an ES6 module. It is read as a string literal
embedded in `terrain.js` and spawned as a Blob URL classic worker. Therefore:
- No `import` statements (no importmap, no Three.js)
- No `export` statements
- Uses `self.onmessage` and `self.postMessage`
- Uses `importScripts()` if any external library needed (but recommendation is inline simplex)

**Message protocol pattern** — use typed messages with a `type` discriminator field, matching
the general event-driven convention in the project:
```javascript
// Worker receives:
{ type: 'generate', cx, cz, key }

// Worker posts back:
{ key, cx, cz, heights }   // heights.buffer is in the transferable array
self.postMessage({ key, cx, cz, heights }, [heights.buffer])
```

**Float32Array transferable pattern** — no existing analog in codebase. Use RESEARCH.md
Pattern 3 and Pattern 6. `heights.buffer` goes in the transfer list to avoid copying.

---

### `src/main.js` — queryContacts modification (lines 447–479)

**Analog:** Itself — the existing function at lines 447–479 is the base to modify.

**Existing queryContacts to be replaced** (lines 447–479):
```javascript
// src/main.js lines 447–479 — FULL FUNCTION (copy as base, extend ground section)
function queryContacts (cx, cy, cz, r) {
  const hits = []

  // Ground half-space (y = 0, normal +Y) — unchanged
  const gd = r - cy
  if (gd > 0) hits.push({
    normal: _flatNormal.clone(),
    depth: gd,
    contactPoint: new THREE.Vector3(cx, 0, cz)
  })

  // Triangle mesh contacts — sphere vs each ramp triangle
  for (const [[ax, ay, az], [bx, by, bz], [ex, ey, ez]] of RAMP_TRIS) {
    const cp = closestPointOnTriangle(cx, cy, cz, ax, ay, az, bx, by, bz, ex, ey, ez)
    const dx = cx - cp.x, dy = cy - cp.y, dz = cz - cp.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const depth = r - dist
    if (depth <= 0) continue
    if (dist < 1e-8) continue
    const inv = 1 / dist
    hits.push({
      normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),
      depth,
      contactPoint: cp
    })
  }

  return hits
}
```

**Ground half-space replacement** — replace the 5-line flat-ground block (lines 451–456) with:
```javascript
// Phase 6: replace flat ground half-space with terrain height query
const terrainH = terrainSystem ? terrainSystem.sampleHeight(cx, cz) : 0
const gd = terrainH + r - cy
if (gd > 0) {
  const n = terrainSystem ? terrainSystem.sampleNormal(cx, cz) : { x: 0, y: 1, z: 0 }
  hits.push({
    normal:       new THREE.Vector3(n.x, n.y, n.z),
    depth:        gd,
    contactPoint: new THREE.Vector3(cx, terrainH, cz)
  })
}
```
The ramp triangle section (lines 458–478) is UNCHANGED.

**Existing queryVertexContacts to be modified** (lines 396–438):
```javascript
// src/main.js lines 396–438 — ground half-space section (lines 398–401):
// Ground half-space (y = 0)
if (py < 0) {
  hits.push({ normal: _flatNormal.clone(), depth: -py })
}
```
Replace the ground half-space block with:
```javascript
// Phase 6: replace flat ground half-space with terrain height query
const terrainH = terrainSystem ? terrainSystem.sampleHeight(px, pz) : 0
if (py < terrainH) {
  hits.push({ normal: _flatNormal.clone(), depth: terrainH - py })
}
```
All other blocks in `queryVertexContacts` (ramp top incline, back wall, side walls at lines
405–435) are UNCHANGED.

**TerrainSystem wiring pattern** — follow how `initDebug(RANGER_PARAMS)` is called at module
scope (main.js line 500). TerrainSystem is instantiated at module scope, passed scene:
```javascript
// src/main.js line 499–500 — module-scope service init pattern:
initDebug(RANGER_PARAMS)
// Phase 6 addition follows same pattern:
// const terrainSystem = new TerrainSystem(scene, RANGER_PARAMS)
```

**Per-frame terrain update** — insert inside `loop()` OUTSIDE the fixed accumulator, alongside
`syncMeshesToState` (line 588). Before the physics accumulator `while` loop, update the chunk
ring; after, update meshes. Or update ring at render rate (outside accumulator entirely):
```javascript
// src/main.js lines 532–586 — game loop showing where to add terrain.update():
// OUTSIDE accumulator (render rate — chunk streaming is not physics):
// terrainSystem.update(vehicleState.position)

while (accumulator >= PHYSICS_DT) {
  // existing physics steps unchanged
  stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, queryVertexContacts)
  ...
}

syncMeshesToState(vehicleState)
// terrain mesh updates from pending queue go here too (1-2 builds per frame)
```

**Flat ground mesh removal** — the existing 200×200 ground plane (lines 144–151) is replaced
by terrain chunks. It should be removed or hidden once `terrainSystem` is initialized.
Pattern for removal: `scene.remove(ground)` after TerrainSystem construction.
The `grid` GridHelper (line 154) can remain for reference; it snaps to car position each frame.

**Spawn height adjustment** — `computeStaticEquilibrium` (lines 56–79) assumes ground y=0.
The existing spawn at world origin (0,0,0) is safe if `noise2D(0,0) = 0` (standard simplex
returns exactly 0 at lattice points). Verify at runtime; no code change needed for v1.
If adjustment is needed, the reset block (lines 561–579) is where to offset `eq.bodyY`:
```javascript
// src/main.js lines 561–563 — reset pattern (copy + offset for terrain):
const eq = computeStaticEquilibrium(RANGER_PARAMS)
vehicleState.position.set(SPAWN_STATE.positionX, eq.bodyY, SPAWN_STATE.positionZ)
// Phase 6 spawn offset (if needed):
// vehicleState.position.y += terrainSystem.sampleHeight(SPAWN_STATE.positionX, SPAWN_STATE.positionZ)
```

**importmap addition** — `index.html` lines 22–29 show the importmap pattern. Add
`simplex-noise` entry to the imports object (needed by `terrain.js` on the main thread only;
worker uses inlined source):
```html
<!-- index.html lines 22–29 — importmap pattern to extend: -->
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

---

### `data/ranger.js` / `data/vehicles.js` (config, possibly modified)

**Analog:** `data/ranger.js` lines 1–30 (existing pattern).

**Export pattern** (data/ranger.js lines 9, data/vehicles.js lines 9–11):
```javascript
// data/ranger.js — named const export, no Object.freeze
export const RANGER_PARAMS = { ... }

// data/vehicles.js — named const export
export const VEHICLES = { 'Ranger': { ...RANGER_PARAMS }, ... }
```

**No modification likely needed for v1.** Spawn at world origin relies on `noise2D(0,0) = 0`
(verified in RESEARCH.md §Open Questions #1). If terrain amplitude sliders are added to the
debug panel, they go into `RANGER_PARAMS` as new fields (matching how all debug-tunable params
live in `RANGER_PARAMS`, not as standalone variables).

If amplitude tuning fields are added, follow the existing underscore-prefix convention for
runtime-only scratch fields:
```javascript
// data/ranger.js — underscore prefix convention for runtime-mutable params:
// (no underscore = physical parameter that can be tuned)
// terrainAmplitude: 4.0,   // m — low-freq noise amplitude (tunable via debug)
// terrainFrequency: 0.02,  // 1/m — low-freq noise spatial frequency
```

---

## Shared Patterns

### THREE.Vector3 construction in contact hits
**Source:** `src/main.js` lines 452–455, 472–475
**Apply to:** Both `queryContacts` and `queryVertexContacts` terrain sections in main.js, and any contact object built in terrain.js if it produces contacts directly.
```javascript
// Contact hit object shape — every hit must match this exactly (physics.js reads these fields):
{
  normal:       new THREE.Vector3(nx, ny, nz),  // unit vector pointing away from surface
  depth:        gd,                              // positive penetration depth in metres
  contactPoint: new THREE.Vector3(cx, hy, cz)   // world-space point on the surface
}
```

### ES6 named export
**Source:** Every `src/*.js` file
**Apply to:** `src/terrain.js`
```javascript
// All modules use named exports, never default exports:
export class TerrainSystem { ... }
export const CHUNK_SIZE = 64
export const GRID_SAMPLES = 65
```

### No underscore convention for private module state
**Source:** `src/main.js` lines 33–44, `src/physics.js` lines 108–109
**Apply to:** `src/terrain.js` module-level scratch variables
```javascript
// Underscore prefix = module-private or params-internal scratch (not exported):
// RANGER_PARAMS._tireFz, RANGER_PARAMS._suspForceAccum, RANGER_PARAMS._hubNormalXZ
// In terrain.js: _chunkMap, _pendingWorker, _terrainWorker, _pendingQueue are all private
```

### JSDoc function headers
**Source:** Every exported function in `src/*.js` (e.g., physics.js lines 97–107, vehicle.js lines 43–54)
**Apply to:** All exported methods in `src/terrain.js`
```javascript
/**
 * One-line summary.
 *
 * @param {type} name — description
 * @returns {type} description
 */
```

### File-top module docblock
**Source:** `src/main.js` lines 1–16, `src/physics.js` lines 1–22
**Apply to:** `src/terrain.js`
```javascript
/**
 * src/terrain.js — TerrainSystem for RangerSim
 *
 * Responsibilities: [...]
 *
 * Conventions: see docs/GLOSSARY.md
 */
```

### THREE.MeshPhongMaterial for ground surfaces
**Source:** `src/main.js` lines 146–148, 486–487
**Apply to:** terrain chunk material in `src/terrain.js`
```javascript
// Ground and ramp both use MeshPhongMaterial (not MeshStandardMaterial):
new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })  // ground
new THREE.MeshPhongMaterial({ color: 0x885522, side: THREE.DoubleSide })  // ramp
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/terrain-worker.js` | utility | batch (Float32Array generation) | No workers exist anywhere in the codebase. RESEARCH.md Pattern 3 is the authoritative reference. Key points: classic worker (not module worker), inline simplex noise source, `self.onmessage` + `self.postMessage` with `[heights.buffer]` transferable, no `import`/`export`. |

---

## Metadata

**Analog search scope:** `src/`, `data/`, `index.html`
**Files scanned:** `src/main.js` (660 lines, fully read), `src/physics.js` (first 140 lines), `src/vehicle.js` (first 80 lines), `src/debug.js` (first 60 lines), `data/ranger.js` (first 30 lines), `data/vehicles.js` (first 20 lines), `index.html` (first 40 lines)
**Pattern extraction date:** 2026-06-03

### Critical integration notes for planner

1. **queryContacts is passed as a callback** (not imported): `stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, queryVertexContacts)` at main.js line 582. TerrainSystem must be in scope of the closure that defines `queryContacts` in main.js — it does not need to be passed anywhere else.

2. **terrain() stub is called inside the accumulator** (main.js line 555) for M1-13 verification. Phase 6 replaces its body. The call site itself may be replaced by the `queryContacts` extension (which calls `terrainSystem.sampleHeight` directly), making the explicit `terrain()` call redundant.

3. **The flat ground plane must be removed** when terrain chunks activate; otherwise chunks will Z-fight with the ground mesh. The 200×200 `ground` mesh (lines 144–151) should be hidden or removed after `TerrainSystem` construction.

4. **The grid snapping loop** (main.js lines 592–598) moves the GridHelper to follow the car. Terrain chunks do the same job visually, so the grid is optional in Phase 6. Keep it for now; it does not conflict.

5. **stepPhysics failsafe** (main.js/physics.js lines 115–128) checks `hub.y < wheelRadius` for tunnelling. On hilly terrain, `hub.y` is world Y of the wheel hub. This is correct — the failsafe fires only when a wheel is > 0.3 m underground in world space. No change needed.

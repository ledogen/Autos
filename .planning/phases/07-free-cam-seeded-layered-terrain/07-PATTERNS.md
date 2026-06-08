# Phase 7: Free-Cam + Seeded Layered Terrain - Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7 (all from live codebase)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/seed.js` (NEW) | utility | transform (pure math) | `src/terrain.js` Worker math block (lines 54–132) | partial — same pure-math, no-import constraint |
| `src/terrain.js` (MODIFY) | service | batch (Worker), streaming | `src/terrain.js` itself — existing WORKER_SOURCE, `rebuildAllChunks`, `sampleHeight`, `terrainAmplitude` pattern | self-analog (extend, not rewrite) |
| `src/terrain-worker.js` (MODIFY) | utility | batch transform | `src/terrain-worker.js` itself — must stay byte-identical with WORKER_SOURCE string in terrain.js | self-analog (sync copy) |
| `src/camera.js` (MODIFY) | service | event-driven (pointer lock, keydown) | `src/camera.js` itself — `cameraMode` string, `C`-key listener, `updateCamera` export | self-analog (add third mode) |
| `src/debug.js` (MODIFY) | utility | request-response (lil-gui onChange) | `src/debug.js` itself — `terrainFolder`, `gui.addFolder`, slider `.onChange(callback)` pattern | self-analog (extend terrain folder) |
| `src/main.js` (MODIFY) | controller | request-response + event-driven | `src/main.js` itself — `vehicleState` literal, reset block, `terrainSystem.update(carPos)` call site | self-analog (extend spawn/reset/loop) |
| `tests/seed-test.html` (NEW) | test | transform | `tests/` directory (currently empty — no test files exist) | no analog — create fresh |
| `tests/height-agreement-test.html` (NEW) | test | transform | same — no analog exists | no analog — create fresh |

---

## Pattern Assignments

### `src/seed.js` (NEW — utility, pure math)

**Analog:** `src/terrain.js` lines 54–132 (the inline Worker block, specifically `buildPermutationTable` and `createNoise2D` — pure math, no imports, no DOM)

**Constraint (from RESEARCH.md §Pitfall 1):** All functions placed in `seed.js` for main-thread use MUST also be copied verbatim into `WORKER_SOURCE` in `terrain.js` AND into `terrain-worker.js`. The Blob Worker has no importmap — it cannot import ES6 modules.

**No-import pattern** (terrain.js lines 54–56 — everything the Worker uses is self-contained):
```javascript
// terrain-worker.js has NO import/export statements.
// seed.js must also export functions the Worker copies verbatim (no import syntax in copies).
const SQRT3 = Math.sqrt(3.0);
const F2 = 0.5 * (SQRT3 - 1.0);
```

**String-to-int hash** (djb2 — from RESEARCH.md §Seed System):
```javascript
// Pure function — safe to copy into WORKER_SOURCE verbatim (no DOM, no import)
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}
```

**parseWorldSeed** (entry point — accepts string or integer):
```javascript
// Called once at startup from main.js (URL param) and on debug-panel seed change.
export function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0
  return djb2(String(input))
}
```

**Sub-seed derivation** (seedFor — domain-tagged, pure function, no mutable state):
```javascript
// Must be a pure function of (worldSeed, domainTag, ...coords) — HARD RULE.
// Copies: WORKER_SOURCE in terrain.js + terrain-worker.js must include this verbatim.
export function seedFor(worldSeed, domainTag, ...coords) {
  let h = djb2(domainTag)
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}
```

**PRNG** (mulberry32 — seeded, passes PractRand at < 512 draws):
```javascript
// Used to build permutation tables: mulberry32(seedFor(worldSeed, "coarse"))
// Must be copied verbatim into WORKER_SOURCE.
export function mulberry32(seed) {
  return function() {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

**URL parsing** (called in main.js at module top):
```javascript
// In main.js — called once at startup before terrainSystem init
const _urlSeed = new URLSearchParams(window.location.search).get('seed')
export let worldSeed = _urlSeed ? parseWorldSeed(_urlSeed) : parseWorldSeed('lone-pine')
```

**Domain tags used in P7** (from RESEARCH.md §Seed System):
- `"coarse"` — ridged-multifractal layer noise
- `"fine"` — fine FBM layer noise
- `"regional"` — regional-roughness modulator noise
- `"spawn"` — low-slope spawn position resolver

---

### `src/terrain.js` (MODIFY — service, streaming + batch)

**Self-analog:** All patterns are already present in this file. The goal is extension, not rewrite.

**WORKER_SOURCE boundary marker pattern** (lines 37–177):
```javascript
// The WORKER_SOURCE string is delimited by template literal backticks.
// Every function inside it is a verbatim copy of what terrain-worker.js contains.
// SYNC RULE: every edit to WORKER_SOURCE must immediately be reflected in terrain-worker.js.
const WORKER_SOURCE = `
// ... all worker code here, including djb2, mulberry32, seedFor, createNoise2D,
// coarseHeight, fineHeight, regionalModulator, height(x,z)
`
```

**terrainAmplitude live-multiplier pattern** (lines 377–387 and lines 276–279) — the TEMPLATE for new three-layer params:
```javascript
// rebuildAllChunks: re-applies amplitude to built geometry without Worker round-trip.
// This is Path A (amplitude-only, instant). Pattern to copy for coarseAmplitude slider.
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

// sampleHeight: applies terrainAmplitude to bilinear result (line 278)
return raw * (this._params.terrainAmplitude ?? 1.0)
```

**Worker message send pattern** (lines 357–361) — extend `generate` to pass `worldSeed` + `params`, and add new `init` message type:
```javascript
// Current pattern (lines 357-361):
this._pendingWorker.add(key)
this._worker.postMessage({ type: 'generate', cx, cz, key })

// P7 extension: seed/param change path sends init first, then generate for all chunks.
// New init message:
this._worker.postMessage({ type: 'init', worldSeed, params })
// Then rebuild: dispose all chunks, re-request ring.
```

**_pendingWorker duplicate-request race fix** (lines 214–219 and 436–441) — preserve this when changing streaming center:
```javascript
// Key stays in _pendingWorker from postMessage UNTIL _flushPendingQueue builds it.
// Only remove from _pendingWorker after _chunkMap is updated (line 440).
// Do NOT change this ordering when adding freecam streaming center logic.
this._worker.onmessage = (e) => {
    const { key, cx, cz, heights } = e.data
    this._pendingQueue.push({ key, cx, cz, heights })
    // NOTE: key is intentionally NOT removed from _pendingWorker here.
}
// ...later in _flushPendingQueue:
this._pendingWorker.delete(key)  // authoritative release point
```

**update() signature** (line 228) — parameter name changes to `streamCenter` for clarity in P7:
```javascript
// Current (line 228):
update(carPos) {
    const { cx: ccx, cz: ccz } = this._worldToChunk(carPos.x, carPos.z)
    this._updateChunkRing(ccx, ccz)
    this._flushPendingQueue()
}
// P7: caller passes camera.position when freecam active, vehicleState.position otherwise.
// No change needed to update() body — it already accepts any {x,z} object.
```

**sampleHeight return pattern** (lines 244–279) — physics contacts switch to `analyticHeight` in P7; `sampleHeight` is kept for height-agreement test only:
```javascript
// Current: returns 0 for unloaded chunks (flat-ground fallback).
if (!chunk || !chunk.heights) return 0
// P7: queryContacts and queryVertexContacts in main.js switch to analyticHeight() instead.
// sampleHeight stays as-is for the P7-2 height-agreement test.
```

**Geometry build pattern** (lines 398–412) — `heights[i]` is the raw Worker value; amplitude applied on setY. P7 must store the same raw values from the new `height(x,z)` function:
```javascript
const amp = this._params.terrainAmplitude ?? 1.0
for (let i = 0; i < N * N; i++) {
    pos.setY(i, heights[i] * amp)
}
```

---

### `src/terrain-worker.js` (MODIFY — sync copy of WORKER_SOURCE)

**Self-analog:** This file must remain byte-identical with the content of the `WORKER_SOURCE` string in `terrain.js` (excluding the outer template literal backticks and JS escape sequences).

**Current structure** (terrain-worker.js lines 1–149):
1. Comment header (lines 1–15)
2. Simplex noise 2D impl block (lines 16–95) — `buildPermutationTable`, `createNoise2D`
3. Worker constants (lines 97–101)
4. Noise init with fixed seed (line 106): `createNoise2D(function() { return 0.5; })`
5. Startup verification (lines 109–114)
6. `self.onmessage` handler (lines 118–148)

**P7 replaces lines 106 and 134–143** — the fixed `() => 0.5` noise init and the 3-octave FBM loop:
```javascript
// BEFORE (terrain-worker.js line 106):
const noise2D = createNoise2D(function() { return 0.5; })

// AFTER: three seeded noise instances, initialized in onmessage 'init' handler.
// djb2, mulberry32, seedFor must be pasted verbatim above createNoise2D.
let noiseCoarse, noiseFine, noiseRegional  // initialized via 'init' message

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        const { worldSeed, params } = e.data
        noiseCoarse   = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
        noiseFine     = createNoise2D(mulberry32(seedFor(worldSeed, 'fine')))
        noiseRegional = createNoise2D(mulberry32(seedFor(worldSeed, 'regional')))
        return
    }
    if (e.data.type !== 'generate') return
    // ... chunk build using height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params)
}
```

**SYNC RULE (from RESEARCH.md §Pitfall 2):** After any edit to WORKER_SOURCE in `terrain.js`, immediately apply the identical change to `terrain-worker.js`. These two changes must always be in the same commit.

---

### `src/camera.js` (MODIFY — service, event-driven)

**Self-analog:** All patterns from the existing file are the template.

**cameraMode string pattern** (line 11) — extend to three values:
```javascript
// Current (line 11):
let cameraMode = 'chase'  // 'chase' | 'cockpit'
// P7 extension:
let cameraMode = 'chase'  // 'chase' | 'cockpit' | 'freecam'
```

**C-key listener pattern** (lines 53–57) — the existing listener is the template; upgrade to handle shift:
```javascript
// Current (lines 53-57):
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'c') {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase'
  }
})
// P7 replacement: check e.shiftKey first; enter/exit freecam on Shift+C;
// plain C only toggles chase/cockpit or exits freecam.
```

**Module-level state pattern** (lines 11–29) — freecam adds analogous module-level vars:
```javascript
// Existing pattern: module-level state for camera modes
let isDragging  = false
let orbitTheta  = Math.PI
let orbitPhi    = 0.38
// P7 additions (same pattern, module scope):
let isPointerLocked = false
let freecamPos      = new THREE.Vector3()
let freecamYaw      = 0       // radians, Y-axis
let freecamPitch    = 0       // radians, X-axis, clamped ±(PI/2 - 0.01)
// Freecam key state (internal — not exported; main.js checks getCameraMode() to gate WASD):
const freecamKeys = { w: false, a: false, s: false, d: false, space: false, ctrl: false, shift: false }
```

**updateCamera branch pattern** (lines 68–108) — the if/else chain is the template; freecam adds a third branch:
```javascript
// Existing branch structure (lines 68-108):
export function updateCamera(camera, vehicleState, dt) {
  if (cameraMode === 'chase') {
    // ... chase logic
  } else {
    // cockpit mode
  }
}
// P7: add freecam branch BEFORE the chase/cockpit else chain:
export function updateCamera(camera, vehicleState, dt) {
  if (cameraMode === 'freecam') {
    // Freecam: apply WASD movement, set camera.position + camera.rotation
    // Return value used by main.js to get stream center for terrainSystem.update()
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(freecamPitch, freecamYaw, 0, 'YXZ'))
    const right   = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, freecamYaw, 0, 'YXZ'))
    const speed   = freecamKeys.shift ? 100 : 20
    if (freecamKeys.w) freecamPos.addScaledVector(forward,  speed * dt)
    if (freecamKeys.s) freecamPos.addScaledVector(forward, -speed * dt)
    if (freecamKeys.a) freecamPos.addScaledVector(right,   -speed * dt)
    if (freecamKeys.d) freecamPos.addScaledVector(right,    speed * dt)
    if (freecamKeys.space) freecamPos.y += speed * dt
    if (freecamKeys.ctrl)  freecamPos.y -= speed * dt
    camera.position.copy(freecamPos)
    camera.rotation.set(freecamPitch, freecamYaw, 0, 'YXZ')  // 'YXZ' order prevents FPS roll (RESEARCH.md §Pitfall 8)
  } else if (cameraMode === 'chase') {
    // ... existing chase logic unchanged
  } else {
    // ... existing cockpit logic unchanged
  }
}
```

**getCameraMode export** (lines 116–118) — already exported; main.js uses it in P7 to gate WASD routing:
```javascript
// No change needed — already exported (line 116):
export function getCameraMode() {
  return cameraMode
}
// P7 adds a companion export:
export function getFreecamPosition() {
  return freecamPos  // used by main.js to pass camera position to terrainSystem.update()
}
```

**Pointer lock entry** (derived from D-01/D-02, no existing codebase analog — follows MDN pattern):
```javascript
// Add at module load (alongside existing mousedown/mousemove/mouseup listeners):
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = !!document.pointerLockElement
})
// canvas click re-captures when in freecam but pointer not locked:
document.querySelector('canvas').addEventListener('click', () => {
  if (cameraMode === 'freecam' && !isPointerLocked) {
    document.querySelector('canvas').requestPointerLock()
  }
})
document.addEventListener('mousemove', e => {
  if (!isPointerLocked || cameraMode !== 'freecam') return
  const MOUSESENSE = 0.002
  freecamYaw   -= e.movementX * MOUSESENSE
  freecamPitch -= e.movementY * MOUSESENSE
  freecamPitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, freecamPitch))
})
```

**No-snap exit (CAM-03):** The existing chase follow `camera.position.lerp(goalPos, alpha)` (lines 88–89) with `CHASE_STIFFNESS=5` naturally absorbs the freecam→chase position discontinuity over ~200ms. No special transition code required.

---

### `src/debug.js` (MODIFY — utility, lil-gui sliders)

**Self-analog:** The existing Terrain folder pattern is the direct template.

**Terrain folder creation pattern** (lines 120–127) — the template for seed field and three sub-folders:
```javascript
// Existing pattern (lines 120-127):
const terrainFolder = gui.addFolder('Terrain')
terrainFolder.add(params, 'terrainAmplitude', 0, 1.0, 0.05).name('Terrain Amplitude').onChange(() => {
  if (typeof callbacks.rebuildTerrain === 'function') callbacks.rebuildTerrain()
})
terrainFolder.add(params, 'rampEnabled').name('Ramp Visible').onChange(v => {
  if (typeof callbacks.setRampVisible === 'function') callbacks.setRampVisible(v)
})
```

**Folder grouping + onChange callback wiring pattern** — sub-folders follow the same `.addFolder()` + `.add()` chain:
```javascript
// P7 extends terrainFolder with nested sub-folders:
const coarseFolder = terrainFolder.addFolder('Coarse Layer')
coarseFolder.add(params, 'coarseAmplitude', 50, 500, 10).name('Amplitude (m)').onChange(() => {
  if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  // rebuildTerrainFull = Path B: send Worker init + dispose all chunks + re-request ring (D-09)
})
// All coarse/fine/regional sliders use rebuildTerrainFull callback (Path B, debounced).
// terrainAmplitude slider keeps rebuildTerrain callback (Path A, instant Y-rescale).
```

**Debounce pattern** (150ms, from RESEARCH.md §Regeneration, D-09):
```javascript
// In main.js, the rebuildTerrainFull callback wraps a debounced rebuild.
// Pattern: clearTimeout/setTimeout (simple, no library).
let _rebuildTimer = null
function debouncedRebuildFull() {
  clearTimeout(_rebuildTimer)
  _rebuildTimer = setTimeout(() => {
    // Path B: send init message, dispose all chunks, re-request ring, teleport truck
    terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
    terrainSystem.rebuildAllChunksFromWorker()
    _reseeatTruckAtSpawn()
  }, 150)
}
```

**String field / seed text input** (from RESEARCH.md §Debug Panel, A7):
```javascript
// lil-gui renders a text <input> automatically when the value is a string.
// Same gui.add() call — no special configuration needed.
// worldSeedState is a plain object; onChange triggers parseWorldSeed + Path B rebuild.
const _worldSeedState = { seed: 'lone-pine' }
terrainFolder.add(_worldSeedState, 'seed').name('World Seed').onChange(v => {
  worldSeed = parseWorldSeed(v)
  if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
})
```

**callbacks object pattern** (line 44 in debug.js — `initDebug(params, callbacks = {})`) — P7 adds new callbacks to the same object:
```javascript
// Existing initDebug signature (line 44):
export function initDebug(params, callbacks = {}) {
// Existing callbacks (lines 559-561 of main.js):
const _gui = initDebug(RANGER_PARAMS, {
  setRampVisible: (v) => { rampMesh.visible = v },
  rebuildTerrain: ()  => { if (terrainSystem) terrainSystem.rebuildAllChunks() }
})
// P7 adds:
//   rebuildTerrainFull: () => debouncedRebuildFull()
//   changeSeed: (v) => { worldSeed = parseWorldSeed(v); debouncedRebuildFull() }
```

---

### `src/main.js` (MODIFY — controller, request-response + event-driven)

**Self-analog:** vehicleState, reset block, terrainSystem.update, and queryContacts are the patterns to extend.

**vehicleState literal + 3-places rule** (lines 119–138, vehicle.js lines 23–39):

The 3-places rule (from MEMORY: `project_vehiclestate_three_places.md`) requires new vehicleState fields in:
1. `vehicle.js` `SPAWN_STATE` export (lines 23–39)
2. `main.js` `vehicleState` literal (lines 119–138)
3. `main.js` reset block (lines 628–655)

```javascript
// Place 1 — vehicle.js SPAWN_STATE (lines 23-39):
export const SPAWN_STATE = {
  positionX: 0, positionY: 0, positionZ: 0,
  // ... all scalar fields
  strutComp: [0, 0, 0, 0],
  strutCompVel: [0, 0, 0, 0],
  handbrake: false
  // P7 new fields (if any vehicleState additions are made): add here first
}

// Place 2 — main.js vehicleState literal (lines 119-138):
const vehicleState = {
  position: new THREE.Vector3(0, _spawnEq.bodyY, 0),
  // ...
  strutComp: [..._spawnEq.strutComp],
  // P7 new fields: add here with same initial value
}

// Place 3 — main.js reset block (lines 624-655):
vehicleState.position.set(SPAWN_STATE.positionX, eq.bodyY, SPAWN_STATE.positionZ)
// ...
vehicleState.strutComp    = [...eq.strutComp]
vehicleState.strutCompVel = [0, 0, 0, 0]
// P7 new fields: add here with reset value
```

**terrainSystem.update() call site** (line 681) — P7 gates on freecam mode:
```javascript
// Current (line 681):
terrainSystem.update(vehicleState.position)

// P7 replacement (from RESEARCH.md §Pitfall 5 / D-21):
import { getCameraMode, getFreecamPosition } from './camera.js'
// In render loop:
const streamCenter = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
terrainSystem.update(streamCenter)
```

**queryContacts / queryVertexContacts switch to analyticHeight** (lines 435–484, 493–531):
```javascript
// Current terrain query in queryContacts (lines 497-504):
const terrainH = terrainSystem ? terrainSystem.sampleHeight(cx, cz) : 0
const gd = terrainH + r - cy
if (gd > 0) {
  const n = terrainSystem ? terrainSystem.sampleNormal(cx, cz) : { x: 0, y: 1, z: 0 }
  ...
}
// P7 replacement (RESEARCH.md §Unified height architecture, D-20):
// analyticHeight(cx, cz, RANGER_PARAMS) — never returns 0 for unloaded chunks.
// Both queryContacts AND queryVertexContacts switch to analyticHeight.
// sampleHeight is kept for height-agreement test (P7-2) only, not physics contacts.
```

**WASD routing gate** (vehicle.js line 15, main.js has no explicit WASD routing today — vehicle.js owns WASD):
```javascript
// Current: vehicle.js registers WASD at module load (line 15) unconditionally.
// vehicle.js (line 15):
document.addEventListener('keydown', e => { const k = e.key === ' ' ? ' ' : e.key.toLowerCase(); if (k in keys) keys[k] = true })
// P7: vehicle.js must check getCameraMode() before consuming WASD, OR camera.js
// consumes WASD internally for freecam (preferred per RESEARCH.md recommendation).
// camera.js internal approach: freecamKeys listener at module load in camera.js;
// vehicle.js WASD routing: updateVehicle reads throttle/steer = 0 when freecam active
// because vehicle.js keys.w/a/s/d are blocked when getCameraMode() === 'freecam'.
// The cleanest gate is inside updateVehicle (or its keydown listener) checking getCameraMode().
```

**Spawn / re-seat pattern** (lines 620–654 reset block) — canonical spawn function follows this structure:
```javascript
// Existing reset block (lines 629-654) — canonical seat-at-terrain pattern:
const eq = computeStaticEquilibrium(RANGER_PARAMS)
vehicleState.position.set(SPAWN_STATE.positionX, eq.bodyY, SPAWN_STATE.positionZ)
vehicleState.position.y += terrainSystem ? terrainSystem.sampleHeight(SPAWN_STATE.positionX, SPAWN_STATE.positionZ) : 0
vehicleState.velocity.set(0, 0, 0)
vehicleState.quaternion.set(SPAWN_STATE.quatX, SPAWN_STATE.quatY, SPAWN_STATE.quatZ, SPAWN_STATE.quatW)
vehicleState.angularVelocity.set(0, 0, 0)
// ... zero all motion fields
vehicleState.strutComp    = [...eq.strutComp]
vehicleState.strutCompVel = [0, 0, 0, 0]

// P7 canonical spawn function (D-14/15/16):
// Replace the inline reset with a call to resolveSpawn() which:
// - uses seedFor(worldSeed, "spawn") to pick a deterministic low-slope point
// - calls analyticHeight() directly (not sampleHeight — no chunk dependency)
// - returns { position: THREE.Vector3, heading: number }
// Same call site for both initial load and every regenerate (D-14).
// Phase 8 swaps the resolver body to road-graph probe without touching the call site.
function _reseatTruckAtSpawn() {
  const { position: spawnPos, heading } = resolveSpawn(worldSeed, RANGER_PARAMS)
  const eq = computeStaticEquilibrium(RANGER_PARAMS)
  vehicleState.position.copy(spawnPos).setY(spawnPos.y + eq.bodyY)
  // heading: set quaternion from Y-axis rotation
  vehicleState.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), heading)
  vehicleState.velocity.set(0,0,0)
  vehicleState.angularVelocity.set(0,0,0)
  // ... zero all motion fields (same as existing reset block)
  vehicleState.strutComp    = [...eq.strutComp]
  vehicleState.strutCompVel = [0,0,0,0]
}
```

**Pause menu / grid world pattern** (new DOM overlay — no existing codebase analog):
```javascript
// Pattern derived from existing keydown listener style in main.js (lines 581-593):
document.addEventListener('keydown', e => {
  if (e.key === '\\') toggleRecording()
  if (e.key === 'i' && e.ctrlKey) openInitialCondition(vehicleState, RANGER_PARAMS)
})
// P7 Esc handler (same listener style):
// In freecam: Esc releases pointer lock (browser forces this — do NOT prevent).
// In chase/cockpit: Esc opens pause menu.
// Pitfall 3 (RESEARCH.md): do NOT open pause menu on Esc when in freecam
// (causes flash-open/close). Gate on cameraMode.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && getCameraMode() !== 'freecam') {
    togglePauseMenu()
  }
})
```

**Ramp conditional pattern** (lines 447–484) — grid world mode replaces the rampEnabled flag with a world-mode flag:
```javascript
// Current guard (line 448):
if (RANGER_PARAMS.rampEnabled !== false) { ... }
// P7 grid world: ramp exists only in grid world, not Sierra terrain world.
// Simple boolean in main.js module scope:
let _gridWorldActive = false
// In queryContacts and queryVertexContacts, guard ramp triangles on _gridWorldActive.
```

---

### `tests/seed-test.html` and `tests/height-agreement-test.html` (NEW — test, no analog)

**Pattern:** Plain HTML file, ES6 module script, `console.assert` for assertions, openable via local HTTP server.

No existing test files. Base structure on the project's existing file conventions — plain HTML, importmap for Three.js, `type="module"` script. No test runner, no Jest, no npm.

```html
<!-- tests/seed-test.html — pattern from RESEARCH.md §Validation Architecture -->
<!DOCTYPE html>
<html>
<head>
  <title>P7-1 Seed Determinism Test</title>
  <script type="importmap">{ "imports": { "three": "https://..." } }</script>
</head>
<body>
  <pre id="out"></pre>
  <script type="module">
    import { parseWorldSeed, seedFor } from '../src/seed.js'
    // console.assert throws no exception on pass; prints FAIL on failure.
    const s1 = seedFor(parseWorldSeed('lone-pine'), 'coarse')
    const s2 = seedFor(parseWorldSeed('lone-pine'), 'coarse')
    console.assert(s1 === s2, 'P7-1 FAIL: seedFor not deterministic')
    // ...
    console.log('P7-1 PASS: seedFor determinism verified')
  </script>
</body>
</html>
```

---

## Shared Patterns

### Pattern: Pure-math "Worker-safe" functions
**Source:** `src/terrain.js` WORKER_SOURCE block (lines 54–132), `src/terrain-worker.js` (lines 16–95)
**Apply to:** `src/seed.js` (djb2, mulberry32, seedFor), height layer functions in `terrain.js`/`terrain-worker.js`
**Rule:** Any function that must run inside the Worker must be pure math — no DOM, no import, no `THREE.`. Define in `seed.js` with `export`, AND paste verbatim into WORKER_SOURCE and terrain-worker.js without the `export` keyword.
```javascript
// Worker-safe function signature template:
// - No import statements
// - No DOM references
// - No THREE.* references
// - Pure computation: inputs → outputs
// - Uses only Math.*, typed arrays, plain objects
function exampleWorkerSafeFunction(input) {
    return /* pure math result */
}
```

### Pattern: lil-gui onChange → debounced callback
**Source:** `src/debug.js` lines 121–123, `src/main.js` lines 558–561
**Apply to:** All new terrain slider onChange handlers in `src/debug.js`
```javascript
// Two-tier onChange pattern:
// Tier A (instant): amplitude-only slider calls rebuildTerrain (rebuildAllChunks, no Worker)
terrainFolder.add(params, 'terrainAmplitude', 0, 1.0, 0.05).name('...').onChange(() => {
  if (typeof callbacks.rebuildTerrain === 'function') callbacks.rebuildTerrain()
})
// Tier B (debounced 150ms): shape-param/seed sliders call rebuildTerrainFull (Worker reinit)
coarseFolder.add(params, 'coarseAmplitude', ...).name('...').onChange(() => {
  if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
})
```

### Pattern: Camera mode string + getCameraMode export
**Source:** `src/camera.js` lines 11, 116–118
**Apply to:** Any P7 code that needs to know the current camera mode (main.js WASD routing, terrain streaming center, Esc handler)
```javascript
// camera.js (line 11):
let cameraMode = 'chase'  // 'chase' | 'cockpit' | 'freecam'
// camera.js (lines 116-118):
export function getCameraMode() { return cameraMode }
// main.js usage pattern:
import { getCameraMode } from './camera.js'
if (getCameraMode() === 'freecam') { /* ... */ }
```

### Pattern: Esc / keyboard listener coexistence
**Source:** `src/main.js` lines 581–593, `src/camera.js` lines 31–57
**Apply to:** Pause menu Esc handler, freecam pointer-lock release
**Rule:** Multiple `keydown` listeners on `document` are fine (existing code has at least 4 separate listeners). Do NOT combine them into a single router — keep each module's listener self-contained. The Esc pause menu listener in main.js must gate on `getCameraMode() !== 'freecam'` to avoid the flash-open/close pitfall (RESEARCH.md §Pitfall 3).

### Pattern: Module-scope scratch vars + per-frame update
**Source:** `src/camera.js` lines 11–29 (module-level state), `src/main.js` lines 107–109 (`_prevRenderPos`, `_prevRenderQuat`)
**Apply to:** freecam module-level state (`freecamPos`, `freecamYaw`, `freecamPitch`, `freecamKeys`, `isPointerLocked`)
```javascript
// Pattern: declare at module top, mutate in event listeners, read in updateCamera each frame.
// No class required — module scope IS the singleton.
let freecamPos   = new THREE.Vector3()  // declared once at module load
let freecamYaw   = 0
let freecamPitch = 0
// Mutated by mousemove listener, read by updateCamera each frame.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/seed-test.html` | test | transform | No existing test files in the codebase |
| `tests/height-agreement-test.html` | test | transform | No existing test files in the codebase |
| Pause menu HTML/CSS overlay | UI | event-driven | No overlay UI elements exist yet; minimal DOM pattern from existing keydown listeners |

---

## Critical Sync Constraints

The following pairs MUST be edited together (never independently):

| File A | File B | What must stay in sync |
|---|---|---|
| `src/terrain.js` WORKER_SOURCE string | `src/terrain-worker.js` | Every function body inside the Worker string |
| `src/vehicle.js` SPAWN_STATE | `src/main.js` vehicleState literal | All vehicleState field names and initial values |
| `src/vehicle.js` SPAWN_STATE | `src/main.js` reset block | All vehicleState field names and reset values |

The 3-places rule (from MEMORY `project_vehiclestate_three_places.md`): any new `vehicleState` field added in one location must be added in all three locations before a task is considered complete.

---

## Metadata

**Analog search scope:** `src/` (all 7 source files read in full), `data/ranger.js` (skipped — no new patterns), `.planning/phases/07-*/` context files
**Files scanned:** 7 source files + 2 planning files
**Pattern extraction date:** 2026-06-07

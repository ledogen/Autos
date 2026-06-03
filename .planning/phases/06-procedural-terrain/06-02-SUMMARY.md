---
phase: 06-procedural-terrain
plan: "02"
subsystem: terrain
tags: [terrain, main.js, queryContacts, queryVertexContacts, importmap, integration]
dependency_graph:
  requires: [06-01 (TerrainSystem, sampleHeight, sampleNormal)]
  provides: [terrain-wired-physics, terrain-render-loop, simplex-noise-importmap]
  affects: [src/main.js (queryContacts, queryVertexContacts, loop, reset block), index.html]
tech_stack:
  added:
    - simplex-noise@4.0.3 importmap entry (CDN, main-thread use)
  patterns:
    - terrainSystem.sampleHeight/sampleNormal replacing flat y=0 half-space in queryContacts
    - terrainSystem.sampleHeight replacing py<0 in queryVertexContacts
    - terrainSystem.update() called outside physics accumulator (render rate)
    - Spawn height offset via sampleHeight in reset block
key_files:
  created: []
  modified:
    - src/main.js
    - index.html
decisions:
  - "flat y=0 half-space replaced; ramp triangle loop left unchanged per plan scope"
  - "ground.position.x/z removed (commented); grid snapping retained for visual reference"
  - "terrainSystem declared null at module scope so query functions see it at call time"
  - "spawn height offset added to reset block for correct on-terrain respawn (TERR-04)"
metrics:
  duration: "5 minutes"
  completed: "2026-06-03T07:54:52Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 06 Plan 02: TerrainSystem Wiring Summary

**One-liner:** Wired TerrainSystem into main.js contact queries and render loop — queryContacts and queryVertexContacts now use terrain height/normal instead of flat y=0 half-space, and the chunk ring updates each frame.

## What Was Built

Two files modified to integrate the TerrainSystem service from Plan 01 into the live physics and rendering pipeline:

**`src/main.js`** — Six targeted edits:
1. Added `import { TerrainSystem } from './terrain.js'` and `let terrainSystem = null` at module scope.
2. Instantiated `terrainSystem = new TerrainSystem(scene, RANGER_PARAMS)` after `initDebug()`; called `scene.remove(ground)` to eliminate Z-fighting with terrain chunks.
3. `queryContacts`: replaced the 5-line flat y=0 half-space with `terrainSystem.sampleHeight(cx, cz)` + `sampleNormal(cx, cz)`. The ramp triangle loop is unchanged.
4. `queryVertexContacts`: replaced `if (py < 0)` with `if (py < terrainH)` using `terrainSystem.sampleHeight(px, pz)`. All ramp face half-spaces unchanged.
5. `loop()`: added `terrainSystem.update(vehicleState.position)` outside the physics accumulator (after `syncMeshesToState`, before `renderer.render`). Removed `ground.position.x` and `ground.position.z` assignments.
6. Reset block: added spawn height offset — `vehicleState.position.y += terrainSystem ? terrainSystem.sampleHeight(...) : 0` — so the car respawns correctly on uneven terrain.

**`index.html`** — Added `"simplex-noise": "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js"` to the importmap. Existing `three` and `three/addons/` entries unchanged. Importmap JSON remains valid.

## Physics Contract

`queryContacts` and `queryVertexContacts` now use the terrain height surface instead of y=0, so suspension spring forces, body pitch/roll, and rollover dynamics all respond to terrain slope. The ramp contact geometry is preserved — the car can still use the ramp while terrain is active. `sampleHeight` returns 0 when a chunk is not yet loaded, matching the pre-terrain flat-ground fallback so the car never falls through during initial load.

## Threat Mitigations Applied

- **T-06-06** (DoS: ground.position updates after removal): `ground.position.x/z` assignment lines removed in the loop; the comment documents the removal for future maintainers.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The terrain stub function `terrain(x, z)` (M1-13 verification call) is retained at lines ~323–335 per plan instruction — it is a no-op called inside the physics accumulator for M1-13 verification only and does not affect physics contact queries.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The CDN simplex-noise importmap entry matches the trust level of the existing Three.js CDN entry (T-06-05: accepted).

## Self-Check

### Files exist
- `src/main.js`: EXISTS (modified)
- `index.html`: EXISTS (modified)
- `.planning/phases/06-procedural-terrain/06-02-SUMMARY.md`: EXISTS (this file)

### Commits exist
- `a01e747` feat(06-02): wire TerrainSystem into main.js
- `03f6725` feat(06-02): add simplex-noise to index.html importmap

## Self-Check: PASSED

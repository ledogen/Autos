---
phase: 06-procedural-terrain
plan: "01"
subsystem: terrain
tags: [terrain, web-worker, heightmap, simplex-noise, chunk-streaming, physics]
dependency_graph:
  requires: []
  provides: [TerrainSystem, CHUNK_SIZE, GRID_SAMPLES, terrain-worker-blob]
  affects: [src/main.js (Plan 02 wires TerrainSystem into queryContacts)]
tech_stack:
  added:
    - simplex-noise@4.0.3 (MIT, Jonas Wagner) — inlined in Blob worker, no CDN dependency
  patterns:
    - Blob classic worker spawn from embedded string (no importmap needed in worker)
    - Float32Array transferable for zero-copy worker→main thread transfer
    - Frame-spread geometry build queue (MAX_BUILDS_PER_FRAME=2)
    - O(1) bilinear height query on raw Float32Array heightmap
    - Central-difference finite-difference terrain normals
    - Shared MeshPhongMaterial across chunk pool (no per-chunk material dispose)
key_files:
  created:
    - src/terrain-worker.js
    - src/terrain.js
  modified: []
decisions:
  - "Inline simplex-noise@4.0.3 minimal 2D subset in worker source (no CDN importmap in worker context)"
  - "Deterministic seed () => 0.5 for seamless chunk boundaries (RESEARCH §Pitfall 3)"
  - "RING_RADIUS=2 (5x5 = 25 chunks) for 320m visible radius per RESEARCH §Chunk Strategy"
  - "MAX_BUILDS_PER_FRAME=2 caps main-thread geometry build cost (T-06-01)"
  - "terrainAmplitude applied in both sampleHeight and _flushPendingQueue so physics/visual surfaces always match"
  - "sampleNormal returns plain {x,y,z} object; callers construct Vector3 per PATTERNS contact hit shape"
metrics:
  duration: "3 minutes"
  completed: "2026-06-03T07:50:53Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 06 Plan 01: TerrainSystem Module Summary

**One-liner:** Chunk-streaming heightmap engine using inlined simplex FBM Blob worker with O(1) bilinear height queries and central-difference normals for the physics pipeline.

## What Was Built

Two new files establish the complete terrain service:

**`src/terrain-worker.js`** — Classic Blob worker (not an ES module). Inlines a minimal 2D subset of simplex-noise@4.0.3 (MIT, Jonas Wagner). Generates 65×65 Float32Array heightmaps using 3-octave FBM (frequencies 0.02/0.06/0.15, amplitudes 4.0/1.5/0.5). Deterministic seed `() => 0.5` ensures all chunks share the same permutation table so chunk-boundary heights are seamless. Posts results via `[heights.buffer]` transferable (zero-copy).

**`src/terrain.js`** — TerrainSystem ES6 class. Manages a 5×5 ring of 64×64-unit chunks. Spawns the worker from an embedded WORKER_SOURCE string. Handles chunk lifecycle: requests missing chunks via worker, frame-spreads geometry builds (max 2/frame), disposes evicted chunks' geometries without touching the shared material. Exposes `sampleHeight(wx, wz)` (bilinear, returns 0 when unloaded) and `sampleNormal(wx, wz)` (central-difference FD, plain {x,y,z}). Both the physics query and the visual geometry multiply by `params.terrainAmplitude` identically.

## Exports

- `TerrainSystem` class: `constructor(scene, params)`, `update(carPos)`, `sampleHeight(wx, wz)`, `sampleNormal(wx, wz)`
- `CHUNK_SIZE = 64`
- `GRID_SAMPLES = 65`

## Physics Contract

`sampleHeight` returns `0` when the chunk is not yet loaded — this matches the existing flat-ground fallback behavior, so the car spawns safely at world origin (noise2D(0,0) = 0 for standard simplex lattice). The `terrainAmplitude` multiplier is applied identically in both `sampleHeight` (physics) and `_flushPendingQueue` (visual geometry), guaranteeing contact surface and rendered surface are always co-located.

## Threat Mitigations Applied

- **T-06-01** (DoS: unbounded pending queue): MAX_BUILDS_PER_FRAME=2 caps main-thread geometry build cost per frame
- **T-06-03** (DoS: missing geometry.dispose): explicit `chunk.mesh.geometry.dispose()` in `_updateChunkRing` before `chunkMap.delete` — confirmed in grep verification

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan creates the terrain service layer only. Integration into `queryContacts` and `queryVertexContacts` in `main.js` is deferred to Plan 02 per plan scope.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The Blob worker URL is same-origin (T-06-02: accepted).

## Self-Check

### Files exist
- `src/terrain-worker.js`: EXISTS
- `src/terrain.js`: EXISTS
- `.planning/phases/06-procedural-terrain/06-01-SUMMARY.md`: EXISTS (this file)

### Commits exist
- `a2fd77b` feat(06-01): add terrain-worker.js
- `304e15e` feat(06-01): add terrain.js

## Self-Check: PASSED

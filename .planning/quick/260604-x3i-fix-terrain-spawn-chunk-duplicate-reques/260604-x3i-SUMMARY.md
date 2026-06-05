---
phase: quick-260604-x3i
plan: "01"
subsystem: terrain
tags: [bugfix, race-condition, terrain, chunk-lifecycle, orphan-mesh]
dependency_graph:
  requires: []
  provides: [race-free-chunk-lifecycle]
  affects: [src/terrain.js]
tech_stack:
  added: []
  patterns: [idempotent-build-guard, pending-reservation-lifetime]
key_files:
  created: []
  modified: [src/terrain.js]
decisions:
  - "_pendingWorker reservation held from request-post through _chunkMap.set; single release point in _flushPendingQueue"
  - "Idempotent build guard added defensively before _scene.add; disposes only chunk geometry, never shared material"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-05"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260604-x3i: Fix Terrain Spawn-Chunk Duplicate-Request Race

Closed the spawn-chunk duplicate-request race in `_pendingWorker`/`_flushPendingQueue` that orphaned terrain meshes, making them invisible to `rebuildAllChunks()` and leaving frozen bumpy patches that the Terrain Amplitude slider could not flatten.

## What Was Built

**One commit — `7cf6178`** — two coordinated edits to `src/terrain.js`:

**Edit A — reserve chunk keys until build completes:**
- Removed `this._pendingWorker.delete(key)` from the `onmessage` handler. Previously the key was freed immediately on worker reply, before the geometry was actually built (2-13 frames later). This allowed `_updateChunkRing` to re-request the same chunk during the drain window.
- Added `this._pendingWorker.delete(key)` in `_flushPendingQueue`, after `this._chunkMap.set(key, { mesh, heights })`. This is now the single authoritative release point — the key stays reserved from worker post through actual geometry tracking.

**Edit B — idempotent build guard:**
- Added a stale-entry check in `_flushPendingQueue` before `_scene.add(mesh)`. If `_chunkMap` already has an entry for the key, removes the stale mesh from the scene and disposes its geometry (mirroring the existing T-06-03 pattern in `_updateChunkRing`). Does NOT dispose `this._material` (shared `MeshPhongMaterial`).

## Verification

Automated grep check passes:
- `onmessage` handler contains no `_pendingWorker.delete`
- `_flushPendingQueue` contains `_pendingWorker.delete(key)` after `_chunkMap.set`
- `_flushPendingQueue` contains `geometry.dispose()` for idempotent guard
- `node --check src/terrain.js` confirms syntax valid

Manual browser verification required (see plan checkpoint): drag Terrain Amplitude to 0 and confirm all spawn chunks + driving-loaded chunks go flat with no leftover bumpy patches.

## Commits

| Hash | Message |
|------|---------|
| 7cf6178 | fix(260604-x3i): close spawn-chunk duplicate-request race in terrain.js |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/terrain.js` exists and syntax-valid: CONFIRMED
- Commit `7cf6178` exists: CONFIRMED
- `_pendingWorker.delete` removed from `onmessage`: CONFIRMED
- `_pendingWorker.delete(key)` present in `_flushPendingQueue` after `_chunkMap.set`: CONFIRMED
- `geometry.dispose()` idempotent guard present in `_flushPendingQueue`: CONFIRMED

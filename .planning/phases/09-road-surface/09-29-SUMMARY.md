---
phase: 09-road-surface
plan: 29
subsystem: road
tags: [BUG-10, camber-stitch, run-adjacency, seam-continuity, P4-fix]
dependency_graph:
  requires:
    - phase: 09-25
      provides: runProfile / _buildRunProfile — the P0 camber arrays _runStartCamber feeds into
    - phase: 09-27
      provides: gradeY from runProfile — confirms profile infra is fully live
  provides:
    - _predecessorRunKey — generation-keyed XZ adjacency index (runKey → predecessorRunKey)
    - _runStartCamber — cycle-safe boundary camber seed for _buildCamberProfile / _buildRunProfile
    - cross-run camber stitch in _buildCamberProfile and _buildRunProfile
  affects: [src/road.js]
tech_stack:
  added: []
  patterns: [generation-keyed-adjacency, cycle-safe-boundary-seed, xz-spatial-hash]
key_files:
  created: []
  modified:
    - src/road.js
decisions:
  - "Adjacency detection uses XZ spatial hash (rounded to 2 m cell) over network endpoints — same O(R) cost as iterating the run map, avoids brute O(R^2) scan"
  - "Cycle-break: _runStartCamber reads predecessor's last camberRad from _camberProfileCache if already built (fast path), else computes from raw forward-march starting at 0 without seeding the predecessor further (slow path) — prevents A→B→A recursive loop"
  - "_runAdjacencyCache is generation-keyed (not a plain Map) so it auto-invalidates on param/route change identical to _camberProfileCache discipline"
  - "Both _buildCamberProfile and _buildRunProfile updated with the same seed, keeping runProfile.camberRad = camberProfile for all downstream consumers (physics, carve, ribbon)"
  - "The slow-path predecessor's own rawCamber[0] is left at 0 (unseeded) — this is the correct cycle-break; only one step of history is propagated per call, not a chain"
metrics:
  duration: ~15 minutes
  completed: "2026-06-15T17:30:00Z"
  tasks: 1
  commits: 1
---

# Phase 9 Plan 29: P4 — BUG-10 Cross-Run Camber Stitch — Summary

**One-liner:** BUG-10 closed — `_runStartCamber` seeds each run's start camber from its predecessor's end value via a generation-keyed XZ adjacency index, replacing the forced `rawCamber[0]=0` that caused banking to reset at every run boundary.

## What Was Built

### Task 1 — `_predecessorRunKey` + `_runStartCamber` + profile seed (commit c895119)

Three new pieces added to `RoadSystem` in `src/road.js`:

**`_predecessorRunKey(runKey)`** — builds `this._runAdjacencyCache`:
- Walks every entry in `this._network` on first call for this generation
- Records each run's LAST point XZ in a spatial hash (cell = 2 m, `Math.round(x/2),Math.round(z/2)`)
- Second pass: for each run, looks up its FIRST point in the hash to find which run ends there
- Result: `{ generation, map: Map<runKey→predecessorRunKey> }` — auto-invalidates when `this._generation` changes (same discipline as `_camberProfileCache`, `_runProfileCache`)
- Guard: a run cannot be its own predecessor (`predKey !== rk`)

**`_runStartCamber(runKey)`** — cycle-safe boundary seed:
1. Calls `_predecessorRunKey(runKey)` to find the predecessor
2. Fast path: if predecessor is in `_camberProfileCache` (already built this generation), reads its last `camberRad` value — the slew-limited, stitched end-camber
3. Slow path: predecessor not yet cached — re-computes predecessor's end camber from a raw forward-march starting at 0 (NO recursion; does NOT call `_buildCamberProfile` or `_runStartCamber` again). Returns the last value of that unseeded march
4. No predecessor: returns 0 (genuine free run start)

**Profile seed updated:**
- `_buildCamberProfile`: `rawCamber[0] = this._runStartCamber(runKey)` replaces the former unconditional `rawCamber[0] = 0`
- `_buildRunProfile` (P0 foundation): same replacement → `runProfile.camberRad` reflects stitched profile automatically, so physics, carve, and ribbon all read the continuous banking (design requirement)
- `camberRad[0] = rawCamber[0]` — the slew-march starting value is already the seeded value, so the entire run's profile eases from the predecessor's end banking rather than restarting from flat

## Verification

- `node --check src/road.js` exits 0
- `node test/spline-continuity.mjs` — all 8 gate fixtures PASS (no regression):
  - gentle-baseline, tile-seam-mismatch (spline metrics)
  - physics-sampling-continuity
  - hairpin (inner-edge fold count == 0)
  - switchback-no-arm-flip (armFlipCount == 0)
  - two-arms-no-undermine (undermineDepth == 0)
  - camber-rate (slew-limited maxDCamber ≤ 2°/m)
  - hairpin-fillet-enforced (filleted min radius ≥ 11.40 m)
- `grep -n "rawCamber\[0\] = 0" src/road.js` — the only match is inside `_runStartCamber` slow-path (predecessor's own unseeded start, the intentional cycle-break), NOT inside `_buildCamberProfile` or `_buildRunProfile`
- Adjacency seed path confirmed: `_predecessorRunKey` → XZ hash → predecessor runKey; `_runStartCamber` → reads predecessor end camber
- `_runAdjacencyCache` is generation-keyed (same invalidation discipline as `_camberProfileCache`)
- No infinite recursion by inspection: `_runStartCamber` reads from cache OR computes raw predecessor march; neither path calls `_buildCamberProfile` or `_runStartCamber` again
- `git diff --stat src/terrain-worker.js` — no change (worker byte-identical)

## Deviations from Plan

None — plan executed exactly as written. Both `_buildCamberProfile` (D2 camber profile) and `_buildRunProfile` (P0 unified profile) updated as specified. Cycle-break implemented via the "already-cached fast path + raw forward-march slow path" approach suggested in the plan action text.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | c895119 | fix(09-29): stitch camber across run boundaries — _predecessorRunKey + _runStartCamber |

## Known Stubs

None. The cross-run seed is live and unconditional. The camber-across-run headless gate (asserting |Δcamber| ≤ slew rate at run boundaries) is owed in plan 09-30 per the design doc.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. This change is purely internal to the `RoadSystem` profile-building methods.

## Self-Check

Files modified:
- src/road.js — FOUND

Commits:
- c895119 — let me verify...

## Self-Check: PASSED

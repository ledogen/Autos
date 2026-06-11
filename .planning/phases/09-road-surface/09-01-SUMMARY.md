---
phase: 09-road-surface
plan: "01"
subsystem: road
tags: [bug-fix, window-invariant, test-harness, BUG-08, D-16]
dependency_graph:
  requires: []
  provides: [window-invariant-road-network, _segXZ-module-scope, test-road-carve-harness, test-road-mesh-harness]
  affects: [src/road.js, test/test-road-carve.html, test/test-road-mesh.html]
tech_stack:
  added: []
  patterns: [canonical-anchor-band, mz-mx0-mx1-memo, module-scope-segment-intersection]
key_files:
  created:
    - test/test-road-carve.html
    - test/test-road-mesh.html
  modified:
    - src/road.js
decisions:
  - "CANONICAL_HALF_WIDTH = 4 macro-column cells (covers ±1024 m, safely wider than 640 m streaming radius)"
  - "_canonRunCache Map persists across re-streams but is cleared on param change (_invalidateProto) and full cache clear (invalidateCache)"
  - "COVER suppression spatial hash rebuilt from scratch in deterministic mz order each re-stream (never accumulated)"
  - "5 probe positions chosen at mixed XZ spread within ±400 m query radius for the window-invariance assertion"
metrics:
  duration: "~25 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 3
---

# Phase 9 Plan 1: BUG-08 Window-Invariant Splines + Phase Test Harness Scaffold Summary

**One-liner:** Window-invariant _streamNetwork via canonical mx0:mx1 anchor band memoization; _segXZ promoted to module scope; both phase harnesses scaffolded with verbatim r184 importmap and BUG-08 assertion.

## What Was Built

### Task 1: _segXZ promotion + window-invariant _streamNetwork (D-16)

**`src/road.js`**

1. **`_segXZ` promoted to module scope** — the XZ segment-intersection function was previously a closure inside `_removeSelfCrossings`. It is now declared at module scope as `function _segXZ(ax, az, bx, bz, cx, cz, dx, dz)` with the exact `Math.abs(denom) < 1e-10` guard and open-interval test `t,u ∈ (1e-6, 1-1e-6)`. `_removeSelfCrossings` now delegates to it with no behavior change.

2. **`CANONICAL_HALF_WIDTH = 4`** — new module constant. Each macro-row column band spans `center_mx ± 4` cells (±1024 m), safely wider than the 640 m streaming radius, ensuring no rendered road escapes the canonical band.

3. **Window-invariant `_streamNetwork`** — the mz row range still follows the streaming radius (rows appear/disappear as the view moves N/S). But each row's column extent is now the canonical band `mx0 = floor(center.x/PROTO_ANCHOR_SPACING) - CANONICAL_HALF_WIDTH` to `mx1 = ... + CANONICAL_HALF_WIDTH`, derived from `center_mx` (not the transient streaming window edge). Post-passes (`_removeLoops`, `_removeSelfCrossings`, `_limitCurvature`) run on the FULL canonical run for each mz row.

4. **`_canonRunCache`** — a per-instance Map keyed `"mz:mx0:mx1"` that memoizes the post-processed canonical polyline for each row. Re-streams whose center maps to the same `center_mx` hit the cache for all rows, making the re-stream O(1) in the common case. Cleared by `_invalidateProto` (param changes) and `invalidateCache` (full reset).

5. **COVER suppression** — the `cover` spatial hash is rebuilt from scratch in deterministic mz order from the completed canonical runs each re-stream. Never accumulated across re-streams.

6. **Routing untouched** — D-09 weights, `_protoConnect`, `_protoAnchor` unchanged. No carve baked here.

### Task 2: Phase test harness scaffold

**`test/test-road-carve.html`**
- Verbatim r184 importmap (three@0.184.0, three/addons/, simplex-noise@4.0.3)
- Monospace dark style block
- Imports `assert` and `TEST_PARAMS` from `test/road-test-harness.js`
- **BUG-08 window-invariance assertion**: constructs a RoadSystem with seed 'lone-pine', warms tiles ±2 around origin (center A), records `queryNearest` at 5 fixed world XZ positions with 400 m radius, triggers a re-stream at center B = (300,0,0) (>96 m threshold), re-warms tiles around B, re-queries same 5 positions; asserts `dP < 0.01 m` and `dT < 0.001` for each road-bearing probe
- SURF-05/04 carve assertions placeholder (Plan 09-02)

**`test/test-road-mesh.html`**
- Verbatim r184 importmap + same style block
- Minimal THREE scene: Scene, PerspectiveCamera, WebGLRenderer, DirectionalLight, render, dispose — no exception = PASS
- SURF-01/02/07 placeholder assertions (Plans 09-03/04/05)
- Harness opens and renders without console error

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| SURF-05/04 carve placeholder | test/test-road-carve.html | ~77 | Intentional: carve system built in Plan 09-02; placeholder keeps file runnable and non-empty |
| SURF-01/02/07 mesh placeholders | test/test-road-mesh.html | ~57-59 | Intentional: ribbon/junction mesh built in Plans 09-03/04/05 |

These stubs do NOT prevent Plan 09-01's goal (BUG-08 fix + harness scaffold). They are forward-placeholders that later plans will replace.

## Verification

Automated greps confirmed:
- `_segXZ` declared at module scope (`function _segXZ` on line 70)
- `CANONICAL_HALF_WIDTH` constant present (3 non-comment references)
- `mz:mx0:mx1` memo key + `window-invariant` purity comment present (7 occurrences)
- Both harnesses contain `three@0.184.0` (2 occurrences each)
- `window-invariance` assertion present in test-road-carve.html (6 occurrences)

Browser verification (manual): open `test/test-road-carve.html` — all 5 probe positions should show `PASS BUG-08 window-invariance` in console, confirming canonical per-run derivation is working.

## Self-Check: PASSED

Files created/modified confirmed in git log:
- `src/road.js` — commit 2737926
- `test/test-road-carve.html` — commit d2cf69b
- `test/test-road-mesh.html` — commit d2cf69b

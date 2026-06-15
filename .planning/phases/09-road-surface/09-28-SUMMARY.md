---
phase: 09-road-surface
plan: 28
subsystem: road
tags: [BUG-12, ribbon-frame, seam-continuity, edge-weld, P3-tangent]
dependency_graph:
  requires:
    - phase: 09-25
      provides: runProfile — seam-continuous gradeY/camberRad/tx/tz by arc-length
    - phase: 09-26
      provides: byArc / sampleRoadAt — single road-query API
  provides:
    - sweepRibbon section frame from continuous run tangent (BUG-12 closed)
    - boundary edge weld — bit-identical ±halfWidth vertices at shared slice seams
  affects: [src/road-mesh.js]
tech_stack:
  added: []
  patterns: [runProfile-frame, camberSign-flip, boundary-snap-by-construction]
key_files:
  created: []
  modified:
    - src/road-mesh.js
decisions:
  - "Section frame reads runProfile(arcS, runKey).tx/tz instead of spline.getTangentAt(u) — C0 across all slice seams by construction"
  - "Tangent flipped by camberSign (sign of arcS1-arcS0) before building rightX/rightZ so E→W slices do not invert winding or camber orientation"
  - "gradeY sourced from rp.gradeY (not designGradeY array) so ribbon/physics/carve all share one arc-indexed value (height-agreement invariant)"
  - "Post-loop boundary snap overwrites i=0/i=N-1 sections from runProfile(arcS0)/runProfile(arcS1) — makes weld a construction guarantee, not floating-point luck"
  - "Skirt verts at boundary sections also re-snapped for full seam closure"
metrics:
  duration: ~25 minutes
  completed: "2026-06-15T17:00:00Z"
  tasks: 2
  commits: 1
requirements-completed: [SURF-01, SURF-03]
---

# Phase 9 Plan 28: P3 BUG-12 — Ribbon Frame from Continuous Tangent + Boundary Edge Weld — Summary

**One-liner:** `sweepRibbon` section frame sourced from `runProfile(arcS).tx/tz` (seam-continuous) instead of per-slice `spline.getTangentAt`; boundary sections explicitly snapped from boundary arcS profile so ±halfWidth edges are bit-identical across adjacent slices — ribbon sealed at sharp corners.

## What Was Built

### Task 1 — Section frame from runProfile tangent (commit 0b01fcd)

Changed `sweepRibbon` in `src/road-mesh.js` (loop body, ~line 200):

**Before:**
```js
spline.getTangentAt(u, _scratchTan)
const tx = _scratchTan.x
const tz = _scratchTan.z
```

**After:**
```js
const arcS = arcS0 + (arcS1 - arcS0) * u   // moved before frame read
const _rp = this._road.runProfile(arcS, runKey)
const rpTx = camberSign * _rp.tx            // flip for E→W slices
const rpTz = camberSign * _rp.tz
```

Key points:
- `arcS` computation moved before the frame read so the same value feeds both the frame and the quality/camber reads below.
- `camberSign` (already computed from `arcS1 >= arcS0 ? 1 : -1`) flips the run tangent into this slice's sweep direction. Without the flip, E→W slices (arcS1 < arcS0) would get the run canonical tangent pointing the wrong way, inverting winding and camber.
- `gradeY = _rp.gradeY` replaces the `designGradeY[i]` read. Both values come from the same routed polyline Y, but sourcing from `runProfile` makes ribbon, physics, and carve fully share one arc-indexed value (height-agreement invariant, P2 consistency).
- Degenerate-tangent guard retained: `tLen > 1e-8 ? ... : 1/0` fallback to unit X right.

### Task 2 — Shared-boundary edge weld (commit 0b01fcd, same file)

Added a post-loop pass over `[0, N_LONG - 1]` boundary indices. For each boundary:
- Calls `runProfile(arcS_boundary, runKey)` (arcS0 at i=0, arcS1 at i=N-1).
- Recomputes all top-surface verts in that section from the boundary profile tangent.
- Rewrites `positions[]` and `colors[]` for all `CROSS_SEGS+1` top-surface verts.
- Re-snaps left/right skirt bottom verts from the same boundary frame.

Result: the first and last sections are written twice — once by the main loop, once by the boundary snap. The second write guarantees the result is `runProfile(arcS_boundary)` regardless of any loop floating-point path. Adjacent slices resolve to the same `arcS` at the shared seam → same `runProfile` call → same `tx/tz` → same `rightX/rightZ` → same `±halfWidth` XZ edge positions. The weld is guaranteed by construction, not by floating-point coincidence.

The snap does NOT touch spline/router geometry; `posX/posZ` still come from `spline.getPointAt(u)` (C0 shared boundary control point by construction in road.js).

## Verification

- `node --check src/road-mesh.js` exits 0
- `node test/spline-continuity.mjs` exits 0 — all 8 gate fixtures PASS:
  - gentle-baseline, tile-seam-mismatch, physics-sampling-continuity, hairpin, switchback-no-arm-flip, two-arms-no-undermine, camber-rate, hairpin-fillet-enforced
- `grep -n "runProfile" src/road-mesh.js` shows 3 hits (comment + 2 calls: main loop + boundary snap)
- `spline.getTangentAt` no longer sources the section perpendicular frame in `sweepRibbon` (still used in `_splineCurvatureSigned` for curvature diagnostics — not the ribbon frame)
- Tangent flipped by `camberSign` before rightX/rightZ computation
- `git diff --stat src/terrain-worker.js` empty

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were committed together (single file; both changes form one cohesive seam fix); the commit message captures both task descriptions.

## Known Stubs

None — no placeholder values or incomplete data paths introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1+2 | 0b01fcd | feat(09-28): sweepRibbon section frame from continuous runProfile tangent + boundary edge weld (BUG-12) |

## Self-Check

Files modified:
- src/road-mesh.js — verified present, `node --check` PASS

Commits:
- 0b01fcd — verified in git log

## Self-Check: PASSED

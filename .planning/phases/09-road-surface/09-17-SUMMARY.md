---
phase: 09-road-surface
plan: 17
subsystem: road-physics
tags: [physics, road, continuity, bounce-fix, queryNearest, spline]
dependency_graph:
  requires: [09-13, 09-14, 09-15, 09-16]
  provides: [C0-continuous-physics-road-height, SURF-04-gap-closure]
  affects: [_sampleCarveWorld, queryNearest, spline-continuity-harness]
tech_stack:
  added: []
  patterns: [local-XZ-projection-refine, bracket-segment-projection]
key_files:
  created: []
  modified:
    - src/road.js
    - test/spline-continuity.mjs
decisions:
  - "Projection refine operates on the two XZ bracket segments [uPrev→bestU] and [bestU→uNext]; winning segment maps t back to refinedU in the same linear blend — O(1), no new Vector3 allocations beyond the two returned vectors."
  - "bestN (probe sample count) lifted from probeSpline closure to query scope so the refine can compute du = 1/bestN without recomputing len/n — single extra scalar per query."
  - "Harness physics fixture uses ~8% grade + XZ curvature path with 0.5 m lateral offset to ensure nearest-discrete staircase clearly exceeds threshold (0.1547 m) vs refine (0.0200 m)."
metrics:
  duration: "~25 minutes"
  completed: "2026-06-12"
  tasks: 2
  files: 2
---

# Phase 09 Plan 17: Physics Road-Height C0-Continuity (Bounce Fix) Summary

Physics road height is now C0-continuous and matches the visible ribbon. `queryNearest` projects the query point onto the local polyline bracketing the nearest discrete sample, producing a smooth `nr.point.y` that eliminates the ~2 m staircase that was kicking the suspension.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Refine queryNearest to continuous projected point | beb6b5a | src/road.js |
| 2 | Add physics-sampling C0-continuity gate fixture | 10cd73c | test/spline-continuity.mjs |

## What Was Built

### Task 1 — queryNearest projection refine (src/road.js)

**Root cause:** `probeSpline` found the nearest DISCRETE sample at `bestU = i/n` (~2 m spacing for n≈100 samples). The return block evaluated `getPointAt(bestU)` — so as the tire contact point moved, `nr.point.y` snapped between discrete samples, producing a ~0.15 m staircase at every ~2 m step. `_sampleCarveWorld` reads `designY = nr.point.y`, so the suspension was kicked by invisible steps even on visually-smooth asphalt.

**The fix — local projection refine algorithm:**

After `probeSpline` settles `bestSpline / bestU / bestN`:

1. Compute `du = 1/bestN` (the discrete step size). Bracket: `uPrev = clamp(bestU - du, 0, 1)`, `uNext = clamp(bestU + du, 0, 1)`.
2. Evaluate the three bracket points in XZ into scalar locals (reusing `_scratchPt` three times — no new `Vector3`): `(prevX, prevZ)`, `(midX, midZ)`, `(nextX, nextZ)`.
3. Project `(wx, wz)` onto segment `[prev→mid]`:
   `t_A = clamp(dot(q-A, B-A) / |B-A|², 0, 1)` → projected XZ distance² `dA2`.
4. Project `(wx, wz)` onto segment `[mid→next]`:
   `t_B = clamp(dot(q-A, B-A) / |B-A|², 0, 1)` → projected XZ distance² `dB2`.
5. Pick the closer segment:
   - `dA2 <= dB2` → `refinedU = uPrev + t_A * (bestU - uPrev)`
   - else → `refinedU = bestU + t_B * (uNext - bestU)`
6. Clamp `refinedU` to `[0, 1]`.
7. Return: `point = getPointAt(refinedU)`, `tangent = getTangentAt(refinedU)`, `arcS = refinedU * bestArcLen`.

**Properties:**
- O(1): 3 `getPointAt` calls for bracket evaluation + 2 `getPointAt/getTangentAt` for the return values (same count as before for the returns; bracket adds 3 scratch reads).
- Allocation-free refine: all scalar locals; `_scratchPt` reused; no new `Vector3` per query.
- Contract preserved: `{ point, tangent, runKey, arcS, spline }` unchanged. `arcS = refinedU * bestArcLen` keeps pothole keying and camber probe consistent.
- Raw-network fallback block unchanged (already interpolates between polyline points).

### Task 2 — Physics-sampling C0-continuity harness fixture (test/spline-continuity.mjs)

**Added:**

- `MAX_PHYSICS_DY_M = 0.05` — tunable constant; documented as far below the old ~2 m staircase artifact.
- `physicsSampleY(curve, qx, qz, mode)` — zero-install helper vendoring both strategies:
  - `'nearest'`: brute nearest discrete sample, return `curve.getPoint(bestU).y`.
  - `'refine'`: nearest-discrete search + same bracket→project→map refine as Task 1; return `curve.getPoint(refinedU).y`.
- `computePhysicsMetrics(fixture)` — marches a query point along the spline at 0.25 m steps with 0.5 m lateral offset, calling both modes at each step, returning `{ maxDY_nearest, maxDY_refine }`.
- New gate fixture `physics-sampling-continuity`: ~8% grade, gentle XZ curvature (~105 m path, 7.6 m rise). Fixture chosen so nearest-discrete staircase clearly exceeds threshold.

**Harness output (node test/spline-continuity.mjs):**

```
nearest-discrete: ΔY=0.1547 m (would FAIL) | refine: ΔY=0.0200 m (PASS)
```

- Nearest-discrete: 0.1547 m — **3× above** the 0.05 m threshold (staircase catch demonstrated).
- Refine: 0.0200 m — **2.5× below** the threshold (C0 continuous, PASS).
- Exit code: 0.

## Verification

```
node --check src/road.js        → OK
node --check test/spline-continuity.mjs → OK
node test/spline-continuity.mjs → exit 0, all gate fixtures PASS
git diff --stat -- src/terrain-worker.js → (empty — byte-identical)
```

## Deviations from Plan

None — plan executed exactly as written.

## Human Verification Required

The static gates all pass (harness exit 0, syntax clean, worker unchanged). The on-road bounce can only be confirmed in-browser. **Steps:**

1. Start a local HTTP server (ES modules require HTTP, not `file://`):
   ```
   npx serve .
   ```
   or use VS Code Live Server. Open the served `index.html`.

2. Spawn on a road (default spawn places the truck on the road).

3. Drive DOWN the road at speed (40+ km/h) — the bounce was speed-sensitive (higher speed = more visible staircase impulse frequency).

4. **CONFIRM:** the hard up/down periodic bounce on visually-smooth asphalt is GONE. The truck should ride the visible road surface smoothly with no rhythmic ~2 m-period jolt from the suspension.

5. Drive over a gentle grade and a curve to confirm the surface stays smooth. Crown/camber/pothole behavior should look unchanged from 09-16 (this plan did not touch that math — only the base `nr.point.y` evaluation).

6. Sanity check: off-road terrain feel unchanged; spawn still places the truck on the road.

**Expected outcome:** No bouncing on smooth road. Suspension travel visible but smooth (crown + camber + any potholes may produce gentle undulation, which is correct behavior).

## Known Stubs

None — all changes are functional.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface introduced. Physics-only fix in an existing hot path.

## Self-Check: PASSED

- `src/road.js` — modified, committed at beb6b5a — confirmed present and node --check clean.
- `test/spline-continuity.mjs` — modified, committed at 10cd73c — confirmed present and harness exits 0.
- `src/terrain-worker.js` — git diff empty (byte-identical).
- Both commits exist in `git log --oneline`: beb6b5a, 10cd73c.

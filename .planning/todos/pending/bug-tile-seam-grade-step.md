---
id: BUG-14
type: bug
status: open
opened: 2026-06-14
source: phase-09-insim-verify
severity: high
---

# BUG-14: Vertical grade step at tile/chunk seams (carve foundation + physics) → suspension launch

## Request

Crossing a tile seam, the car sometimes hits a vertical drop/gain in the road surface that the suspension
rides over; combined with the residual body-collision jank it can launch the truck. A clear repro:
**World Seed 7**, Coarse Amplitude **150 m** / Freq 0.2 / Octaves 4 / Ridge 1.6, Fine Amp 2.4 / Freq 0.05,
Regional strength 1 / scale 500, Max Grade 0.15, Min Turn Radius 12 — the road right behind spawn shows a
vertical step in the carved foundation (image 2026-06-14).

## Root cause (confirmed in code)

The previously-fixed "continuous centerline" work made the slice SPLINE C0 across seams, but the road
GRADE REFERENCE is still selected discretely / per-window, and that selection is NOT seam-consistent:

1. **Carved foundation (visible step) — `terrain.js _buildCarveTable` (~946-962).** Each chunk vertex's
   road grade is the **nearest DISCRETE road sample's Y** (`ny = samples[bi+1]`), with `samples` collected
   per-chunk via `collectChunkSplinePoints(chunkCX, chunkCZ, …)`. A vertex on the SHARED boundary between
   two chunks picks its nearest sample from two DIFFERENT per-chunk sample sets → different `ny` → the
   shared boundary vertices don't match → a vertical step in the foundation mesh. No projection is done
   here (unlike physics). With grade 0.15 over 150 m relief the per-sample Y deltas are large → the
   seam mismatch is a real step.

2. **Physics (felt launch) — `road.js queryNearest`.** It projects continuously WITHIN a slice (09-17
   fix), but the nearest-SLICE selection (`bestSpline`) can switch as the 3×3 search block shifts across
   a tile boundary, and the D4 interior/exterior arm pick can flip. When `bestSpline` jumps A→B, `nr.point.y`
   jumps. Intermittent; amplified by steep grade. The car rides `analyticHeight` (physics), not the mesh,
   so this is the suspension-launch path; the foundation step (1) is the visual tell.

Both are worse at high coarse amplitude (steep road grades turn small arc-position / sample-selection
differences into large Y steps). Distinct from the camber-seam BUG-10 (that was arcS keying).

## Fix directions

- **Carve foundation:** project onto the slice spline (continuous, same as physics) instead of nearest
  discrete sample; OR guarantee shared chunk-boundary vertices use an identical cross-boundary sample/grade
  so adjacent chunks agree by construction. Then mesh == physics and no per-chunk seam step.
- **Physics:** make the slice/arm selection stable across tile boundaries — prefer the continuous parent
  run and blend `nr.point.y` across a slice switch rather than hard-switching `bestSpline`.
- Extend the headless harness: a seam fixture that samples grade on BOTH sides of a tile boundary from the
  carve-table path AND the queryNearest path and asserts |ΔY| < ε across the seam (the current
  tile-seam-mismatch gate only checks the spline endpoints, not the discrete carve / slice-switch).

## Acceptance

- Driving across tile seams (esp. high-amplitude terrain) produces no vertical step in physics or the
  carved foundation; suspension stays calm. Headless seam-grade gate passes on both paths.

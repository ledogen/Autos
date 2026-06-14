---
id: BUG-10
type: bug
status: open
opened: 2026-06-13
source: phase-09-insim-verify
---

# BUG-10: Road camber transitions are sharp / discontinuous

## Request

Banking changes abruptly at points along the road instead of easing in/out. Top in-sim concern
after the Phase 9 D0–D5 refactor.

## Root-cause analysis (from code, 2026-06-13)

`road.js _buildCamberProfile(runKey)` builds a slew-rate-limited camber profile **per network run**,
and forces `rawCamber[0] = 0` / `camberRad[0] = 0` — so banking resets to zero at the START of every
run. The ribbon (and physics) read `camberProfile(arcS, runKey)` per-vertex, with `runKey`/`arcS` from
`queryNearest`. Wherever the nearest run changes (between switchback arms via D4 disambiguation, or at
mz row-band seams) the camber jumps between two INDEPENDENT profiles that each start at 0 → the felt
discontinuity. The D2 design intended "rate-limit along the CONTINUOUS run"; the per-run reset breaks
continuity at run boundaries.

Also: forward-march-only slew limit is asymmetric (banking lags curvature); a symmetric (forward +
backward) pass would center the ramp on the curvature change.

## Fix directions

- Make camber continuous across run boundaries: either stitch adjacent runs into one arc-domain for the
  camber pass, or seed each run's `camberRad[0]` from the neighbouring run's end value (needs run
  adjacency/ordering, which `_network` currently lacks).
- Add a **headless camber-continuity gate** to `test/spline-continuity.mjs`: build a multi-run road that
  crosses a run boundary mid-turn and assert `|Δcamber|` per metre stays ≤ slew rate ACROSS the seam
  (the current camber-rate gate only tests within a single synthetic run).
- Consider symmetric slew limiting.

## Status (2026-06-13): ROOT FIXED (`3df47cd`), in-sim verify + seam-gate owed

Real root was NOT "per-run reset" — it was `arcSOffset` defaulting to 0 in `_sliceNetwork` (never
set), so camber/quality used **tile-local** arc and sawtoothed back to the run start at every 64 m
tile seam. Fixed: slices now carry `arcS0/arcS1` (run-global arc at their ends, reversal-aware), and
ribbon + physics (`queryNearest`) + carve (`collectChunkSplinePoints` / `_buildCarveTable`) all read
the run-global arc + a `camberSign` for E→W slices. ribbon == physics == carve banking. Worker
byte-identical. All 8 harness gates pass.

**Still owed:** a headless camber-across-seam gate (the existing camber-rate gate only tests a single
synthetic run, never the tile-slice indexing — which is exactly why this shipped). Blocked on the
slicer needing THREE (can't import road.js into the zero-install harness); options: extract a pure
slice-arc helper, or a thin THREE-backed node test. Until then: in-sim verification only.

## Update (2026-06-14): within-run sawtooth fixed, but sharp transitions PERSIST

`3df47cd` (run-global arcS) killed the per-tile-seam sawtooth, and `a99ab5c` (camberStrength 200→4)
fixed the over-banking. But the user still sees **sharp camber transitions** in-sim (image 17). Remaining
suspects (still under BUG-10):

1. **Per-RUN reset (primary):** `_buildCamberProfile` forces `rawCamber[0] = camberRad[0] = 0` at the
   START of every network run (road.js ~1840/1874). The ribbon/physics read `camberProfile(arcS, runKey)`,
   so wherever the nearest run (`runKey`) changes — a road crossing from one E-W canonical run to the next
   (e.g. N-S / winding climbs that span multiple `mz` rows) — banking jumps to 0 and ramps back. The
   arcSOffset fix made camber continuous WITHIN a run but did nothing ACROSS runs. A run that begins
   mid-curve also starts at 0 bank (wrong).
2. **(Ruled out)** camberSign flip on reversed slices is self-consistent: uLat and camberSign flip
   together, so banking is invariant across slice orientation — NOT the cause.

Fix direction: make camber continuous across run boundaries (seed each run's start camber from the
adjacent run's end, or build camber over stitched runs), and add the camber-across-run-boundary headless
gate (still owed). Don't force `camberRad[0]=0` when the run starts mid-curve.

## Acceptance

- Driving through turns and across run/arm boundaries, banking eases smoothly (no step).
- Headless gate proves `|Δcamber/Δs| ≤ roadCamberRate` across a run-boundary fixture.

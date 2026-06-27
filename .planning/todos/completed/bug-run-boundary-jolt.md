---
id: BUG-21
type: bug
status: resolved
opened: 2026-06-26
diagnosed: 2026-06-27
resolved: 2026-06-27
severity: medium
source: user-observation
captures:
  - Logs/rangersim-capture-1782461186579.json   # event, 173 frames, drive-over — REPRODUCES the jolt
  - Logs/rangersim-capture-1782461316755.json    # place, mark (-296.8, 221.5) — on the run boundary
repro_headless: confirmed
root_cause: apex-sliver-off-road   # both arms reject the shared-anchor wedge via _projectOntoRun offEnd
relates_to: BUG-15
---

# BUG-21: Upward jolt at the run boundary (shared hairpin apex, runs 0:-3 ↔ 0:-2)

## Request

User (after BUG-15 fixes felt good): "there's a camber discontinuity near the same area, small gap in
road visible in the screenshot. driving over it kinda jolts the car up." Distinct from BUG-15 (that was
the carve cross-section / shoulder; this is at the run-to-run boundary). The "small gap in the road" is
literal — see root cause.

## Where

Boundary between run **`0:-3`** (the hairpin, **ends** at arcS ≈ 714, minRadius ≈ 13 m, camber 6°) and
run **`0:-2`** (**starts** at arcS 0). The two runs **share the apex anchor exactly**: `0:-3` end ==
`0:-2` start == **(-295.52, 223.97)**. Seed 6.

## ROOT CAUSE — CONFIRMED 2026-06-27

Diagnostic: reconstructed the 4 wheel hubs per frame from the event capture (`getWheelPosition` on the
recorded pos+quat+strutComp) and sampled the FRESH `_resolveRoadSurface` / `analyticHeight` at each hub.

- The **outside-of-hairpin** wheels (FL/FR, ~3–4.7 m lateral) hit a **one-frame off-road sliver** at the
  apex: **FL f59** `(-296.72, 220.94)` and **FR f60** `(-297.31, 219.59)` both resolve to **NULL** →
  the surface pops UP to **raw terrain** (FL 120.31→120.54, FR 120.44→**121.03**, ≈ +0.6 m; the road is
  in a CUT here so raw sits above the grade) → the jolt/slam. RL/RR (inside the bend) never go off-road.
- **Mechanism:** at the OFF points `_projectOntoRun` returns `offEnd=Y` for **both** arms — `overAfter`
  for `0:-3` (arcS 714.46, past its end) and `overBefore` for `0:-2` (arcS 0.00, past its start) — yet
  both are `inFoot` (lat 3.26 / 4.73 < footHW 10.5). A point laterally offset on the OUTSIDE of the sharp
  bend has its perpendicular foot AT the shared apex vertex but lies longitudinally beyond the end of both
  arms, so the wedge beyond the apex is owned by no run. (`offEnd` was added to kill the 40 m "topmost"
  endpoint artifact; at a hairpin BOTH continuation arms terminate at the shared anchor and each treats
  the wedge as off-its-end → the sliver.)
- **The carveHint cache is NOT involved** (it was the original leading hypothesis — refuted). The recorded
  `*_gh` telemetry is logged via a FRESH `analyticHeight`, no hint (main.js:1104), and it MATCHES the
  fresh resolve to **Δ = 0.000** at the OFF frames. The fresh resolver itself returns off-road there, so
  the spike exists with the cache entirely out of the path.

Diagnostic scripts saved in the session scratchpad (`diag-bug21-good.mjs` per-wheel hub table;
`diag-bug21b-good.mjs` candidate-run / offEnd dump). To be folded into the acceptance gate.

## RESOLVED 2026-06-27 (Stage 1 of the earthwork-routing work)

Implemented the designed second pass in `_resolveRoadSurface` (road.js): offEnd candidates whose foot is
the terminal vertex and that lie within `footHW` **radially** (`pr.d2 ≤ footHW²` — a radial gate, not
lateral-only, so the old 40 m "topmost" artifact stays rejected) are collected and the nearest is used
ONLY when nothing interior wins. `_projectOntoRun` needed no change — its offEnd result already carries
the terminal foot (fx/fz), the end-clamped arcS, and d2. Verified: the seed-6 apex disc went from 466
off-road nulls → 0 (seed 7: 300 → 0); apex fan gradeY step 0.013 m (C0). New gate
`test/road-apex-sliver.mjs` (in run-all, now 16 gates) asserts no off-road sliver within the carve
footprint of ANY shared anchor. NOTE: replay.mjs self-check is currently RED from pre-existing
terrain-headless.mjs drift (0.756 m, frame 168, present with AND without this fix) — a separate harness
issue; verified via fresh-resolve gate instead. The large gradeY step (~4 m) the gate reports at some
shared anchors is two runs from different rows CROSSING at different heights (inter-run-crossing /
overpass territory), not this bug.

## Fix (designed — IMPLEMENTED above)

In `_resolveRoadSurface`, keep the primary nearest-interior-non-`offEnd` selection. When it yields
nothing (`bestPr` null), run a **second pass**: among candidates that are `offEnd` but whose foot is a
**terminal vertex** AND are `inFoot` (lat ≤ footHW), pick the nearest by lateral distance and **clamp
arcS to that run end**. This fills the apex/continuation sliver with the endpoint road surface
(gradeY + crown + camber at the run end — C0 with both arms, which share the anchor and have synced
run-end camber per BUG-19/QUAL-05), removing the raw-terrain pop. The `inFoot` gate preserves the 40 m
"topmost" rejection (a run merely passing nearby has its endpoint foot well outside footHW).

Open detail for implementation: `_projectOntoRun` currently returns only a boolean `offEnd`; the second
pass needs which end (to clamp arcS to the run's first/last cumulative arc) and confirmation the foot is
the terminal vertex (`bestI`/`bestTclamp` at an end). When both arms qualify, nearest-lateral is the
stateless pick; gradeY is identical at the shared anchor so the worst residual is a small camber-tilt
crease (bounded, not the 0.6 m pop).

## Headless reproduction (confirmed)

`node test/replay.mjs Logs/rangersim-capture-1782461186579.json`:
- (A) terrain self-check: headless `analyticHeight` matches recorded `rd_gh` to **0.033 m** → the jolting
  surface is faithfully reproduced; it's a real feature, not a harness artifact.
- (C) **all-wheels airborne frames 57–59** (t 67.13–67.17), brief (3 frames) — reproduced in replay.
- Recorded per-wheel ground-height spikes: **`fl_gh` +0.25 m (f58→59)**, then **`fr_gh` +0.62 m
  (f59→60)** — these are the off-road pops to raw terrain identified above (NOT a camber-tilt flip).

## What was RULED OUT (don't re-chase these)

- **carveHint cache staleness** (the original leading hypothesis) — refuted; see root cause (Δ=0.000).
- **Simple camberSign flip:** `camberSign = +1` on BOTH runs; camber is continuous along the centerline.
- **Two-arm antiparallel overlap:** at the apex only one run is interior at a time; both candidates here
  are the same-side continuation arms sharing the anchor, not opposing arms.
- **A static lateral cliff:** a fine grid scan over [-300,-292]×[216,224] finds a worst adjacent step of
  only 0.275 m (the intended BUG-15 ribbon-edge dropoff). The grid stepped OVER the apex sliver; the
  actual driven wheel trajectory lands inside it (hence the live spike a coarse scan misses).
- **Surface window-invariance:** GREEN at the place mark (no streaming tear).

## Acceptance

Driving across the 0:-3/0:-2 boundary produces no upward jolt / contact loss: the resolved per-wheel
ground height is continuous across the apex (no off-road pop; no >~0.1 m single-frame surface spike
beyond the intended ribbon-edge dropoff). The event capture replays without the airborne signature.
**Gate:** along the driven path crossing the run boundary (reconstructed wheel hubs, or a swept lateral
fan past a shared anchor), assert `_resolveRoadSurface` never returns null where a run footprint covers
the point, and the resolved gradeY is C0 across the boundary.

## Not this ticket

BUG-15 (carve cross-section / shoulder / fill — fixed). BUG-18 (visual wheel dip on switchback inside —
single-sphere contact sampling, FEAT-09). This is a run-boundary SURFACE-RESOLUTION gap at a shared
junction anchor, separate from both.

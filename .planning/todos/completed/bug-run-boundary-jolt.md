---
id: BUG-21
type: bug
status: open
opened: 2026-06-26
severity: medium
source: user-observation
captures:
  - Logs/rangersim-capture-1782461186579.json   # event, 173 frames, drive-over — REPRODUCES the jolt
  - Logs/rangersim-capture-1782461316755.json    # place, mark (-296.8, 221.5) — on the run boundary
repro_headless: confirmed
relates_to: BUG-15
---

# BUG-21: Small upward jolt / brief airborne at the run boundary (hairpin apex, runs 0:-3 ↔ 0:-2)

## Request

User (after BUG-15 fixes felt good): "there's a camber discontinuity near the same area, small gap in
road visible in the screenshot. driving over it kinda jolts the car up." Distinct from BUG-15 (that was
the carve cross-section / shoulder; this is at the run-to-run boundary).

## Where

Run boundary between **`0:-3`** (the hairpin, ends at arcS ≈ 714, minRadius ≈ 13 m, camber 6°) and
**`0:-2`** (next run, starts at arcS 0). The shared anchor / apex is near **(-296, 220)**, z ≈ 219.8–220.
Seed 6.

## Headless reproduction (confirmed)

`node test/replay.mjs Logs/rangersim-capture-1782461186579.json`:
- (A) terrain self-check: headless `analyticHeight` matches recorded `rd_gh` to **0.033 m** → the jolting
  surface is faithfully reproduced; it's a real feature, not a harness artifact.
- (C) **all-wheels airborne frames 57–59** (t 67.13–67.17), brief (3 frames) — reproduced in replay.
- Per-wheel ground-height spikes in the recorded telemetry: **`fl_gh` +0.25 m (f58→59)**, then
  **`fr_gh` +0.62 m (f59→60)** — single-frame upward spikes in the resolved surface under the wheels as
  they cross the boundary. `0.62 ≈ 2·(3 m)·sin(6°)` — a camber-tilt-magnitude flip at a ~3 m wheel offset.

## What is RULED OUT (don't re-chase these)

- **Simple camberSign flip:** `camberSign = +1` on BOTH runs; camber is continuous (6° → ramps down on
  0:-2) and the +3 m-offset tilt is continuous across the boundary (0.29 → 0.26 …) along the centerline.
- **Two-arm overlap at the apex:** at every tested point near the apex only **ONE** run is
  footprint-interior, all same-side (`signedLat ≈ +3 m`). Not an antiparallel-arm pick.
- **A static lateral cliff:** a fine free-resolution grid scan (`_sampleCarveWorld`, no hint) over
  [-300,-292]×[216,224] finds a worst adjacent step of only **0.275 m** — and that is just the intended
  BUG-15 ribbon-edge clearance dropoff, not the 0.62 m event spike.
- **Surface window-invariance:** GREEN at the place mark (no streaming tear).

## ROOT CAUSE — CONFIRMED 2026-06-26 (the cache hypothesis below is REFUTED)

Diagnostic: reconstructed the 4 wheel hubs per frame from the event capture (`getWheelPosition` on the
recorded pos+quat+strutComp) and sampled the FRESH `_resolveRoadSurface` / `analyticHeight` at each hub.

- The two runs **share the apex anchor exactly**: run `0:-3` end == run `0:-2` start == **(-295.52, 223.97)**.
- The OUTSIDE-of-hairpin wheels (FL/FR, ~3–4.7 m lateral) hit a **one-frame off-road sliver** at the
  apex: **FL f59** `(-296.72, 220.94)` and **FR f60** `(-297.31, 219.59)` both resolve to **NULL** →
  surface pops UP to **raw terrain** (FL 120.31→120.54, FR 120.44→**121.03** ≈ +0.6 m; the road is in a
  CUT here so raw sits above the grade) → the jolt/slam. RL/RR (inside the bend) never go off-road.
- **It is NOT the carveHint cache.** The recorded `*_gh` telemetry (logged via a FRESH `analyticHeight`,
  no hint — main.js:1104) MATCHES the fresh resolve to **Δ = 0.000** at the OFF frames. The fresh
  resolver itself returns off-road there.
- Mechanism: at the OFF points `_projectOntoRun` returns `offEnd=Y` for **both** arms — `overAfter` for
  `0:-3` (arcS 714.46, past its end) and `overBefore` for `0:-2` (arcS 0.00, past its start) — yet both
  are `inFoot` (lat 3.26 / 4.73 < footHW 10.5). A point laterally offset on the OUTSIDE of the sharp bend
  has its perpendicular foot AT the shared apex vertex but lies longitudinally beyond the end of both
  arms, so the wedge beyond the apex is owned by no run. (`offEnd` was added to kill the 40 m "topmost"
  endpoint artifact; at a hairpin BOTH continuation arms terminate at the shared anchor and each treats
  the wedge as off-its-end.)

### Fix (designed)

In `_resolveRoadSurface`, when the primary nearest-interior-non-offEnd pass yields nothing (`bestPr`
null), run a SECOND pass: among candidates that are `offEnd` but whose foot is a **terminal vertex** AND
are `inFoot` (lat ≤ footHW), pick the nearest by lateral distance and **clamp arcS to that run end**.
This fills the apex/continuation sliver with the endpoint road surface (gradeY + crown + camber at the
run end — C0 with both arms, which share the anchor and have synced run-end camber per BUG-19/QUAL-05),
removing the raw-terrain pop. The `inFoot` gate preserves the 40 m-artifact rejection (a run passing far
away has its endpoint foot well outside footHW). Then add the acceptance gate.

## Leading hypotheses (SUPERSEDED — kept for the record; #1 was refuted above)

1. **`carveHint` quantized-cell cache staleness (LEADING).** The live physics ground path is
   `queryContacts (main.js) → carveHint(cx,cz) → _resolveRoadSurface → _sampleCarveWorld`, and
   `carveHint` caches the resolved `nr` per quantized cell and REUSES it for nearby wheel queries. Near
   the run boundary a cached `nr` from run 0:-3 (arcS 714) can be served for a wheel that is actually on
   0:-2 (arcS 0) → wrong arcS/tangent/lat → a spiked gradeY. This explains why a FRESH `_sampleCarveWorld`
   scan is smooth but the cached live drive spikes. **Next step:** reconstruct the exact per-wheel world
   positions at frames 57–60 (CG + quaternion-rotated wheel offsets from RANGER_PARAMS) and sample BOTH
   the carveHint-cached path and fresh `_sampleCarveWorld` there — reproduce the 0.25/0.62 m spike, then
   read which run/arcS/lat/offEnd the cache returns vs fresh.
2. **`_projectOntoRun` endpoint / `offEnd` behavior** at arcS ≈ 714 (end of 0:-3) / arcS ≈ 0 (start of
   0:-2): a wheel projecting just past a run end may flip runs or clamp arcS abruptly.
3. **Run ownership at the shared anchor is ambiguous:** the place DIFF showed game = `0:-3` (arcS 714) vs
   fresh replay = `0:-2` (arcS 0) at the SAME mark — the live streaming state and a fresh build disagree
   which run owns the boundary point. Whatever resolves it must be C0 in surface height regardless of pick.

## Acceptance

Driving across the 0:-3/0:-2 boundary produces no upward jolt / contact loss; the resolved per-wheel
ground height is continuous across the boundary (no >~0.1 m single-frame spike beyond the intended
ribbon-edge dropoff). The event capture replays without the airborne signature. Add a gate: along a
driven path crossing a run boundary, assert the carveHint-cached surface == fresh `_sampleCarveWorld`
(no cache-induced spike) and is C0.

## Not this ticket

BUG-15 (carve cross-section / shoulder / fill — fixed). BUG-18 (visual wheel dip on switchback inside —
single-sphere contact sampling, FEAT-09). This is a run-boundary SURFACE-RESOLUTION spike (likely cache),
separate from both.

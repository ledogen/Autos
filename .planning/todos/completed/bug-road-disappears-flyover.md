---
id: BUG-20
type: bug
status: fixed
opened: 2026-06-25
closed: 2026-06-25
severity: high
source: user-observation
capture: Logs/rangersim-capture-1782454067744.json
resolution: "FIXED + BROWSER-CONFIRMED (holes gone). Two independent window-variance bugs in src/road.js _streamNetwork, both made the carved terrain surface depend on the streaming-band center: (A) the longitudinal grade moving-average (smoothGradeInPlace, ±designGradeWindow) was computed over a row truncated at the band edge mx0/mx1 → a band-edge run's smoothed gradeY drifted as the band slid → carve-height holes ALONG the road; (B) the X band was a FIXED CANONICAL_HALF_WIDTH=2 (±512 m) while the Z extent scaled with the road radius R, so at Far/Ultra a run anchored just outside the band but curving into the visible disc dropped out → whole sections carved as no-road and never self-healed. Fix A: grade PROTO_GRADE_PAD=2 extra connections beyond the band each side, register only in-band → every registered run is interior to the smoother. Fix B: band half-width scales with R — _bandHalfWidth()=ceil(R/PROTO_ANCHOR_SPACING)+ROAD_BAND_MARGIN(1); Near stays HW2/±512 (= PERF-05 cost), Ultra → HW4/±1024 (= original). New gate test/road-band-coverage.mjs (12 gates green); replay of the capture now exits 0 (gradeΔ=hitΔ=0)."
---

# BUG-20: Road disappears / terrain holes when flying over an area before driving it

## Request

> "How come the road disappears here? ... seems like the road glitches if i spawn in and fly over
> before driving over. driving over doesnt fix it clearly."

Spawning and freecam-flying over a region BEFORE driving to it leaves the road with holes / floating
sections / a vanished swath. Driving over does NOT repair it (the terrain chunk is already carved).
Captured live as a `kind:"place"` capture (seed 6): `Logs/rangersim-capture-1782454067744.json`.

## Diagnosis (2026-06-25)

`node test/replay.mjs Logs/rangersim-capture-1782454067744.json` reproduced it deterministically:
SURFACE WINDOW-INVARIANCE failed — the drivable surface (gradeY) and even road presence (hit) at a
fixed world region differed by which stream center built it (worst gradeΔ 6.06 m; 43 hit flips). Two
independent mechanisms, both in `_streamNetwork`:

- **A — windowed grade smoothing.** `smoothGradeInPlace` (±50 m moving avg, crosses connection joins
  for C0) ran over `rowPts` truncated at the streaming band `mx0..mx1`. A band-edge run got a
  shortened averaging window → its smoothed gradeY (and the terrain carved to it) shifted as the band
  slid. (The `defect-b-grade.mjs` window-invariance test SKIPS truncated ends — exactly this blind spot.)
- **B — fixed band under-covers the disc.** Runs are keyed by their WEST anchor `"mz:mx"` but curve
  ~2.5 cells EAST (anchor jitter + `PROTO_SNAP_CAP` ≈ 115 m). The X band was a fixed
  `CANONICAL_HALF_WIDTH=2` (±512 m) while the Z extent scaled with R. At R=640 (Far/Ultra; the replay
  default) a run anchored just outside ±512 m still curved into the visible disc but was dropped → its
  chunk carved with no road.

## Resolution

- **A:** `PROTO_GRADE_PAD=2` — assemble + grade extra connections beyond the band each side, register
  only the in-band ones, so every registered run is interior to the smoother.
- **B:** `_bandHalfWidth() = ceil(R / PROTO_ANCHOR_SPACING) + ROAD_BAND_MARGIN` (margin=1), used by
  both `warmRoutes` and `_streamNetwork`. Per preset: Near HW2/±512 m (= PERF-05 cost, kept cheap),
  Normal/Far HW3, Ultra HW4/±1024 m (= the pre-PERF-05 width). `CANONICAL_HALF_WIDTH` removed.

## Verification

- Replay of the capture now exits 0: gradeΔ=0, hitΔ=0, arcS-reparam=0 over 95 on-road points.
- `npm test` 11 → 12 gates green. New gate `test/road-band-coverage.mjs` (two-center Δ300/Δ512 m
  hit+gradeY invariance at R=640) is RED on the old fixed band (130 / 624 hit-drops), GREEN now.
  Unlike `invariance.mjs` it does not skip hit-mismatched points (that skip hid Mechanism B).
- Browser-confirmed by user: holes are gone.

Files: `src/road.js`, `test/run-all.mjs`, new `test/road-band-coverage.mjs`.

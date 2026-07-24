---
id: PERF-24
type: perf
status: open
opened: 2026-07-23
severity: major
source: user-observation (post-junction-merge re-drive) + test/replay.mjs characterization
relates: [QUAL-16 (deg-2 kink connector), FEAT-40/junction merge (triple-overlay carve), PERF-08 (profiling harness)]
capture: "Logs/rangersim-capture-1784869575819.json (Downloads original; Logs/ is gitignored — capture
  kept locally). seed 1402567980 'quotient', mark (582.6, -233.5)."
note: "Severe frame lag when the car SITS ON a specific tight deg-2 kink corner. replay.mjs pins it to
  a sub-design-min kink: local centerline radius 11.1 m = 74% of the 15 m design min (hard floor 10 m),
  runKey g:1,-2,2:0,-1,1, arcS 2214.8. The tight kink is exactly where the deg-2 connector + pad-fallback
  + carve-resolve machinery is heaviest per physics sample, so the on-road carve query cost spikes."
---

# PERF-24: Severe on-road lag at a tight deg-2 kink corner

## Observed

While driving on one particular deg-2 (kink) corner the frame rate tanks badly — the lag is tied to
the car being **on** that corner (leaves when the car leaves). Reproduced from a place-capture at
mark **(582.6, −233.5)**, seed **"quotient"** (1402567980). Screenshot: the pinch/kink where the
road bends hard around the pad. (image #15 in the 2026-07-23 re-drive.)

## Characterization (test/replay.mjs)

`node test/replay.mjs Logs/rangersim-capture-1784869575819.json`:

- runKey `g:1,-2,2:0,-1,1`, arcS 2214.8, camber 0.209.
- **FOLD METRIC: local centerline turn radius = 11.1 m — 74% of design min (15 m), just above the
  10 m hard floor → flagged KINK "tighter than the router should emit."**
- Surface window-invariance passes (173 on-road pts, gradeΔ 0.000 m) — so this is NOT a geometry tear;
  the surface is stable. The cost is in how much WORK each on-road carve/resolve query does here.
- Secondary observation (may be unrelated / capture-timing): replay gradeY 105.39 vs game 111.50 — a
  ~6 m reproduction mismatch at the mark while hit/runKey/arcS/camber/minRadius all match. Worth a
  glance when investigating (could be a live-vs-headless profile difference), but the lag is the
  headline.

## Hypothesis

The physics per-frame contact sampling calls `_sampleCarveWorld` several times per wheel per step.
On a tight deg-2 kink that path now runs the full triple-overlay compose (bore resolve → blended run
cross-section incl. the QUAL-10 pad-plane inter-leg RULED blend over every near-node leg via
`_projectLegNearNode` → deg-2 connector `_connectorCarve` projection onto the arc → `_mergeCarve`
pad merge). Near a sub-design-min kink the connector arc is short/tight and the pad ring + ruled-leg
enumeration is at its most expensive, so the cost multiplies right where the car dwells. Likely
levers: cache/memoize the per-position resolve within a frame, cheapen `_projectLegNearNode`
enumeration, or quick-reject the connector/pad work when the query is clearly on the plain ribbon.

## Acceptance

- Driving on the captured corner holds the 60 fps target (no visible frame lag) on the mid-range
  laptop baseline.
- The fix is a COST reduction only — surface geometry unchanged: `road-smoothness`,
  `shoulder-lateral-continuity`, `carve-mesh-smoothness`, and the window-invariance in this capture
  stay green (mesh == collision preserved).
- Profile the hot path with the PERF-08 harness (`?prof=1` / trace-report) before and after to show
  the `_sampleCarveWorld` on-kink cost dropping.

## Notes / leads

- Triple-overlay carve composition + the `_projectLegNearNode` array (every local-min limb blended)
  are documented in memory `project_junction_fillet_merge_pending`.
- PERF-08 profiling harness: memory `project_perf08_harness_findings`.
- Possible dupe-lever with the tight-kink itself: the router emitted an 11.1 m kink below the 15 m
  design min — if that's avoidable at generation time it also reduces the worst-case here (but the
  perf path should be cheap regardless; don't block PERF-24 on router tuning).

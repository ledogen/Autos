---
id: BUG-17
type: bug
status: open
opened: 2026-06-23
severity: minor
source: user-observation
phase_origin: road-overhaul
note: "User: roads still overlap whether `roadCoverSuppress` (COVER Suppress slider) is ON or OFF — the toggle appears to do nothing in-game."
---

# BUG-17: COVER Suppress toggle has no visible effect — roads overlap on or off

> **DEFERRED / SUBSUMED by FEAT-10 (2026-06-25).** COVER is the weak per-connection dedup this ticket
> is about; FEAT-10 (robust route merge + exclusion) **deletes the COVER mechanism** and replaces it
> with a deterministic graph merge. **Close BUG-17 as subsumed when FEAT-10 lands and `PROTO_COVER_*`
> is removed.** No independent fix here. See `feat-robust-route-merge.md`.

## Observed

Toggling **COVER Suppress** (`roadCoverSuppress`) in the debug GUI does not visibly change the road
network — roads overlap the same either way.

## Likely causes (in priority order — investigate before fixing)

1. **Scope mismatch (most likely).** COVER only suppresses **parallel, same-direction** overlap
   (heading dot > `PROTO_COVER_DOT` ≈ 21°, ≥ `PROTO_COVER_FRAC` of a connection's length within
   `PROTO_COVER_D`=36 m of a lower-row road). The overlaps the user sees may be **crossings** (two
   runs meeting at an angle = X/T junctions) — which COVER *deliberately preserves* (those are
   FEAT-07 intersections, not duplicates). If so, COVER is working as designed and the real ask is
   FEAT-07. **Verify what kind of overlap is on screen first.**
2. **Fires too rarely.** Headless on the synthetic terrain it drops only ~1 run of ~63 (smooth
   terrain → adjacent rows rarely converge within 36 m). Real ridged terrain may converge more, but
   if anchors rarely land within `COVER_D`, the pass almost never triggers → looks like a no-op.
   The anchor-segment pre-filter (`PROTO_COVER_PREFILTER`=110 m) gates it further.
3. **Toggle doesn't re-route.** Confirm the slider's `fireRoadParam → onRoadParamChange` actually
   invalidates + re-streams the network (so flipping it rebuilds). If the re-stream is skipped (band
   signature unchanged, dirty flag not set), the change won't take until the player moves far enough.
4. **Threshold too strict.** `PROTO_COVER_FRAC`=0.5 over a whole 256 m connection + the 21° heading
   gate may be too conservative to catch real partial overlaps.

## Acceptance

- [ ] Classify the on-screen overlaps: parallel-duplicate (COVER's job) vs crossing (FEAT-07's job).
- [ ] If parallel: confirm the toggle re-streams, then verify COVER actually drops the overlapping
      connection on a real seed where two rows converge (add a headless repro on a converging-anchor seed).
- [ ] If crossing: close as "works as designed; see FEAT-07" and adjust the slider tooltip to say
      COVER only merges parallel duplicates, not crossings.

## Notes

- COVER is window-invariant + per-connection (whole-connection drop granularity) — see
  `_streamNetwork` COVER pass. Headless it does change the run count (62 vs 63 on seed 6), so the
  mechanism runs; the question is whether it fires on the geometry the user is actually looking at.
- Related: FEAT-07 (intersections as a merged mesh), FEAT-08 (grade-separated self-overpasses).

---
id: QUAL-01
type: quality
severity: minor
status: resolved
opened: 2026-06-10
resolved: 2026-06-11
resolved_by: "quick 260610-v0y (spline viz + self-crossing removal, 2ae75d2) + quick 260610-w1c (corner smoothing, eb4a388)"
phase_origin: 08-road-routing
---

> **RESOLVED 2026-06-11** — all three parts shipped: (1) spline viz (`buildDebugLines` samples
> `seg.spline`), (2) loop/self-crossing removal (`_removeSelfCrossings`), (3) over-tight-corner control.
>
> Part (3) was first built as a per-vertex max-angle chamfer (`_limitTurnAngle` + `roadMaxTurnDeg`), but
> that could not fix tight loops/teardrops (each vertex turns only a few degrees; they ACCUMULATE a big
> heading change over a short arc). Replaced (commit `f38ed4e`) with **curvature / min-turn-radius
> excision** — `_limitCurvature` excises spans that coil tighter than `roadMinTurnRadius` (default 70 m),
> exposed as the **"Min Turn Radius (m)"** debug slider (20–300). Standalone test: teardrop coil
> 540°→32° excised, gentle R=200 m curve preserved, deterministic. Default is a starting point — user
> tunes live on Pages; lock a new `roadMinTurnRadius` default later if desired.

# QUAL-01: Road splines show occasional loop-backs and sharper-than-ideal corners

## ⏳ REMINDER — corner smoothing still OUTSTANDING (deferred 2026-06-11)

Quick task `260610-v0y` shipped TWO of the three QUAL-01 fixes (commits `2ae75d2` viz+crossings,
`4a53a1f` strip):
- ✅ **Spline viz** — `buildDebugLines` now samples the actual per-tile `seg.spline` (~2 m res) instead
  of drawing the coarse control polyline. Much of the apparent corner "sharpness" was this rendering
  artifact.
- ✅ **Loop / self-crossing removal** — `_removeSelfCrossings` (deterministic segment-intersection
  excision) added after `_removeLoops`; removes the real X-crossings / loops (UAT Images 2, 3).
- ⏳ **DEFERRED — corner smoothing (max-turn-angle / min-radius limit + slider).** A `_limitTurnAngle`
  chamfer pass + `roadMaxTurnDeg` param (default 70°) + "Max Turn Angle" debug slider were drafted but
  **intentionally stripped** (commit `4a53a1f`) so the user can first re-look at the smooth spline viz
  (loops gone) on Pages and decide whether any genuinely-sharp control-point corners still need limiting
  — and at what threshold, WITHOUT flattening real switchbacks (which arrive with spurs, currently
  deferred). The stripped implementation is recoverable from commit `2ae75d2` if we revive it.

**Next time:** user re-looks on Pages → if corners still too sharp, revive `_limitTurnAngle` + the
`roadMaxTurnDeg` slider (re-apply from `2ae75d2`), tune the default by eye, verify D-06 seam gate +
determinism still pass.

# QUAL-01: Road splines show occasional loop-backs and sharper-than-ideal corners

## Symptom

Flagged during Phase 08 UAT (2026-06-10). With "Show Road Splines" enabled, the valley-trunk
centerlines generally look good but exhibit:
- **Loop-backs** — the route occasionally doubles back on itself.
- **Sharper corners** — some corners are tighter than a drivable road would ideally be.

Cosmetic / tuning only — non-blocking. All Phase-08 UAT items passed.

## Likely contributing factors

- **`_removeLoops`** may not be catching all self-intersections, or is tuned too loosely (cross-ref
  `08-REVIEW.md` WR-03: `_removeLoops` can also erode run endpoints — tune carefully, both directions).
- **Turn penalty `roadWTurn` (D-09 default 120)** may be too low to discourage tight direction
  changes; raising it should round out corners at the cost of slightly longer routes.
- Some sharp corners are **expected switchbacks** (phase goal: "switchback where the grade is too
  steep") — distinguish genuine grade-forced switchbacks from undesirable kinks before tuning.
- Near-degenerate slices (`08-REVIEW.md` WR-05) can also read as visual kinks at tile boundaries.

## Suggested approach (when picked up)

1. Reproduce on lone-pine; note world coords of the worst loop-back and sharpest corner.
2. Try raising `roadWTurn` via the live debug slider (already wired) and watch the re-stream — find a
   value that smooths corners without distorting valley-following.
3. Review `_removeLoops` logic for missed self-intersections vs endpoint erosion (WR-03).
4. Lock any new D-09 default in `data/ranger.js` if a better turn weight is found.

## Files

- `src/road.js` — `_removeLoops`, `_protoEdgeCost` (turn term), slicing
- `data/ranger.js` — `roadWTurn` (and other D-09 weights)

## Notes

- Pure tuning/polish; safe to defer past Phase 9. Re-check after any PERF-01 streaming changes, since
  altering stream radius/memoization could change which runs are built and simplified.

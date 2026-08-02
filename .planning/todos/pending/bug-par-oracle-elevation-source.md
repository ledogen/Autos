---
id: BUG-40
type: bug
status: open
opened: 2026-08-02
severity: minor
source: discovered while fixing FEAT-39 GPS defects (feature/gps-fix)
relates_to: src/par.js (computePar / gradeRun), src/road.js (_gradeSampler, edgeParData,
  runProfile), src/mission.js (segments[].gradeAt), FEAT-29 (par oracle), FEAT-30 (par
  calibration), FEAT-53 (economy spine — payout/rank scale, k re-derived 2026-08-02 in 30544cb)
note: "Do NOT fix silently. Correcting this shifts every par time, and par is the denominator of
  the FEAT-53 payout/rank scale that was just re-derived. It is the owner's call whether to take
  the correction and re-calibrate, or leave par on its current basis."
---

# BUG-40: the par oracle prices grade off an elevation series the world does not build

## Observed

`RoadSystem.edgeParData()` hands the par oracle a `gradeAt(s)` built by `_gradeSampler(hit.points,
hit.clArc)` (`src/road.js:617`, `:1736`) — the ROUTED design polyline's `points[].y`. That is not
the elevation the world is carved to. The carve, the ribbon mesh and the physics all read
`RoadSystem.runProfile(s, runKey).gradeY`, a later pipeline stage.

The two disagree substantially. Measured on seed 6 over ~5 k route samples
(`RANGER_PARAMS`, `MISSION_PLAN_RADIUS`), against the true carved surface via
`terrain.analyticHeight`:

| elevation source | \|err\| vs carved surface, p50 | p90 | max |
|---|---|---|---|
| `seg.gradeAt` (what par uses) | 0.05 m | 0.74 m | **27.40 m** |
| `runProfile().gradeY` (what the world builds) | 0.05 m | **0.09 m** | 22.47 m* |

\* the runProfile tail is entirely FEAT-40 tunnel bores, where `analyticHeight` correctly returns
the hill overhead rather than the bore floor — i.e. runProfile has no genuine outliers.

The error is dominated by a per-run CONSTANT offset (all four worst samples on one runKey sat
-27 m, at arcs 6/12/18/24 m). This is why the impact on par is modest but nonzero: `par.js:147`
prices grade as a DIFFERENCE, `gradeAt(sFwd) - gradeAt(sBack)`, so a constant offset cancels — but
it does not cancel across a run boundary or wherever the offset varies along the run.

## Impact

Re-pricing 25 rolled missions on seed 6 with `runProfile` in place of `gradeAt`:

```
par time, relative change:  p50 0.61%   p90 2.61%   max 3.42%
```

So: real, one-sided-ish, and small. It does not invalidate FEAT-30's calibration, but it means par
is computed against hills that are not the hills the truck drives.

## Why this was not fixed in the GPS pass

FEAT-39's overlay had the same bug far more visibly — baking `gradeAt` put 5.6% of chevrons UNDER
the road surface (depth-tested away: "the chevrons disappear") and 7.2% more than a metre above it
("floating in the sky"), and left the junction arrow a median 7 m off. GPS now bakes from
`runProfile` (`src/gps.js` bakeRoute, ELEVATION SOURCE note) and is accurate to 0.02 m at junctions.

Par was deliberately left alone: changing it moves every par time by up to ~3.4%, and par is the
denominator of the FEAT-53 payout/rank scale whose `k` was re-derived only days earlier (30544cb).
That is a balance decision, not a bug fix.

## Acceptance

- [ ] Owner decides: switch par to `runProfile().gradeY`, or keep the current basis and record why.
- [ ] If switched: `edgeParData` returns a `runProfile`-backed `gradeAt` (guarded — `runProfile`
      warns and returns `gradeY: 0` for a runKey not in `_network`, so the unstreamed case must
      fall back rather than snap par's hills to sea level).
- [ ] If switched: re-run FEAT-30 par calibration (`test/calibrate-par.mjs`) and re-derive the
      FEAT-53 `k` against the new scale, exactly as Phase D item 1 did.
- [ ] `test/par-oracle.mjs` gains a check pinning WHICH elevation series par prices, so the two
      sources cannot silently diverge again.

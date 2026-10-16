---
id: BUG-77
type: bug
status: pending
severity: medium
---

# BUG-77 — tunnel spans on merged / shoved runs are stored in clArc but read in polyCum

**On main** (pre-existing; surfaced 2026-09-27 by the portal post-pass on `feature/portal-extend`).

`_v2GradePts(pts, clArc)` returns bore spans in the **centerline arc** domain (`clArc`). For a run
that carries `offCurveSpans` (a merged/promoted side road, `road.js` ~5675; a shoved run, ~6163),
the run's DRIVEN arc — the domain `tunnelSpanAt`, the carve, the tube mesh and the collider all
speak (see the `edgeParData` invariant, ~1980) — is `polyCum`. Nothing converts the spans, so the
tube is drawn where `polyCum = s`, not where the profile put the bore. `_v2SliceRun` (~5959) clips
spans in `clArc` too.

Measured: seed 6, `road-tunnel.mjs` region, run `g:1067143,-293510,-1:1,0,0` (offCurveSpans
[0, 86]): at polyCum 830.6 the clArc is 806.1 — **24 m** of drift. The span starts at polyCum
829.8 where the deck is only 5.5 m under ground and the approach runs 24%; the bore the profile
actually solved starts ~24 m further in.

While portals sat at 25 m of cover this hid inside the tunnel. With portals at ~10 m (portal
post-pass) it shows: `road-tunnel` reads 22.5% "bore interior" grade (limit 21%) — approach-road
samples inside the mislocated span. That is the gate's only red on the merged branch.

## Acceptance
- Spans on every run are in that run's driven arc: convert clArc → polyCum where a run carries
  offCurveSpans (the promoted side road, the shove, and the slice path), one helper (inverse of
  `_clArcOfCum`).
- `road-tunnel.mjs` green (bore interior ≤ 21%) with the portal post-pass in place.
- `bore-junction-clearance`, `road-smoothness`, `junction-stitch` no worse.
- (review-2 road reviewer, 2026-10-15) The fix must also switch `_v2SliceRun` (road.js) to clip
  `tunnelSpans` on the driven arc (`p0`, polyCum) instead of `c0` (clArc), together with the conversion.

## Known red on main

2026-10-01, main `f163e6c`: `road-tunnel.mjs` fails on a clean HEAD checkout — `bore INTERIOR grade
≤ 21%: worst 22.5%`. This is the symptom above, not a new regression. Any session that sees this red
can skip re-running the gate on main to prove it.

---
id: BUG-09
type: bug
severity: minor
status: open
opened: 2026-06-11
phase_origin: 08-road-routing
source: user-observation
---

# BUG-09: Two separate roads cross each other (inter-run crossing, no junction)

## Symptom

Observed two distinct road centerlines crossing each other in the world. Not a single road looping over
itself (that is BUG-handled by `_removeSelfCrossings`) — this is **two different roads** intersecting,
with no junction/intersection treatment, so it reads as an artifact.

NOT being fixed yet — captured for later (user request).

## Root cause hypothesis (not yet confirmed)

Inter-run crossings are currently **unhandled / intentionally preserved**, and the per-row routing makes
them likely:

- The network is built as one east-west run **per macro-row** (`mz`), each routed independently by the
  A* (`_protoConnect`), which may detour up to `PROTO_MARGIN = 200 m` north/south to wrap around a peak.
  So a run from row A can wander into row B's z-band and cross row B's run.
- `_removeSelfCrossings` only removes crossings **within a single polyline** — it never compares two
  different runs.
- The overlap suppression (`PROTO_COVER_*`) is explicitly **same-direction only**: "Crossings (different
  heading where they meet) are preserved — only same-direction overlaps are cut" (road.js:85). So two
  roads meeting at an angle are kept by design.

Net: two roads can legitimately cross under the current model, and nothing resolves it into an
intersection or removes the redundant one.

## Open design question (decide before fixing)

Are road crossings DESIRABLE (real networks have intersections) or not?
- If undesired for the trunk-only network: detect inter-run crossings and resolve (drop one run past the
  crossing, or merge them), and/or tighten `PROTO_MARGIN` / lane-constrain rows so they stop wandering
  into each other.
- If desired: treat the crossing as a real **junction** — add an intersection node so the two roads share
  a point (needed anyway for a connected graph + Phase-9 mesh that meshes the junction cleanly).

## Likely fix directions (for later)

- Add an **inter-run crossing pass** over `this._network` (all runs, pairwise XZ segment intersection),
  then either excise/clip one run at the crossing or insert a shared junction node.
- Reduce wandering: lower `PROTO_MARGIN`, or add a soft cost for leaving the row's z-lane, so runs stay
  in their bands and rarely cross.

## Files

- `src/road.js` — per-row run build in `_streamNetwork`, `PROTO_MARGIN`, `PROTO_COVER_*` overlap logic
  (same-direction only), `_removeSelfCrossings` (single-polyline only), `this._network`.

## Notes

- Severity minor (visual) for now, but relevant to **Phase 9**: a ribbon mesh over two ungoverned
  crossing centerlines would produce overlapping/z-fighting road surfaces at the crossing — wants a
  junction decision first.
- Distinct from BUG-08 (re-stream pop) and from the QUAL-01 within-road self-crossings already handled.

---
id: FEAT-05
type: feature
status: folded
opened: 2026-06-11
phase_origin: 08-road-routing
resolves_phase: 9
folded_into: 09-road-surface
source: user-observation
note: "Reclassified from BUG-09 (2026-06-11) — road crossings are expected; we need to handle them as intersections. FOLDED INTO Phase 9 (2026-06-11 discuss-phase, SURF-07) — merged at-grade paved junctions built junction-aware from the start; see 09-CONTEXT.md D-12..D-15. Will auto-close on Phase 9 completion."
---

# FEAT-05: Road intersections / junctions where roads cross

## Goal

Roads cross each other (two different runs meeting at an angle) — this is EXPECTED, not a defect. What's
missing is treating those crossings as real **intersections/junctions**: a shared node where the roads
meet, so the network is a connected graph and Phase-9 meshing can build a clean intersection instead of
two overlapping/z-fighting ribbons.

## Current behavior (why crossings already occur)

- The network is one east-west run **per macro-row** (`mz`), each routed independently by the A*
  (`_protoConnect`), which may detour up to `PROTO_MARGIN = 200 m` N/S to wrap around a peak — so runs
  from different rows can cross.
- `_removeSelfCrossings` only removes crossings **within a single polyline**; it never compares two runs.
- Overlap suppression (`PROTO_COVER_*`) is **same-direction only** and explicitly preserves angled
  crossings (road.js:85). So crossings survive — there's just nothing that turns them into junctions.

## What "do intersections" means (design sketch)

- **Detect** inter-run crossings: pairwise XZ segment intersection across all runs in `this._network`.
- **Insert a shared junction node** at each crossing (split both runs at the intersection point so they
  share that exact vertex) → connected graph; both centerlines pass through one point.
- Keep determinism: crossing detection + node insertion must be a pure function of `(seed, coords, params)`
  and stable across re-streams (ties into BUG-08 window-invariance — junctions must not pop either).
- Phase-9 consideration: the mesh needs an intersection treatment (merged surface / priority road) at each
  junction so two ribbons don't z-fight; the shared node is the hook for that.

## Open questions

- Junction geometry: simple shared-point, or a proper blended intersection footprint?
- Priority/ramp: do crossing roads stay flat-crossing, or does one duck under (grade-separated)? Likely
  flat at-grade for now.
- Interaction with spurs (deferred D-01) — spurs will create T-junctions too; design the junction model
  once for both X- and T-crossings.

## Files

- `src/road.js` — `_streamNetwork` run build, `this._network`, a new inter-run crossing/junction pass;
  `PROTO_MARGIN` / `PROTO_COVER_*` context.
- (Phase 9) ribbon mesh — intersection surface treatment at junction nodes.

## Notes

- Pairs with BUG-08 (re-stream pop): junctions must be window-invariant too, so ideally both are solved
  by moving to canonical, center-independent run/junction derivation.

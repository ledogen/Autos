---
id: BUG-25
type: bug
status: open
opened: 2026-06-30
severity: minor
source: user-observation (in-sim graph-mode map vs 3D desync) + headless scan
relates_to: FEAT-13 (graph road network), project_feat13_windiness_stage (memory)
---

# BUG-25: Graph crossing-cull picks a different survivor edge at a few centers (crossing-DETECTION is still render-radius-bounded)

## Symptom

In graph mode the 2D map (`map2d`, streams ~1500 m) and the 3D world (streams ~320 m) occasionally show a
**single different edge** near a junction — the cull dropped one strand of a crossing in one view and the
*other* strand in the other. Down from the original gross desync ("map culls a bunch of roads the 3D
keeps"), which was the dominant bug and is FIXED (see below). What remains is a 1-edge tie-break flip at a
small number of centers.

Headless repro (seed 67): of the scanned centers, two far-corner ones — `(-2000,-1600)` and `(-2000,-400)`
— still differ by exactly one edge between a 320 m build and a 1500 m build at the same center. Seed 6 is
fully clean across all tested centers.

## What was already fixed (the dominant half)

`_cullCrossings` (src/road.js) ran its bounded-hop **detour BFS** over the render-bounded `this._network`,
so a small play-radius window (≈14 edges) found no detour → every crossing looked like a bridge → 0 culls,
while the wide map window found detours → culled ~6. The detour BFS now runs over a DEDICATED wide,
window-invariant Urquhart graph (`_buildUrquhart(..., persist=false, marginOverride = roadGraphMargin +
maxHops + 1)`), so the detour answer is render-radius-independent. `_cullCrossings(mx0,mx1,mz0,mz1)` takes
the band; junction-degree mutation still targets `this._proto.graph`. 23 gates green.

## Root cause of the residual

The cull's candidate set is `this._crossingList` (from `_detectJunctions`), which detects crossings from
the **routed centerlines of in-band edges** — still bounded by the render radius. At a small radius a
crossing whose strands extend differently (or whose far strand isn't routed) is detected differently than
at the wide map radius. The detour graph is now invariant, but the *pair list* fed to the cull isn't, so:
- a crossing present in both → same cull (good);
- a crossing detected in one view but not the other → its tie-break (`da < db ? ka : kb`, else `ka < kb`)
  drops a different survivor → the 1-edge difference.

## Fix direction

Make crossing DETECTION window-invariant too: detect cull-candidate crossing pairs from the wide Urquhart
**chord geometry** (straight node→node segments over the same wide graph the detour BFS uses) instead of
from `this._crossingList` (routed, in-band). Chords-cross ≈ routed-edges-cross for the cull's purpose; it
makes the candidate pair set a pure function of (seed, params, region), independent of render radius.
Risk: chord-vs-routed crossing differs at curvy edges → may over/under-cull; re-validate GRAPH-FLAT-MERGES,
GRAPH-SURFACE-SMOOTH, GRAPH-CROSSINGS-CULLED, GRAPH-REACHABILITY.

## Acceptance

- A radius-invariance check (build at 320 m and 1500 m at the same center; compare the post-cull edge set
  within the smaller window) shows **zero** edge differences across a grid of centers for seeds 6 and 67
  (and a couple more) — both "world-only" and "map-only-near" counts are 0.
- Register that check as a gate in `test/run-all.mjs` (the gross-desync regression guard FEAT-13 lacked).
- No regression on the existing 23 gates; in-sim map and 3D agree on the network in the overlap.

## Files

- `src/road.js` — `_cullCrossings` (swap candidate-pair source to wide-graph chord crossings),
  possibly a small chord-intersection helper; `_buildUrquhart` (already takes `marginOverride`).
- `test/` — new `graph-cull-radius-invariance.mjs` gate; register in `run-all.mjs`.

## Notes

Low severity — drivable, cosmetic, only a single edge at a few centers. Deferred pending in-sim re-test of
the dominant fix; promote if the residual is visually noticeable while driving.

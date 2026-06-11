---
quick_id: 260610-v0y
slug: qual-01-road-corner-smoothing-and-loop-removal
type: quick
created: 2026-06-11
files_modified:
  - src/road.js
  - data/ranger.js
  - src/debug.js
resolves: QUAL-01
---

# Quick Task: QUAL-01 — road corner smoothing + real loop/self-crossing removal

## Problem (from user UAT screenshots, top-down)

1. **Too-sharp corners** — near-hairpin spikes/cusps in the trunk (Image 1 downward V at a junction;
   Image 3 left-side cusp). No max-turn-angle / min-radius limit exists.
2. **Loops & self-crossings** — closed loops (Image 1 pentagon, Image 3 oval) and an actual segment
   self-crossing (Image 2 X with sliver triangle) survive. `_removeLoops` is PROXIMITY-only; the old
   segment-intersection detector `_segIntersectXZ` was removed (road.js:1065), so true crossings and
   tight loops below the `PROTO_LOOP_ARCLAG = 38 m` arc-lag (mistaken for switchbacks) slip through.

## Design

Two new deterministic, pure-function geometry passes on each row polyline in `_streamNetwork`, plus a
live-tunable max-turn-angle param wired like the existing D-09 sliders. Pipeline becomes (road.js ~857):
```js
let pts = spline.getPoints(Math.max(24, rowWps.length * 2))
pts = this._removeLoops(pts)                              // existing proximity folds
pts = this._removeSelfCrossings(pts)                      // NEW — true segment crossings (Image 2 + tight loops)
pts = this._limitTurnAngle(pts, this._proto.params.maxTurnDeg)  // NEW — cap sharp corners (Images 1,3)
if (pts.length < 2) continue
```

All three passes must remain pure functions of `(seed, center, params)` — NO randomness, NO history —
so determinism (D-03) and the D-06 seam gate hold.

## Task 1: data/ranger.js — add the tunable

Add a Phase-8 road param next to the D-09 weights:
```js
roadMaxTurnDeg: 70,   // QUAL-01 — max deflection angle (deg) at a centerline vertex; sharper corners
                      // get rounded by _limitTurnAngle. 0 deflection = straight; lower = smoother roads.
```
Do not remove or renumber existing road params.

## Task 2: src/road.js — param plumb + two passes

**(a) Plumb the param** into `_proto.params` (same spot as wDist/wAlt/... in `_refreshParams`/proto init):
```js
maxTurnDeg: p.roadMaxTurnDeg ?? 70,
```

**(b) `_removeSelfCrossings(pts)`** — re-introduce true segment-intersection loop excision (deterministic,
bounded guard loop like `_removeLoops`):
- For each non-adjacent segment pair (i,i+1),(j,j+1) with j ≥ i+2, test XZ segment-segment intersection
  (standard orientation/`segIntersect` test; ignore shared-endpoint touches).
- On the FIRST intersection found, compute intersection point `X` and splice: `pts = [...pts.slice(0,i+1),
  X, ...pts.slice(j+1)]`. Restart the scan. Guard ≤ 200 iterations.
- This catches Image 2's X-crossing and any tight loop the proximity pass missed, independent of arc-lag.

**(c) `_limitTurnAngle(pts, maxTurnDeg)`** — cap corner sharpness by chamfer/rounding (deterministic):
- Deflection at interior vertex i = angle between `(p[i]-p[i-1])` and `(p[i+1]-p[i])` (0° = straight).
- Iterate up to ~3 passes: for each INTERIOR vertex whose deflection > `maxTurnDeg`, replace `p[i]` with
  two chamfer points pulled back along each adjacent edge by `cut = min(0.4 * minAdjEdgeLen, edge*0.4)`
  (clamp so points stay ordered and edges never invert). Endpoints (`p[0]`, last) are NEVER moved — they
  are connection/junction anchors the seam slicing and run-splitting depend on (C0 continuity).
- After each pass, recompute; stop when all interior deflections ≤ maxTurnDeg (+ small epsilon) or passes
  exhausted. Effective min radius scales with `cut` — satisfies the user's "min radius / max angle" ask.
- Chamfering only cuts corners inward, so it cannot introduce new self-crossings.

**Note on switchbacks:** trunk-only/spurs-deferred on lone-pine has essentially no legitimate switchbacks,
so `roadMaxTurnDeg = 70` removes the artifact spikes safely. The value is a live slider (Task 3) so it can
be relaxed later when real switchbacks (spurs) arrive.

## Task 3: src/debug.js — Max Turn Angle slider

In the Roads folder, next to the D-09 cost sliders, add:
```js
roadFolder.add(params, 'roadMaxTurnDeg', 30, 120, 5).name('Max Turn Angle (°)').onChange(() => {
  if (typeof callbacks.onRoadParamChange === 'function') callbacks.onRoadParamChange()
})
```
No main.js change needed — `onRoadParamChange` already drives the debounced deterministic re-stream.

## Verification

- `node --check src/road.js && node --check src/debug.js && node --check data/ranger.js` → OK.
- **D-06 seam gate still PASS** (headless, real three r184 via the throwaway /tmp CDN-symlink approach prior
  executors used; remove before commit, keep git clean): `EXIT GATE D-06: PASS`, all C0 < 0.01 m, C1 < 5°,
  totalSeams ≥ 1 — proves the geometry passes did not break spline continuity/determinism.
- **Geometry assertions** (headless, lone-pine seed, build the network):
  - No two non-adjacent segments within any run intersect (self-crossings removed).
  - Max interior deflection across all run vertices ≤ roadMaxTurnDeg + ~2° epsilon (corners capped).
  - Determinism: two builds, same seed+params → byte-identical run point arrays.
- Manual (user, browser): reload, toggle Show Road Splines — spikes/loops from the screenshots are gone;
  Max Turn Angle slider re-streams and visibly smooths/sharpens corners.

## On completion

QUAL-01 resolved — move `.planning/todos/pending/qual-road-spline-shape.md` to completed (orchestrator
handles todo closure + STATE Quick Tasks table). Do NOT modify src/main.js.

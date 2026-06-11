---
quick_id: 260610-v0y
slug: qual-01-road-corner-smoothing-and-loop-removal
type: quick
created: 2026-06-11
revised: 2026-06-11
files_modified:
  - src/road.js
resolves: QUAL-01 (partial — corner smoothing deferred)
---

# Quick Task: QUAL-01 — draw the real spline + remove real loops/self-crossings

## Revised scope (2026-06-11)

User insight: the debug viz draws the **control polyline** (straight `THREE.Line` between coarse sample
points), not the Catmull-Rom curve — so some "sharp corners" are a rendering artifact. Revised plan:

1. **Spline viz** — draw the actual per-tile `seg.spline` (smooth), not `seg.points` (straight segments).
2. **Loop / self-crossing removal** — remove the REAL loop geometry (Image 2 X-crossing, Image 3 oval,
   Image 1 pentagon) that proximity-only `_removeLoops` misses.
3. **DEFERRED — corner smoothing** (max-turn-angle / min-radius limit + slider). NOT implemented here.
   Held until the user re-looks at the smooth spline viz on Pages and decides whether truly-sharp
   control-point corners still need limiting (and at what threshold, without flattening real
   switchbacks). Tracked in `.planning/todos/pending/qual-road-spline-shape.md`.

Both implemented changes are `src/road.js` only. No `data/ranger.js`, no `debug.js`, no `main.js`.

## Problem (from user UAT screenshots, top-down)

- **Viz angularity** — `buildDebugLines` (road.js:510-516) draws `seg.points` as straight lines; the
  network is sampled coarsely (`getPoints(Math.max(24, rowWps.length*2))`, ~2 pts/control point), so
  smooth roads render as sharp polylines.
- **Real loops/self-crossings** — `_removeLoops` is PROXIMITY-only; the old segment-intersection detector
  `_segIntersectXZ` was removed (road.js:1065). True crossings (Image 2) and tight loops below the
  `PROTO_LOOP_ARCLAG = 38 m` arc-lag (mistaken for switchbacks) survive.

## Task 1: src/road.js — draw the spline in buildDebugLines (viz only)

In `buildDebugLines` (~line 510), replace drawing `seg.points` with a fine sampling of `seg.spline`:
```js
for (const { spline, points } of segs) {
  if (!spline || !points || points.length < 2) continue
  // Sample the actual Catmull-Rom curve, ~2 m resolution, bounded — smooth centerline, not the
  // coarse control polyline. Falls back to points only if spline is somehow absent.
  const len = spline.getLength()
  const n = Math.max(8, Math.min(256, Math.ceil(len / 2)))
  const seg = spline.getPoints(n)
  if (surf) for (const p of seg) p.y = surf(p.x, p.z) + 1.0
  else      for (const p of seg) p.y += 1.0
  const line = _buildDebugLine2(seg, 0x00e5ff)
  line.visible = this._debugVisible
  this._scene.add(line)
  this._debugLines.push(line)
}
```
Notes: runs once per re-stream (not per frame), only when viz enabled — perf fine. Lift onto the surface
by xz exactly as today. Keep the existing clear-prior-lines + dispose logic unchanged. Do not change the
network/slice DATA — this is render only.

## Task 2: src/road.js — _removeSelfCrossings (real loop/self-crossing removal)

Add `_removeSelfCrossings(pts)` and wire it into `_streamNetwork` right after `_removeLoops`:
```js
let pts = spline.getPoints(Math.max(24, rowWps.length * 2))
pts = this._removeLoops(pts)            // existing proximity folds
pts = this._removeSelfCrossings(pts)    // NEW — true segment crossings + tight loops
if (pts.length < 2) continue
```
`_removeSelfCrossings(pts)` (deterministic, bounded guard ≤ 200, pure function of input):
- For each non-adjacent segment pair (i,i+1),(j,j+1) with j ≥ i+2, test XZ segment-segment intersection
  (standard orientation test; ignore shared-endpoint/coincident touches with a small epsilon).
- On the FIRST crossing, compute intersection point `X` and splice `pts = [...pts.slice(0,i+1), X,
  ...pts.slice(j+1)]`; restart the scan.
- Endpoints (`pts[0]`, last) are preserved by construction (i ≥ 0 keeps [0]; j+1 ≤ len keeps last).
- Independent of arc-lag, so it catches the tight self-crossing in Image 2 and the loops the proximity
  pass missed. Cannot create new crossings (it only removes geometry).

## Verification

- `node --check src/road.js` → OK.
- **D-06 seam gate still PASS** (headless, real three r184 via throwaway /tmp CDN-symlink approach prior
  executors used; remove before commit — git MUST be clean): EXIT GATE D-06 PASS, all C0 < 0.01 m,
  C1 < 5°, totalSeams ≥ 1, zero FAIL. (Loop removal only excises geometry → continuity/determinism hold.)
- **Geometry assertion** (headless, lone-pine): build the network; assert no two NON-adjacent segments
  within any run intersect (self-crossings gone). Determinism: two builds same seed+params → identical
  run point arrays.
- Manual (user, browser): reload, toggle Show Road Splines — roads render as smooth curves; the loops
  from Image 2/3 are gone.

## On completion

- QUAL-01 is PARTIALLY resolved: spline viz + loop removal shipped. **Corner smoothing (max-turn-angle)
  is DEFERRED** — leave `.planning/todos/pending/qual-road-spline-shape.md` OPEN, updated to note the viz
  + loop fixes shipped and that the smoothing decision awaits the user's re-look on Pages.
- Update STATE.md "Quick Tasks Completed" table. Do NOT modify src/main.js / debug.js / data/ranger.js.

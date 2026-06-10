---
phase: 08-road-routing
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/road.js
  - data/ranger.js
  - src/debug.js
  - src/main.js
  - test/test-road-seam.html
findings:
  critical: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Phase 8: Code Review Report (gap-closure 08-05/06/07)

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This pass reviews the valley-trunk streaming RoadSystem that replaced the retired per-tile
A* router (`src/road.js`), its data params (`data/ranger.js`), the productionized debug
sliders (`src/debug.js`), the render-loop + spawn wiring (`src/main.js`), and the retargeted
D-06 seam exit gate (`test/test-road-seam.html`).

The architecture is coherent and the determinism story (pure function of seed+coords+params,
caches as memoization only) mostly holds. However there are **two BLOCKER-class correctness
bugs**: a `queryNearest` search window that is narrower than its own default radius (silently
misses roads `resolveSpawn` should snap to), and a non-deterministic mid-stream cache eviction
that can change the routed network depending on play history. Several warnings cover edge
cases in the slicing/loop-removal math, dead/misleading code, and a debounce branch that can
never fire.

## Critical Issues

### CR-01: queryNearest search block (3×3 tiles = 192 m) is narrower than its default 200 m radius — roads within radius are silently missed

**File:** `src/road.js:353-385`
**Issue:**
`queryNearest(wx, wz, radiusM = 200)` restricts the spline search to the 3×3 tile block around
the query tile:
```js
for (let dx = -1; dx <= 1; dx++)
  for (let dz = -1; dz <= 1; dz++) { ... this._tiles.get(`${qTileX+dx},${qTileZ+dz}`) ... }
```
With `CHUNK_SIZE = 64`, the 3×3 block spans only the query tile ±1 tile. A query at the center
of its tile can therefore see at most ~96 m + 32 m = 128 m of road on each side before the block
ends, and a query near a tile edge sees as little as ~96 m on the far side. Any road point that
is genuinely within the **200 m** default radius but sits 2–3 tiles away (the common case for the
sparse valley trunk, whose runs are hundreds of metres apart) is never sampled. The function then
returns `null` (or a farther fallback hit) even though a closer in-radius road exists.

This directly breaks the D-07 spawn contract: `resolveSpawn` (`main.js:144`) calls
`queryNearest(baseX, baseZ, 200)` precisely to snap the truck onto the nearest road within 200 m,
then warms only the 3×3 spawn tiles (`main.js:139-143`). On `lone-pine` the trunk does not cross
the origin 3×3 grid at all (documented in the seam test, `test-road-seam.html:57-63`), so the
road branch almost always falls through to the terrain-only fallback — the road-aware spawn is
effectively dead on the shipped seed. The raw-network fallback (lines 399-408) is unbounded and
does scan all polylines, but it only runs when the spline pass found nothing within radius, and
it returns a polyline-vertex hit rather than the intended arc-length spline hit.

**Fix:** Size the search block from the radius instead of hard-coding ±1, and warm a matching
region in `resolveSpawn`:
```js
const blk = Math.ceil(radiusM / CHUNK_SIZE)   // 200/64 → 4 tiles each way
for (let dx = -blk; dx <= blk; dx++)
  for (let dz = -blk; dz <= blk; dz++) {
    const segs = this._tiles.get(`${qTileX+dx},${qTileZ+dz}`)
    if (segs) for (const s of segs) probeSpline(s.spline)
  }
```
And in `main.js:139-143` warm `Math.ceil(200/CHUNK_SIZE)` tiles around the spawn, not just ±1.
(Note: ensureTile re-streams a 640 m radius network regardless, so the data is present — only the
query block is too small.)

### CR-02: mid-stream cache eviction in _streamNetwork is non-deterministic — identical (seed, center, params) can yield different networks depending on play history

**File:** `src/road.js:859-869`
**Issue:**
After a re-stream the builder evicts caches by size:
```js
if (this._proto.anchors.size > 4000) this._proto.anchors.clear()
if (this._proto.segs.size    > 1500) this._proto.segs.clear()
if (this._network.size       > 3000) { this._network.clear(); this._networkCenter = null; ... }
```
The `_network.size > 3000` branch clears the network **that was just built for this center** and
nulls `_networkCenter`. Whether this fires depends on the accumulated `_network` size, which is a
function of how the view has streamed over the session — not of `(seed, center, params)`. Two
sessions that arrive at the same center via different paths can therefore end a stream with
different `this._network` state (full network vs. emptied network), violating the module's stated
contract: *"Pure function of (worldSeed, center, params) → identical inputs yield identical
polylines"* (lines 763-765) and the project determinism requirement (CLAUDE.md / D-03).

Concretely: `_network` is `.clear()`-ed at the top of every real re-stream (line 784) and then
rebuilt for the current window, so its size is bounded by the window, not by history — the
`> 3000` guard is both ineffective for its stated purpose *and* able to silently discard a
correctly-built network, leaving `this._network` empty until the next move past the threshold.
`ensureTile`/`queryNearest`/`buildDebugLines` then all see an empty network for that frame.

**Fix:** Do not evict the freshly-built network by an accumulated-size heuristic. If a hard cap is
desired, enforce it on the window bounds (radius/anchor count) deterministically, or drop the
`_network.size > 3000` block entirely (the network is already cleared+rebuilt each stream). The
`anchors`/`segs` eviction is also history-dependent but benign (both are pure functions of
coords, so a cache miss recomputes the identical value); still, prefer evicting them *before*
the build, not after, to keep behavior independent of when the threshold trips.

## Warnings

### WR-01: PROTO_PARAM_DEBOUNCE branch is dead — paramDirtyAt is never assigned, so the slider-settle gate never fires

**File:** `src/road.js:548, 772-774`
**Issue:** `_streamNetwork` opens with:
```js
if (this._proto.dirty && this._proto.paramDirtyAt && (Date.now() - this._proto.paramDirtyAt) < PROTO_PARAM_DEBOUNCE)
    return this._network
```
`paramDirtyAt` is initialized to `0` (line 548) and **never written anywhere** in the codebase
(`grep paramDirtyAt` → only the init and this read). Because `0` is falsy, the guard can never be
true, so the debounce branch is unreachable dead code. The header comment (lines 763-765) and the
`PROTO_PARAM_DEBOUNCE = 160` constant advertise a slider-settle gate that does not exist. In
practice debouncing is handled entirely in `main.js` (`debouncedRoadRebuild`, 150 ms), so behavior
is correct, but the dead branch + unused constant are misleading and a maintenance trap.

**Fix:** Either remove the dead branch and `PROTO_PARAM_DEBOUNCE` / `paramDirtyAt`, or actually set
`this._proto.paramDirtyAt = Date.now()` in `setRadius`/`_refreshParams` if in-module debounce is
intended. Pick one — do not ship an advertised gate that no code path can trigger.

### WR-02: ensureTile representative requires a FULL E-W span (spanScore===2); a tile crossed by a road that enters and exits the same edge, or spans N-S, reports spline:null

**File:** `src/road.js:317-331, 1010`
**Issue:** `ensureTile` only returns a representative spline when some slice has `spanScore === 2`
(touches BOTH the west and east tile boundary). A road that crosses a tile diagonally entering the
west edge and leaving the *north/south* edge — or a road oriented mostly N-S — yields no
spanScore-2 slice, so `ensureTile` returns `{ spline: null }` even though the tile clearly carries
road. The seam harness tolerates this (it skips null tiles), but any other consumer of `ensureTile`
(and the determinism probe in `test-road-seam.html:182-213`, which asserts a specific tile spans)
will see "no road here" for tiles that visibly have road. This is a correctness foot-gun for Phase 9
ribbon-meshing if it reads `ensureTile` rather than `this._tiles` directly.

**Fix:** Document loudly that `ensureTile().spline` is the *E-W-spanning seam representative only*,
not "the road on this tile," and have Phase-9 consumers iterate `this._tiles.get(key)` (all slices)
for actual geometry. Consider renaming to `seamSplineForTile` to prevent misuse.

### WR-03: _removeLoops splice can erode a run's endpoints, shortening or emptying the road

**File:** `src/road.js:654-672`
**Issue:** The loop-removal splice is `p = [...p.slice(0, i + 1), ...p.slice(j)]`. The outer guard
re-derives `arc` and re-scans up to 200 times. There is no guard preserving the run's first/last
control points across iterations: a loop detected with `i === 0` collapses the leading section, and
a pathological self-near path can iteratively erode the run down to 2 points (then the
`pts.length < 2` check at line 830 drops the whole row). On a valley trunk this is unlikely but not
impossible where two anchors snap close. The result is a silently shortened/empty road, not a crash.

**Fix:** Preserve the first and last control points explicitly (never let `i === 0` splice away the
start anchor, never remove the final anchor), or cap cumulative removal per row and bail to the
un-spliced polyline if removal would drop below `PROTO_RUN_MIN`.

### WR-04: queryNearest fallback tangent direction is build-order-dependent — can flip spawn heading 180°

**File:** `src/road.js:410-417`
**Issue:** The raw-network fallback computes the tangent as `q - rr` from neighboring polyline
vertices. The raw `this._network` runs are NOT consistently oriented W→E (only the *sliced* splines
are reversed in `_assignSlice`; the raw runs keep their build order). So `resolveSpawn` heading
`= atan2(tangent.x, tangent.z)` (main.js:151) can face the truck the opposite way down the road
versus the spline path, depending on which direction the run was built. Not a crash, but a visible
spawn-orientation inconsistency.

**Fix:** Orient `this._network` runs deterministically (e.g. W→E) at build time, or document that the
fallback heading is direction-agnostic and acceptable. If parity with the spline path matters, mirror
the W→E reversal here.

### WR-05: _collectCrossings / _sliceNetwork can emit near-degenerate (zero-length) slices that survive to a spline with getLength()≈0

**File:** `src/road.js:928-934, 958-970, 980-989`
**Issue:** x- and z-crossings are merged, sorted, and de-duped with `if (t <= prevT + 1e-9) continue`.
Two near-but-not-equal corner t-values differing by > 1e-9 (e.g. `0.5` and `0.5000000001`) produce a
zero-thickness sub-polyline (two points an epsilon apart). `_assignSlice` de-dups with a **1e-6**
position tolerance — a different threshold — so a slice with chord length between 1e-9 and 1e-6 can
slip through `clean.length >= 2` and become a `CatmullRomCurve3` whose `getLength()` ≈ 0. That feeds
`probeSpline` (`len || 64`) meaningless samples. No NaN, but wasted/incorrect query coverage.

**Fix:** Use one shared tolerance for the t-merge and the position de-dup, and in `_assignSlice`
reject splines whose total chord length is below ~0.01 m, not only `clean.length < 2`.

### WR-06: queryNearest allocates a closure + return Vector3s every call on a near-60fps hot path (violates the module's own anti-pattern note)

**File:** `src/road.js:364-375, 389-390`
**Issue:** `queryNearest` is documented as called at near-60fps cadence (lines 40-44). Each call
allocates a fresh `probeSpline` arrow closure (line 364), and the spline-hit path calls
`getPointAt(bestU)` / `getTangentAt(bestU)` with no out-param (lines 389-390), each of which
allocates a new Vector3 (and `getTangentAt` internally samples the curve twice more). The module
header explicitly forbids per-frame Vector3 allocation in queryNearest (lines 22, 44). The per-sample
scratch is correctly reused, but the closure and the two return vectors are not.

**Fix:** Hoist `probeSpline` to a method/module function over shared best-tracking fields, and pass
module-scope out-vectors to `getPointAt`/`getTangentAt`
(`bestSpline.getPointAt(bestU, _outPoint)`), reusing two persistent return vectors documented as
"valid until the next queryNearest call."

### WR-07: testSeamDeterminism hard-codes tile (3,-7) instead of reusing a discovered candidate — brittle to any legal re-tuning

**File:** `test/test-road-seam.html:184-185, 198-199`
**Issue:** `testSeamDeterminism` hard-codes `SEED_TILE_X = 3, SEED_TILE_Z = -7` as "the west side of
a discovered seam on lone-pine." This is only valid while the routing math, anchor snapping, and D-09
cost defaults are unchanged. Any tuning of `PROTO_*` constants or D-09 defaults can move the trunk so
this tile no longer spans E-W, turning the determinism assertion (`spline exists on both instances`,
line 198) into a failure that *looks* like a determinism break but is actually a stale fixture. The
discovery phase already finds seams dynamically — the determinism probe should reuse one.

**Fix:** In `testSeamDeterminism`, reuse the first entry from the Phase-1 `candidates` array (or re-run
a small discovery) rather than the literal `(3,-7)`, so the gate stays green across legal re-tuning.

## Info

### IN-01: _buildDebugLine (spline-based, line 1028) is dead code — only _buildDebugLine2 is called

**File:** `src/road.js:1028-1033`
**Issue:** `_buildDebugLine(spline, color)` is defined but never invoked; `buildDebugLines` uses
`_buildDebugLine2(pts, color)` (line 495). Dead function duplicating the geometry-build logic.
**Fix:** Delete `_buildDebugLine` (and its doc comment), or collapse both into one helper accepting a
point array.

### IN-02: Stale "PROTOTYPE / spike / no-op stub / experimental" comments contradict the now-production code

**File:** `src/road.js:71-73, 194-205, 266-271, 534-577, 1035-1043`
**Issue:** 08-05/06/07 promoted the valley-trunk path to the production core, but comments still call
it "PROTOTYPE", "spike", "benign no-op stubs", "Non-destructive experimental routing." The class
docstring (lines 194-205) still describes the *retired* per-tile router ("Per-tile deterministic road
routing system" / "the tile cache is memoization only"). These contradict the shipped design and the
module header (lines 1-33), and will mislead the next LLM session (a stated CLAUDE.md risk).
**Fix:** Sweep the file: reword PROTOTYPE/stub/experimental language and fix the class docstring to
describe the valley-trunk streaming model that actually ships.

### IN-03: spurProbability param is retained but consumed nowhere (deferred D-01 spur pass)

**File:** `data/ranger.js:223-225`
**Issue:** `spurProbability: 0.15` is documented as retained for a deferred spur pass and is read
nowhere in `road.js`. Harmless, but a tunable param with no effect invites a future session to wire a
slider to it and see nothing happen.
**Fix:** Keep it (intentional deferral) but mark inline that NO code consumes it yet, or group it in a
clearly-labeled "deferred / unused" block.

### IN-04: Interacting PROTO_* heuristics have an unenforced correctness invariant (ARCLAG > LOOP_D)

**File:** `src/road.js:74-94, 651-653`
**Issue:** The streaming heuristics (`PROTO_COVER_*`, `PROTO_LOOP_D/ARCLAG`, `PROTO_SNAP_CAP`,
`PROTO_RUN_MIN`) are hard-coded magic numbers governing road shape. `PROTO_LOOP_ARCLAG > PROTO_LOOP_D`
is a stated *correctness* precondition for keeping switchbacks (lines 91, 653) but is only prose — a
future tune of one without the other silently breaks switchback survival.
**Fix:** Add a single assertion/comment block documenting the inter-constant invariants (at minimum
`ARCLAG > LOOP_D`) so tuning cannot break it unnoticed.

### IN-05: queryNearest returns point.y as raw routing height, not render-surface height — contract is implicit

**File:** `src/road.js:389, 413`; `src/main.js:148-151`
**Issue:** `queryNearest` returns `point` with the road's raw coarse routed Y (grade-math height,
pre-amplitude, pre-surface-lift). `resolveSpawn` correctly overrides it with
`terrainSystem.analyticHeight(point.x, point.z)` (main.js:148), but any future Phase-9 consumer using
`nearest.point.y` directly as a surface height will place geometry at the wrong elevation.
**Fix:** Document on `queryNearest`'s return type that `point.y` is routing height, not render-surface
height — consumers needing a visual Y must resample the surface sampler.

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
id: QUAL-07
type: quality
status: open
opened: 2026-06-27
severity: major
source: user-architecture-review
relates_to: [QUAL-06, BUG-15, BUG-21, QUAL-03]
subsumes: QUAL-06 (bank staircasing — folded into the single carve fn here)
note: "Collapse the DUPLICATED road carve into ONE shared cross-section function so the visual mesh and
the physics collision surface are the same surface by construction. Decision (2026-06-27, with user):
unify the SURFACE DEFINITION, not the REPRESENTATION — analytic stays the physics source of truth (its
continuous normals are what make the ride feel smooth; a mesh/per-poly collider would facet the normal
every 1 m → buzzy). The mesh becomes a tessellation of that one surface; physics samples the same surface
continuously."
---

# QUAL-07: Unify the road carve into one cross-section function (visual mesh == collision surface)

## Implementation status — DONE (headless-green) 2026-06-27; in-browser confirm pending

Landed in 4 commits (a0ca70a / 90ca4f7 / df50c77 + this status):
- **One cross-section fn** `RoadSystem._carveCrossSection` (+ `_carveDirtY` for the crown/camber/
  clearance fold). Physics `_sampleCarveWorld` and the terrain mesh `_buildCarveTable` BOTH call it.
- **Mesh adopts the continuous resolve**: `_buildCarveTable` now projects each vertex point-to-SEGMENT
  onto the pre-collected sample polyline (continuous perpendicular signedLat + interpolated arcS) and
  calls the shared fn — replacing the Euclidean nearest-discrete-sample metric that made the collision
  apron sit higher/wider than the drawn bank. Added `sampleSegStart` to `collectChunkSplinePoints` so
  the projection never spans a seg boundary. D4 interior-arm pick + D3 cross-arm max-floor preserved.
  Discrete surface path + dead `crownProfile` import deleted (net LOC down).
- **Clearance decomposition** preserved: shared fn returns the DIRT surface (−clearance always); physics
  adds clearance back on-ribbon (rides the decal) + pothole. Off-ribbon both read the same dirt.
- **QUAL-06 staircase**: linear shoulder falloff → **smoothstep** (C1 at core edge AND toe) in the one fn.
- **Gate** `test/carve-surface-agreement.mjs` (registered): mesh continuous resolve == physics to ≤0.007 m
  on real fill+cut banks (vs the Euclidean-discrete control's 0.03–0.10 m) + a no-staircase bound. All 17
  gates green; road-smoothness / camber-continuity / ribbon-carve / road-fill-support /
  shoulder-lateral-continuity / invariance / restream-invariance unregressed.

**REMAINING:** (1) in-browser confirm — drive a steep fill embankment + a cut bank: truck contacts where
drawn (no float/sink), bank reads smooth. (2) Optional max-bank-slope clamp + debug sliders (reserved for
user tuning — NOT guessed blind). (3) Spot-check stream-time carve cost holds the frame budget (structure
preserves the PERF contract: point-to-segment on the pre-collected polyline, no new getPointAt/queryNearest,
no per-vertex alloc — but confirm on a switchback chunk). QUAL-06 is subsumed (smoothstep landed).

---

## Problem

There are **two road-carve resolvers** computing the same cut/fill surface with different math, so the
rendered terrain and the surface the truck drives on **disagree on steep banks**:

- **Visual mesh** — `terrain.js _buildCarveTable` resolves "where is the road" per grid vertex by
  **nearest discrete spline sample** (~1.5 m arc samples, Euclidean distance → `latDist = sqrt(bestD2)`,
  terrain.js:1605).
- **Collision** — `road.js _sampleCarveWorld` → `_resolveRoadSurface` → `_projectOntoRun` resolves by
  **continuous perpendicular projection** onto the centerline (`latDist = |signedLat|`, road.js:2117-2118).

The bank height both produce is `raw + blendW·(gradeY − raw)` and `blendW` ramps down with `latDist`
("CARVE SYNC" is asserted in comments on both) — but the two `latDist` values differ on curves (the
Euclidean distance to the nearest 1.5 m sample is always ≥ the true perpendicular distance, and is
quantized). On a **raised fill embankment** the mesh pulls toward raw terrain sooner than collision does,
so the **collision apron sits higher and wider than the drawn bank** → the truck **floats above the
visible carve** on an invisible surface. (Road + flat shoulder agree — both metrics give the flat ribbon —
which is why collision feels perfect there and only breaks on the steep carve.) The same narrow-ramp /
coarse-grid geometry also produces the **visual staircasing** tracked as QUAL-06.

## Why there are two (for the record)

Not two *terrains* — one terrain field (`height()` simplex noise) feeds both. What forked is the **carve
overlay**. Collision is **analytic** (a continuous function sampled on demand) rather than the mesh because
of three still-live constraints:

1. **Always-available ground.** Physics needs a surface *everywhere the truck can be*, including chunks not
   yet streamed; the mesh only exists for resident chunks (`sampleHeight` returns 0 off-ring,
   terrain.js:1205). `analyticHeight` returns a real height anywhere (terrain.js:14 contract).
2. **Headless determinism.** The quality gate (`test/replay.mjs` + rainy-day scripts) runs physics with
   **no Worker, no scene, no DOM** — `terrain-headless.mjs` reproduces `analyticHeight` as pure float math.
   GPU triangles can't run headless; riding them would break the entire replay/gate harness.
3. **Smooth normals (the felt quality).** `analyticNormal` central-differences the continuous field, so the
   contact normal rotates *gradually*. A per-poly collider's face normal is constant within a triangle and
   **snaps at every 1 m edge** → impulsive normal-force/grip changes → a faceted, buzzy ride. The user
   explicitly values the current smoothness; preserving it is a hard requirement, not a nice-to-have.

## Decision (2026-06-27)

Collapse to **one surface definition, not one mesh**:

> There is exactly ONE road-carve cross-section function. The renderer **tessellates** it into triangles
> (visual). Physics **samples** it at a point, continuously, the way it does today (feel preserved). Same
> surface, two consumers.

- **Analytic stays the physics source of truth** — keep `analyticHeight`/`analyticNormal` for collision
  (smooth normals, always-available, headless-deterministic). Do NOT switch physics to read GPU triangles.
- **Delete the nearest-discrete-sample road resolver** in `_buildCarveTable`; both the mesh build and the
  physics sampler call the SAME continuous cross-section function (continuous projection → `signedLat`,
  shared crown/camber/blend/toe). Mesh vertices then equal the collision surface by construction; the only
  residual difference is the mesh's piecewise-linear interpolation between 1 m vertices (sub-cell, invisible).
- **Fold the bank-smoothing (QUAL-06) into that one function** so the cure applies to mesh AND collision at
  once: widen the embankment ramp / clamp a max bank slope so the drop spans enough grid cells, and replace
  the linear `blendW` falloff with a **smoothstep** (C1 at the toe) — no staircase, no hard top-of-bank crease.

## Scope

1. **Extract a single carve cross-section function** — input `(wx, wz)` (+ the resolved run/arcS/signedLat),
   output `{ blendW, gradeY }` (or the surface Y directly). It owns: continuous road resolution
   (`_resolveRoadSurface`/projection), crown + camber fold-in, fill/cut toe + smoothstep blend, edge dropoff,
   `carveHalfWidth` core. This is the merge of the shared body of `_sampleCarveWorld` and `_buildCarveTable`.
2. **Repoint `_buildCarveTable`** at it per vertex; **delete** its `collectChunkSplinePoints` nearest-sample
   path + the parallel `sampleArcS/sampleRunKeys/sampleCamberSign` arm-disambiguation (the duplicated logic).
3. **Repoint `_sampleCarveWorld`** at the same function (it already uses the continuous resolver; this just
   makes the cross-section body shared, not copy-pasted).
4. **Fold in the bank-smoothing** (QUAL-06): max-slope clamp + smoothstep falloff, in the one function.
5. **Gate it** — a headless check that mesh vertex Y == the collision surface at vertices to < ε across a
   fill bank AND a cut bank, plus a max-per-cell-slope (staircase) assertion. Register in `run-all.mjs`.

## Constraints to preserve (do not regress)

- **Streaming perf (the main risk).** `_buildCarveTable` was deliberately built to avoid per-vertex
  `queryNearest`/projection (PERF-03 — the 4225-vertex main-thread loop is a stream-time cost). The continuous
  resolver is heavier than the squared-distance search. **Mitigation:** project onto the already-collected
  per-chunk sample polyline (point-to-segment between consecutive samples → true perpendicular `signedLat` at
  near the current cost) rather than calling `_resolveRoadSurface` fresh per vertex; and/or memoize per chunk.
  Measure stream-time cost before/after; must hold the PERF-05 frame budget.
- **Always-available** analytic ground for unloaded chunks (terrain.js:14) — unchanged (physics still samples
  the analytic field, which already includes the carve via this function).
- **Headless determinism** — `terrain-headless.mjs` defers carve to the real `_sampleCarveWorld`, so it
  inherits the unified function for free; keep it that way. (NB pre-existing terrain-headless drift ~0.756 m,
  per BUG-21 note — verify the unified fn doesn't widen it; ideally the shared body shrinks it.)
- **Window-invariance** — the carve must stay a pure fn of `(seed, coords, params)`, identical across stream
  centers / re-streams. The continuous resolver is already window-invariant; the mesh inherits it.
- **CARVE SYNC discipline** — if any of the shared cross-section helpers land in `src/road-carve.js` and are
  mirrored into `WORKER_SOURCE`, keep the copy byte-identical and update in the same commit (the Worker does
  NOT bake carve today — terrain.js:1383 — so the carve fn itself is main-thread; confirm nothing it depends
  on crosses into the Worker without a sync).

## Acceptance

- Driving a steep fill embankment (and a cut bank): the truck contacts the surface **where it is visually
  drawn** — no float on an invisible apron, no sink. Mesh vertex Y == the physics collision surface at every
  vertex to < ε across both bank types (new gate).
- The carve/shoulder→terrain transition reads as a **smooth bank, not a staircase**, at normal draw distance
  (QUAL-06 acceptance) — and the smoothing is identical in mesh and collision.
- **Physics feel is unchanged** on the road/shoulder — collision still rides the continuous analytic surface
  with continuous normals (no new faceting/buzz). The existing physics asserts (`test/assert-m4-*.mjs`) and
  the BUG-15 gates (`shoulder-lateral-continuity`, `road-fill-support`), `ribbon-carve`, `road-smoothness`,
  `camber-continuity`, `invariance`, `restream-invariance` all stay green.
- One carve cross-section function exists; the nearest-discrete-sample resolver in `_buildCarveTable` is
  **deleted** (net LOC down, not up).
- Stream-time carve cost holds the frame budget (no PERF-05 regression); `npm test` green.

## Files

- `src/terrain.js` — `_buildCarveTable` (repoint + delete nearest-sample path), `_sampleCarveWorld` lives in
  road.js but the shared cross-section body is the merge target; `sampleHeight` bilinear path stays for the
  debug/HUD readback (or is repointed too).
- `src/road.js` — `_sampleCarveWorld` / `_resolveRoadSurface` (host or call the shared cross-section fn).
- `src/road-carve.js` — only if the shared cross-section helpers are canonicalized here (then CARVE SYNC).
- `data/ranger.js` — bank-smoothing knobs (max bank slope, smoothstep ramp) if not reusing existing.
- `test/` — `carve-surface-agreement.mjs` (mesh-vertex Y == collision surface; max-cell-slope) + register.

## Relationships

- **QUAL-06** (staircasing) — **subsumed**; its fix is the bank-smoothing folded into the unified function.
- **BUG-15 / BUG-21** — both are symptoms of the carve drift / resolver seams; unifying removes the whole
  class. (BUG-15 mostly fixed, BUG-21 fixed cf4baee — this prevents recurrence.)
- **QUAL-03** (graph constrained-spline road re-architecture) — this is a concrete step toward it: one
  surface definition is exactly what QUAL-03 wants. Design the cross-section fn so a future swept/junction
  surface (FEAT-07/FEAT-10) can extend it rather than fork it again.
- **FEAT-07 / FEAT-10** — the junction/merge surfaces MUST call this same single function (don't add a third
  carve resolver for junctions).

## Open questions (planning)

- Exact signature of the shared fn (return `{blendW, gradeY}` vs absolute Y; pass-in resolved-run vs resolve
  inside) — must serve both the per-vertex mesh loop (perf-critical) and the per-contact physics call.
- Per-vertex continuous projection cost: point-to-segment on the collected sample polyline vs a real
  `_projectOntoRun` per vertex — benchmark on a switchback chunk (worst case, many arms).
- Bank-smoothing parameters: max bank slope (degrees) and smoothstep ramp width — tune so cut/fill banks read
  smooth without over-widening the footprint into adjacent arms at hairpins (the D3 no-overlap bound).
- Whether `sampleHeight`'s bilinear-of-components readback (HUD/debug) should also repoint to the unified fn
  or stay as the cheap approximate path it is.

# Phase 9 — Continuous Road Profile + Single Sampler (Design Lock)

**Date:** 2026-06-14
**Status:** Locked — ready for planning (`/gsd-plan-phase 9 --gaps`)
**Cadence:** COMBINED — plan the foundation + BUG-14/12/10 as ONE coherent refactor, execute fully, verify once in-sim.
**Closes:** BUG-14 (tile-seam grade step → launch), BUG-12 (ribbon tears at sharp corners), BUG-10 (cross-run camber reset). Builds directly on the shipped camber-arc work (`3df47cd`).

## Context

The D0–D5 lifecycle/camber refactor (09-18..24) is in-sim confirmed for radius, flicker, slider-carve, spawn, over-banking, and causeway fall-through (BUG-13 ✅). The remaining road defects are all the **same class of bug**: the road is processed in FRAGMENTS — per-tile *slices* (`_tiles`), per-row *runs* (`_network` keyed by `runKey`), per-chunk *carve* (`_buildCarveTable`) — and each consumer computes geometry **per-fragment**, so every fragment boundary is a discontinuity.

| Bug | Fragment boundary | Per-fragment value read (the defect) |
|-----|-------------------|--------------------------------------|
| BUG-14 | tile / chunk seam | grade **Y**: nearest-discrete-sample `ny` (carve) / `nr.point.y` slice-switch (physics) |
| BUG-12 | tile-slice seam | ribbon edge **frame** (tangent→perpendicular) per slice → ±halfWidth edges don't weld |
| BUG-10 | network-run boundary | **camber** profile forced to 0 at each run start |

The camber fix already proved the cure: stop reading per-fragment values; read from a **continuous per-run arc-indexed profile** by the run-global `arcS` (`arcS0/arcS1`, plumbed in `3df47cd`). At a seam both fragments resolve to the SAME `arcS`, so anything read by `arcS` is C0 by construction. This refactor applies that cure to grade Y and the ribbon frame, stitches camber across runs, and consolidates everything behind ONE road-query API so features stop re-fragmenting the road.

## Locked decisions

### P0 — One continuous per-run profile (the foundation)
Extend the existing per-run camber cache (`_buildCamberProfile` / `_camberProfileCache` / `_interpolateCamber`, road.js) into a unified `RoadRunProfile` per `runKey`, built once per canonical run, cached, **generation-invalidated via D1** (`this._generation`). It holds parallel arrays indexed by run arc-length and exposes an O(log N) binary-search sample:

`runProfile(arcS, runKey) → { gradeY, camberRad, tx, tz }`

- `gradeY[]` — the routed centerline Y of the run, arc-indexed (the value physics currently reads as `nr.point.y`, but now continuous along the whole run).
- `camberRad[]` — existing slew-limited camber (reuse as-is).
- `tx[]/tz[]` — unit tangent along the run (for the ribbon frame + projection consistency).

Built from the same `_network.get(runKey).points` + XZ arc that `_buildCamberProfile` already walks — no new geometry source, no Phase 8 routing change. Pure/deterministic (D-16).

### P1 — `RoadSample` / `sampleRoadAt(x,z)`: the single road-query surface
Make a ONE road-query API the whole codebase goes through, so new features can't re-fragment the road. Two forms:
- `byArc(runKey, arcS) → RoadSample` (consumers that already have arcS: ribbon, carve, physics).
- `sampleRoadAt(x, z) → RoadSample | null` (world query: projects to nearest run via the existing tile-block acceleration, then reads the run profile by arcS).

`RoadSample = { onRoad, runKey, arcS, lateralSigned, gradeY, tangent, camber, crown, blendW, surfaceType }`

`queryNearest` becomes the projector under `sampleRoadAt` (keeps the `_tiles` block acceleration + 09-17 projection refine for FINDING `(runKey, arcS)`); everything geometric is then read from the P0 profile by `arcS` so it's seam-continuous.

**Implement-now-minimal vs design-for-later:** implement only the fields BUG-14/12/10 need (`gradeY`, `tangent`, `camber`, `crown`, `blendW`, `arcS`, `runKey`). Carry `surfaceType`/`onRoad` in the struct and route the obvious callers through the API, but DON'T build friction/effects/props now — just leave the seam so they slot in without another refactor (see "Who else samples it").

### P2 — BUG-14: grade Y from the profile (physics + carve)
- **Physics** `road.js _sampleCarveWorld`: `designY = runProfile(nr.arcS, runKey).gradeY` instead of `nr.point.y`. `nr.arcS` is continuous across a slice-switch (both sides give the boundary arcS), so contact height is C0 → no teleport; no upward-step penetration → no launch.
- **Carve** `terrain.js _buildCarveTable`: `roadY = runProfile(sampleArcS[i], runKey).gradeY` instead of nearest-discrete-sample `ny = samples[bi+1]`. Both chunks read the same profile by `arcS` → shared chunk-boundary vertices match → the foundation step is gone, AND mesh grade == physics grade (height-agreement).
- This is literally the camber fix applied to grade Y.

### P3 — BUG-12: ribbon frame from the continuous tangent (weld slice edges)
`road-mesh.js sweepRibbon` builds the cross-section frame (tangent → perpendicular) per slice, so adjacent slices' ±halfWidth edges don't meet at a sharp tangent change. Read the section tangent from `runProfile(arcS).tx/tz` (continuous across slice seams) so adjacent slices' boundary cross-sections are identical → edges weld → no gap/overlap, **regardless of corner sharpness** (user steer: continuity > roundness). If frame-from-profile is insufficient at the very sharpest apex, additionally weld the shared boundary edge vertices. Keep grade/camber/crown reads on the same profile (consistent with P2).

### P4 — BUG-10: stitch camber across run boundaries
`_buildCamberProfile` forces `rawCamber[0]=camberRad[0]=0` at every run start, so banking jumps to 0 wherever `runKey` changes (N-S / winding climbs spanning multiple E-W rows). Seed each run's start camber from the adjacent run's end value (build run-adjacency, or carry a boundary camber across the shared node) instead of forcing 0; do not zero a run that begins mid-curve. Profile is generation-invalidated (D1) like the rest.

## Bug → decision map
P0 foundation underpins all · BUG-14 → P2 (on P0) · BUG-12 → P3 (on P0) · BUG-10 → P4 (on P0) · P1 is the API the three are wired through.

## Cross-system couplings (why this is one refactor)
- P0's profile is consumed by physics (P2), carve (P2), ribbon (P3), and camber (P4) — one source, one arc domain.
- `arcS` continuity (already shipped: `arcS0/arcS1`) is the precondition for P2/P3 being C0 — verify it holds at the projection level too.
- `runProfile.gradeY` must equal what the ribbon renders (height-agreement): ribbon `designGradeY`, physics, and carve all read `gradeY(arcS)` from P0 → agreement by construction.
- The D1 generation counter invalidates P0 (same as camber today).

## Who else samples it (design the API for these; do NOT build now)
Carry the hooks in `RoadSample`/`sampleRoadAt` so these slot in later without re-fragmenting:
- **Tire grip / surface friction** — `surfaceType` → asphalt grippier than dirt shoulder than off-road; the tire model reads one friction multiplier. (Answers "same tire logic as terrain": a *deliberate* sampled difference, not accidental.)
- **On-road effects (dust FEAT-03, audio)** — `onRoad`/`blendW` suppresses dust + swaps tire sound on asphalt.
- **Prop scatter exclusion (rocks & trees FEAT)** — scatter pass queries `sampleRoadAt` and skips the road corridor.
- **Junction elevation (SURF-07)** — junction node grade + leg blend read the SAME profile so crossings are height-consistent (else BUG-14 recurs at every junction).
- **Perf (deferred note)** — `sampleRoadAt` is the chokepoint to cache per-wheel results across suspension substeps, attacking the on-ground frame cost.
- **roadQuality / pothole (SURF-06)** — already arc-keyed; fold into the profile so stretch tiers are consistent.

## Verification
- **Headless harness** (`test/spline-continuity.mjs`): add gates that actually bite the seams (the current tile-seam gate only checks spline endpoints):
  - **seam-grade gate** — sample grade on BOTH sides of a tile boundary via the carve-table path AND the queryNearest/profile path; assert |ΔY| < ε across the seam.
  - **ribbon-edge-weld gate** — sweep a sharp-cornered polyline across a slice seam; assert the ±halfWidth edge polylines are C0 (no gap > ε, no inverted quads).
  - **camber-across-run gate** — two adjacent runs sharing a boundary mid-curve; assert |Δcamber| ≤ slew rate across the run boundary.
  - All existing gates stay green.
- **Browser (human):** seed 7 + the BUG-14 custom params (Coarse Amp 150) — drive the seam behind spawn: no teleport/launch, foundation has no vertical step. Drive switchbacks: banking eases across run boundaries. Sharp corners: ribbon sealed (no tear).

## Constraints
- No build system; ES6 modules; Three.js r184; 60 fps; hand-rolled physics in a fixed-step accumulator.
- **Worker CARVE SYNC:** `src/terrain-worker.js` byte-identical (RAW heights only) — carve + profile are main-thread; assert `git diff --stat`.
- Do NOT modify Phase 8 routing geometry; keep the decal architecture (ribbon authoritative on top, polygonOffset + skirts, terrain carved below); keep D0 fillet, D1 generation versioning, D4 arm-disambiguation.
- `runProfile`/`sampleRoadAt` must be O(log N) and allocation-free on the hot physics/carve paths (60 fps).
- Height-agreement: ribbon Y == physics Y == carve grade at the same on-road position.

## Plan-breakdown guidance for the planner
Combined refactor, dependency-ordered (e.g. 09-25..):
0. **P0 foundation first** — `RoadRunProfile` (gradeY + tangent added to the camber profile build), cached + generation-invalidated. Everything hangs off it.
1. **P1 API** — `RoadSample` struct + `byArc` + `sampleRoadAt` (queryNearest becomes the projector); route the obvious callers through it. Implement-minimal fields; leave `surfaceType`/`onRoad` hooks.
2. **P2 BUG-14** — physics `_sampleCarveWorld` + carve `_buildCarveTable` read `gradeY(arcS)` from P0. Headless seam-grade gate (carve + physics). Highest severity — kills the launch; lowest risk (mirrors camber).
3. **P3 BUG-12** — ribbon frame from `tangent(arcS)` + edge weld. Ribbon-edge-weld gate.
4. **P4 BUG-10** — cross-run camber stitch. Camber-across-run gate.
5. Harness gate fixtures (the three above) as the headless gates.
One combined in-sim verification pass at the end (seed 7 BUG-14 repro + switchbacks + sharp corners).

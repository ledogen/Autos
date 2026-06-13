# Phase 9 — Road Lifecycle + Camber Refactor (Design Lock)

**Date:** 2026-06-13
**Status:** Locked — ready for planning (`/gsd-plan-phase 9 --gaps`)
**Cadence:** COMBINED — plan Effort A + Effort B as ONE coherent refactor, execute fully, verify once in-sim.

## Context

Phase 9's road *surface* basics are done and in-sim confirmed: seam steps (09-13), terrain-load lag + road-below-ground (09-16), physics bounce (09-17). The remaining issues are NOT surface bugs — they live in the Phase 8 road **streaming / slicing / mesh lifecycle** and the **camber model**, which the surface work kept exposing. This refactor fixes all of them with one coherent set of decisions instead of per-bug patches.

**DO NOT modify Phase 8 routing geometry** — the canonical run (road.js ~1016-1058, `_limitCurvature`, `_protoConnect`/`_protoAnchor`) is correct and produces a continuous, curvature-limited spline (user-verified). The decal architecture from 09-10/11/12 (ribbon authoritative on top, polygonOffset + skirts, terrain carved below) stays.

## The 6 bugs

1. Ribbon goes stale when the network re-slices → diverges from spline, car falls through where terrain falls away.
2. Tile-edge crossing loads/unloads the ribbon (thrash).
3. `queryNearest` flips to the wrong switchback arm → invisible-ramp launch → car drops to terrain.
4. Camber is instantaneous → sharp/discontinuous banking at alternating corners + clamp-flip spike at curvature zero-crossings.
5. Carve doesn't inherit camber/crown → clip (inside edge) and gap (outside edge) on banked turns. NUMERIC: 6° × 5 m = 0.52 m edge drop > 0.5 m clearanceMargin.
6. Routing sliders (maxGrade) re-route the road but don't rebuild the terrain carve.

## Locked decisions

### D1 — Slice versioning is the single invalidation source
A generation counter bumps on every re-stream AND re-route (`invalidateCache`, main.js `debouncedRoadRebuild`). Ribbon tiles (road-mesh.js) and terrain-carve chunks (terrain.js) record the version they were built against; on sync, rebuild any whose stored version ≠ current.
→ Fixes #1 (ribbon stale) and #6 (slider doesn't rebuild carve) with one mechanism.
**Plan-time check:** confirm `_assignSlice` (road.js ~1707) produces window-invariant slice geometry (the canonical run is invariant; verify the slicing is too). If invariant, version-skip avoids needless rebuilds; if not, versioning still corrects staleness.

### D2 — One rate-limited camber profile, computed on the continuous run
Compute `camberProfile(arcS)` ONCE per canonical run (NOT per slice): sample signed curvature along arc → slew-rate limit (tunable max °/m, new ranger.js param + slider) → ±max-bank clamp (keep ±6°). Cache per run/band; invalidate via D1.
Rate-limiting along the *continuous* run (not per-slice) means banking eases across slice seams and through curvature sign-changes (kills the clamp-flip spike). Ribbon sweep (road-mesh.js sweepRibbon), terrain carve cross-section, AND physics (`_sampleCarveWorld`) all read camber from this one profile at their `arcS`.
→ Fixes #4. Replaces the per-vertex instantaneous `_splineCurvatureSigned` camber in road-mesh.js:206-208.

### D3 — Carve inherits the ribbon cross-section
Terrain carve target per vertex = `roadY(arcS) + crownProfile(uLat) + camberTilt(uLat, camberProfile(arcS)) − clearanceMargin` — the SAME cross-section as the ribbon, lowered by the clearance. The trough tilts WITH the ribbon → uniform clearance on banked turns.
→ Fixes #5; makes `clearanceMargin` sizing moot (uniform clearance regardless of camber).

#### D3 refinement — switchback multi-arm carve (no mutual undermining)
Side-by-side switchback arms carve close together; each arm's footprint (shoulder + `carveExtraWidth`) can undermine the other (lower arm's cut removes upper arm's foundation) and cause a step where the carve flips from nearest-arm-A to nearest-arm-B.
- **Bound each arm's carve footprint to ≤ ½ the minimum inter-arm separation** (set by the router min-turn-radius) so adjacent arms' footprints don't overlap → no undermining/step by construction. **NEW coupling: carve footprint ↔ min-turn-radius** — size them together.
- Where geometry forces arms closer, resolve per-vertex by nearest arm with a **max-floor guard**: never carve a vertex below the floor the *higher* arm needs there (so a lower arm's cut can't remove an upper arm's support) — accept a managed steep bank between arms.

### D4 — Stateless `queryNearest` arm-disambiguation
Switchback arms are ALWAYS laterally separated, never vertically stacked (user-confirmed 2026-06-13) → physics stays a pure 2D height field. Make `queryNearest` prefer the spline on whose footprint the query lies (smallest LATERAL distance / interior projection), not the globally-nearest discrete sample. Stateless → `analyticHeight` / `_sampleCarveWorld` stay pure (no signature change).
→ Fixes #3 (invisible-ramp launch).

### D5 — Ring hysteresis
Ribbon tiles use a keep-radius larger than the build-radius (don't dispose the instant a tile leaves the terrain active ring; keep ~1-tile margin).
→ Fixes #2 (edge thrash).

## Bug → decision map
#1 → D1 · #2 → D5 · #3 → D4 · #4 → D2 · #5 → D3(+D2) · #6 → D1

## Cross-system couplings (the reason this is one refactor, not piecemeal)
- D1's versioning is consumed by ribbon tiles, carve chunks, the camber profile (D2), and the design-grade caches.
- D2's camber profile is consumed by ribbon (D2), carve cross-section (D3), and physics.
- D3's footprint width is coupled to the router min-turn-radius (refinement).
- D4's nearest-arm logic should be consistent between physics `queryNearest` and the carve's `collectChunkSplinePoints` nearest-point selection.

## Verification
- **Headless harness** (`test/spline-continuity.mjs`): extend with (a) a self-approaching / switchback fixture (D4 — no arm-flip), (b) a two-close-arms-at-different-heights fixture (D3 refinement — no undermining / no step), (c) re-use the existing camber-rate fixture (D2). All gate fixtures exit 0.
- **Browser (human, no headless WebGL):** one combined pass — drive switchbacks (smooth banking, no clip/gap, no launch), cross tile edges (no thrash/divergence, car stays on ribbon), change maxGrade slider (carve + ribbon rebuild to match new route).

## Constraints
- No build system; ES6 modules; Three.js r184; 60fps; hand-rolled physics in a fixed-step accumulator.
- Worker CARVE SYNC: `src/terrain-worker.js` byte-identical (RAW heights only) — assert via `git diff --stat`.
- Do NOT modify Phase 8 routing geometry. Keep the decal architecture (09-10/11/12).
- New params (camber slew-rate, any retuned clearanceMargin/footprint) → `data/ranger.js` + `src/debug.js` sliders.

## Plan-breakdown guidance for the planner
Combined refactor, dependency-ordered within one plan set (e.g. 09-18..):
1. D1 versioning core (the invalidation mechanism) — everything else hangs off it.
2. D5 ring hysteresis + D4 stateless arm-disambiguation (queryNearest + carve nearest consistent).
3. D2 shared camber profile (continuous-run, slew-limited, cached, version-invalidated).
4. D3 carve inherits cross-section + multi-arm footprint/undermine handling.
5. Harness fixtures (D4 switchback, D3 two-arms) — the headless gates.
6. Dirt-color shoulders (09-15, independent, cosmetic).
One combined in-sim verification pass at the end.

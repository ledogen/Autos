# Phase 8: Road Routing - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a **deterministic, infinite, tile-able road graph** routed over the coarse terrain: routes switchback where the grade is too steep, hug low ground, and are exposed as **queryable centerline splines** with a debug-line visualization. The route network must be stable and continuous across 64 m tile seams **before** any ribbon mesh is built.

**In scope:** the tile-graph router (per-tile A* over pure `coarseHeight`), seeded tile-edge waypoints for seam continuity, slope-weighted cost with a hard max-grade limit + switchbacking, queryable spline output, debug-line viz, and wiring the Phase 7 `resolveSpawn` seam to spawn the truck on the nearest road.

**Out of scope (own phases):** road surface ribbon mesh / crown / camber / terrain carve (Phase 9 — SURF); POI anchors (Phase 10); pothole/crack micro-noise (Phase 10 stretch).

**Risk note:** This is the HIGHEST-RISK phase in v1.1 — the infinite/deterministic/switchbacking tile-graph router is the only novel algorithm. A research spike at the START of planning is REQUIRED (resolve how per-tile A* handles paths that double back at different altitudes).
</domain>

<decisions>
## Implementation Decisions

### Network Shape
- **D-01:** **Sparse network** — a trunk road with *occasional spurs/forks*, not a dense web. The road is a "find" in mostly-off-road terrain. Branch points are **seeded** (`seedFor("roads", ...)`) so spurs are deterministic and reproducible.

### Grade & Switchbacks
- **D-02:** **Max road grade target ~12%** (steep-but-drivable, Eastern-Sierra character). Where a direct line would exceed it, the router **switchbacks** (ROAD-03) with **tighter hairpins** rather than long sweeping turns. The truck must always be able to climb any shipped road.
- **D-03:** Expose **max-grade as a live debug slider** (consistent with Phase 7's live-tuning ethos, D-08/D-12). Roads are pure functions of `(worldSeed, coords)` and re-route automatically when the grade target changes — no data corruption, just re-validation.

### Routing Character
- **D-04:** **Valley/pass-seeking** cost function — the slope-weighted cost (ROAD-02) is shaped to **reward low altitude + saddle/pass crossings**, so roads hug valley floors and climb only at passes (natural, hand-built feel) rather than wandering mid-slope.

### Debug Visualization
- **D-05:** **Shipped debug viz = road centerline splines only**, toggled via a **debug-panel (lil-gui) checkbox** — consistent with the existing panel conventions. Clean by default (no waypoint/grid clutter).
- **D-06:** **Seam continuity (no kinks at 64 m tile boundaries) is the exit gate.** The planner MAY add a *temporary* tile-edge-waypoint / tile-grid overlay during development to validate seams, but it is NOT a shipped feature — a seam kink is also visible directly on the centerline spline.

### Spawn Integration (fills Phase 7 seam D-16)
- **D-07:** Swap the Phase 7 `resolveSpawn` body from the terrain-only low-slope resolver to **"probe nearest road node + tangent heading"** so the truck spawns **ON the road, facing down it**. Same call site (`src/main.js` `resolveSpawn(worldSeed, params) → {position, heading}`); signature unchanged.

### Claude's Discretion
Delegated to research/planner within the locked constraints above: per-tile A* internals and how it handles altitude-doubling-back paths; branch-point logic for spurs; spline sampling/resolution; exact valley-seeking cost weights; the max-grade slider's range; spline query API shape (kept clean for Phase 9 consumption).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Routing / requirements / determinism
- `.planning/ROADMAP.md` — Phase 8 goal, 4 success criteria, the seam-continuity exit gate, and the **required research spike** note (per-tile A* + altitude doubling-back). Also the Phase 7 lock note: coarse params committed + `seedFor()` frozen.
- `.planning/REQUIREMENTS.md` — ROAD-01 (deterministic tile-able graph), ROAD-02 (slope-weighted cost + hard max grade), ROAD-03 (switchback), ROAD-04 (queryable splines + debug lines).
- `.planning/v1.1-BLUEPRINT-DRAFT.md` §② Road Routing — milestone intent, `seedFor("roads", …)` domain tagging, switchback rationale, 60fps constraint on `queryContacts`.
- `.planning/phases/07-free-cam-seeded-layered-terrain/07-CONTEXT.md` — D-16 (spawn-on-road seam, design road-aware now / fill in P8), D-07 (drivable mountain-pass vibe), and the HARD RULE that every generator is a pure function of `(worldSeed, world coords)`.

### Terrain calibration reference
- `references/km elev ref.png` — Eastern Sierra elevation transect (~13.3 km, ~640 m relief). Primary reference for max-grade / switchback tuning (Phase 7 D-06/D-07).

### Code seams
- `src/terrain.js` — `coarseHeight(wx,wz)` / `analyticHeight`. Router MUST use **pure `coarseHeight`**, never `sampleHeight` (chunk-load-order dependent).
- `src/seed.js` — `seedFor(worldSeed, domainTag, ...coords)` (frozen). Roads use `seedFor("roads", tileX, tileZ)`.
- `src/main.js` — `resolveSpawn` seam (D-07/D-16), `queryContacts`, render loop, debug-panel wiring.
- `src/debug.js` — lil-gui panel (folder pattern) — host the road-viz toggle + max-grade slider.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`seedFor(worldSeed, domainTag, ...coords)`** (`src/seed.js`) — domain-tagged deterministic sub-seeds; roads consume the `"roads"` tag with tile coords. Independent stream from terrain noise (no correlation).
- **`coarseHeight` / `analyticHeight`** (`src/terrain.js`) — pure coarse-terrain height for routing; never returns chunk-load-dependent values.
- **lil-gui debug panel** (`src/debug.js`) — established folder pattern; host the road-viz checkbox + max-grade slider here.
- **`resolveSpawn(worldSeed, params) → {position, heading}`** (`src/main.js`) — already designed road-aware (D-16); swap only the resolver body.

### Established Patterns
- **Pure-function-of-`(worldSeed, coords)` generators** — HARD RULE (no chunk-load / frame-timing / visit-history dependence). The router obeys it.
- **Tile-based generation (64 m tiles)** — roads are a tileable graph keyed by tile coords; **shared tile-edge waypoints derived by both adjacent tiles from the same `seedFor()` key** enforce C1 continuity at seams.
- **Debounced regenerate on param change** (Phase 7 D-09) — max-grade / road param changes re-route deterministically.

### Integration Points
- `resolveSpawn` (main.js) → road-graph nearest-node + tangent probe (D-07/D-16).
- Debug panel (debug.js) → road-viz toggle + max-grade slider.
- **Phase 9 (Road Surface)** consumes the queryable centerline splines — keep the spline query API clean and stable.
</code_context>

<specifics>
## Specific Ideas

- Feel target: **"drivable mountain-pass country"** (Phase 7 D-07) — roads like the reference transect, "somewhere a road would actually be."
- Eastern Sierra escarpment as the switchback reference — steep faces force visible hairpins, valleys stay flat.
</specifics>

<deferred>
## Deferred Ideas

- Road surface ribbon mesh, crown/camber, terrain carve — Phase 9 (SURF).
- POI anchors at road-adjacent low-slope sites — Phase 10.
- Pothole / crack micro-noise on the road surface — Phase 10 stretch.
- Truck body styles + functional brake/reverse lights — backlog 999.1.

### Reviewed Todos (not folded)
- `feat-dust-trails.md` — weak match (terrain-dependent keyword only). A particle/visual effect unrelated to road routing; deferred to its own future work.
</deferred>

---

*Phase: 8-Road Routing*
*Context gathered: 2026-06-09*

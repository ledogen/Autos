# Requirements: RangerSim — Milestone v1.1 Mountains & Roads

**Defined:** 2026-06-07
**Core Value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.

> v1.0 requirements are validated and archived at `.planning/milestones/v1.0-REQUIREMENTS.md`. This document scopes **v1.1 only**.

## v1.1 Requirements

Requirements for milestone v1.1. Each maps to roadmap phases P7–P10.

### World Seed (SEED)

- [ ] **SEED-01**: A single `worldSeed` drives all procedural generation; the same seed produces a byte-identical world (terrain, roads, POIs)
- [ ] **SEED-02**: `seedFor(domainTag, ...coords)` derives independent sub-seed streams so terrain and road/POI placement do not visually correlate
- [ ] **SEED-03**: The world seed is settable via a `?seed=...` URL parameter (string or int) for shareable maps
- [ ] **SEED-04**: The world seed is shown and editable in the debug panel; changing it regenerates the world deterministically
- [ ] **SEED-05**: Every generator is a pure function of `(worldSeed, world coords)` — no dependence on chunk load order, frame timing, or visit history

### Layered Terrain (TERR)

- [ ] **TERR-01**: The coarse terrain layer produces Eastern-Sierra character — steep escarpments and flat valley floors (ridged-multifractal style landform)
- [ ] **TERR-02**: A fine high-frequency layer adds suspension texture on top of the coarse landform
- [ ] **TERR-03**: A low-frequency regional-roughness field modulates the fine layer's amplitude across the map
- [ ] **TERR-04**: A single unified `height(x,z)` and its surface normal is the source of truth used by both the Web Worker mesh build and the physics sampler (no divergent recomputation)
- [ ] **TERR-05**: Terrain generation holds 60fps with the layered height function active (Worker-safe, cheap per-sample)
- [ ] **TERR-06**: Coarse terrain shape parameters are tunable in the debug panel for calibration against a Sierra topo reference

### Free-Fly Camera (CAM)

- [ ] **CAM-01**: A dev free-fly camera mode (toggle key) flies decoupled from the truck with WASD + look + vertical control
- [ ] **CAM-02**: While in free-fly mode the car idles in place — physics continues with zero input, not frozen
- [ ] **CAM-03**: Exiting free-fly returns to chase view without a camera snap or jump

### Road Routing (ROAD)

- [ ] **ROAD-01**: Roads are routed deterministically over the coarse height as a tile-able graph — same seed + coords produce the same roads, seamless across streaming chunks
- [ ] **ROAD-02**: Routing uses slope-weighted cost with a hard maximum-grade limit
- [ ] **ROAD-03**: Where a direct line would exceed max grade, the route switchbacks up the slope instead of exceeding the grade
- [ ] **ROAD-04**: Road centerlines are queryable as splines and visualized as debug lines

### Road Surface (SURF)

- [ ] **SURF-01**: A ~10 m fixed-width ribbon mesh is swept along the road splines
- [ ] **SURF-02**: The road surface has a basic asphalt color/texture generated without asset files
- [ ] **SURF-03**: The cross-section has a centerline crown plus curvature-driven camber that banks into turns
- [x] **SURF-04**: The physics surface carries the road's height AND normal, so the car feels the crown and bank
- [x] **SURF-05**: The road embeds in the terrain via cut-and-fill — cut faces into high/steep ground, raised graded-dirt embankment on rolling ground — blended over a shoulder width and applied identically in mesh build and physics sampler *(revised 2026-06-11: cut-and-fill, was "cut-biased over fill")*
- [ ] **SURF-06**: *(stretch)* Pothole/crack micro-noise perturbs only the road surface, severity driven by the per-stretch road-quality tier
- [ ] **SURF-07**: Where two roads cross, they mesh as a single merged at-grade paved junction (one shared footprint, no z-fighting), built deterministically and stable while driving *(scoped into Phase 9 on 2026-06-11; folds FEAT-05 + BUG-08)*

### POI Hooks (POI)

- [ ] **POI-01**: Seeded POI anchors emit `{position, road tangent, type slot}` at low-slope, road-adjacent sites; the same seed places the same POIs in the same spots
- [ ] **POI-02**: POI anchors are a data contract only — no spawning, no models (consumed by a future gameplay phase)

## Future Requirements

Deferred beyond v1.1. Tracked but not in this roadmap.

### Terrain (TERR-future)

- **TERR-F01**: Domain-warp upgrade — add domain warping on the coarse layer for organic, non-grid ridgelines (additive on top of ridged base)
- **TERR-F02**: Difficulty-driven regional roughness — drive the regional-roughness field from a difficulty system rather than randomly

### Gameplay (GAME-future)

- **GAME-F01**: POI spawning — consume the POI anchor contract to place gas stations / parking lots / trailer homes and mission pickups

## Out of Scope

Explicitly excluded for v1.1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Finite DEM import | World stays infinite & procedural — match the *statistics* of real Sierra terrain, never import a bounded heightmap |
| Iterative hydraulic/thermal erosion | Requires global heightmap state — incompatible with streaming per-sample `height(x,z)`; derivative slope warping is the stateless stand-in if needed |
| New runtime dependencies | Hand-rolled / Three.js + existing simplex only — no npm, no build system |
| Physics in a Web Worker | Worker is terrain-gen only; physics stays on the main thread (existing constraint) |
| POI models / spawning | v1.1 ships the data contract only; spawning is a future gameplay milestone |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEED-01 | Phase 7 | Pending |
| SEED-02 | Phase 7 | Pending |
| SEED-03 | Phase 7 | Pending |
| SEED-04 | Phase 7 | Pending |
| SEED-05 | Phase 7 | Pending |
| TERR-01 | Phase 7 | Pending |
| TERR-02 | Phase 7 | Pending |
| TERR-03 | Phase 7 | Pending |
| TERR-04 | Phase 7 | Pending |
| TERR-05 | Phase 7 | Pending |
| TERR-06 | Phase 7 | Pending |
| CAM-01 | Phase 7 | Pending |
| CAM-02 | Phase 7 | Pending |
| CAM-03 | Phase 7 | Pending |
| ROAD-01 | Phase 8 | Pending |
| ROAD-02 | Phase 8 | Pending |
| ROAD-03 | Phase 8 | Pending |
| ROAD-04 | Phase 8 | Pending |
| SURF-01 | Phase 9 | Pending |
| SURF-02 | Phase 9 | Pending |
| SURF-03 | Phase 9 | Pending |
| SURF-04 | Phase 9 | Complete |
| SURF-05 | Phase 9 | Complete |
| SURF-06 | Phase 9 | Pending |
| SURF-07 | Phase 9 | Pending |
| POI-01 | Phase 10 | Pending |
| POI-02 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 27 total (25 core + 1 stretch SURF-06 + 1 POI-02 data-contract companion); SURF-07 added 2026-06-11 (intersections scoped into Phase 9)
- Mapped to phases: 27/27
- Unmapped: 0

---
*Requirements defined: 2026-06-07*
*Last updated: 2026-06-07 — traceability table populated by roadmapper (P7–P10)*

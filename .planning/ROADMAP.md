# Roadmap: RangerSim

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-06-03) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- 📋 **v1.1 Mountains & Roads** — Phases 7–10 (in progress)
- 📋 **v2.0** — TBD (planned via `/gsd-new-milestone`)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-06-03</summary>

- [x] Phase 1: Core Driving (4 plans) — completed 2026-05-11
- [x] Phase 2: Scenario System + Debug Menu (3 plans) — completed 2026-05-29
- [x] Phase 3: Tire Model (6 plans) — completed 2026-05-30
- [x] Phase 4: Suspension (3 plans) — completed 2026-05-31
- [x] Phase 4.1: Body-Frame Suspension [INSERTED] (3 plans) — completed 2026-06-02
- [~] Phase 5: Rollover Validation — SKIPPED (rollovers work organically; M5-03 through M5-07 deferred)
- [x] Phase 6: Procedural Terrain (3 plans) — completed 2026-06-03

See [v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md) for full phase details.

</details>

### v1.1 Mountains & Roads

- [x] **Phase 7: Free-Cam + Seeded Layered Terrain** (5 plans) — World-seed foundation, three-layer Sierra terrain, free-fly camera (completed 2026-06-09)
- [ ] **Phase 8: Road Routing** (3 plans) — Deterministic tile-graph A* roads with switchbacks, queryable debug splines
- [ ] **Phase 9: Road Surface** — Ribbon mesh, asphalt, crown + camber, cut-biased terrain carve, physics height and normal
- [ ] **Phase 10: POI Hooks + Polish** — Seeded POI anchor data contract; pothole/crack stretch

## Phase Details

### Phase 7: Free-Cam + Seeded Layered Terrain
**Goal**: The world has a reproducible seed, a Sierra-grade three-layer terrain, and a dev free-fly camera so every subsequent terrain and road change can be visually evaluated.
**Depends on**: Phase 6 (existing simplex terrain + Web Worker chunk pipeline)
**Requirements**: SEED-01, SEED-02, SEED-03, SEED-04, SEED-05, TERR-01, TERR-02, TERR-03, TERR-04, TERR-05, TERR-06, CAM-01, CAM-02, CAM-03
**Success Criteria** (what must be TRUE):
  1. Setting `?seed=lone-pine` in the URL and refreshing produces the same terrain visible to the eye; changing the seed string produces visibly different terrain
  2. The debug panel shows the world seed as an editable field; typing a new seed and pressing Enter regenerates the terrain without a full page reload
  3. Pressing the free-cam toggle key decouples the camera from the truck; WASD + look flies freely while the truck idles visibly on the terrain below
  4. Returning from free-fly to chase view has no camera snap or jump — the view transitions smoothly
  5. The terrain has Eastern-Sierra character observable from free-cam: steep escarpment faces and flat valley floors, with fine surface texture that bounces the truck's suspension over open ground; frame rate holds at 60fps
**Plans**: 5 plans
  - [x] 07-01-PLAN.md — Free-fly dev camera (Shift+C, pointer-lock fly, WASD routing, camera-centered streaming)
  - [x] 07-02-PLAN.md — Seed module (djb2/seedFor/mulberry32) + P7-1 determinism gate
  - [x] 07-03-PLAN.md — Seeded three-layer terrain (coarse/fine/regional) + analytic physics height + P7-2 gate
  - [x] 07-04-PLAN.md — Terrain sliders + seed field + regeneration + canonical spawn + coarse-param lock + 60fps gate
  - [x] 07-05-PLAN.md — Esc pause menu + grid world + ramp relocation
**Notes**: Free-cam must ship FIRST within P7 — all terrain tuning work must be done from free-cam. `seedFor()` determinism test and height-agreement test (sampleHeight == bilinear of chunk.heights * amp at 5 world positions) are required exit gates before P7 closes. Coarse terrain amplitude, wavelength, and octave parameters must be LOCKED at P7 completion — changing them after Phase 8 invalidates all generated roads.

---

### Phase 8: Road Routing
**Goal**: Deterministic roads route themselves over the coarse terrain, switchback where the grade is too steep, and are visible as debug splines — the route network is queryable and stable before any ribbon mesh is built.
**Depends on**: Phase 7 (coarseHeight(wx,wz) pure function locked; seedFor() frozen)
**Requirements**: ROAD-01, ROAD-02, ROAD-03, ROAD-04
**Success Criteria** (what must be TRUE):
  1. Loading the same seed twice on two separate page loads shows identical road splines in the debug visualization — routes are fully deterministic
  2. Road splines cross chunk tile seams without visible kinks or gaps — the route is continuous across the 64 m tile boundary
  3. Where the terrain grade would exceed the maximum, the road switchbacks visibly up the slope rather than climbing straight
  4. Road centerlines are visible as colored debug lines in the scene and can be toggled off
**Plans**: 3 plans
  - [x] 08-01-PLAN.md — road.js core: per-tile A* over raw coarseHeight, quadratic slope cost + hard grade block + valley-seeking, seeded edge waypoints, Catmull-Rom splines with ghost control points + Wave 0 test harness (ROAD-01/02/03)
  - [x] 08-02-PLAN.md — Query API (queryNearest/ensureTile) + centerline debug viz + lil-gui Roads folder (viz checkbox + max-grade slider) + main.js wiring + debounced re-route (ROAD-04, D-03, D-05)
  - [ ] 08-03-PLAN.md — resolveSpawn swap to nearest-road-node + tangent heading (D-07) + seam-continuity exit-gate test (D-06)
**Notes**: HIGHEST RISK phase in v1.1 — the infinite, deterministic, switchbacking tile-graph router is the only novel algorithm in the milestone. A research spike at the START of P8 planning (before implementation) is required: resolve how per-tile A* handles paths that double back at different altitudes. Router MUST use pure coarseHeight(wx,wz) — never terrainSystem.sampleHeight (chunk-load-order dependent). Shared tile-edge waypoints derived by both adjacent tiles from the same seedFor() key enforce C1 continuity at seams. Debug splines showing no kinks at seam boundaries is an exit gate before P9.
**UI hint**: yes

---

### Phase 9: Road Surface
**Goal**: The road exists as a physical ribbon in the world — visible asphalt, shaped with crown and banking, carved into the terrain so the truck feels the elevation change and surface normals through its suspension.
**Depends on**: Phase 8 (stable, locked road splines)
**Requirements**: SURF-01, SURF-02, SURF-03, SURF-04, SURF-05, SURF-06
**Success Criteria** (what must be TRUE):
  1. Driving onto the road, the truck rides on the raised or carved surface — it does not float above or sink below the visible mesh
  2. The road camber banks in the correct direction (surface tilts so the inside of the curve is lower) with realistic, curvature-proportional magnitude, plus a centerline crown — verified on the road surface geometry/normal itself, NOT via the truck's body-roll response
  3. Where the road crosses rolling terrain, the surface carves into high ground (cut-biased) and the carve transitions to the surrounding terrain continuously — no vertical discontinuity / step that launches the body-contact probes. Real cut faces and drop-offs on steep or switchback terrain are EXPECTED and allowed; only degenerate vertical seams are disallowed
  4. The road surface looks like asphalt — dark grey with lane markings, no external asset files required
  5. (Stretch) Driving slowly on the road surface, pothole and crack micro-perturbations are felt as slight vertical jolts through the suspension
**Plans**: TBD
**Notes**: The carve blend design (carveBlend function + chunk.carveWeights Float32Array pattern) must be specified BEFORE any mesh or physics code is written. Height-agreement test extended to on-road positions is the exit gate: assert carveBlend result is identical in _flushPendingQueue vertex write and sampleHeight return. Carve-continuity test: sampleHeight stepped across the carve boundary must show no vertical step discontinuity (the surface stays continuous) — note this allows steep but continuous cut faces on switchback terrain; it only forbids degenerate vertical seams. SURF-06 (pothole/crack micro-noise) is a stretch goal within this phase — implement if P9 lands under budget.
**UI hint**: yes

---

### Phase 10: POI Hooks + Polish
**Goal**: Future gameplay content has a stable, seeded placement contract — POI anchor points are computed, deterministic, and queryable, but nothing is spawned in the world.
**Depends on**: Phase 9 (stable road surface and road.js splines)
**Requirements**: POI-01, POI-02
**Success Criteria** (what must be TRUE):
  1. Calling the POI anchor API with a tile coordinate returns one or more `{position, tangent, type}` objects at road-adjacent, low-slope sites — same seed always returns the same anchors at the same positions
  2. POI anchors produce no visible objects in the scene — the data contract is internal only, confirmed by inspecting the scene graph
**Plans**: TBD
**Notes**: Lightweight phase — POI placement is a pure seedFor() computation over road.js spline data. No models, no spawning. Foldable into P9 if P9 completes under budget (per blueprint 3-phase cut option).

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Driving | v1.0 | 4/4 | ✅ Complete | 2026-05-11 |
| 2. Scenario System + Debug Menu | v1.0 | 3/3 | ✅ Complete | 2026-05-29 |
| 3. Tire Model | v1.0 | 6/6 | ✅ Complete | 2026-05-30 |
| 4. Suspension | v1.0 | 3/3 | ✅ Complete | 2026-05-31 |
| 4.1. Body-Frame Suspension | v1.0 | 3/3 | ✅ Complete | 2026-06-02 |
| 5. Rollover Validation | v1.0 | 0/0 | ⬜ Skipped | — |
| 6. Procedural Terrain | v1.0 | 3/3 | ✅ Complete | 2026-06-03 |
| 7. Free-Cam + Seeded Layered Terrain | v1.1 | 5/5 | Complete   | 2026-06-09 |
| 8. Road Routing | v1.1 | 2/3 | In Progress|  |
| 9. Road Surface | v1.1 | 0/? | Not started | — |
| 10. POI Hooks + Polish | v1.1 | 0/? | Not started | — |

## Backlog

### Phase 999.1: Truck body + swappable body styles + functional lights (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Vehicle-visuals feature (decoupled from physics). Three threads:
- **Truck body model** — replace the current `BoxGeometry` body (built in `main.js`) with a truck-shaped mesh.
- **Swappable body-style architecture** — a vehicle-visual model registry so additional bodies (e.g. Nissan 240sx) can be selected later, keeping the physics rig (collision box, CG, wheelbase) independent of the visual shell.
- **Functional lights (emissive meshes that toggle with state):**
  - Tail/brake lights illuminate when braking is applied (`vehicleState.brake` / `smoothBrake`).
  - Reverse lights illuminate when the vehicle rolls backwards (velocity projected onto the body forward axis < 0).

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

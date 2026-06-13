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
- [x] **Phase 8: Road Routing** (7 plans) — REPLAN (valley-following trunk, per-tile A* retired): deterministic valley-wrapping streaming trunk (trunk-only; spurs deferred), per-tile-sliced queryable splines, seam exit gate. Gap closure 08-05/06/07 built the valley-trunk core into src/road.js — re-verified 7/7 must-haves + human UAT 3/3 (D-06 gate PASS, viz, on-road spawn) 2026-06-10. Non-blocking follow-ups: PERF-01 (load time), QUAL-01 (spline shape). (completed 2026-06-10)
- [~] **Phase 9: Road Surface** — Ribbon mesh, worn asphalt, crown + camber, cut-and-fill terrain carve, 5-zone materials, merged at-grade intersections, physics height and normal. Plans 09-01..09 executed; verification found the carve-and-meet height-agreement gate violated + a perf regression. RE-ARCHITECTED via gap-closure 09-10..12: decal ribbon authoritative on top (polygonOffset + edge skirts), terrain carved cheaply BELOW the ribbon (perf restored), physics still rides the ribbon, new 3-clause exit gate (terrain-below + ribbon-driven + longitudinal continuity) replaces the retired equality gate.
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
**Plans**: 4 plans (REPLAN after spike 001 — first per-tile/hard-block build failed verification; valley-following architecture validated in-sim and signed off)
  - [x] 08-01-PLAN.md — Valley-trunk streaming network core: retire per-tile A*/hard-block path; productionize soft-cost turn-penalty A* (D-09: wAlt 0.85 / wGrade 400 / wOver 8000 / maxGrade 0.15 / wTurn 120, finite over-cap — never "no path") into _streamNetwork over seeded 256 m macro-anchors; lock D-09 cost defaults in ranger.js (ROAD-01/02/03, D-02/04/08/09)
  - [x] 08-02-PLAN.md — Per-tile slicing of the continuous trunk into Catmull-Rom splines (seam C0/C1 free — one curve sliced) + queryNearest(x,z)→{point,tangent} + ensureTile over the streamed network (ROAD-01/04, D-06/07)
  - [x] 08-03-PLAN.md — Shipped centerline-only viz with lil-gui checkbox (D-05) + maxGrade/cost-weight live sliders → debounced deterministic re-route (D-03) + resolveSpawn queryNearest wiring (D-07); retire all proto scaffolding (ROAD-01/04) — spurs (D-01) deferred
  - [x] 08-04-PLAN.md — Re-run the Phase-8 exit gate: refresh test-road-seam.html (C0/C1 on sliced splines) + test-road.html (determinism, queryNearest, switchback, soft-model) to the valley-trunk API; TEST_PARAMS to D-09 (ROAD-01/02/03/04, D-06)
**Notes**: HIGHEST-RISK phase — the novel-router risk is now RETIRED (spike 001 validated the valley-following architecture on the real locked terrain; user signed off in-sim). The first build (per-tile west→east A* with a HARD grade block) FAILED verification: no valid path on nearly every 64 m tile on the steep coarse terrain, climbing mountains via fallback. The replacement is a valley-following streaming-anchor trunk routed by a SOFT-cost A* that wraps around high ground, sliced into per-tile splines (seam C0/C1 free — no shared-seam-waypoint machinery). Router MUST use pure coarseHeight(wx,wz) — never terrainSystem.sampleHeight. The over-cap penalty is FINITE/soft — NEVER an Infinity hard block (D-02 REVISED); some genuine passes stay steep (accepted). Browser harnesses (test-road-seam.html, test-road.html) are the exit gate — execution is the user's UAT; the seam gate must be green before P9. Deferred to post-functional polish (user): route-quality tuning (10 m grid coarseness, a few loop-backs).
**UI hint**: yes

---

### Phase 9: Road Surface
**Goal**: The road exists as a physical ribbon in the world — visible asphalt, shaped with crown and banking, carved into the terrain so the truck feels the elevation change and surface normals through its suspension.
**Depends on**: Phase 8 (stable, locked road splines)
**Requirements**: SURF-01, SURF-02, SURF-03, SURF-04, SURF-05, SURF-06, SURF-07
**Success Criteria** (what must be TRUE):
  1. Driving onto the road, the truck rides on the raised or carved surface — it does not float above or sink below the visible mesh
  2. The road camber banks in the correct direction (surface tilts so the inside of the curve is lower) with realistic, curvature-proportional magnitude, plus a centerline crown — verified on the road surface geometry/normal itself, NOT via the truck's body-roll response
  3. Where the road crosses rolling terrain, the surface carves into high ground (cut-biased) and the carve transitions to the surrounding terrain continuously — no vertical discontinuity / step that launches the body-contact probes. Real cut faces and drop-offs on steep or switchback terrain are EXPECTED and allowed; only degenerate vertical seams are disallowed
  4. The road surface looks like asphalt — dark grey with lane markings, no external asset files required
  5. (Stretch) Driving slowly on the road surface, pothole and crack micro-perturbations are felt as slight vertical jolts through the suspension
  6. Where two roads cross, they mesh as a single merged at-grade paved junction (one shared footprint, not z-fighting overlapping ribbons), reproducible and stable while driving (no pop/rebuild as you fly past)
**Plans**: 12 plans executed + 4 gap-closure plans (09-13..16 — continuous-centerline follow + rate-limited camber + visible dirt shoulders + carve-perf pre-sampled lookup; 09-16 fixes the stream-lag + road-below-ground regression confirmed at verification)
  - [x] 09-01-PLAN.md — BUG-08 window-invariant splines (D-16) + module-scope _segXZ + scaffold test-road-carve.html/test-road-mesh.html harnesses (SURF-07 prereq)
  - [x] 09-02-PLAN.md — road-carve.js pure carve + smoothed design grade + cut-and-fill carve identical in Worker mesh build & analyticHeight/sampleHeight; EXIT GATES height-agreement + carve-continuity (SURF-04/05, D-05..D-08)
  - [x] 09-03-PLAN.md — road-mesh.js ribbon sweep + crown + curvature camber as real geometry/normal (folded into carve gradeY); streaming tile lifecycle (SURF-01/03, D-04)
  - [x] 09-04-PLAN.md — Merged at-grade junctions: _detectJunctions + fillet-arc footprint + triangulation + leg trim + shared-node elevation, same carve embed (SURF-07, D-12..D-15)
  - [x] 09-05-PLAN.md — Procedural worn-asphalt vertex colors + per-500m roadQuality tiers/markings + 5-zone feathered materials + full Roads-folder debug sliders (SURF-02, D-01/02/03/09/10/11)
  - [x] 09-06-PLAN.md — STRETCH: pothole/crack micro-noise on road surface only, severity from roadQuality, identical mesh+physics (SURF-06, D-03 — skip if P9 over budget)
  - [x] 09-07-PLAN.md — CR-04 carve-free design-grade sampler (rawHeightWorld) + design-grade cache invalidation + sampleDesignGradeAt arc-keyed lookup
  - [x] 09-08-PLAN.md — CR-01/02/03 unified gradeY source + shared signedCurvature + pothole arcS (the carve-and-meet unification — later superseded by re-arch for the terrain mesh)
  - [x] 09-09-PLAN.md — equality exit-gate integration test (RETIRED by 09-12 — terrainMeshY==ribbonY is wrong under the decal-on-top model)
  - [x] 09-10-PLAN.md — RE-ARCH 1/3: ribbon authoritative on top — polygonOffset (negative factor/units) + renderOrder + downward edge skirts (roadSkirtDepth) so the ribbon wins depth and has no see-through edge gap (SURF-03/04/05)
  - [x] 09-11-PLAN.md — RE-ARCH 2/3: terrain carved cheaply BELOW the ribbon — gut the per-vertex sampleDesignGradeAt/2nd-queryNearest/closure (perf restored), carve toward targetY−clearanceMargin under a footprint widened by carveExtraWidth; physics still rides the ribbon (SURF-04/05)
  - [x] 09-12-PLAN.md — RE-ARCH 3/3: new 3-clause exit gate replaces the retired 09-09 equality — terrain-below (≤ribbon−clearanceMargin) + ribbon-driven (physics==ribbon on-road) + longitudinal continuity (within-tile + across boundary) (SURF-04/05/06/07)
  - [x] 09-13-PLAN.md — SPLINE-FIX 1/3: follow the CONTINUOUS routed centerline Y (kill per-tile _smoothDesignGrade in ribbon + physics + terrain carve) — removes seam steps AND the ~1s load lag; truthful cyan viz draws the spline geometry not analyticHeight (SURF-03/04/05, D-06/D-16)
  - [ ] 09-14-PLAN.md — SPLINE-FIX 2/3: rate-limit camber along arc (pure camberRateLimit slew limiter) applied in ribbon AND physics (visual==physics); no clamp-flip spike at zero-crossings; tunable roadCamberRate + slider, +/-6deg clamp kept; harness tight-turn gate (SURF-03/04, D-04)
  - [ ] 09-15-PLAN.md — SPLINE-FIX 3/3: dirt-brown ribbon edge skirts via roadDirtColor param + picker so cuts/fill shoulders read as dirt not asphalt; final full-surface human verify (SURF-05, D-05/D-08/D-09)
  - [x] 09-16-PLAN.md — CARVE-PERF gap closure: replace per-vertex queryNearest + 4-corner bilinearGrade in _buildCarveTable with a pre-sampled spline-point lookup (single pre-loop getPointAt site, closure-free per-vertex nearest-point search) — fixes the ~1s stream lag AND road-below-ground on steep/curving tiles; remove roadDebugLineOnSurface viz toggle (SURF-04/05)
**Notes**: ORIGINAL approach (carve terrain to MEET the ribbon at the road edge) was found geometrically unsound at verification — two independently-tessellated opaque surfaces interpenetrate between their own vertices (z-fighting/camo), and 09-08 introduced a per-vertex binary-search + 2nd queryNearest perf regression (~1 s terrain-load hang). RE-ARCHITECTED 2026-06-12 (user-locked decision): the ribbon is the ONE authoritative surface — it wins depth via polygonOffset + has edge skirts; terrain is carved CHEAPLY to stay clearanceMargin BELOW it under a wider footprint; physics samples the ribbon on-road (crown/camber/pothole fold-in retained in road.js _sampleCarveWorld). The 09-09 equality exit gate is RETIRED — the new gate is terrain-below + ribbon-driven + longitudinally-continuous. Worker CARVE SYNC unchanged: terrain-worker.js stores RAW heights, no decal symbols leak in. SURF-06 (pothole) is a stretch; SURF-07 (junctions) still needs human z-fight/stability confirmation.
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
| 8. Road Routing | v1.1 | 7/7 | Complete   | 2026-06-10 |
| 9. Road Surface | v1.1 | 14/16 | In Progress|  |
| 10. POI Hooks + Polish | v1.1 | 0/? | Not started | — |

## Backlog

_Empty — the former Phase 999.1 (Truck body + swappable body styles + functional brake/reverse lights)
was retired on 2026-06-11 and merged into the active todo
[`FEAT-04`](todos/pending/feat-truck-body-and-brake-reverse-lights.md) (`.planning/todos/pending/`).
Promote via `/gsd:review-backlog` or plan it directly when ready._

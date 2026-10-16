# Repository Layout & File Conventions

**What this is:** the live map of the repo and the conventions for where new files go. CLAUDE.md
holds the *rules* (import seams, prohibitions, workflow); this holds the *map*. When you add, move,
or delete a file, update the relevant line here in the same commit — it's one line, keep it honest.

*Last full audit: 2026-10-04 (81 files in `src/`, 8 in `src/props/`).*

## Top level

| Path | What lives there |
|---|---|
| `index.html` | The single entry point (Vite root). |
| `src/` | The product — shippable game engine, ES6 modules. No diagnostics, no dead code (see CLAUDE.md "src/ is the product"). |
| `data/` | Content-as-data: vehicle specs (`ranger.js`, `vehicles.js`), model registry (`vehicle-models.js`, `prop-models.js`), dialogue, flora, biomes, map icons, mission-board word lists + content tables (`offer-names.js`, `offers.js`, FEAT-67), freight loads (`freight.js`, FEAT-96 — model key + mass per strapped load; read by the debug "Load Cargo" menu), authored scenarios (`scenarios.js`, FEAT-62 — seed + world-coordinate poses, re-checked against the road by `test/scenario-route.mjs`). (The bundled route caches were deleted 2026-08-19 with the bake subsystem.) |
| `assets/models/` | Hand-authored `.glb` assets + `CREDITS.md`. Convention: `.planning/research/ASSETS.md`; style: `ART-STYLE.md`. |
| `vendor/box3d/` | Vendored Box3D WASM bindings. Imported ONLY by `src/physics-engine.js` (FEAT-48 seam). |
| `test/` | Headless gates (`gates.mjs` + `run-all.mjs`), shared libs (`lib/*.mjs`), replay harness (`replay.mjs`), rainy-day scripts, refactor fingerprints (`fingerprint-world.mjs` / `fingerprint-physics.mjs`: `--out` + `--compare` hash tables, review-2 S-80). Pure node — never touches Vite. |
| `tools/dashboard/` | `npm run dash` ticket-tracker viewer (:8010). Read-only over `.planning/todos/`, except the Sounds tab's upload, which writes takes into `wip/audio/<slug>/`. |
| `wip/audio/<slug>/`, `assets/audio/<slug>/` | Sound takes, one folder per FEAT-120 sound (slug = its `###` heading). `wip/` is git-invisible (recordings in progress, dashboard uploads); promote to `assets/audio/` when the game plays it. |
| `.planning/` | Planning record. **Live:** `todos/` (tracker), `story-mode/DESIGN.md` + `MILESTONES.md` (roadmap), `research/` (standing references). **Historical:** `phases/`, `milestones/`, handoffs, `STATE.md`. |
| `.github/workflows/` | `deploy.yml` — Pages build. Runtime-fetched assets are copied to `dist/` by the inline plugin in `vite.config.js`. |

## File conventions

- **Naming:** kebab-case, one subsystem per file (`tire-audio.js`, `road-carve.js`).
- **Header comment:** every non-trivial module opens with a `src/<name>.js — <purpose>` block
  carrying its ticket tag (FEAT-NN / QUAL-NN / …). That header is the file's one-line contract —
  keep it true when the file's job changes.
- **Directories are earned:** a subsystem gets a subdirectory only once it splits into several
  files. `src/props/` is the only precedent (8 files). Don't pre-create directories.
- **No worker mirrors:** every Worker is an ES module that imports the code the main thread runs
  (the no-mirror fence — FEAT-68 for the road workers, extended to the terrain worker 2026-10).
  There is no `WORKER_SOURCE` string and no `SYNC RULE`; shared code lives in a leaf module
  (`terrain-height.js`, `seed.js`, `corridor-router.js`) that both sides import.
- **New gates** register in `test/gates.mjs` with `subsystem`/`cost`/`desc`/`extraDeps`.

## src/ map

Grouped by subsystem. The **physics stack import direction** (the load-bearing contract) is in
CLAUDE.md; everything else here is inventory.

**Physics stack** — `physics-engine.js` (THE Box3D adapter seam) · `physics.js` (vehicle step,
chassis factory, debris translation) · `tire.js` (Pacejka, pure math) · `suspension.js`
(spring-damper struts, out-of-round tire radius) · `alignment.js` (static toe/camber signs,
pure math — read by `physics.js` and `vehicle-model.js`) · `terrain-physics.js` (streamed heightfield colliders, MESH == PHYSICS) ·
`drivetrain.js` (engine/converter/gearbox, FEAT-23) · `ignition.js` (key/starter state machine,
FEAT-33 — pure, no DOM) · `vehicle.js` (Ackermann, input) · `vehicle-state.js` (THE canonical
vehicleState shape — one factory, so the world truck and the FEAT-41 menu-stage truck cannot drift) ·
`debris.js` (FEAT-36 dynamic props) · `physics-debug.js` (collider wireframes) · `damage.js` (SM-3
component condition model — reads vehicleState signals, writes `params._*Scale` multipliers; the
physics stack never imports it) · `fragile.js` (FEAT-97 fragile cargo condition — pure; main.js feeds
it the strap's felt g each step).

**World generation** — `seed.js` (djb2 / mulberry32 / FNV-1a hash32 / seedFor, pure) · `terrain.js` (chunk ring, carve table, analytic
height) · `terrain-height.js` (THE height function + seeded noise — imported by main thread, worker,
road.js and the headless gates) · `terrain-worker.js` (chunk heightmap Worker, module entry) · `terrain-detail.js` (shared surface-detail GLSL) · `biome.js` (forest/meadow/
rock classification) · `map-cover.js` (map-resolution forest cover) · `water.js` (ponds/streams
generation) · `water-render.js` · `stone-texture.js` (procedural riverbed texture) ·
`terrain-texture.js` (FEAT-84: procedural grass/dirt/rock surface maps, DataTexture, headless-safe).
`stream-priority.js` (PERF-33 near-then-ahead queue order + stream-centre motion/jump detection,
zero-dep) · `stream-budget.js` (PERF-33 the one shared per-frame streaming budget, zero-dep).

**Road network** — `road.js` (RoadSystem: streaming, resolve, surface queries) · `road-graph.js`
(blue-noise anchors + Urquhart topology) · `road-carve.js` (pure carve helpers: crown, potholes,
curvature, ear-clip, the BUG-82 Delaunay pad fill) · `corridor-router.js` (v2 corridor router, FEAT-68) · `road-mesh.js` (ribbon build) ·
`road-worker.js` (route Worker POOL, QUAL-08/FEAT-68 — since QUAL-27 its only consumer is the
network Worker's nested pool) · `road-route-worker.js` (route Worker module entry) ·
`road-network-worker.js` (PERF-30 network Worker module entry — the whole build off-thread) ·
`road-network-client.js` (PERF-30 main-thread client: dispatch + atomic adopt) ·
`road-quality.js` (per-stretch quality) · `centerline.js` (curvature-bounded centerline model) ·
`world-validate.js` (BUG-56 "is this world playable": one routine behind story entry's seed check and
the `play-area` gate; since BUG-85 also the region's connected PIECES — `regionPieces` — whose main
piece's nodes filter the planners and POI siting).
(The bundled route cache / `route-store.js` was deleted 2026-08-19 — owner call; the in-session
cache in main.js is what remains.)

**Props** — `props/`: `prop-system.js` (orchestrator) · `prop-palette.js` (variant bake + the
FEAT-85 cover material: wind sway + distance fade) · `prop-geometry.js` (blobs/tubes/cones + the
FEAT-85 grass/brush clumps) · `prop-scatter.js` (+ the FEAT-85 cover pass) · `prop-collider.js` ·
`prop-impostor.js` · `prop-shadow-bake.js` · `prop-debug.js`.

**Rendering & atmosphere** — `sky.js` (time-of-day, ACES) · `moon.js` · `shadow-fade.js` ·
`camera.js` (chase/cockpit/fly) · `vehicle-model.js` (procedural truck + cast lights) ·
`model-service.js` (FEAT-59 .glb import service) · `campfire.js` (FEAT-66 lit campfire: ASSET-24 + flames/embers/point light) · `smoke.js` · `dust.js` · `dirt-spray.js` ·
`map2d.js` (M-key dev map).

**Audio** — `engine-audio.js` · `tire-audio.js` (tonal stick-slip) · `wind-audio.js` · `heartbeat-audio.js` (FEAT-87 rank-bar lub-dub) · `glass-audio.js` (FEAT-87 rank tile shatter; FEAT-97 fragile cargo hits).

**Story mode & gameplay** — `story.js` (FEAT-43 gamemode sandbox) · `day.js` (day clock, FEAT-47) ·
`economy.js` (payout/wallet/points spine, FEAT-53) · `offer-board.js` (FEAT-67 mission board —
slots, expiry timers, seeded offers, names, card view-model; pure) · `mission.js` (mission generator
+ run state machine) · `par.js` (FEAT-29 par oracle) · `poi.js` (lay-by POIs, FEAT-46) · `camp.js` (dispersed
camping, FEAT-45) · `dialogue.js` (character channel) · `paper-route.js` + `throw.js` (FEAT-61) ·
`gps.js` (FEAT-39 nav overlay) · `cluster.js` (FEAT-49 gauge cluster — instrument panel, not
clustering) · `rank-timer.js` (FEAT-87 live rank timer — band line-up, escalation, beats; pure, the
DOM ticker is in main.js) · `damage-screen.js` (FEAT-90 player damage pictogram + left-edge alert
icon, V, parked only) · `park-badge.js` (FEAT-90 orange P-in-a-circle "park first" badge + keycap
markup) · `lab.js` (FEAT-31 testing lab world) · `scenario.js` (FEAT-62 scenario run rules — countdown,
fixed-step clock, gate/finish line crossings; pure, the columns + HUD + finish card are in main.js) ·
`leaderboard.js` (FEAT-62 best times per scenario behind a `{load, save}` store hook — session memory
until the FEAT-42 save file; the hook is documented in its header).

**Dev & harness bridge** — `debug.js` (lil-gui panel, HUD) · `damage-hud.js` (SM-3 diagnostic damage readout, opened from
the debug panel's Damage folder) · `capture.js` (game↔harness capture
schema) · `logger.js` (frame logger + IC loader) · `perf.js` (bucketed profiler) · `version.js`
(build marker).

**Menus & shell** — `stage.js` (FEAT-41 MenuStage: the live 3D scene behind the main menu AND
every mode-entry load — its OWN scene, camera, physics world and truck, so it keeps animating while
the real world is being reseeded and routed. Only `main.js` constructs it; the pure-node gates never
touch it, same rule as `debris.js`).

**Entry** — `main.js` (scene setup, fixed-step accumulator loop, wires everything).

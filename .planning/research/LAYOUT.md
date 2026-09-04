# Repository Layout & File Conventions

**What this is:** the live map of the repo and the conventions for where new files go. CLAUDE.md
holds the *rules* (import seams, prohibitions, workflow); this holds the *map*. When you add, move,
or delete a file, update the relevant line here in the same commit — it's one line, keep it honest.

*Last full audit: 2026-08-16 (58 files in `src/`, 8 in `src/props/`).*

## Top level

| Path | What lives there |
|---|---|
| `index.html` | The single entry point (Vite root). |
| `src/` | The product — shippable game engine, ES6 modules. No diagnostics, no dead code (see CLAUDE.md "src/ is the product"). |
| `data/` | Content-as-data: vehicle specs (`ranger.js`, `vehicles.js`), model registry (`vehicle-models.js`, `prop-models.js`), dialogue, flora, biomes, map icons, and the bundled route caches (`route-cache-*.json.gz`, fetched by URL — never ES-import them). |
| `assets/models/` | Hand-authored `.glb` assets + `CREDITS.md`. Convention: `.planning/research/ASSETS.md`; style: `ART-STYLE.md`. |
| `vendor/box3d/` | Vendored Box3D WASM bindings. Imported ONLY by `src/physics-engine.js` (FEAT-48 seam). |
| `test/` | Headless gates (`gates.mjs` + `run-all.mjs`), shared libs (`lib/*.mjs`), replay harness (`replay.mjs`), rainy-day scripts. Pure node — never touches Vite. |
| `tools/dashboard/` | `npm run dash` ticket-tracker viewer (:8010). Read-only over `.planning/todos/`. |
| `.planning/` | Planning record. **Live:** `todos/` (tracker), `story-mode/DESIGN.md` + `MILESTONES.md` (roadmap), `research/` (standing references). **Historical:** `phases/`, `milestones/`, handoffs, `STATE.md`. |
| `.github/workflows/` | `deploy.yml` — Pages build. Runtime-fetched assets are copied to `dist/` by the inline plugin in `vite.config.js`. |

## File conventions

- **Naming:** kebab-case, one subsystem per file (`tire-audio.js`, `road-carve.js`).
- **Header comment:** every non-trivial module opens with a `src/<name>.js — <purpose>` block
  carrying its ticket tag (FEAT-NN / QUAL-NN / …). That header is the file's one-line contract —
  keep it true when the file's job changes.
- **Directories are earned:** a subsystem gets a subdirectory only once it splits into several
  files. `src/props/` is the only precedent (8 files). Don't pre-create directories.
- **Worker mirrors:** the terrain worker exists only as `WORKER_SOURCE` in `src/terrain.js`;
  carve/seed/route code is mirrored verbatim from its canonical file (search `CARVE SYNC` /
  `ROUTE SYNC`; gate: `test/route-worker-sync.mjs`). Edit canonical + mirror in the same commit.
- **New gates** register in `test/gates.mjs` with `subsystem`/`cost`/`desc`/`extraDeps`.

## src/ map

Grouped by subsystem. The **physics stack import direction** (the load-bearing contract) is in
CLAUDE.md; everything else here is inventory.

**Physics stack** — `physics-engine.js` (THE Box3D adapter seam) · `physics.js` (vehicle step,
chassis factory, debris translation) · `tire.js` (Pacejka, pure math) · `suspension.js`
(spring-damper struts, out-of-round tire radius) · `alignment.js` (static toe/camber signs,
pure math — read by `physics.js` and `vehicle-model.js`) · `terrain-physics.js` (streamed heightfield colliders, MESH == PHYSICS) ·
`drivetrain.js` (engine/converter/gearbox, FEAT-23) · `ignition.js` (key/starter state machine,
FEAT-33 — pure, no DOM) · `vehicle.js` (state, Ackermann, input) ·
`debris.js` (FEAT-36 dynamic props) · `physics-debug.js` (collider wireframes).

**World generation** — `seed.js` (PRNG, pure, worker-paste-able) · `terrain.js` (chunk ring +
`WORKER_SOURCE`) · `terrain-detail.js` (shared surface-detail GLSL) · `biome.js` (forest/meadow/
rock classification) · `map-cover.js` (map-resolution forest cover) · `water.js` (ponds/streams
generation) · `water-render.js` · `stone-texture.js` (procedural riverbed texture).

**Road network** — `road.js` (RoadSystem: streaming, resolve, surface queries) · `road-graph.js`
(blue-noise anchors + Urquhart topology) · `road-carve.js` (carve bodies + router, canonical for
worker mirrors) · `road-mesh.js` (ribbon build) · `road-worker.js` (dedicated routing Worker,
QUAL-08) · `road-quality.js` (per-stretch quality) · `centerline.js` (curvature-bounded centerline
model) · `route-store.js` (bundled route cache, dev convenience).

**Props** — `props/`: `prop-system.js` (orchestrator) · `prop-palette.js` · `prop-geometry.js` ·
`prop-scatter.js` · `prop-collider.js` · `prop-impostor.js` · `prop-shadow-bake.js` ·
`prop-debug.js`.

**Rendering & atmosphere** — `sky.js` (time-of-day, ACES) · `moon.js` · `shadow-fade.js` ·
`camera.js` (chase/cockpit/fly) · `vehicle-model.js` (procedural truck + cast lights) ·
`model-service.js` (FEAT-59 .glb import service) · `smoke.js` · `dust.js` · `dirt-spray.js` ·
`map2d.js` (M-key dev map).

**Audio** — `engine-audio.js` · `tire-audio.js` (tonal stick-slip) · `wind-audio.js`.

**Story mode & gameplay** — `story.js` (FEAT-43 gamemode sandbox) · `day.js` (day clock, FEAT-47) ·
`economy.js` (payout/wallet/points spine, FEAT-53) · `mission.js` (mission generator + run state
machine) · `par.js` (FEAT-29 par oracle) · `poi.js` (lay-by POIs, FEAT-46) · `camp.js` (dispersed
camping, FEAT-45) · `dialogue.js` (character channel) · `paper-route.js` + `throw.js` (FEAT-61) ·
`gps.js` (FEAT-39 nav overlay) · `cluster.js` (FEAT-49 gauge cluster — instrument panel, not
clustering) · `lab.js` (FEAT-31 testing lab world).

**Dev & harness bridge** — `debug.js` (lil-gui panel, HUD) · `capture.js` (game↔harness capture
schema) · `logger.js` (frame logger + IC loader) · `perf.js` (bucketed profiler) · `version.js`
(build marker).

**Entry** — `main.js` (scene setup, fixed-step accumulator loop, wires everything).

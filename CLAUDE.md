## Project

**RangerSim**

A browser-based 6DOF rigid body car physics simulation built in JavaScript with Three.js. The default vehicle is a 2002 Ford Ranger (RWD, open diff). The physics system is designed to be accurate enough to simulate real driving behavior — including drifting, weight transfer, and rollovers — while remaining tunable through an in-game debug menu. Runs entirely in-browser with no install required.

**Core Value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.

### Constraints

- **Tech stack**: Three.js + vanilla JS, Vite build (PERF-04/PERF-20.5) — `npm run dev` locally, `npm run build` → `dist/` deployed to GitHub Pages via GitHub Actions. (Was a no-bundler CDN importmap; bundling was adopted to kill the ~0.9 s per-load import waterfall. three/simplex resolve from npm, byte-identical to the retired pins; the `test/*.mjs` gates stay pure-node and never touch Vite.)
- **Runtime**: Browser only, single origin — no server, no WebSocket, no backend
- **File structure**: ES6 modules in a `src/` directory, single `index.html` entry point
- **Physics**: Hand-rolled, no physics library — required for learning, tuning transparency, and terrain control
- **Performance**: Target 60fps on a mid-range laptop with terrain active — physics must be lightweight
- **LLM maintainability**: Code is primarily maintained by LLM sessions (Claude Sonnet 4.6, `claude-sonnet-4-6`). Conventions must be explicit, self-documenting, and resistant to drift across sessions.

## Technology Stack

Three.js r184 (ESM from npm, bundled by Vite) · vanilla JS · lil-gui + stats.js (from `three/addons`,
aliased to `three/examples/jsm/` in vite.config.js). Hand-rolled 6DOF physics (Pacejka tires,
spring-damper suspension) using Three.js math primitives. Local dev: `npm run dev` (Vite on :8000).
Deploy: `npm run build` → `dist/` shipped to GitHub Pages by `.github/workflows/deploy.yml` (Pages
Source must be set to "GitHub Actions"). Runtime assets fetched by URL — `data/route-cache-default
.json.gz` and `assets/models/*.glb` — are copied into `dist/` by an inline plugin at their existing
paths (NOT ES imports; do not convert to `?url`, that breaks the pure-node gates that read them).

**Do NOT use:** physics libs (Cannon/Rapier/Ammo), dat.GUI, global `<script>` Three.js, Web Workers
for physics, OffscreenCanvas, or Euler angles for body rotation. Fixed-timestep accumulator loop.
(Full rationale + version-verification + sources: `.planning/research/STACK.md`.)

### Module Structure
| Module | Responsibility | Imports from |
|--------|---------------|--------------|
| `src/tire.js` | Pacejka Magic Formula, slip angle → lateral force | Nothing (pure math) |
| `src/suspension.js` | Spring-damper per corner, contact patch position, normal force | `tire.js` (for normal force input) |
| `src/physics.js` | 6DOF integrator, force accumulation, quaternion rotation | `tire.js`, `suspension.js` |
| `src/vehicle.js` | Vehicle state, drivetrain, Ackermann, input accumulation | `physics.js` |
| `src/camera.js` | Chase camera, spring follow | Three.js only |
| `src/debug.js` | lil-gui panel, scenario logger, HUD | `vehicle.js` (reads state) |
| `src/main.js` | Entry point, scene setup, game loop | All of the above |
| `data/ranger.js` | Ford Ranger specs as exported const object | Nothing |

## Conventions

### src/ is the product

`src/` is a shippable, bare-minimum game engine. Keep it that way:

- **No diagnostic plumbing in the frame loop.** Per-frame probes, ground-vs-grade comparisons, and
  one-off bug instrumentation do not belong in `src/`. Diagnostics run *externally* against the
  headless harness in `test/` (replay + rainy-day scripts), not inside the running game.
- **No dead code.** A retired approach gets deleted, not parked behind a "kept for reference" comment.
  Git history and `.planning/` hold the story.
- **Comments keep the story.** BUG-XX / D-NN / CR-NN tags and invariant explainers stay inline —
  they're shipped with `src/` and prevent regressions. Strip the tag only when the code it described
  is gone.

### Diagnostic tools (all live in test/, triggered externally)

- **Road resolution / fold debugging:** `node test/replay.mjs <place-capture.json>` — reports
  gradeY / hit / runKey / arcS / minR at the marked location and checks surface window-invariance.
  (Captures are produced in-game; press the capture key. `RoadSystem.debugSampleAt()` is the read-only
  method behind it.)
- **Physics behaviors** (load transfer, wheel independence, wheel lift, damping, ramp slide):
  `test/assert-m4-*.mjs` — rainy-day manual scripts; each needs a recorded scenario log. Not in
  `npm test`.
- **Regression gates (33, in `test/gates.mjs`):** `npm test` runs **only the AFFECTED gates** — those
  whose transitive import closure (computed live by `run-all.mjs`, + each gate's `extraDeps`) intersects
  your `git diff`. So a physics edit runs the physics gates, a prop-slider tweak the prop gates, a
  skybox edit nothing. Keeps the nominal loop fast; heavy road/terrain/water gates run only when you
  touch that code. `npm run test:all` runs the full suite (do this pre-commit / on the desktop —
  see INFRA-01). Preview what a change hits: `node test/run-all.mjs --list [--changed=<paths>]`.
  Add a gate in `test/gates.mjs` (with `subsystem`/`cost`/`desc`/`extraDeps`); `test/` also holds libs
  (`lib/*.mjs`) and rainy-day scripts, which are not gates. Wall-clock assertions are report-only
  (flaky) — real timing budgets live in the PERF-08 profiling harness, not the gates.

### Terrain Worker

The terrain Web Worker source lives only as the `WORKER_SOURCE` template string in `src/terrain.js`
(spun up as a Blob classic worker). There is no separate worker file. Carve bodies (canonical in
`src/road-carve.js`) and seed/height helpers (canonical in `src/seed.js`) are copied verbatim into
`WORKER_SOURCE` — edit the canonical original and reflect it there in the same commit (search
`CARVE SYNC` / SYNC RULE).

**Routing also runs in this Worker** (PERF-03 Workstream A): the road router (`arcPrimitiveConnect` +
dubins helpers + search scratch, canonical in the `ROUTE SYNC` region of `src/road-carve.js`) is copied
verbatim into `WORKER_SOURCE` so `RoadSystem.warmRoutes()` can pre-warm the per-connection centerline
cache off the main thread (killing the macro-cell routing hitch). The copy is escaped for the backtick
template literal; `test/route-worker-sync.mjs` (a `npm test` gate) asserts it stays byte-identical to
the canonical (modulo `export` + template escaping). Edit the `ROUTE SYNC` region and re-mirror it in
the same commit. The main thread keeps the synchronous router as the cold-load/teleport fallback, so
headless gates (no Worker, no dispatcher) are unaffected.

## Story Mode (design intent)

Story mode (roguelike runs, sleep/doze clock, par-based mission economy, region unlocking via
FEAT-28) is framed but not yet scheduled. **Intent and invariants live in
`.planning/story-mode/DESIGN.md`** (cite invariants as `SM-INV-N`); milestones + ticket map in
`.planning/story-mode/MILESTONES.md`. Read DESIGN.md before any gameplay/mission/progression/
sleep/economy work — if an implementation satisfies its ticket but violates an invariant there,
the invariant wins; stop and flag it. Open design questions listed there are the user's to
answer, not yours.

## Workflow

This project is in **maintenance / polish stage**. Work the lightweight loop — direct edits are the
norm.

- **Capture** bugs/features/ideas as tickets in `.planning/todos/pending/` (frontmatter: `id`, `type`,
  `status`, `severity`, plus a clear acceptance section). This tracker is the live source of truth for
  outstanding work. Close a ticket by moving it to `.planning/todos/completed/` with a resolution note.
- **Plan** non-trivial / multi-file changes via plan mode (get sign-off before implementing). Skip the
  ceremony for small fixes.
- **Implement directly** with focused edits. The headless harness is the real quality gate: `npm test`
  (the registered gates) + `node test/replay.mjs <capture>` for captured bugs. Prove fixes there rather
  than through heavyweight verify phases.
- **Commit** with conventional messages (`feat(NN)` / `fix(NN)` / `perf(NN)` / `docs`), only at a
  task/phase boundary or when asked.

For a large structured effort, lean on plan mode and stage the work in `.planning/`. The `.planning/`
phase artifacts (`phases/`, `milestones/`, handoffs) are historical record; `.planning/todos/` is the
live tracker.

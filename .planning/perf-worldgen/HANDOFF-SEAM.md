# Seam: worldgen-CPU worker ↔ prop-streaming/graphics worker

Two parallel efforts are active. This doc is the ownership boundary so edits don't collide.
Written 2026-07-16 by the worldgen-perf session (worktree `CarGame-perf-worldgen`,
branch `feature/perf-worldgen`).

## Who owns what

**Worldgen-CPU (this worktree)** — cold-load / generation-time CPU cost:
- `src/road.js`, `src/road-carve.js`, `src/road-worker.js` (router + ROUTE SYNC mirror) — HOT,
  actively edited here.
- `src/terrain.js` worldgen stages (height/carve/normals/colors pipeline) — may move stages
  into the Worker.
- `src/water.js` generation (pond/stream placement) — perf only, no behavior change.
- Prop **placement math** (which prop goes where): `src/props/prop-scatter.js` — placement must
  stay deterministic per seed (collision props are gameplay). May change *when* placement runs,
  never *what* it produces.
- New: per-seed persistent route cache (IndexedDB) + quality-preset *generation pacing* knobs.
- Test tools: `test/dump-network.mjs`, `test/feel-diff.mjs`, `test/_prof-*.mjs` (scratch).

**Prop-streaming/graphics (other worktree)** — per-frame GPU/render cost:
- `src/props/prop-system.js` streaming/instancing, `prop-geometry.js`, `prop-shadow-bake.js`,
  `prop-debug.js` — yours.
- `src/vehicle-model.js`, `src/sky.js`, `src/water-render.js`, render side of `src/terrain.js`
  (materials, meshes) — yours.
- Draw-distance / LOD / shadow-quality side of any quality presets — yours.

## Shared surfaces (coordinate before touching)

1. **`src/props/prop-scatter.js` output format** (placement list consumed by prop-system):
   worldgen owns the *values*, streaming owns the *consumption*. If you need format changes,
   flag it; don't reorder/reseed the scatter RNG — prop positions are deterministic gameplay
   state (tree collision can end a story-mode run).
2. **Quality presets**: single shared param object (likely `data/ranger.js` + debug menu).
   Rule agreed with the user: presets must NOT change deterministic world state (road topology,
   terrain heights, prop placement/density). They may change: generation *pacing*/staging,
   active-cache size (generate → unload → re-hydrate), draw distance, LOD, shadows, instancing
   density of *non-collision decoration only if it never becomes collision*. When both sessions
   add preset knobs, use distinct key prefixes: `gen*` (worldgen) vs render-side names, and
   merge via `data/ranger.js` at integration time.
3. **`src/main.js`**: both sessions will touch the boot path. Keep edits small and localized;
   integration conflicts resolved at merge by the user's main session.
4. **Workers**: routing pool (`road-worker.js`, 2–4 workers) + terrain worker exist. If the
   graphics side wants workers (e.g. shadow bake), budget against the same core count — the M4
   Air is fanless; 8 total busy workers measured SLOWER than 4 on cold load (PERF-15 note in
   road-worker.js). Talk before adding more than 1.

## Facts the other session should know

- Cold load is ~99% road routing (measured 2026-07-16: 26.5s of 26.8s headless cold stream is
  inside `arcPrimitiveConnect`; terrain main-thread work is ~5ms/chunk; props/water negligible
  at load). If your changes make load feel slower/faster, it's almost certainly interaction
  with the routing worker pool, not your rendering code.
- `npm test` runs only AFFECTED gates (import-closure vs git diff). Prop edits run prop gates
  only. `npm run test:all` = full 33-gate suite, do it pre-merge.
- Road/worker code is byte-mirrored (ROUTE SYNC / CARVE SYNC). If you somehow touch
  `road-carve.js` or `terrain.js` helpers, the mirror gates will fail — that's the signal to
  re-mirror, not to skip the gate.

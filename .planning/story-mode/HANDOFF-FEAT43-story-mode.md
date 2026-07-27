# HANDOFF — FEAT-43 Story Mode sandbox (routing-frozen, terrain-streaming region)

**Read this first, then `feat-story-mode-fixed-region.md` (FEAT-43) and `DESIGN.md`.** This is a
recycled-session handoff: it captures the full state + the agreed plan so you can continue without
re-investigating. Owner has approved **Option A** (below). Date: 2026-07-25.

> **STATUS 2026-07-25 (later session): Option A is now IMPLEMENTED.** All six steps of the
> "Implementation plan" below are done, plus an owner-requested **region boundary overlay on the 2D
> map** (`_drawRegion` in `src/map2d.js` + `setRadiusCap`) — the in-world wall is invisible until
> FEAT-28, so the map is where the boundary has to be legible. Two deviations worth knowing:
> (1) `REGION_RADIUS_M = 2500` lives in `src/story.js`, not passed from main.js — main.js no longer
> supplies `regionRadius`; (2) entry no longer guesses when the world has settled — `applySeed` /
> `reseat` are now **awaited** (`debouncedRebuildFull()` was made promise-returning), with the old
> timer kept only as a failure ceiling. Entry degrades honestly: a settle/warm timeout logs and
> enters **unfrozen** rather than hanging on the loading screen.
> `npm run build` green; **all 40 gates green** (`npm run test:all`). Still **uncommitted** — awaiting
> the owner's drive-check. Everything below is retained as the rationale + measurement record.

---

## Where the work lives

- **Worktree:** `/Users/ledogen/CodeShit/CarGame-story-mode`, branch **`feature/story-mode`** (off
  `origin/main`). `node_modules` is installed here. Dev server was run on port **8011**
  (`npm run dev -- --port 8011 --strictPort`).
- **Uncommitted:** all Phase-1 changes below are in the working tree, **NOT committed yet**. Don't
  commit until the owner is happy (project convention: commit at phase/task boundary or when asked).
- Build check: `npm run build`. Gates: `npm test` (affected only) / `npm run test:all` (full).
- The `/worktree` skill (`~/.claude/skills/worktree/scripts/wt.sh`) manages serve/merge/clean. Its
  `serve` sub-command failed to resolve the worktree earlier; just run Vite directly (above).

## The goal (owner intent, refined over the session)

Story mode is a **sandboxed gamemode** that forks free roam so POIs + future divergences can't break
free roam. Boot lands in Free Roam; pause → **Story Mode** → seed prompt (default the pre-baked seed
`6`) → enter a **bounded region**. **Story Mode CONTAINS Quick Job** (the beta mission generator,
`src/mission.js`) as an in-mode corner button (later a debug-only affordance once POIs give missions).
POIs are the **next** slice (Phase 2), built inside this sandbox.

## THE DECISION — Option A: freeze ROUTING, keep TERRAIN streaming

The owner wants the **maximum play area** (target: a **5×5 km** region), entered via a **loading
screen** that pre-warms the area, after which there's "no streaming cost" and hard walls bound it.

**Why not freeze everything:** routing and terrain have inverted cost profiles (both measured this
session — numbers below):

| | compute cost | cost to HOLD frozen | determinism risk |
|---|---|---|---|
| **Road routing** | high, **O(R²)** (~20 s cold @2.2 km radius) | **tiny** (~50 cached centerlines @1.4 km; radius-agnostic) | **none today** (BUG-25 fixed) |
| **Terrain mesh** | ~5.5 ms/chunk | **huge** — meshes stay resident: **~230 KB × chunk** | none (pure fn of coords) |

A **fully-frozen 5×5 km** world is a memory bomb: ~6,200 resident chunks ≈ **1.4 GB** RAM/VRAM →
not viable in a browser tab. So:

- **Freeze routing** for the whole region (it was ~99 % of the cost and the only determinism-fragile
  part). Warm once → freeze the router → the road network never re-streams/re-routes.
- **Keep terrain (+ props + water + road ribbons) streaming** around the player — cheap (~1 chunk/
  frame, ~66 MB resident at Ultra), deterministic (terrain has no window-sensitivity), and it's what
  makes a big area memory-safe. The residual per-frame cost is a fraction of a ms.
- Hard circular **boundary** at the region radius; **suspended while a Quick Job is active** (its
  planner is player-centered at 1400 m and teleports the truck to the start — clamping breaks it).

This gives ~all the perf benefit with none of the memory problem, and the loading screen only warms
**routing** (seconds, or **instant on the pre-baked default seed**), not 6,200 terrain chunks.

(If the owner ever wants *everything* frozen / zero streaming, that path is memory-capped to ~**2×2
km** (~235 MB). Not what we're building now.)

---

## Measured facts (don't re-investigate — two Explore agents gathered these)

**Constants**
- `CHUNK_SIZE = 64` m; terrain `GRID_SAMPLES = 65` (65×65 verts/chunk). `src/terrain.js:40-41`.
- Terrain ring: `setRingRadius(n, warmMargin)` — **no upper cap**. Quality presets
  (`src/main.js:1390-1394`): Normal ring 2/warm 1 (49 chunks, ~192 m gen), Ultra ring 4/warm 4 (289
  chunks, ~512 m gen). Fog goes opaque ~430–500 m even at Ultra.
- Road anchor grid `PROTO_ANCHOR_SPACING = 256` m; blue-noise site spacing `roadSiteSpacing = 640` m,
  min node dist `roadSiteMinDist = 420` m (`src/road.js:347`, `data/ranger.js:589/595`).
- `MISSION_PLAN_RADIUS = 1400` m (Quick Job planner reach); `PLAN_RESTREAM_MOVE = 700`
  (`src/mission.js:35-36`). Play road radius `setRadius(320)`; Ultra ~576–640 m; map to 2000 m.

**Costs (measured on the owner's machine via `test/bench-worldgen.mjs`)**
- Terrain: **~5.5 ms/chunk** main-thread (road *carve* = 4.1 ms of it, main-thread only; worker-side
  height only 0.9 ms). Throughput ~60 chunks/s steady, ~180/s burst. 1–3 terrain workers.
- Routing: **~19.5 s cold @2200 m radius → 0.21 s cached** (~93×). **O(area)=O(R²)**. 2–4 route
  workers (`src/road-worker.js:1416`, cap 4). `USE_WORKER_ROUTING = true`.
- **5×5 km ≈ 6,200 chunks ≈ 34 s build / ~35 s burst wall-clock, and ~1.4 GB resident** (the wall).
  Route warm to enclose 5×5 km ≈ 2500·√2 ≈ **3540 m radius** → ~1.6–2.6× the 2200 m cost (~30–50 s
  single-thread, ~10–25 s pooled), **or instant on seed 6 if the bundled cache covers it**.

**Determinism (THE key question — answered):** post-BUG-25 the crossing cull is a **pure function of
(seed, params, region)**, computed on a static wide graph with a **3072 m margin**
(`(roadGraphMargin 3 + roadGraphCullMaxHops 8 + 1)×256`, `src/road.js:2248`). HARD-passing gates
`test/graph-cull-radius-invariance.mjs` + `test/restream-invariance.mjs` prove "drive out and back →
byte-identical network + grades." A frozen network is a **safe superset**: boundary edges only ever
*keep* a real redundant road, **never** draw a phantom or make one disappear. **So determinism is NOT
the limiter at any radius** — the only requirement is: pump **`warmBandComplete(center)` to `true`
before freezing** (else un-routed edges are missing when you drive to them). `warmBandComplete`
(`src/road.js:1661`) warms every *registering* edge in the band + its out-of-band SOLO deps and
returns true only when nothing is outstanding.

**Route cache:** `routeCacheSig(worldSeed, params)` (`src/route-store.js:22`) covers seed + all
routing params but **NOT radius/window** — so the bundled **seed-6** cache
(`data/route-cache-default.json.gz`) is **radius-agnostic**: it serves any window on seed 6. Coverage =
whatever the bake script warmed. **OPEN:** verify the bundled cache covers the target region radius; if
not, re-bake it (scratchpad `gen-default-route-cache.mjs` pattern — not in the worktree; recreate/locate
it) so seed-6 story mode is instant. Otherwise seed 6 also pays a one-time ~15–25 s warm (loading
screen handles it either way).

---

## Current worktree state (Phase-1, needs revising for Option A)

**IMPORTANT:** the code currently implements a **live-streaming** boundary version (I reverted an
earlier freeze after the owner hit the tiny-area problem). Option A needs the **routing freeze added
back** (correctly this time — routing only, not terrain) plus the **loading screen** and a **bigger
region**. Files touched this session:

- **NEW `src/story.js`** — `StorySystem`. Currently: `enter(seed)` sets mode, reseeds-or-reseats,
  shows Quick Job; a short `CENTER_CAPTURE_MS` grace captures the region center; `update()` enforces a
  circular wall at `regionRadius` (passed as `MISSION_PLAN_RADIUS` = 1400 from main.js), **suspended
  while `isMissionActive()`**, with an `_armed` flag so returning from a far mission isn't yanked. It
  is import-light and coordinates via a `deps` adapter. **No routing freeze, no loading screen yet.**
- **`src/main.js`**:
  - imports `StorySystem` + `setDebugLockout`.
  - extracted **`applyWorldSeed(v)`** (shared by debug `changeSeed` + story) — near `debouncedRebuildFull`.
  - **`storySystem` construction** (~line 2274) with deps: `regionRadius: MISSION_PLAN_RADIUS`,
    `setGameMode/getWorldSeed/applySeed/reseat/setDebugLockout/hidePauseMenu/setQuickJobVisible/
    getVehiclePosition/isMissionActive`. `setDebugLockout` adapter also force-hides collision spheres.
  - **`_showPauseMenu`** sets `pm-story` label context-aware ("story mode" ↔ "free roam").
  - **`pm-story` handler**: in story mode → exit story; else open seed modal. Seed modal wiring
    (`ss-start`/`ss-cancel`/`ss-seed` Enter/Esc). **`quickjob-btn`** → `missionSystem.enter()`.
  - **`mp-quit`** routes through `storySystem.exit()` when active.
  - loop: `storySystem.update(frameTime, vehicleState)` right after the physics accumulator (before
    render interpolation). Collision-sphere backtick handler (`~main.js:2050`) gated on
    `!storySystem.isActive()`.
- **`src/debug.js`**: `setDebugLockout(locked)` export — backtick inert + panel/canvases force-hidden
  while locked. Lil-gui suppression confirmed working.
- **`index.html`**: `#story-seed-modal` (input default `6`, start/cancel) + `#quickjob-btn` corner
  button + styles; relabeled `pm-story` to "story mode".
- **FEAT-43 ticket** updated with the freeze-reversal rationale + Option-A framing.

Build + affected gates were green after Phase 1.

---

## Implementation plan — Option A (what to change)

1. **Region size:** make `regionRadius` a story-layer constant in `story.js` (circular boundary).
   Target **2500 m** (5 km diameter). Warm-routing radius = `regionRadius + margin` (~2800–3540 m to
   cover the boundary + the router's own margin). Keep it a single tunable constant.
2. **Loading screen:** add a DOM overlay (e.g. `#story-loading` in `index.html`) shown by
   `StorySystem.enter()` while warming. Minimal styling (FEAT-41 will restyle).
3. **Warm + freeze routing** in `enter()` via new `deps`:
   - After any reseed settles, `deps.warmRegionRoutes(center, warmRadius, onDone)` — sets
     `roadSystem.setRadius(warmRadius)` and pumps **`warmBandComplete(center)`** (mirror the
     `_startPlannerWarm` pump loop, `src/main.js:1662-1680`) until true. For seed 6 with full cache
     this returns true immediately.
   - On done: register the full network once (`roadSystem.update(regionCenter)` at the big radius so
     the whole region's edges register + cull at the wide radius), then set a **`_routingFrozen`**
     flag, hide the loading screen, capture center, arm the boundary, show Quick Job.
4. **Freeze in the loop:** gate **only** `roadSystem.update(streamCenter)` and
   `roadSystem.warmRoutes(streamCenter)` (the two road-stream calls, `~src/main.js:2686/2728`) on
   `!storySystem.isRoutingFrozen()`. **Leave terrain/props/water/roadMesh streaming ON** — they build
   carve + ribbons against the frozen `_network` as the player drives. (Do NOT re-add the terrain/
   water/roadMesh freeze gating from the earlier draft — that was the memory-bad path.)
5. **Boundary:** unchanged logic, just the bigger `regionRadius`; keep the mission-suspend + `_armed`
   re-entry behavior. (Quick Job from spawn reaches ≤1400 m, well inside 2500 m; only near the edge
   does a mission exit the region, which the suspend handles. Region-anchored Quick Job planner is
   Phase 2.)
6. **Exit:** restore `roadSystem.setRadius(320)`, clear `_routingFrozen`, unlock debug, mode→freeroam,
   reseat. (No terrain ring restore needed — we never widened it in Option A.)

**Watch-outs:**
- Registering ~200 edges at the big radius runs the wide-radius cull once — that's *correct* (map-
  accurate, superset-safe). Fine.
- The road ribbon mesh + terrain carve read `roadSystem._network` per chunk as terrain streams — with
  the full region registered + frozen, they build correctly everywhere the player drives.
- Terrain streaming stays player-centered; memory stays bounded (~66 MB), not 1.4 GB.
- Confirm Quick Job still works with routing frozen: it uses a **separate** planner RoadSystem
  (`makePlanner`/`_startPlannerWarm`, `src/main.js:1662-1735`) on the road worker — leave that path
  ungated so Quick Job keeps warming its own planning network.

## Verification

- `npm run build` green; `npm test` (affected) green — no physics/worldgen/router *code* changed.
- Live (`npm run dev -- --port 8011 --strictPort`): boot → Free Roam. Pause → "story mode" → seed 6 →
  loading screen (instant if cache covers region) → dropped in region. Drive to ~2500 m edge → hard
  wall. Quick Job corner button → teleports to start + full drive works (wall suspended). Backtick:
  no debug panel, no collision spheres. Pause shows "free roam" → exits, streaming + debug restored.
- Optional: confirm **no `roadSystem.update`/`warmRoutes`/routing worker traffic** after freeze (that's
  the perf-win acceptance) while terrain chunks still stream as you drive.
- Determinism: the existing `graph-cull-radius-invariance` + `restream-invariance` gates already cover
  the frozen-network safety; no new gate needed for this slice.

## Then

- Update FEAT-43 progress note; commit at the phase boundary when the owner is happy; merge via
  `wt.sh merge story-mode` + `wt.sh clean story-mode`.
- **Phase 2 (next):** POIs (translucent-cube placeholders, deterministic placement, interact-to-start-
  mission) + region-anchored Quick Job planner (missions drawn from the fixed region, not a player-
  centered window) — both build inside `src/story.js`. See FEAT-43 acceptance.

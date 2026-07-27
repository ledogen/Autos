# HANDOFF 2026-07-26 — Story-mode fixes: MERGE to main (worktree `../CarGame-story-mode`, branch `feature/story-mode`)

## State: three owner-reported defects fixed + PERF-26 item 1 done. All 40 gates green, build clean, verified in-browser. READY TO MERGE.

Scope of this session: **not** the FEAT-43 build itself (that is commit `272e7ce`, already on the
branch) — this is the follow-up round answering three owner reports, plus the route-cache split that
came out of the third.

## Merge situation

Branch base is `ef8d8f7`. **main has advanced by two commits since** and must be merged in:

- `905ef27` feat(road): softer grade wall + deeper earthwork caps
- `a66e690` fix(camera): chase-cam drag-orbit snapping at speed

Neither overlaps this work — the files touched here are `src/{main,mission,story,route-store}.js`,
`test/{bake-route-bundle,route-bundle-parity,mission-network,gates}.mjs`, `vite.config.js`,
`data/route-cache-region.json.gz` (new) and two `.planning/todos/` files. `src/camera.js` and the
road/carve tuning files are untouched here, so **no conflicts are expected**. The one thing to
re-run after merging is `node test/route-bundle-parity.mjs`: `905ef27` changed road grade/earthwork,
and if it moved any routing-relevant param the cache sig shifts and **both** assets need re-baking
(`node test/bake-route-bundle.mjs`, which now writes both). The gate says so explicitly if it fires.
It was green here against `ef8d8f7`, so this is a real check, not a formality.

## 1. Quick Job could route outside the region wall

**Report:** "spawn → story mode → quick job → regenerate (several times) → I get a mission that
routes outside the world boundary."

**Cause — the planner, not the wall.** `_roll()` (src/mission.js) picks *both* endpoints freely from
every node in the planner network, and that network reaches far past its nominal
`MISSION_PLAN_RADIUS` because the streamed band carries a wide margin. Measured on seed 6 with the
planner centred *exactly* on the region centre — the best case — the candidate set held **43 nodes
reaching 2783 m, 4 of them (9%) already outside the 2500 m wall**. So ~1 roll in 10 escaped, and
worse in play: the planner re-centred on the **car** every `PLAN_RESTREAM_MOVE` (700 m), sliding the
whole window outward as you drove. Regenerating just re-rolled the dice.

**Fix**, all mission-side so story.js stays the region's only owner:
- new optional `getRegion()` dep — **null in free roam, so Quick Job's original behaviour is
  bit-for-bit untouched there**;
- `_planner()` anchors on the region centre instead of following the car (also stops pointless
  re-streams of an already-frozen network — `PLAN_RESTREAM_MOVE` can no longer fire in-mode);
- `_roll()` filters candidate **edges** to `r - REGION_MARGIN` (edges, not endpoints: an edge with
  one node outside *is* a road that leaves the region), and the finished **polyline** is re-checked,
  because a centerline between two in-region nodes can still bow past the wall;
- `_generate()` re-rolls up to `REGION_ROLL_TRIES` **only when a region is active** — cheap there
  (region is pre-warmed, every `edgeParData` is a cache hit), whereas retrying in free roam could
  route live edges and block for seconds.

**Gate:** `test/mission-network.mjs` section 6 — 25 confined rolls, every poly point *and* both pins
inside the wall (furthest 2199 m of 2500), 25/25 rolls still produce a mission, free-roam planning
unchanged. **Negative-controlled:** with both guards disabled the same check fails with 53 escaping
points, worst 2774 m — matching the 2783 m measured independently.

## 2. Teleport + debug menu re-enabled in story mode — TEMPORARY

Story mode is *designed* to remove both (DESIGN.md "Game modes"). They are re-opened while the mode
is a sandbox under construction. **Two sibling switches — flip them together to close it up:**
- `isTeleportEnabled()` in main.js now admits `'story'`;
- `DEBUG_LOCKOUT = false` in story.js (the whole lockout mechanism — `debug.js setDebugLockout` +
  the force-hide hook — stays wired and is still called, just with `false`).

**Non-obvious dependency:** teleport alone was a no-op, because the boundary clamped the truck
straight back on the next tick. `storySystem.notifyTeleport()` (called from both `teleportToGround`
and `teleportToPose`) disarms the wall exactly the way an active Quick Job does, re-arming the
moment the player is inside the region again. **If you re-close teleport, this call becomes dead and
should go with it.**

## 3. Story entry was slow despite seed 6 being "cached" → the route cache is now SPLIT

**Cause:** the bake covered `MISSION_PLAN_RADIUS + 300 = 1700 m` while story entry warms to
`REGION_RADIUS_M + WARM_MARGIN_M = 2800 m`. Measured against the shipped bundle: **104 of 216
in-band edges (48%) uncached**, routing live on the worker pool behind the loading screen on *every*
entry. Nothing was stale — the sig matched and the parity gate was green — the bake just stopped
short, which is precisely why no existing check saw it.

**Then a second cost surfaced, and it drove the design.** Baking to 3100 m in one asset took it to
8.31 MB gz — which is **24.85 MB of JSON**, inflated and `JSON.parse`d **on the main thread**: ~100 ms
here (38 ms gunzip + 63 ms parse), several hundred on an old laptop, plus a ~25 MB allocation spike.
Unlike the download, that is paid on *every* load whether or not the file is HTTP-cached. Bandwidth
was never the real argument.

**So the asset is split by when it is needed** (owner's call: block on the free-roam cache, lazily
pull the story region so it is ready by the time they click):

| asset | covers | when |
|---|---|---|
| `data/route-cache-default.json.gz` — BASE | spawn band + `MISSION_PLAN_RADIUS` → 1700 m | **awaited at boot** (unchanged QUAL-14 behaviour) |
| `data/route-cache-region.json.gz` — REGION delta (**new file**) | + out to 3100 m for the story warm | **background** after `__rsReady` (idle callback), **awaited by story entry** |

Notable: **BASE came out byte-identical to the asset already committed on this branch** — git shows
it unmodified. The merge therefore adds exactly one new binary, the 4.67 MB region delta.

Mechanics: `route-store.js` gains `loadRegionRouteCache()` (shared fetch/sig core); main.js gains
`_fetchRegionRoutes()` (memoized **per seed** — the sig check is seed-dependent, so a non-default
seed resolves null once and is never retried) and `_ensureRegionRoutes()` (imports, re-checking the
seed because a reseed builds a *different* RoadSystem instance and importing seed 6's routes into
seed 99's network would be poison). story.js awaits it via a new `ensureRegionRoutes` dep, placed
**after the settle** — the reseed branch builds the new RoadSystem, so importing earlier would load
into the doomed one. The bake target is derived from `max(MISSION_PLAN_RADIUS, REGION_WARM_RADIUS_M)`
via a new `REGION_WARM_RADIUS_M` export, so it can never silently fall behind the region again.

`vite.config.js` `RUNTIME_ASSETS` ships the new file (fetched by URL, not an ES import — do NOT
convert to `?url`, it breaks the pure-node gates).

**Verified in-browser** (headless Chrome/CDP against built `dist/`, 0 page exceptions):
`__rsReady` at 1403 ms; BASE requested before ready, REGION **not** requested before ready, REGION
requested after idle. Story entry reaches `live` in **1594 ms** with `isRoutingFrozen() === true`,
region centred at r=2500, Quick Job button up, loading overlay down. Debug panel opens on backtick
in-mode (lockout confirmed off), and a 4000 m teleport leaves `_armed === false` across 10 s of
frames, i.e. the truck is not yanked back.

**Gate:** `route-bundle-parity` grew from 2 checks to 5 — both sigs, base/region **disjointness**
(delta not a second copy), live-router parity, and **REGION-COVERAGE**: 0 of 216 in-band edges
uncached at the 2800 m warm. That last one pins the original bug directly. `test/gates.mjs`
`extraDeps` now lists both `.gz` paths (the old entry said `data/route-cache-default.json`, missing
the `.gz`, so it never matched a real file).

## Known-left, deliberately

The background prefetch runs for **everyone**, so a player who never opens story mode still
downloads and parses the region delta — just off the critical path. That is the owner's current
preference (story mode is where the dev loop lives; it must be instant on click). Escalating to
story-entry-only is one line: drop the `requestIdleCallback` kick after `window.__rsReady` and let
`_ensureRegionRoutes()` do the fetch on demand. Recorded in **PERF-26**, which also still owns the
real remaining task: a cold-boot → driving-**in-story-mode** measurement on a low-end machine.

## Verification summary

- `npm run test:all` — **40/40 green** (run twice: after the mission fix, and after the cache split).
- `npm run build` — clean; both `.gz` assets land in `dist/data/`.
- In-browser CDP checks above.
- Negative control on the new mission gate (fails against the pre-fix code).

## Tickets

- `.planning/todos/pending/feat-story-mode-fixed-region.md` (FEAT-43) — updated with all three fixes.
  **Still open**: Phase 2 is POIs + a region-anchored planner; the planner half landed here.
- `.planning/todos/pending/perf-26-cold-load-budget.md` (PERF-26) — **new**. Item 1 done, item 2 open.

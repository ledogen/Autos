---
id: FEAT-43
type: feature
status: open
opened: 2026-07-23
severity: minor
source: user-request
relates_to: >
  src/mission.js (today's beta mission system → rename to "Quick Job"),
  FEAT-28 region-gated connectivity (feat-region-gated-connectivity.md — trail-closed barriers),
  game-mode split (window.__setGameMode seam, teleport feature merged 2026-07-16),
  main-menu / game-menus UI (feat-game-menus-ui.md), road streaming + router (src/road.js,
  src/road-worker.js), story-mode DESIGN.md ("Game modes", SM-INV-12/13),
  FEAT-21 (road POI scatter — feat-road-poi-scatter.md, the eventual real POI siting)
---

## Implementation progress

**Phase 1 — sandbox shell + seed entry + frozen region (in progress, `feature/story-mode`, 2026-07-25).**
Owner decisions this session: (a) the new Story Mode **replaces** the old `pm-story` pause-menu slot;
the beta mission generator becomes **Quick Job**, surfaced as an **in-mode corner button**
(`#quickjob-btn`), *inside* story mode — not a pause-menu entry ("story mode CONTAINS quick job";
later Quick Job becomes a debug-only affordance once POIs give missions). (b) Entry is a **minimal DOM
seed prompt** (`#story-seed-modal`) pre-filled with the pre-baked default seed `6` (instant boot; full
menu styling deferred to FEAT-41). (c) A **hard circular boundary** at `REGION_RADIUS_M = 2500 m`
(story.js's own constant) around the seed spawn clamps free driving inside the region, and is
**suspended while a Quick Job is active** so its teleport-to-start + drive-to-end isn't clamped (it
re-arms once the player is back inside). (d) Entry runs behind a **loading screen** that pre-routes
the whole region, after which the router is frozen and no routing runs while driving.

**Freeze reversed, then re-landed correctly as "Option A" (2026-07-25).** The first draft froze
*everything* (terrain + router). Owner feedback: that made the play area tiny (~600 m diameter),
because a fully-frozen region must be pre-generated in full — and it broke Quick Job (the teleport
landed outside the wall). Investigation showed **routing and terrain have inverted cost profiles**:

| | compute cost | cost to HOLD frozen | determinism risk |
|---|---|---|---|
| Road routing | high, **O(R²)** (~19.5 s cold @2.2 km) | **tiny** (~50 cached centerlines) | none post-BUG-25 |
| Terrain mesh | ~5.5 ms/chunk | **huge** — 65×65-vert meshes, ~230 KB each | none (pure fn) |

A fully-frozen 5×5 km region is ~6,200 resident chunks ≈ **1.4 GB** — not viable in a browser tab.
So the freeze is scoped to the expensive-and-window-fragile half: **freeze ROUTING for the whole
region, keep TERRAIN (+props/water/ribbons) streaming** around the player. That is ~all of the perf
win with none of the memory problem, and it makes a **2.5 km-radius (5 km-wide) region** affordable.
Acceptance line "no terrain-worker stream messages after load" is **amended** accordingly — the
verifiable claim is *no `arcPrimitiveConnect` and no `roadSystem.update`/`warmRoutes` after entry*.

**Determinism (SM-INV-12) — checked, not assumed.** Post-BUG-25 the crossing cull is a pure function
of (seed, params, region) on a static wide graph with a 3072 m margin, proven by the HARD-passing
`graph-cull-radius-invariance` + `restream-invariance` gates. Registering the network once at the
WIDE radius is therefore a safe **superset** of the 320 m play window — boundary edges can only keep
a real redundant road, never invent or delete one. The single hard requirement is that
`warmBandComplete()` reach `true` **before** the freeze, or edges the player drives to would have no
routed centerline. That is exactly what the entry loading screen covers.

Built: `src/story.js` (`StorySystem` — `REGION_RADIUS_M = 2500`, entry state machine
`settling → warming → live`, routing freeze, boundary, Quick-Job surfacing; imports nothing,
coordinates via a `deps` adapter). `src/main.js` wires it (seed modal, `pm-story`→modal, Quick Job
button, `mp-quit`→`storySystem.exit()`, boundary tick in the loop), extracts `applyWorldSeed()`
shared with the debug seed field, makes `debouncedRebuildFull()` **awaitable** (entry must not
capture its region center until the reseed + reseat have settled, or the region centers on the old
position), adds the `pumpRegionWarm`/`releaseRegion` deps, and gates the loop's two road-stream calls
(`roadSystem.update` / `warmRoutes`) plus the Quick Job planner pre-warm on the freeze/entry flags.
`src/debug.js` adds `setDebugLockout()`. `index.html` adds the seed modal, the `#story-loading`
entry screen, and the corner button. `src/map2d.js` adds the **region boundary overlay** (owner
request: dimmed exterior + boundary ring + km label — the wall is invisible in-world until FEAT-28,
so the map is where it must be legible) and `setRadiusCap()` so the map builds out to the boundary
instead of stopping at `MAP_RADIUS_MAX = 2000` (safe in-mode: those rings are route-cache hits).

Build green; **all 40 gates green** (`npm run test:all`), including both invariance gates above.

`REGION_RADIUS_M` is a story-layer value and is **NOT** in `routeCacheSig` — changing it must not
invalidate the bundled route cache. Debug lockout also force-hides main.js's collision-sphere debug
(a second backtick handler), not just the lil-gui panel. Entry degrades honestly rather than hanging:
a settle or warm timeout logs and enters **unfrozen** (streaming still live) instead of stranding the
player on a loading screen. **POIs (below) + a region-anchored Quick Job planner (missions drawn from
the fixed region, not a player-centered window) are Phase 2**, built inside this sandbox next.

**Story-mode-only frame hitches — root-caused to a pre-existing dead memo (2026-07-26).** Owner
reported ~2 s-periodic frame loss in story mode, coinciding with chunk/prop pop-in, absent in free
roam. A CDP A/B of the same 40 s drive (free roam vs story mode, `window.__perfData` buckets) put it
in one bucket: **`frame.ribbon.flush` 93 ms → 584 ms**, i.e. **~42 ms per ribbon tile build vs 4.2 ms**
— everything else got *cheaper* in story mode, confirming the freeze works (`frame.road.update`
10.3 → 0.4 ms, `road.streamNetwork` 4.7 → 0).

Cause: `RoadSystem._detectJunctions()`'s memo was guarded on
`_junctionsFrom === _network && _junctions.size > 0`. **The size clause cannot distinguish "empty"
from "not computed"** — and under the shipped graph topology (QUAL-12) mid-span crossings are culled,
so zero crossings is the CORRECT and universal answer. The memo therefore never hit, and the full
O(runs × segs) broad+narrow phase re-ran on **every call**. `RoadMeshSystem._buildRoadTile` calls it
on **every ribbon tile build**, so the cost scaled with network size and story mode's 2800 m region
made a long-latent bug finally visible. Measured (node): **22.4 ms/call at r=320, 90.8 ms/call at
r=2800 → 0.00 ms after the fix**, cache hit in both.

Fix: key the memo on `_networkRev`, the same key every other cache in `road.js` uses
(`_hintCache` / `_cellCands` / `_nodeJunctionsRev` / `_chordCostMemo`); `_junctionsFrom` → `_junctionsRev`.
The two explicit invalidation sites are preserved (re-stream, and post-cull — the cull deletes from
`_network` without bumping the rev, so it must invalidate by hand). **This fixes free roam too** —
it was paying 22 ms per ribbon tile all along.

Post-fix A/B: `frame.ribbon.flush` **584 → 6.9 ms** in story mode (93 → 12.6 ms in free roam);
story-mode frames >32 ms **14 → 4**, >50 ms **8 → 1**; every bucket now story ≤ free roam.

Gate gap closed: `test/crossing-classifier.mjs` claimed to cover "once-per-build identity" but its
assertion (`j1 === j2`) is trivially true — `_detectJunctions` returns the same Map it mutates in
place — and its fixture deliberately runs with the cull OFF, so it only ever saw the non-empty case.
Added check **(c) ONCE-PER-BUILD-IDENTITY-WHEN-EMPTY**, which keys on `_crossingList` (reassigned on
every recompute, so it actually detects one) against a never-streamed RoadSystem. Verified it FAILS
against the old guard and passes against the fix.

Also added `window.__story` under `?prof=1`, so the external profiler can measure inside the mode
rather than only ever profiling free roam.

**Open:** verify the bundled seed-6 route cache (`data/route-cache-default.json.gz`) actually covers
a 2800 m warm radius. It is radius-agnostic (`routeCacheSig` excludes radius) but its *coverage* is
whatever the bake script warmed — if it falls short, seed 6 pays a one-time warm behind the loading
screen like any other seed, and re-baking it is the fix.

## Summary

Split the current single "story mode" surface into two distinct things:

1. **Quick Job** — a rename of *everything that exists today* under the "story mode" label
   (the `src/mission.js` beta mission generator, its pause-menu button `pm-story`, the map
   offer/accept/regenerate flow, the `#mission-panel` / `#mission-hud` UI). It keeps its current
   behaviour: the planner streams a ~4×4 km network **around the player**, re-streaming as they
   drift (`PLAN_RESTREAM_MOVE`), and rolls A→B legs inside that moving window. This is a testing
   harness for the par economy, not the real gamemode — the rename makes that honest.

2. **Story Mode (new gamemode)** — a genuinely separate mode selected from the main menu that
   **loads one fixed map region ONCE** and lives entirely inside it:
   - The playable region is streamed a single time at mode entry and then **frozen** — no
     re-streaming as the player moves, no router calls after load.
   - **Road router and terrain/road streaming are fully disabled** while in this mode. Expect a
     **small perf win** from removing routing + streaming work from the frame/idle budget.
   - **Barriers** bound the region (future: FEAT-28 trail-closed barriers — the diegetic region
     wall, SM-INV-13). Initially a hard boundary is fine; the barrier art/mechanic lands with
     FEAT-28.
   - Missions inside it draw from the **whole fixed region** (this is the natural home for
     "Lever 3" from the 2026-07-23 discussion — a stable, fully-drivable bounded area the player
     learns, which is exactly the region-bounded framing in DESIGN.md "Game modes").

## Why

Quick Job's moving-window planner gives good *breadth of roads near you* but the area chases the
player, so it can never be a stable, fully-explored place. Story Mode wants the opposite: a bounded
region loaded once, drivable end-to-end, with barriers and progression. Disabling the router and
streaming inside a fixed region is both a correctness simplification (no window-variance, no cull
churn, no re-stream hitches) and a performance win.

This also cleanly separates the *testing harness* (Quick Job) from the *shipping gamemode* (Story
Mode), so the harness can stay a harness (regenerate, retry, teleport — all testing affordances)
while Story Mode gets no-do-overs discipline.

## Points of interest (Story Mode's mission source, placeholder art)

Story Mode should place a set of **points of interest (POIs)** within the fixed region — placeholder
visual is a **translucent cube** for now (real art comes later). These are the seed of the real
mission-giving mechanic:

- Driving up to a POI and pressing a key **receives a mission** that starts from that POI (start point
  = the POI's location; this is the first concrete "walk up and get a job" interaction, standing in for
  NPCs/mission-givers before any of that exists).
- **Quick Job stays anywhere-to-anywhere.** The existing "quick mission" button must keep placing
  start+end anywhere on the map, independent of POIs — POIs are an *additional*, location-gated way to
  get a mission inside Story Mode, not a replacement for the free placement Quick Job already does.
- This is explicitly a **stepping stone toward real story mode**: POI placeholders here are the first
  piece of the eventual mission-giver / POI system (FEAT-21's road POI scatter is the fuller version —
  siting, variety, story-region tie-ins). Keep this v1 simple (placeholder cubes, deterministic
  placement within the fixed region) rather than pulling FEAT-21 forward.

### Acceptance additions (POIs)

- [ ] A small number of POIs (translucent cube placeholder mesh) are placed within the fixed Story
      Mode region, deterministically (same region → same POIs).
- [ ] Driving within interaction range of a POI and pressing a key triggers mission generation with
      that POI's location as the mission start point.
- [ ] The Quick Job / quick-mission flow is unaffected — it can still place start and end anywhere in
      the region, with or without POIs present.
- [ ] POI placement and the interact-to-start-mission flow are scoped to Story Mode only (Quick Job /
      Free Roam behaviour unchanged).

## Design constraints (from .planning/story-mode/DESIGN.md — read before building)

- **SM-INV-12** — worldgen stays a pure fn of `(worldSeed, metaState, coords)`. A fixed region is
  a *bounded slice* of the same deterministic world, not a separate generator. Freezing the stream
  must not change what any tile generates — it just stops streaming *new* tiles.
- **SM-INV-13** — region locks are diegetic (trail-closed barriers, FEAT-28), not menu walls. The
  hard boundary here is a placeholder until FEAT-28's barrier lands.
- **"Game modes" section** — Story Mode locks out debug tooling / fixes sliders; Free Roam keeps
  the infinite streaming world. Extend the existing `window.__setGameMode` seam rather than adding
  a second mode mechanism.
- Story Mode has **no do-overs** (regenerate/retry are Quick Job testing affordances only).

## Acceptance

- [ ] Main menu (or mode selector) offers **Quick Job**, **Story Mode**, and **Free Roam** as
      distinct entries; the old "story mode" label/button is gone (renamed to Quick Job everywhere:
      button id, panel copy, any code identifiers where cheap).
- [ ] Entering **Story Mode** streams one fixed region once, then **no further router or streaming
      work occurs** while in the mode (verifiable: no `arcPrimitiveConnect` / no terrain-worker
      stream messages after load).
- [ ] A measurable (even if small) frame/idle-budget improvement in Story Mode vs Free Roam over
      the same region, attributable to routing+streaming being off (PERF-08 harness or a simple
      before/after trace).
- [ ] The region is bounded — the player cannot drive out of it (hard boundary acceptable pre-FEAT-28).
- [ ] Missions/quick-jobs generated inside Story Mode draw from the **whole fixed region**, not a
      moving window (this is the Lever-3 stable-area behaviour).
- [ ] Quick Job behaviour is unchanged by the rename (moving-window planner, accept/regenerate/retry).
- [ ] Debug tooling locked out in Story Mode per the "Game modes" ratification.

## Notes / open

- **Region size vs load time**: the fixed region is a one-off cold load, amortized across the whole
  session, so it can afford to be larger than Quick Job's 1400 m planner radius. Pick a size that
  is a satisfying play area without a punishing cold load — tune against the PERF-08 harness.
- Where the fixed region is anchored (spawn point? a designated region tile? seed-derived?) ties
  into FEAT-28's discrete-macro-tile region model — coordinate the two.
- Barrier art/mechanic is explicitly **out of scope here** and lands with FEAT-28; a hard invisible
  wall is the placeholder.
- Prerequisite/adjacent: `feat-game-menus-ui.md` (the main-menu surface this mode selector lives in).

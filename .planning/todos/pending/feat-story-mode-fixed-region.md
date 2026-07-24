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
  src/road-worker.js), story-mode DESIGN.md ("Game modes", SM-INV-12/13)
---

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

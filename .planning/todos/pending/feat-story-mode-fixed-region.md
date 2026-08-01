---
id: FEAT-43
type: feature
status: open
opened: 2026-07-23
rescoped: 2026-07-27
severity: minor
source: user-request
relates_to: >
  src/story.js (StorySystem — the mode this ticket now only has leftovers on),
  src/mission.js (Quick Job — region-anchored planner, done),
  FEAT-28 region-gated connectivity (feat-region-gated-connectivity.md — the diegetic barrier that
  replaces today's invisible wall), FEAT-41 game menus (feat-game-menus-ui.md — the mode selector),
  FEAT-21 (road POI scatter — the fuller POI system this ticket's placeholder cubes precede)
---

# FEAT-43: Story mode fixed region — remaining slices

**Phase 1 shipped and is on main** (`272e7ce` story-mode sandbox → `0597190` merge, plus
`f3e4be0` region-confined Quick Job and the PERF-26 route-cache split). The worktree is gone.
The full implementation record — freeze design, the routing-vs-terrain cost table, the
`_detectJunctions` dead-memo root cause, the route-cache coverage miss, the Quick Job escape fix —
lives in this file's git history (through `f66149a`) and in `.planning/story-mode/`.

What works today: seed-prompt entry behind a loading screen, whole-region pre-route then a frozen
router (`isRoutingFrozen()`), terrain/props/water still streaming, a hard circular wall at
`REGION_RADIUS_M = 2500`, Quick Job anchored on the region centre with every roll confined inside
the wall (gated: `mission-network` §6), and a measured frame-budget win vs free roam in every
bucket. Gates green, `route-bundle-parity` covers the region warm band.

Three slices are left.

## 1. POIs — the mission source inside the region (the real remaining feature)

Placeholder art, deterministic placement, driving up to one and pressing a key gives you a mission
that *starts there*. This is the first "walk up and get a job" interaction, standing in for NPCs
before any of that exists — and the stepping stone to FEAT-21's fuller siting/variety system. Keep
v1 dumb: translucent cubes, seed-derived positions inside the region, no variety pass.

Quick Job stays anywhere-to-anywhere: POIs are an *additional*, location-gated way to get a
mission, never a replacement for the free placement Quick Job already does.

- [ ] A small number of POIs (translucent cube placeholder mesh) placed within the region,
      deterministically — same seed + region → same POIs.
- [ ] Driving within interaction range and pressing a key generates a mission with that POI's
      location as the start point.
- [ ] Quick Job / quick-mission flow unaffected — still places start and end anywhere in the
      region, with or without POIs present.
- [ ] Scoped to story mode only; free roam behaviour unchanged.

## 2. Close the sandbox up (two flags, when it stops being a sandbox)

Teleport and debug tooling are deliberately ON in story mode right now — they are how you inspect
what the frozen region built (owner request 2026-07-26). The lockout mechanism stays fully wired,
so re-closing is exactly two changes:

- [ ] `DEBUG_LOCKOUT = false` → `true` in `src/story.js`.
- [ ] `isTeleportEnabled()` stops admitting `'story'` (`src/main.js`). Note `notifyTeleport()`
      exists because the wall would otherwise clamp the truck straight back — keep that seam, the
      Quick Job path uses the same disarm.

Do this when the mode stops being a construction sandbox, not before. DESIGN.md "Game modes" is
the standing intent; story mode has no do-overs.

## 3. Blocked on other tickets (tracked here, built there)

- [ ] **Mode selector** — "main menu offers Quick Job / Story Mode / Free Roam as distinct
      entries" needs a menu layer to live in. Today entry is the `#story-seed-modal` off the pause
      menu, which is the deliberate placeholder. → **FEAT-41**.
- [ ] **Diegetic boundary** — today's wall is an invisible clamp, legible only as the map overlay
      ring. The trail-closed barrier (SM-INV-13) lands with → **FEAT-28**, which also owns the
      macro-tile region model that should eventually decide where a region is *anchored* (today:
      the seed spawn).
- [ ] **Confinement must become the UNLOCKED SET, not the current region** [2026-08-01]. DESIGN.md
      "Run shape and saving" ratified that a region is a progression **chapter** and the play space is
      **cumulative** — later missions may start in region 1 and end in region 4. Two things here are
      built on the single-region assumption and will need to widen: the `REGION_RADIUS_M` wall
      (becomes the union of unlocked regions — FEAT-28's macro tiles), and **`_roll()`'s
      region-confinement guards in `src/mission.js`** (FEAT-43 fix 1), which today pin both mission
      endpoints inside the one active region. Cross-region missions do not work until both do.

## Design constraints (unchanged — read before building)

- **SM-INV-12** — worldgen stays a pure fn of **`(worldSeed, coords)`** *(corrected 2026-08-01: the
  2026-07-16 `metaState` widening was REVERTED on 2026-07-29 — no meta-progression input reaches
  worldgen. Run-layer world state is `(worldSeed, runState, coords)`.)* The region is a
  bounded slice of the same deterministic world; freezing the stream must not change what any tile
  generates.
- **SM-INV-13** — region locks are diegetic, not menu walls. Today's hard boundary is a placeholder.
- Story mode locks out debug tooling and fixes sliders; extend the existing `window.__setGameMode`
  seam rather than adding a second mode mechanism.
- `REGION_RADIUS_M` is a story-layer value and must stay **out of** `routeCacheSig` — changing it
  must not invalidate a baked route cache. `REGION_WARM_RADIUS_M` is exported for the bake target;
  the bake derives from it, so do not re-introduce a literal.

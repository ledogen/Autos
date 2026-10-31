---
id: FEAT-156
type: feature
status: open
severity: minor
opened: 2026-10-30
source: owner, 2026-10-30 — "story mode > new game. new slider above difficulty called game mode. options are story, free roam and the respective submenus move under that slider within free roam. this means free roam gets difficulty / relief sliders. scenarios level select will be under new game as well. testing lab should move under scenarios. main menu will then only have continue (conditional), new game and settings."
relates: FEAT-41 (main menu + run setup page), FEAT-42 (continue), FEAT-62 (scenarios), FEAT-125 (menu-nav.js), index.html #mm-root / #mm-setup-panel / #mm-scenarios-panel, src/main.js SELECTORS / _openSetup / _renderSelectors, src/settings.js
---
lane: Spare

# FEAT-156: Main menu = continue · new game · settings; game mode is a selector on the new-game page

## What the owner wants

Today's root menu is six buttons: continue (only while a run is saved), story mode, free roam,
scenarios, testing lab, settings. Story mode and free roam each open the same setup page
(`_openSetup('story' | 'freeroam')`, title "new game" / "new free roam"), scenarios opens its own
list panel, testing lab enters directly.

Target:

- **Root menu: continue (conditional) · new game · settings.** Nothing else.
- **New game page gets a "game mode" selector row ABOVE difficulty**: `story` · `free roam` ·
  `scenarios`. The rows below it are the chosen mode's:
  - **story** — what the page shows today (world: seed/code, difficulty, terrain, poi, roads, the
    save warning; truck: gearbox).
  - **free roam** — the same world and truck rows ("free roam gets difficulty / relief sliders").
  - **scenarios** — the scenario level list (today's `#mm-scenarios-panel` content), and the
    **testing lab** as an entry in that list (it is a scenario-shaped thing: a fixed world, no run).
- Start / back stay the page's first items (owner 2026-10-21: "just press start" lands the highlight
  on start).

## Where to look

- `index.html` `#mm-root` buttons; `#mm-setup-panel` (the selector rows are `button.mm-sel` with a
  `data-key` into `src/settings.js`; `SELECTORS` in main.js is the option table); `#mm-scenarios-panel`.
- `src/main.js` `_openSetup`, `_startFromSetup` (branches on `_setupMode`), `_renderSelectors`, the
  `mm-story` / `mm-freeroam` / `mm-scenarios` / `mm-lab` click wiring (~1500–1610), `_gameMode`.
- `src/menu-nav.js` — the pad / keyboard walk over the visible items; a selector row that swaps the
  rows below it must re-collect items.
- The game-mode choice is a run setting like the others: a `settings.js` key so the page reopens on
  the last mode. **RULED (owner, 2026-10-31): it does NOT persist.** The selector always opens on story;
  its order is **story · scenarios · free roam · testing lab** (lab is the last option, under scenarios).
- The save warning (`#su-save-note`) shows only for mode story while a run is saved.

## Acceptance

- [ ] Root menu shows continue (conditional), new game, settings — and nothing else.
- [ ] New game: a game-mode selector above difficulty; story / free roam share the world + truck rows;
      scenarios shows the level list with the testing lab in it; start launches the chosen mode.
- [ ] Pad and keyboard navigation (menu-nav) walk the new page correctly, including after the mode
      row swaps the rows below it.
- [ ] cdp-smoke's menu transitions (story, lab, scenario steps) updated and green; run-save gate green.

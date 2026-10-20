---
id: FEAT-133
type: feature
status: in-progress
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "a virtual cursor in the map view that only shows up when you're using a controller and can be controlled with the right analog stick" + "lb/rb mapping to q/e for tab switching … menu controls have to be different"
relates: FEAT-125 (pad), FEAT-67 (map hover cards, Q / E offer paging), FEAT-126 (manual gearbox on A / X)
---

# FEAT-133: Pad on the map and the in-game cards — cursor, zoom, offer paging, card navigation

Built on `feature/map-cursor` (worktree `CarGame-map-cursor`).

- **Cursor** (`src/map2d.js` `_padStep` / `_drawPadCursor`): shown only while `pad.active`. It
  stays pinned at the sheet centre and the right stick pans the map under it at
  `PAD_PARAMS.mapPanRate` (600 px/s, debug slider; owner 2026-10-19: the cursor never travels the
  screen). It writes the mouse's own `_hoverX/_hoverY`, so hover cards and coordinates work
  unchanged. Real mouse motion takes the hover back.
- **Map pad layout** (`src/gamepad.js` `MAP_KEYS`): while the map is open, LB / RB = Q / E and
  A / X are silent. The offer card's keycaps read LB / RB when the pad is active.
- **Trigger zoom**: with the map open RT zooms in and LT zooms out about the cursor
  (`PAD_PARAMS.mapZoomRate`, 2 e-folds/s). The map holds the truck the way a menu does: the
  triggers and the stick drive nothing.
- **Camera**: the right stick no longer orbits the chase camera while the map is open (`camera.js`).
- **Cards** (`src/menu-nav.js` `cardContainer`): the offer / result card, the paper route, the
  scenario finish, camp, the fuel recovery card, the inventory and the damage screen are
  navigated like the menus. The D-pad moves a highlight, A presses it, and B is Escape (closes
  the inventory and damage screens). X goes silent. Unlike a menu the truck still drives.
  Directional moves are now SPATIAL (nearest item that way), so button rows and the inventory
  grid work. The inventory's slot divs are navigable. A dialogue card on top still owns every key.
- **Pad paper throw** (owner, 2026-10-19: B + right stick share a thumb; "a lot of houses are at
  turnaround points", so the handbrake must stay usable while aiming). On a RUNNING paper route,
  above 5 mph or within 30 m of a house still owed a paper (`pad.canThrow`, main.js), the right
  stick aims at the ordinary `orbitRate` (owner 2026-10-19: one rate only, so the orbit default
  dropped 20 %, 2.5 → 2.0 rad/s), and the reticle is up while it steers the view.
  In that state gamepad.js holds an RB press back: released under `throwTapMs` (200 ms) it
  throws (F down + up, main.js's own throw path); held past that it is the handbrake from that
  moment. Otherwise RB is the handbrake at once, so there is no added latency off the aim. B hold
  still aims anywhere (free-roam practice). Owner's known risk: a hesitant player who aims and
  then HOLDS RB, expecting a throw on release, gets a handbrake slide instead. Play-test it.
- **Q / E stop at the map** (a window capture listener plus `stopPropagation`), so paging offers
  no longer shifts a manual gearbox. Applies to the keyboard too.

## Acceptance
- [x] `test/pad-e2e.mjs`: cursor at centre, stick pans the map with the cursor fixed, LB / RB → Q / E, A silent,
      no Q / E reaches the gearbox.
- [x] `test/pad-e2e.mjs`: RT/LT zoom and no throttle on the map, no camera orbit behind it, D-pad
      highlight inside the inventory, B closes it, B-hold aims / release throws a paper.
- [x] One-off probe: story mode, park with RB, D-pad to "accept mission", A → the job starts.
- [x] `test/pad-e2e.mjs`: with throwReady forced on, an RB tap sends F and no Space; a hold sends Space and no F.
- [ ] Not proven on a live route: a headless probe could not get Larry's offer to open (the same on main).
- [ ] Owner play-test on a real pad: cursor speed, hovering a POI, paging its offers, the RB tap/hold split and orbitRate on a route.

## Not done
- A card's first D-pad press highlights its FIRST item (the menus' rule), not its main action.

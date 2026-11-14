---
id: FEAT-211
type: feature
status: in-progress
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — the map spec pasted in chat, part 2 ("Layout / UI / POIs / Missions … The map should not take up the entire screen edge to edge … a list of destinations and their details on the right side")
relates: FEAT-210 (the symbols), FEAT-133 (the map's pad cursor), FEAT-67 (offer board, mission cards), FEAT-104 / FEAT-137 (shop stock and its timers), FEAT-209 (pump prices), FEAT-208 (phone calls would later hide this information), PERF-46, src/map2d.js
---
lane: Spare

# FEAT-211: The map as a window — 80 % of the screen, a Missions / Shopping list beside it, live tracking

## Next steps
Landing 1 (window, tracking, edge marker, Missions list) is built on feature/spare and waits on its landing + the owner's
look. Next (Spare lane): landing 2, the Shopping list (bumpers swap the tabs, A expands a vendor), then landing 3, the waypoint.

## Summary
The map stops covering the whole screen. It becomes a window over the live game, with a list on its right that has two modes: Missions and Shopping. Opening it centres on the truck and follows it. The player can pan freely at any point, including from a place the list just showed.

## Description
### Window
- The map window takes about **80 %** of the screen; the live game shows around it. The 3D view behind it need not render at full cost (keep the saving the full-screen map has today).
- Inside the window the map runs edge to edge, and a **list of destinations** sits on the right side.
- **Opens centred on the truck and tracks it** in real time.
- **Edge indicator:** when the truck is outside the visible map (panned or zoomed away), a marker on the window's edge points to it.

### The list: two modes, swapped with the bumpers
**Missions** — the POIs offering a mission now, nearest first.
- A row shows the POI's name, its distance and the colour codes of its mission types.
- Moving through the rows (or hovering with the mouse) pans the map to that POI and shows its mission card.
- Left / right flips between the missions on offer at that POI, straight from the list.

**Shopping** — every POI that sells, gas pumps included, nearest first.
- Vendors with no stock are listed too. Every vendor shows its "new stock in…" timer.
- Hovering snaps the map to the place. Selecting a vendor **expands its items in line**: basic price only (no service or fitting fees), part condition, flavour text, the item's expiry timer. If a row cannot hold all of that, hovering or selecting the item expands it.
- A gas pump shows its price and does not expand. A gas station shows its price **and** expands to its items.
- Selecting an expanded header again collapses it.

### Free panning from anywhere
At any point in either list, **B** drops out of the list and the player pans the map **from where it is**, to find the truck or look around the place the list just showed.

### Control scheme (the orchestrator's recommendation; the owner asked for "the right answer")
The owner's nearest reference is GTA V: the stick pans, the D-pad works the list, neither needs a mode switch.
| Input | Does |
|---|---|
| Left stick / WASD / click-drag | pans the map. The first push stops the truck-tracking. |
| D-pad up / down (mouse: hover a row) | moves through the list; the map snaps to the row's place |
| D-pad left / right | flips the mission cards at the highlighted POI |
| A (mouse: click) | Shopping: expands or collapses the highlighted vendor |
| Bumpers | Missions ↔ Shopping |
| B | first press: collapse the open vendor, or leave the list (the highlight clears, the map stays where it is, the stick pans from there). Second press: closes the map. |
| Stick click (key: a "centre" key) | back to centred on the truck and tracking |
This has no separate "map tab" and no select step: the map is always live under the list, the stick always pans, the D-pad always means the list. The bumper conflict goes away because the cards use D-pad left / right. Mouse and keyboard do not mirror the pad one to one (owner: a mouse is flexible enough).

## Tracker
- [x] Map window at ~80 % with the game behind it, at no more render cost than today's map (the world behind is the frame from the moment the map opened: see Description)
- [x] Opens centred on the truck and tracks it; any pan input releases the tracking; one input restores it
- [x] Edge indicator for the truck when it is off the visible map
- [x] Missions list: name, distance, type colours; highlight pans the map and shows the card; left / right flips cards
- [ ] Shopping list: all vendors and pumps, stock timers, in-line expansion with price, condition, flavour text, expiry
- [ ] Pump rows show the price and do not expand; gas stations do both
- [x] B leaves the list and the map pans from there
- [ ] Custom waypoint: Y on the pad (click / Enter with nothing highlighted) drops a waypoint at the map's centre or cursor and the game routes to it like a job's destination; the same input on the waypoint clears it
- [ ] Pad, keyboard and mouse all reach everything; pad-e2e covers the list

### Built, landing 1 (Spare lane, 2026-11-13)
- **The window** (`#map-window`, index.html): 10 % of the screen in from each edge, so 80 % of the width and the height. The sheet
  fills it left of a 300 px list column; the column holds the list (with the day clock in its head) over the legend.
- **The world behind** is the frame drawn the moment the map opened, dimmed by the window's shadow. main.js already skipped the 3D
  render while the map was open (PERF-38), and a WebGL canvas keeps showing its last frame, so the window costs no 3D at all: the
  same as the full-screen map. A MOVING world behind would cost the 3D frame's GPU bill times the rate drawn (every 4th frame =
  a quarter of it). Not built: an owner call.
- **Map canvas** is smaller than before: at the owner's 1045 × 700 window, 536 × 560 css px against 1045 × 700, about 41 % of the
  pixels blitted per frame.
- **Measured** (PERF-40 bench, A = this branch, B = main, seed 1768572700, A-B-A-B, 4/4 sessions valid; the owner was using
  the Mac, so read the work units, not ms): the map phase costs **580 vs 617 million main-thread instructions/s (−6 %)** and
  **35 vs 65 GPU Mcycles/s (about half)**, both outside the noise band; drive and park phases unchanged within noise.
  Log: `wip/feat-211/bench.log` in the Spare worktree.
- **The legend** moved out of the sheet's bottom-left corner (where it covered POIs) into the foot of the list column, on its own
  canvas painted on a resize, never per frame.
- **Run HUD:** the window covers the top-right HUD on a small screen, so the list head repeats the day clock (the reason the HUD
  used to lift over the map, owner 2026-10-15). The HUD no longer lifts to z 91.
- **Controls, as approved:** left stick / WASD / drag pan (and let go of the tracking); D-pad ↑/↓ or arrows walk the list (mouse:
  hover a row), the map snaps to the row's place and its card shows; D-pad ←/→ or arrows flip the offers; B / Esc leaves the
  list (map stays put), a second B closes; left stick click or `c` centres and tracks again. Q / E (LB / RB) still flip offers
  until landing 2 gives the bumpers to the tabs. A stays silent until landing 2 (vendor expand).
- Distances are straight-line from the truck, one decimal of a km. Rows are written to the DOM only when they read differently,
  at most four times a second.

## Decisions
- 2026-11-13, owner: the map takes about 80 % of the screen with the live game behind; a list on the right with Missions and Shopping modes swapped by bumpers; both sorted nearest first; opening always centres on the truck and tracks it; B from a list starts panning from there.
- 2026-11-13, owner (card feat211-controls): "build it like that" — the control scheme above is approved.
- 2026-11-13, owner: "one feature request. add a custom gps waypoint function. y on pad seems appropriate or maybe we can just use a/enter."

## Open questions
- The world behind the window: the frame from the moment the map opened [DEFAULT, zero 3D cost], or moving at a reduced rate
  (every Nth frame costs 1/N of the 3D frame's GPU bill)?
- At the owner's 1045 × 700 window the sheet is 536 × 560 px and an offer card covers its top half. Acceptable, or should the
  card move into the list column (under the highlighted row) when a row is picked?

## Links
Screenshots: `wip/feat-211/` in the Spare worktree (`shots.mjs` makes them).

## Files
`src/map2d.js` · `src/main.js` · `src/gamepad.js` · `index.html` · `test/pad-e2e.mjs` · `test/cdp-smoke.mjs`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.
- 2026-11-13: landing 1 built by the Spare lane (window, tracking, edge marker, Missions list, legend in the column).

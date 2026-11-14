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

# FEAT-211: The map as a window — 90 % of the screen, a Missions / Shopping list beside it, live tracking

## Next steps
Landings 1–3 are on main; landing 4 (the owner's 11-14 look: 90 %, live world, bigger card, arrows on the cards) is built on
land/feat-211d. Then the ticket closes on the waypoint's [DEFAULT]s (Open questions).

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
- [x] Shopping list: all vendors and pumps, stock timers, in-line expansion with price, condition, flavour text, expiry
- [x] Pump rows show the price and do not expand; gas stations do both
- [x] B leaves the list and the map pans from there
- [x] Custom waypoint: Y on the pad (click / Enter with nothing highlighted) drops a waypoint at the map's centre or cursor and the game routes to it like a job's destination; the same input on the waypoint clears it
- [x] Pad, keyboard and mouse all reach everything; pad-e2e covers the list (both lists and the waypoint)

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

### Built, landing 2 (Spare lane, 2026-11-13)
- **Tabs:** the list head reads MISSIONS SHOPPING, the one showing in the story accent. LB / RB (Q / E) swap them, and so does a
  click on a tab. A swap clears the highlight and leaves the map where it is. While a card is up over the map (the parked offer
  panel) the bumpers still page that card's offers. The tab is kept between opens [DEFAULT].
- **Shopping rows**, nearest first: every POI that sells (`SHOP_TYPES`: auto shop, general store, gas station, food vendor) and
  every POI with pump zones (gas pump, gas station), stocked or not. A row is the name and distance, then a dim line: the pump
  price (`$x.xx/gal`, the price the pump would lock now: day tier × FEAT-209's station factor, `_pumpPrice` in main.js, shared
  with the pump) and the shelf's "new stock in…" (R-24's `nextStockH`). A storefront that only sells its always-rows has no
  timer (nothing new ever lands there). A ▸ marks a row that opens.
- **A (Enter, click)** opens a shop's items in line, under its header: name and price (the shelf price × the day tier, no
  fitting or labour), the condition bar (damage-screen's bands) with new / used, "gone in…" or "always in stock", and the
  flavour text (the part's or item's `desc`), wrapped whole. So every row holds everything and no item needs a second expand.
  Each item is a row of its own, so the D-pad walks through a long shelf. A on the open header closes it; a pump does not open.
  One shop is open at a time.
- **B (Esc):** closes the open shop (the highlight goes back to its header), else leaves the list, else closes the map. A pan
  input leaves the list and closes the shop with it.
- A Shopping highlight snaps the map to the place but shows no mission card (the place is the subject).
- pad-e2e covers it on a stubbed board: RB to Shopping, A on a pump opens nothing, A opens a shop, the D-pad walks onto its items,
  B closes it, A twice opens and closes, B leaves, LB back.

### Built, landing 4 (Spare lane, 2026-11-14, the owner's feat211-look + inbox)
- **90 %:** `#map-window` sits 5 % in from each edge.
- **Live world behind:** main.js renders the 3D scene every frame with the map open (PERF-38's skip is reversed, DEC-175).
  The window covers 81 % of the screen, and the GPU still draws those covered pixels (no cut-out): at full rate the map
  costs what driving costs, as the owner expected.
- **The card had shrunk** because its scale `k` was bound by 46 % of the sheet's WIDTH: full screen that gave k 1.41, but the
  sheet now shares the window with the 300 px list, so k fell to its floor of 1. The width share is now 75 %, which gives
  k 1.41 again at the owner's 1045 x 700 (the old full-screen size; the card's height is about half the sheet).
- **Arrows on the cards:** the map card's keycaps read ← → (keys and D-pad alike); ←/→ already flipped the map's cards and
  Q / E (LB / RB) are the tabs. At a POI the parked offer panel keeps Q / E: its arrows move the panel's own highlight, and
  the map draws no hover card while parked there (hoverLocked), so the two never meet.
- Screenshots: `wip/feat-211/before-s482913-list-pick.png` (landing 1) and `after-s482913-2-list-pick.png` (this landing).

### Built, landing 3 (Spare lane, 2026-11-13)
- **Input.** Pad **Y** (MAP_KEYS sends `n`, so Y no longer holds the ignition behind the map), key **N**, **Enter / pad A with
  nothing highlighted**, or a **click** on the sheet (a press that moves under 4 px) drops the waypoint under the cursor: the
  mouse's, or the pad's at the sheet centre, so with a list row highlighted it lands on that row's place. The same input within
  16 px of the pin clears it. One waypoint: a new drop moves it. A on a highlighted shop still opens the shop. A double-click
  (the teleport) is two clicks that cancel out. Story runs only; refused while a dialogue holds the screen (it keeps its Enter).
- **Where it lands:** snapped to the nearest road within 2 km (`roadOrigin`, now with a radius), so the pin and the line's end
  are one point. A drop that plans no line (outside the wall) does nothing.
- **Guidance, nothing new:** the line is the evening's planner (`planOffer` to a one-stop destination from the truck's road
  point), shown by the same in-world GPS (chevrons, junction arrow, the ring), re-planned from the truck when it strays (BUG-118's
  `_tutDetourTick`), with the evening's HUD line: "1.12 km to the waypoint" (crow-flies, PLACEHOLDER words).
- **A job always wins:** on a job, a paper round or the evening, the GPS and the HUD are the job's, and the waypoint is only its
  pin on the map, drawn under the job's line and pins. Back off the job, it guides again.
- **On the map:** a blue map pin (a shape no POI or job pin uses) lettered "Waypoint", and while it guides, its line: the job
  line's blue at about half the weight, dashed. No legend row: the pin is lettered, and a row would take the list's room.
- **Player state for the run:** saved (`waypoint: { x, z }`; re-snapped and re-planned from the seated truck on resume), cleared
  on arrival within 28 m (mission.js ARRIVE_RADIUS, a job's "you're there") and by a new run.
- Checked: `wip/feat-211/wp-shots.mjs` in a real story run (drop, GPS line end on the pin, HUD line, save & resume, N on the pin
  clears, arrival clears), pad-e2e (Y drops at the centre with the ignition untouched, Y on the pin clears, A with nothing
  highlighted drops, A on a shop opens it).

## Decisions
- 2026-11-13, owner: the map takes about 80 % of the screen with the live game behind; a list on the right with Missions and Shopping modes swapped by bumpers; both sorted nearest first; opening always centres on the truck and tracks it; B from a list starts panning from there.
- 2026-11-13, owner (card feat211-controls): "build it like that" — the control scheme above is approved.
- 2026-11-13, owner: "one feature request. add a custom gps waypoint function. y on pad seems appropriate or maybe we can just use a/enter."
- 2026-11-14, owner (feat211-look): "90% window. Make the background live." Inbox: "replace q/e on the mission cards on the
  map with left/right arrows. q/e are the tabs now. dont forget the visual on the card too." (DEC-175, superseding DEC-132.)
- 2026-11-13, orchestrator (landing 3) [DEFAULT]: Y, and A / Enter with nothing highlighted, both drop it; a job's guidance always
  wins over the waypoint's; arrival radius 28 m.

## Open questions
- The waypoint's [DEFAULT]s, unruled: (1) A / Enter with nothing highlighted also drops it, alongside Y / N; (2) a job's
  guidance always wins (the waypoint is then a pin only); (3) arrival clears it at 28 m; (4) the HUD words "1.12 km to the
  waypoint"; (5) no legend row (the pin is lettered).
- At the POI the parked offer panel still pages with Q / E (LB / RB), its own buttons reading "‹ Q" / "E ›". Keep that, or
  move it to the arrows too (they would then stop moving the panel's highlight left / right)?

## Links
Screenshots: `wip/feat-211/` in the Spare worktree (`shots.mjs` makes them).

## Files
`src/map2d.js` · `src/main.js` · `src/gamepad.js` · `src/paper-route.js` · `index.html` · `test/pad-e2e.mjs` · `test/cdp-smoke.mjs`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.
- 2026-11-13: landing 1 built by the Spare lane (window, tracking, edge marker, Missions list, legend in the column).
- 2026-11-13: landing 2 built by the Spare lane (the Shopping list, the tabs, A opens a shop in line).
- 2026-11-13: landing 3 built by the Spare lane (the custom waypoint).
- 2026-11-14: landing 4 built by the Spare lane (90 %, live world, card size, arrows on the cards).

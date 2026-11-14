---
id: FEAT-211
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — the map spec pasted in chat, part 2 ("Layout / UI / POIs / Missions … The map should not take up the entire screen edge to edge … a list of destinations and their details on the right side")
relates: FEAT-210 (the symbols), FEAT-133 (the map's pad cursor), FEAT-67 (offer board, mission cards), FEAT-104 / FEAT-137 (shop stock and its timers), FEAT-209 (pump prices), FEAT-208 (phone calls would later hide this information), PERF-46, src/map2d.js
---
lane: A

# FEAT-211: The map as a window — 80 % of the screen, a Missions / Shopping list beside it, live tracking

## Next steps
Owner rules on the control scheme (owed card `feat211-controls`: one recommended scheme, approve or change). Lane A builds after that, and after FEAT-210.

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
- [ ] Map window at ~80 % with the game live behind it, at no more render cost than today's map
- [ ] Opens centred on the truck and tracks it; any pan input releases the tracking; one input restores it
- [ ] Edge indicator for the truck when it is off the visible map
- [ ] Missions list: name, distance, type colours; highlight pans the map and shows the card; left / right flips cards
- [ ] Shopping list: all vendors and pumps, stock timers, in-line expansion with price, condition, flavour text, expiry
- [ ] Pump rows show the price and do not expand; gas stations do both
- [ ] B leaves the list and the map pans from there
- [ ] Pad, keyboard and mouse all reach everything; pad-e2e covers the list

## Decisions
- 2026-11-13, owner: the map takes about 80 % of the screen with the live game behind; a list on the right with Missions and Shopping modes swapped by bumpers; both sorted nearest first; opening always centres on the truck and tracks it; B from a list starts panning from there.

## Open questions
- The control scheme above: approve or change (owed card `feat211-controls`).
- Are Missions and Shopping tabs (the recommendation, as written) or filters on one list?

## Files
`src/map2d.js` · `src/main.js` · `src/menu-nav.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.

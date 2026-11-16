---
id: FEAT-239
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "It bothers me slightly that switching between mission cards in the map view is done with the Left and right D-pad buttons but switching between mission cards at a POI is done with shoulder buttons. I think it should be kept consistent which ultimately means moving to shoulder buttons on the map view that displaces switching between shopping mode and mission mode. If we were to use dpad for the shopping versus mission mode in map view could we guarantee that we don't need the dpad to navigate a card that appears inside the map? what else can we do?"
relates: FEAT-133, FEAT-136, src/map2d.js, src/main.js
---
lane: Map batch (answer the question first)

# FEAT-239: Pad: switching mission cards is the same control on the map and at a POI

## Next steps
Built on `land/feat-239` (owner picked option 2). Ready to land. Owner look: a real pad on the map (not testable headless).

## Summary
Mission cards switch with D-pad left/right on the map but with the shoulder buttons at a POI. The owner wants one control, which points to shoulders on the map, displacing the shopping/missions switch there. Their question: if the D-pad took the shopping/missions switch on the map, can we guarantee no card inside the map ever needs the D-pad? What else can be done?

## Description

### How the pad decides what a button means (src/gamepad.js `poll`)
One layout is live at a time, by priority: **menu** (pause, main menu, seed modal) over **card** (an in-game card is up: offer panel, Larry's panel, service screen, inventory, damage, camp, recovery) over **map** (map open, no card) over **drive**. A card up over the open map therefore takes the buttons, never the map. The sticks are the one exception: with the map open the left stick pans and the right zooms even under a card, and the triggers are always the pedals.

### Every pad control, by place (today, on this branch)
Blank = silent there. "card" = menu-nav.js highlight walk: D-pad moves the highlight (and ← / → cycles a ◂ value ▸ selector or steps a slider), A presses it, B backs out.

| Control | Map open, no card (list + sheet) | Map's side panel (Missions / Shopping list) | Parked at a POI: offer card (mission-panel / paper-panel) | Service screen (shop; its "map" button opens the map over it) | Inventory / damage / camp / recovery card | Dialogue card over the map |
|---|---|---|---|---|---|---|
| D-pad ← / → | flip the offers of the hovered or highlighted POI | (same) | card: cycles a selector (haul size, Larry's route size) or steps a slider; else moves the highlight | card walk | card walk | map's (flip) |
| D-pad ↑ / ↓ | walk the list (nearest first), the sheet snaps to the row | walk the list | card highlight up / down | card walk | card walk | map's list walk |
| D-pad ↓ / ← / → as the owner's 11-03 actions (pick up, set spawn, reset) | dormant: MAP_KEYS deletes buttons 13, 14 (and 15 is only the drive layout's held reset) | dormant | dormant (CARD_KEYS deletes 12-15) | dormant | dormant | dormant |
| LB (4) | Missions / Shopping tab (= Q) | the tab switch | previous offer (= Q, `onCycle`) | previous tab (= Q) | previous tab where the card has tabs | silent |
| RB (5) | Missions / Shopping tab (= E) | the tab switch | next offer (= E) | next tab | next tab where the card has tabs | silent (tap = brake otherwise) |
| LT / RT | the truck's pedals, always | pedals | pedals | pedals | pedals | pedals |
| Left stick | pan the sheet | pan | steers (card layout keeps the sticks; map still pans if open) | steers / pans | steers | pan |
| Right stick | zoom (up in, down out) | zoom | zoom if map open | zoom if map open | zoom if map open | zoom |
| L3 (left click) | `c`: back on the truck, tracking | same | headlights (`l`) | headlights | headlights | `c` |
| R3 (right click) | `c`: also recentres (shares the camera key) | same | camera (`c`) | next viewpoint | camera | `c` |
| A | Enter: open / close the highlighted shop (FEAT-234: no longer the waypoint) | the same | press the highlighted button (first press places the highlight on the primary action) | press | press | advance the card |
| B | Esc: close the open shop, else leave the list, else close the map | the same | back (decline / close) | back | back (close) | silent |
| X | silent | silent | silent | silent | silent | silent |
| Y | `n`: drop / clear the waypoint (the one place Y is not the ignition) | the same | ignition hold (`i`) | ignition | ignition | `n` |
| Start | pause | pause | pause | pause | pause | pause |
| View | tap closes the map; hold 1 s resets the truck | same | tap = map; hold = reset | same | same | same |

Squaring with the owner's 2026-11-03 D-pad actions (↓ pick up, → reset, ← set spawn): they are the drive layout's only; the map and card layouts delete them, so no conflict exists today and none is created by any option.

Facts that cut across the table: (1) the only controls on the map that touch the D-pad are ← / → (flip offers) and ↑ / ↓ (walk the list); (2) the only controls on LB / RB are the tab switch on the map and the offer / tab step in a card, which is already the same keys (Q / E) in code: the map's own `_onKeyDown` sends Q / E to `onCycle` when a card is up and to `_swapTab` otherwise; (3) X is the only face button silent on the map; (4) L3 and R3 both recentre on the map (R3 through the camera's `c`), so neither is free.

### Can the D-pad be guaranteed free of cards inside the map?
No. Cards that can be up over the map and that use ← / → : the haul offer's size selector and Larry's route sizes (◂ ▸), the camp card's sleep slider, and the service screen (a full D-pad walk). The inventory and damage screens are D-pad walks too. What does hold is the priority rule above: while a card is up the pad speaks the card's keys and the map's D-pad meanings are dormant, so the two never fire together. So D-pad ← / → for the tab switch would be unambiguous, at the price that the switch is unreachable while a card is up (the card owns the pad). A tab switch with a card up is not a case today: the tabs sit in the map's side panel, which the offer card covers.

### Options
1. **Shoulders flip cards everywhere; D-pad ← / → become the tab switch (the owner's proposal).** Displaces: ← / → flipping on the map (moves to LB / RB, same as the POI card). D-pad free of cards? No, but the priority rule makes it unambiguous. Cost: the tab switch is dead while a card is up; two pairs of keys move (LB / RB from tabs to flips, ← / → from flips to tabs). Keyboard: Q / E flip, ← / → tabs, which breaks DEC-175's "arrows flip cards, Q / E the tabs" (a new ruling would replace it).
2. **Shoulders flip cards everywhere; the tab switch goes on X.** Displaces: nothing (X is silent on the map). The D-pad then keeps only ↑ / ↓ (list walk) and ← / → become spare. D-pad free of cards: still no guarantee, but the map no longer needs ← / → at all. Cost: all four face buttons used on the map (A shop, B back, X tab, Y waypoint); X is the manual gearbox's downshift on the drive layout, so the key is Q only by accident of the keyboard map. Keyboard: Q / E flip, and the tab needs a letter that is not taken (Tab, Z, X, V, C, M, N are).
3. **Remove the tabs: one list, nearest first, Missions and Shopping merged with a filter chip.** Displaces: the tab control entirely; LB / RB flip and ← / → become spare. Design change (the list is the owner's DEC-175 / FEAT-211 shape), not a control swap.
4. **Leave it and make the POI card match the map: D-pad ← / → flips offers on the card too.** Displaces: the card's selectors (haul size ◂ ▸, Larry's sizes), which then need another control. Not recommended: the card's D-pad is its highlight walk, and a ◂ ▸ selector cannot share ← / → with an offer flip.

### Recommendation
Option 2. It is the only one that moves a single control (the tab switch) onto a button that is silent today, keeps LB / RB as "page the cards" in both places, and leaves the whole D-pad to the list walk and to cards, so the "can the D-pad be guaranteed free" question stops mattering. Option 1 is the owner's own proposal and also works, because the card layout always outranks the map's; its price is moving two pairs of controls and a new ruling on the keyboard. Either way, the keyboard needs a decision (Q / E for the flip, and a key for the tab), and a DEC supersedes DEC-175.

## Tracker
- [x] Facts: every control used on the map and inside each card that can open in it (Description)
- [x] Options card for the owner (answered 2026-11-16)
- [x] Built to the pick (LB / RB flip, X tabs, D-pad ← / → spare; legend + card keycaps; smoke pad step; DEC-337)
- [ ] Owner plays it on a physical pad

## Decisions
- 2026-11-16, owner, card feat239-card-switching: "2: shoulders flip cards everywhere, X switches tabs (recommended)". DEC-337 (supersedes DEC-175's pad half; keyboard unchanged: Q / E tabs, arrows flip).

## Log
- 2026-11-16 (lane C): built. gamepad.js MAP_KEYS (LB/RB send the arrows, X sends Q), poll's NAV skips D-pad ← / → on the map-only layout, map card keycaps read LB / RB on the pad, legend gains `LB RB cards` and `X tab` right of the seed readout; smoke `pad` step + pad-e2e updated. Smoke boot,map,story,offer,pad PASS; affected gates 5/5. Picture: wip/feat-239/map-pad-legend.png. Not tried on a physical pad.
- 2026-11-16 (lane C map batch): facts table and five options written from src/gamepad.js (BINDINGS, MAP_KEYS, CARD_MAP_KEYS, poll priority) and src/menu-nav.js. No code changed. Read from the source, not played on a pad.
- 2026-11-16: filed from the owner's inbox note.

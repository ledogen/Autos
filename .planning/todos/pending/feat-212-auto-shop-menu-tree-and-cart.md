---
id: FEAT-212
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — the Google Doc "Cargame menus" (exported to Markdown), copied below with its numbering and nesting intact
relates: FEAT-167 (service shop UI pass: collapsible sections), FEAT-196 (select, then act; corner swaps), FEAT-213 (the info texts), FEAT-202 (oil change), FEAT-104 / FEAT-137 (the shop shelf), FEAT-34, src/service-screen.js, src/service.js
---
lane: B

# FEAT-212: The auto shop menu — a nested Maintenance tree, a plain Shop list, and a cart with checkout

## Next steps
Owner: look at landing 1 (the Maintenance tree, screenshots under `wip/feat-212/` in the land worktree) and answer the Open questions. Lane B next: landing 2, the Shop tab as a flat list.

## Summary
Rebuild the auto shop's menu to the owner's outline. Maintenance is a tree that shows one level at a time. Shop is a flat list of parts. Nothing is paid for or takes time until checkout: work is queued in a cart that shows a subtotal of cost and time, the truck updates live, and the player checks out or discards.

## Description
### The rules (owner's words)
I'm imagining a UI with nested details so the clutter is reduced. We only show the top level (1-5) until the player clicks it then it shows just the next layer and so on. Only one item in each level can be selected at any one time. Selecting the top level again collapses everything. It’s pad friendly because all the options only show up once the item is selected

Every purchasable option should have price and time next to it.

We should use a cart and subtotal system. That way it's harder to misclick something. You queue up all the work that you want to do. The vehicle updates in real time, shows you the results, and then you have to check out in order to leave or you can discard all your changes. The subtotal should show cost and time. Payment and time skip only occurs on checkout.

### Maintenance tab (owner's outline, verbatim)
The numbers in brackets, (1) to (10), point at the info texts in FEAT-213.

Maintenance (note we do not show shop stock anywhere in this tab). The only option to swap a component is for one in your inventory or for one already on the car. If there are none in inventory it simply says “no appropriate replacement in inventory. If you want to buy a component you must visit the shop tab.

1. Vehicle Diagnostics (reuse the “v” menu)  
2. Tires, Wheels, Brakes and Suspension   
   1. Tires and Wheels  
      1. Alignment (display current alignment, 2x2 chart)  
         1. Align all  
      2. FL (display both HPs, maybe “W:xx% T:xx%” stay minimal. Show: flat / wheel failure. These details can move to the children when the item is expanded.)   
         1. Swap with corner (FL, FR, RL, RR as buttons)  
         2. Tire (HP, flat/destroyed) (1)  
            1. Swap with corner  
            2. Swap with player inventory  
            3. Patch (if flat and rare event player makes it there with a flat and HP on tire)   
         3. Wheel (HP, destroyed) (2)  
            1. Swap with corner  
            2. Swap with (player inventory only)   
            3. Repair  
      3. FR  
      4. RL  
      5. RR  
   2. Brakes (3)  
      1. Front (HP)  
         1. Swap with inventory  
      2. Rear  
   3. Suspension  
      1. Springs (4)  
         1. Front (HP)  
            1. Swap with inventory  
            2. Repair  
         2. Rear  
      2. Dampers (5)  
         1. Front (HP)  
            1. Swap with inventory  
            2. Repair  
         2. Rear  
      3. Roll bars  
         1. Front  
            1. Swap with inventory  
         2. Rear  
      4. Lift  
         1. Swap with inventory  
3. Engine and Cooling  
   1. Air filter (6)  
      1. Swap with inventory  
      2. Clean (only for cold air intake)  
   2. Radiator (7)  
      1. Repair  
      2. Swap with inventory  
   3. Engine (8) (hp, air filter hp, oil hp)  
      1. Oil change  
      2. Repair  
      3. Swap with Inventory  
4. Drivetrain   
   1. Transmission (9) (only if manual) (hp)  
   2. Rear differential (hp if clutch type)  
      1. Change clutches (if clutch type)  
      2. Swap with inventory  
5. Headlights and Body Panels  
   1. Headlights (10)  
      1. Left (hp)  
         1. Swap with inventory  
      2. Right   
   2. Body Panels  
      1. Front (hp)  
         1. Repair  
      2. Left  
      3. Right  
      4. Rear  
6.

### Shop tab (owner's words)
Just a list of parts. Without expanding any of them you only see the name (including “old” for tires), condition, cost, how long they will be in stock. Mounted tires need two health indicators.   
When expanded you see more details: i.e. the short 2 line description and the “add to cart” button

### The plan: every outline line → what is behind it (Lane B, 2026-11-13)
`s.` = `ServiceCenter` (src/service.js), `d.` = the damage tracks (src/damage.js TRACKS), sockets = data/parts.js SLOTS.
Hidden = nothing in the game does it yet; the row is left out until it exists (the default).

| Outline line | Behind it today | Shown |
|---|---|---|
| 1 Vehicle Diagnostics | the V-key damage screen (src/damage-screen.js), opened over the shop | yes |
| 2.1.1 Alignment, 2×2 chart | tracks alignFL…RR, one condition per corner | yes |
| 2.1.1.1 Align all | `s.align()` / `alignQuote()` (FEAT-167: one job, four corners) | yes |
| 2.1.2–5 FL…RR, "T:xx% W:xx%", flat / wheel failure | tracks tireXX / wheelXX, `d.flat[]`, a wheel at 0 = collapsed | yes |
| …Swap with corner (the corner) | `s.swapCorners(a, b)` (FEAT-196: the pairs trade, tire and wheel together) | yes |
| …Tire → Swap with corner | nothing: a tire-only move (wheels stay) is not a job today | **hidden** |
| …Tire → Swap with player inventory | `s.exchangeOptions(tireXX)` + `s.exchange()`: loose tires, and mounted pairs (which swap whole) | yes |
| …Tire → Patch | `s.patch()` / `patchQuote()`; only while that tire is flat | yes |
| …Wheel → Swap with corner | nothing: a wheel-only move is not a job today | **hidden** |
| …Wheel → Swap with (inventory only) | `s.exchange()` with the loose wheels in `exchangeOptions(wheelXX)` | yes |
| …Wheel → Repair | `s.targets` / `repair()` (REPAIRS.wheel); a collapsed wheel is scrap, no repair (FEAT-162) | yes |
| 2.2 Brakes Front / Rear → Swap with inventory | sockets brakesFront / brakesRear, tracks brakeFront/Rear; replace-only | yes |
| 2.3.1 Springs, 2.3.2 Dampers, Front / Rear → Swap, Repair | sockets springsX / dampersX, tracks springX / damperX, REPAIRS.spring / .damper | yes |
| 2.3.3 Roll bars Front / Rear → Swap with inventory | sockets arbFront / arbRear and their parts (stock, sport, none); no wear track, so no HP | yes |
| 2.3.4 Lift → Swap with inventory | socket lift (no lift, lift kit); no wear track | yes |
| 3.1 Air filter → Swap with inventory | socket airFilter, track airFilter | yes |
| 3.1 Air filter → Clean (cold air intake) | nothing: no cold air intake part, no clean job | **hidden** |
| 3.2 Radiator → Repair, Swap | socket radiator, REPAIRS.radiator | yes |
| 3.3 Engine (hp, filter hp, oil hp) → Oil change, Repair, Swap | `s.changeOil()` (FEAT-202), REPAIRS.engine (a seized one rebuilds whole), socket engine (stock engine) | yes |
| 4.1 Transmission (only if manual, hp) | track transmission (manualOnly), REPAIRS.transmission; no part to swap. The outline lists no action: the repair it has today stays under it, or the synchro wear could never be fixed | yes, with Repair |
| 4.2 Rear differential (hp if clutch type) → Change clutches, Swap | socket diff, track diff (clutchOnly), the rebuild = `repair('diff', 1)` (FEAT-166) | yes |
| 5.1 Headlights Left / Right → Swap with inventory | sockets headlightL/R, tracks headlightL/R; replace-only | yes |
| 5.2 Body Panels Front / Left / Right / Rear → Repair | tracks armorFront…Rear, REPAIRS.armor | yes |
| 6 (empty in the doc) | nothing | no |

The first Open question's suspects, checked: roll bars, engine repair, engine swap and patching at the shop all exist
(above). The real gaps are the cold air intake's clean, the transmission as a swappable part (the outline does not ask for
one), and the tire-only / wheel-only corner swaps.

**Not in the outline, kept where it is until landing 2:** My Items (sell, split / combine, repair or patch a part you
carry, FEAT-196's inventory wheel). It stays under the Shop tab as today; where it lives after the Shop rebuild is an
open question.

**FEAT-167 and FEAT-196 fold in.** Their rules stay: everything starts collapsed; a header wears the band colour of the
worst part under it (a flat reads as nothing left); one alignment job; a row is one button and its options open on select
(one pad target per row); a corner's tire moves to another corner in one job; an inventory wheel is repaired at the bench.
Their layout goes: the flat My Vehicle section list is replaced by the tree, and its code is deleted.

**How the tree behaves.** The open path is one id per level. Selecting a closed item opens it and closes its siblings
and everything under them; selecting an open item closes it and everything under it (so the top level again collapses
everything). An action row (align, patch, oil change, change clutches, each swap or repair option) carries its price and
its hours. In landing 1 an action is still paid when it is pressed; landing 3's cart moves that to checkout.

### How this sits on what exists
- FEAT-167's collapsible sections and FEAT-196's select-then-act rows are the same idea one level deep; this ticket replaces their layout with the tree and keeps their rules (one target per row for the pad, corner swaps, repairing an inventory wheel).
- Maintenance never shows shop stock. A swap offers only parts in the inventory or on the truck; with none, the line reads "no appropriate replacement in inventory" and buying happens in the Shop tab.
- The cart changes when money and time are spent: today each action is paid as it is clicked.

## Tracker
- [x] Plan: every outline line mapped to an existing part / track, the gaps listed
- [x] Maintenance tree: one level shown at a time, one selection per level, selecting the top level again collapses all
- [x] Every purchasable option shows its price and its time (Maintenance; the Shop tab with landing 2)
- [x] Swaps offer inventory and on-truck parts only; the empty case shows the owner's line
- [ ] Shop tab: flat list with name, condition, cost, time left in stock; mounted tires show two conditions; expanding shows the description and "add to cart"
- [ ] Cart: queued work, live truck preview, subtotal of cost and time, checkout or discard; payment and the time skip happen only at checkout; leaving requires one or the other
- [ ] Pad, keyboard and mouse; pad-e2e updated (Maintenance: ↑/↓ walk the list in order, Enter opens, checked headless; the smoke's service step walks it by keys. pad-e2e never reaches a shop, so it has nothing to update)

## Decisions
- 2026-11-13, owner: nested menu, one level at a time; price and time on every purchasable option; a cart with a cost-and-time subtotal, paid only at checkout; Maintenance shows no shop stock.

## Open questions
- Lines in the outline with nothing in the game yet. Checked (the plan): roll bars, engine repair, engine swap and patching at the shop all exist and show. Hidden until they exist: the cold air intake's "clean", and the "Swap with corner" under Tire and under Wheel (a tire-only or wheel-only move is not a job today; the corner's own "Swap with corner" moves the pair, FEAT-196). Keep them hidden (the default), or mint tickets?
- The transmission's line lists no action. Its rebuild (the synchros, REPAIRS.transmission) is kept under it as "Repair", or a worn manual box could never be fixed. Keep it (the default)?
- My Items (sell, split / combine, repair or patch a part you carry, FEAT-196's inventory wheel) is in neither outline. It stays under the Shop tab, below the list, through landing 2 (the default). Or is it the empty item 6?
- The outline's item 6 is empty in the doc: is a sixth section intended?
- The cart previews work on the truck "in real time": if the player cannot afford the subtotal, block checkout (the default) or block adding the item?

## Files
`src/service-screen.js` · `src/service.js` · `src/menu-nav.js` · `test/service.mjs` · `test/pad-e2e.mjs`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.
- 2026-11-13, Lane B: the plan (135ed4ec). Landing 1 on `land/feat-212` (/Users/ledogen/CodeShit/CarGame-land-212): the My Vehicle tab is now Maintenance, the outline as a tree (src/service-screen.js `_maintenance`); its section list and `group` toggles are deleted. "Parts Shop" is now "Shop" (otherwise unchanged until landing 2). Vehicle Diagnostics opens the V screen over the shop (main.js: the damage screen is no longer blocked while the service screen is open; the shop card hides under it). ↑/↓ walk the card's buttons in list order (`navStep`): the spatial nearest went from the map button straight to the back button past the indented tree. Verified headless (wip/feat-212/shot.mjs, seed 6, story, parked on the lift): every level opens and closes, the top level again collapses all, a corner swap charges $4 and the open path follows the tire to its new corner, a wheel from the inventory goes on for its fitting price, ↓/Enter/↑ drive it, no console errors. cdp-smoke's service step updated, not run on the branch.

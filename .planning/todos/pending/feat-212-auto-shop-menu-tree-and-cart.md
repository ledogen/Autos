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
Lane B, after FEAT-202 lands. First step is a short plan in this ticket mapping every line of the outline to a part or track that exists, and listing the lines that have nothing behind them yet (see Open questions).

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

### How this sits on what exists
- FEAT-167's collapsible sections and FEAT-196's select-then-act rows are the same idea one level deep; this ticket replaces their layout with the tree and keeps their rules (one target per row for the pad, corner swaps, repairing an inventory wheel).
- Maintenance never shows shop stock. A swap offers only parts in the inventory or on the truck; with none, the line reads "no appropriate replacement in inventory" and buying happens in the Shop tab.
- The cart changes when money and time are spent: today each action is paid as it is clicked.

## Tracker
- [ ] Plan: every outline line mapped to an existing part / track, the gaps listed
- [ ] Maintenance tree: one level shown at a time, one selection per level, selecting the top level again collapses all
- [ ] Every purchasable option shows its price and its time
- [ ] Swaps offer inventory and on-truck parts only; the empty case shows the owner's line
- [ ] Shop tab: flat list with name, condition, cost, time left in stock; mounted tires show two conditions; expanding shows the description and "add to cart"
- [ ] Cart: queued work, live truck preview, subtotal of cost and time, checkout or discard; payment and the time skip happen only at checkout; leaving requires one or the other
- [ ] Pad, keyboard and mouse; pad-e2e updated

## Decisions
- 2026-11-13, owner: nested menu, one level at a time; price and time on every purchasable option; a cart with a cost-and-time subtotal, paid only at checkout; Maintenance shows no shop stock.

## Open questions
- Lines in the outline with nothing in the game yet, as far as a first read shows: roll bars, the cold air intake's "clean", engine repair and engine swap, the transmission as a serviceable part, patching a tire at the shop. Hide them until they exist (the default), or mint tickets for them now?
- The outline's item 6 is empty in the doc: is a sixth section intended?
- The cart previews work on the truck "in real time": if the player cannot afford the subtotal, block checkout (the default) or block adding the item?

## Files
`src/service-screen.js` · `src/service.js` · `src/menu-nav.js` · `test/service.mjs` · `test/pad-e2e.mjs`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.

---
id: FEAT-230
type: feature
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16 — "Why don't groceries exist and why doesn't the potato exist? I feel like we've had idle agents for some time Is there just not tickets for these things?"
relates: FEAT-121, FEAT-169, FEAT-66, FEAT-104, ASSET-25, data/items.js, src/camp.js
---
lane: C

# FEAT-230: Cooking at camp — the potato, groceries, and the cooking kit's job

## Next steps
Slices 1, 1b, 3 and 2 are all on main (slice 2 the fresh clock e22a2d35, groceries 56a949e8, tutorial hold e45af4fb DEC-339 draft).
Owner: look cards `fresh-clock-look` (the bar at 6 o'clock, ice 72/120 h, cooler capacity; also approve or change DEC-339) and
`groceries-campgear-look` (prices all [DEFAULT]; a farm now opens its shop first, jobs behind a button). Not built: "evening or
morning" (no ruled mechanic). Every Tracker box is ticked: close after the looks.

## Summary
The cooking kit is sold and rewarded but does nothing: its effect waits on groceries, and neither groceries nor the
potato is an item. Both designs were ratified on 2026-10-21/22 and sat as rows in FEAT-121's list with no ticket of
their own, so no lane was ever given them.

## Description
The rulings are in `.planning/story-mode/items.md` § 1 and FEAT-121 (rows Potato, Groceries, Cooking kit, Cooler,
Ice, Ice King, Packed lunch). In short:

- **Slice 1, potato** (needs only hunger, which is built): inedible raw; cooked on the campfire with no kit; holds
  hunger 4 h; cooking adds 30 min; raw never spoils, cooked keeps 24 h; stacks 5; under $5; general store; a farm
  reward at C to B; never found. Flavor: "Potato".
- **Slice 2, the fresh clock**: food that spoils (packed lunch, groceries, a cooked potato: fresh 24 h); the cooler
  slows it to 1/6; ice.
- **Slice 3, groceries and the kit**: $5 at the general store and farms; one meal a bag; cooked at camp only with the
  cooking kit; holds 10 h; +30 min; evening or morning; a farm and general-store reward at B to A. The kit's "flat
  bonus to the effect of food items" applies to other food and has no number ruled yet.

## Tracker
- [x] Slice 1: potato item, sold and rewarded, cooked on the campfire, eaten
- [x] Slice 1b (DEC-310): cooking kit deployed at camp = food holds 20 % longer
- [x] Slice 2: fresh clock, cooler, ice, built to the owner's five answers (DEC-338)
- [x] Slice 2: the freshness bar at 6 o'clock on every inventory thumbnail (truck slots, the ground)
- [x] Slice 3: groceries cooked with the kit (no 20 % on top); groceries as a farm reward
- [x] FEAT-121's rows for these items brought up to date

## Decisions
- DEC-310: the cooking kit's +20 %; groceries take none on top.
- DEC-338: the bar; every food with a fresh time chills; each unit spoils on its own; Ice King 4; ice melts in 24 h, 72 h /
  120 h in a cooler. The model, in two lines: every unit of a stack carries its own age (`ages`, youngest first) and goes
  alone; an iced cooler runs up to `holds` units of food at its coolRate, youngest first, so an overfull stack's oldest stays out.

## Open questions
- Prices: the cooler $20 and the Ice King $65 are the middles of $10–30 and $30–100 (data/shop-stock.js ITEM_PRICE).
- The potato's exact price ("under $5"): $2 is a placeholder (data/shop-stock.js ITEM_PRICE).
- School lunch and peanuts have no fresh clock (not ruled).

## Log
- 2026-11-16 slice 3 on `land/feat-230-groceries`: `groceries` (raw, no use) and `groceriesCooked` (`use: 'eat'`, hold 10 h, `noKit` so `foodHoldH` skips DEC-310's +20 %), camp button `cp-cook-groceries` shown ONLY with the kit deployed (same `_campFade` + `convert` path as the potato, 30 min), $5 at the general store AND the farm (`STOREFRONT.farm`: a farm sells for the first time), reward cat `groceries` B-A from farm + general store. Owner's two sentences are already in DEC-310, no DEC-332. [DEFAULT]: mass 2 kg, one bag a slot (`stack: 1`), reward weight 4 (a chili dog's). Ruled but NOT built: "evening or morning" (no ruled mechanic found), fresh 24 h / cooler (slice 2). Gates: inventory + the affected set; smoke `cook` step extended (picture wip/groceries/camp-card.png).
- 2026-11-16: minted from FEAT-121's rows at the owner's question.
- 2026-11-16: owner gave the kit's number, +20 % (DEC-310); added to slice 1.
- 2026-11-16 slice 1 + 1b on `land/feat-230`: potato/potatoCooked, `stack` cap in the inventory, camp button `cp-cook`
  (`_campFade` + `convert`), general store + farm `produce` reward, `foodHoldH` (DEC-310). Gates: inventory. Unverified: the
  30 min and the button in a live browser (main.js has no headless gate).
- 2026-11-16 slice 2 on `land/feat-230-fresh`: `freshH` (chili dog 16, packed lunch 24, cooked potato 24) as `age` per entry,
  advanced by `InventorySystem.tick(clockH)` each fixed step (runs asleep, holds under the brake per DEC-289); ice / cooler / Ice
  King items, shelves (tackle shop now a storefront), A–S / S reward rows. Gates: inventory, shop-stock + affected. Unverified:
  nothing visible in the browser (no freshness UI); the Ice King's 0.25 shelf weight.
- 2026-11-16 slice 2 finished (DEC-338): per-unit `ages` (one bad unit never spoils the stack, the oldest eaten first), every
  food with `freshH` chills (`chill` field gone), burger 16 h + groceries 24 h, ice melts in 24 h and gives a cooler its share
  of 72 / 120 h, `freshLeft` → the `.sl-fresh` bar in inventory-screen.js. Main merged in. Gates: inventory, shop-stock + the
  affected set; smoke step `freshBar` (wip/fresh/). Unverified: the bar's look by the owner.
2026-11-16 (bookkeeping sweep): next steps rewritten (slice 2 merged e22a2d35, groceries 56a949e8, DEC-339 tutorial hold e45af4fb). Ready to close after the two look cards.
- 2026-11-24: DEC-487: Rucksack shop price $20 (data/shop-stock.js); the other placeholder prices are the owner's.

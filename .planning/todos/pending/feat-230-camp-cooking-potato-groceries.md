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
Slice 1 and 1b are built on `land/feat-230` (not merged). Next: slice 2 (the fresh clock, cooler and ice; the cooked
potato's 24 h), then slice 3 (groceries cooked with the kit, no +20 % on top). Owner: set the potato's price (placeholder $2).

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
- [ ] Slice 2: fresh clock, cooler, ice
- [ ] Slice 1b: the cooking kit deployed at camp gives food eaten there +20 % hold (DEC-310)
- [ ] Slice 3: groceries cooked with the kit (no 20 % on top); groceries as a farm reward
- [ ] FEAT-121's rows for these items brought up to date

## Open questions
- The potato's exact price ("under $5"): $2 is a placeholder (data/shop-stock.js ITEM_PRICE).

## Log
- 2026-11-16: minted from FEAT-121's rows at the owner's question.
- 2026-11-16: owner gave the kit's number, +20 % (DEC-310); added to slice 1.
- 2026-11-16 slice 1 + 1b on `land/feat-230`: potato/potatoCooked, `stack` cap in the inventory, camp button `cp-cook`
  (`_campFade` + `convert`), general store + farm `produce` reward, `foodHoldH` (DEC-310). Gates: inventory. Unverified: the
  30 min and the button in a live browser (main.js has no headless gate).

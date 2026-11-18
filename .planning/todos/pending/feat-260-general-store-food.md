---
id: FEAT-260
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "This store needs to carry more than just groceries. As far as food items, let's add a salad, let's add a deli sandwich, let's add some cookies, let's add some bread. Try to balance the spoilage, time, satiety, and cost. And propose five more items."
relates: FEAT-250, DEC-380, DEC-377, data/items.js, data/shop-stock.js
---
lane: C

# FEAT-260: The general store sells a salad, a deli sandwich, cookies and bread; five more proposed

## Next steps
Owner: approve or change the numbers and pick from the five proposals on the card food-1117-numbers. Art: four thumbnails.

## Summary
Four new carried foods on the general store's shelf, priced on the $0.35 an hour line (DEC-377) and spread from short
and cheap to long-keeping. Five more are proposed on the card, not built. With FEAT-250's "about six new food items… a
good spread of cheap but not long lasting to high quality expensive with more satiety".

## Description
### Every food (price · satiety · fresh for · chills · $ an hour · sold at)
- Gummy worms · $0.70 · 2 h · never spoils · no · $0.35 · gas station
- Cookies (new) · $0.80 · 2 h · 96 h · yes · $0.40 · general store
- Candy bar · $1.05 · 3 h · never · no · $0.35 · gas station
- Spicy chips · $1.05 · 3 h · never · no · $0.35 · gas station
- Bag of peanuts · $3.00 · 3 h · never · no · $1.00 · gas station (DEC-293)
- Salad (new) · $1.20 · 4 h · 12 h · yes · $0.30 · general store
- Potato (cooked) · $1.40 · 4 h · raw never, cooked 24 h · yes · $0.35 · general store
- Loaf of bread (new) · $2.40 · 6 h · 72 h · yes · $0.40 · general store
- Deli sandwich (new) · $2.45 · 7 h · 24 h · yes · $0.35 · general store
- Burger · $2.80 · 8 h · 16 h · yes · $0.35 · food vendor
- Dinner meal · $2.80 · 8 h · eaten there · no · $0.35 · food vendor
- Chili dog · $3.50 · 10 h · 16 h · yes · $0.35 · food vendor
- Groceries (cooked) · $3.50 · 10 h · 24 h raw and cooked · yes · $0.35 · general store, farm
- Packed lunch, school lunch · worth $2.80 · 8 h · packed 24 h · yes · rewards only
The $ an hour moves ±$0.05 with shelf life: short-lived costs less, long-keeping more. "Time" read as how long it keeps.

### Proposed, not built
- Beef jerky · $1.40 · 3 h · never spoils · $0.47 · gas station, general store: the dear snack that never turns
- Apple · $0.50 · 1.5 h · 72 h · $0.33 · farm, general store: the cheapest food, 6 to a slot
- Breakfast burrito · $1.80 · 6 h · 8 h · $0.30 · gas station: a hot-case meal to eat that morning
- Can of beans · $1.80 · 6 h · never; heated on the campfire (30 min, like the potato) · $0.30 · general store
- Fried chicken bucket · $4.20 · 12 h · 16 h · $0.35 · food vendor: the most satiety, fills to the cap

### Art missing (stand-ins in use, no third-party art)
salad (groceries icon) · deliSandwich (packed lunch icon) · cookies (candy bar icon) · bread (groceries icon).

## Tracker
- [x] Salad, deli sandwich, cookies and bread live on the general store's shelf
- [ ] Numbers approved by the owner
- [ ] Five proposals answered (build the picked ones)
- [ ] Thumbnails rendered for the four

## Decisions
- 2026-11-17, owner (inbox 20261117102806-ltfp): the source line above.

## Open questions
- Are the four's numbers right, and which of the five proposals to build?

## Links
DEC-380 (draft). Card `owed/food-1117-numbers.json`.

## Files
`data/items.js` · `data/shop-stock.js` · `test/inventory.mjs`

## Log
- 2026-11-17: built on land/food-1117 (lane C) with FEAT-250. inventory, shop-stock gates green.
- 2026-11-17 (lane C): DEC-407 rebalanced the four: salad $1.10, deli sandwich 5 h $1.65, cookies $0.60, bread 5 h $1.50 ($0.275–0.33 an hour, grocery staples).

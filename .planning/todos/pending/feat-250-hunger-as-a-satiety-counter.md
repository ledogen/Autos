---
id: FEAT-250
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I'd like to change hunger to a system where food items can be stacked together I think a simple hunger counter that decreases over time through the stuffed full content zones and is added to by foods that each have Their own number that they add. This number is the satiety that the food contributes. Then let's add like six new food items to the game and make sure we have a good spread of cheap but not long lasting to high quality expensive with more satiety."
relates: FEAT-230, FEAT-69, FEAT-260, FEAT-261, BUG-198, DEC-310, DEC-376, DEC-377, DEC-379, data/items.js, src/day.js, src/inventory.js
---
lane: C

# FEAT-250: Hunger is a satiety counter that foods stack into; six new foods

## Next steps
Owner: answer the card food-1117-numbers (the price table, the 12 h cap, the peanuts). Then lane C lands land/food-1117 with FEAT-260/261 and BUG-198.

## Summary
Replace the current hunger hold with one counter that drains over time through the Stuffed / Full / Content zones. Each food adds its own satiety number, so foods stack. Add about six foods from cheap and short to expensive and long.

## Description
Linked owner rulings of the same night are under Decisions.

### As built (land/food-1117)
- The counter is `fedLeftH()` in src/day.js: hours of drain, 1 an awake hour, still asleep. `eat(s)` adds s (from 0 when
  hungry), capped at `DAY_PARAMS.satietyCapH` = 12 h [DEFAULT]; the rest is wasted. Debug slider "satiety cap (h)".
- Conversion: each food's `hold` became its `satiety`, one for one (field renamed in data/items.js; `foodSatietyH`).
- Zones, unchanged, as ranges of the counter: stuffed 6–12 · full 4–6 · content 2–4 · peckish 0–2 · hungry < 0 (drain
  ×1.25 → ×1.5 over 4 h). The hunger bar's full end is now the cap (was the longest hold, 10 h).
- Coolers: 4 slots each, a slot = one inventory entry, so a stack chills whole; filled Ice King first, then inventory order.
- Cooked groceries: `freshH: 24`, chilled like any food.
- Prices, $0.35 × satiety (before → after): burger $5 → $2.80 · chili dog $5 → $3.50 · dinner meal $5 → $2.80 ·
  groceries $5 → $3.50 · potato $2 → $1.40 · gummy worms $2 → $0.70 · candy bar $2 → $1.05 · spicy chips $3 → $1.05 ·
  packed lunch worth $6 → $2.80 · school lunch worth $5 → $2.80 · bag of peanuts $3 held (DEC-293, on the card).
- Save compatibility: the save already carries `fedUntilH` (clock hour the counter reaches 0), which IS the counter, so an
  old run save loads with the same hunger; a counter above 12 h cannot come from an old save (the longest hold was 10 h).
  Inventory ages load as saved; an old save's cooked groceries have no ages and start fresh.

## Tracker
- [x] Counter drains through the zones
- [x] Each food has a satiety number and foods stack
- [ ] Satiety cap (12 h proposed) approved by the owner
- [ ] About six new foods, cheap/short to expensive/long, numbers approved by the owner (four built, five proposed: FEAT-260)
- [x] Items stack inside coolers; a stack is one slot; a cooler has four slots
- [x] Cooked groceries spoil in 24 h outside a cooler
- [x] Food cost about $0.35 per hour of hold (FEAT-69 dive); peanuts held at $3 by DEC-293 pending the card
- [ ] Owner has played it

## Decisions
- 2026-11-17, owner (fresh-clock-look card): "Let item stack inside coolers. A stack of items only counts as one slot and the coolers offer four slots. Cooked groceries should also spoil in 24h outside a cooler."
- 2026-11-17, owner (FEAT-69 dive, cost level): "cut costs: food to about $0.35 per hour of hold, and the oil change $8 → $6" · "We should add a couple more types of food to add some variety"

## Open questions
- The satiety cap: 12 h proposed (6 h past the start of stuffed).
- The bag of peanuts: $3 by DEC-293, or $1.05 on the line (mom's tutorial money follows its price, DEC-306).

## Links
Records DEC-376 (the counter), DEC-377 (the price line), DEC-379 (cooler slots, cooked groceries; supersedes DEC-338). Owner card `owed/food-1117-numbers.json`.

## Files
`src/day.js` · `src/inventory.js` · `src/main.js` · `src/service.js` · `data/items.js` · `data/shop-stock.js` · `data/offers.js` · `test/day-clock.mjs` · `test/inventory.mjs` · `test/shop-stock.mjs`

## Log
- 2026-11-17: built on land/food-1117 (lane C). Gates: day-clock, inventory, shop-stock, economy green; affected run in the log line below.
- 2026-11-17 (lane C): owner's card answered: DEC-407 — $/h by place of sale (cookable $0.25, staples $0.27–0.33, vendor $0.50–0.60, gas $0.67–0.70; band $0.245–0.70), peanuts $2, five more foods built (jerky, apple, burrito, beans heated at camp, fried chicken). test/inventory.mjs holds the band and four ordering rules. Gates/smoke: see the report; look card food-shop-1117-look.

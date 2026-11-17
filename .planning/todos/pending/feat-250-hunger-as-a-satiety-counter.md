---
id: FEAT-250
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I'd like to change hunger to a system where food items can be stacked together I think a simple hunger counter that decreases over time through the stuffed full content zones and is added to by foods that each have Their own number that they add. This number is the satiety that the food contributes. Then let's add like six new food items to the game and make sure we have a good spread of cheap but not long lasting to high quality expensive with more satiety."
relates: FEAT-230, FEAT-69, DEC-310, DEC-315, data/items.js
---
lane: A

# FEAT-250: Hunger is a satiety counter that foods stack into; six new foods

## Next steps
A lane: build the counter on a branch, propose the six foods with price and satiety in an owed card (one per line), and fold in the three linked rulings under Decisions.

## Summary
Replace the current hunger hold with one counter that drains over time through the Stuffed / Full / Content zones. Each food adds its own satiety number, so foods stack. Add about six foods from cheap and short to expensive and long.

## Description
Linked owner rulings of the same night are under Decisions. Read DESIGN.md and the hunger decision records first; list every conflict before building.

## Tracker
- [ ] Counter drains through the zones
- [ ] Each food has a satiety number and foods stack
- [ ] About six new foods, cheap/short to expensive/long, numbers approved by the owner
- [ ] Items stack inside coolers; a stack is one slot; a cooler has four slots
- [ ] Cooked groceries spoil in 24 h outside a cooler
- [ ] Food cost about $0.35 per hour of hold (FEAT-69 dive)
- [ ] Owner has played it

## Decisions
- 2026-11-17, owner (fresh-clock-look card): "Let item stack inside coolers. A stack of items only counts as one slot and the coolers offer four slots. Cooked groceries should also spoil in 24h outside a cooler."
- 2026-11-17, owner (FEAT-69 dive, cost level): "cut costs: food to about $0.35 per hour of hold, and the oil change $8 → $6" · "We should add a couple more types of food to add some variety"

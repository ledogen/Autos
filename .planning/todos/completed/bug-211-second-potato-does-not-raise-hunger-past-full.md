---
id: BUG-211
type: bug
status: closed
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Eating one potato took me to full and then eating another didn't seem to increase my hunger any further. This is on the 8002 dev server."
relates: FEAT-250, FEAT-230, FEAT-283
---
lane: bug (alpha by default)

# BUG-211: Eating a second potato after one took hunger to full changes nothing

## Next steps
Closed 2026-11-20. Owner drove it and said good.

## Summary
One potato filled the hunger bar and a second one seemed to add nothing. FEAT-250 makes hunger a satiety counter that foods stack into, so this may be the cap, or the stacking not working. Seen on the 8002 dev server.

## Description
Owner's words, verbatim (inbox 20261118062542-4cas):

> Eating one potato took me to full and then eating another didn't seem to increase my hunger any further. This is on the 8002 dev server.

## Tracker
- [x] A second potato eaten at "full" has a visible, defined effect (more satiety, or a clear "you are full" message)
- [x] The counter and the bar agree
- [x] Owner has driven it

## Decisions
- Cause, measured (gate meal-waste): on main (the 8002 build is main's) `DaySystem.eat` took the LONGER hold, never the sum: hungry, one cooked potato (hold 4 h) sets 4 h left = "full" (4 to 6 h); a second sets max(4, 4) = 4 h, so it adds 0 h and the potato is gone. FEAT-250 / DEC-376 (on land/food-1117, not merged) makes foods add up to a 12 h cap, which fixes the stacking itself; the bar's top is the longest hold (10 h) on main, the cap on that branch.
- Fix here (the UX half, works under either rule): `DaySystem.mealGainH(h)` is eat()'s own rule; `mealWaste(h)` says 'all' (adds under 0.05 h) or 'some' (loses over 0.25 h) [DEFAULT both]. The inventory card warns before eating: 'all' "You are too full. Eating this now would waste it.", 'some' "You are nearly full. Some of this would go to waste." Words only, no hours on screen. A WARNING, never a refusal: a refusal blocked the opening's scripted peanuts at camp (DEC-347, eaten on a stomach the safe drive keeps fed; the smoke caught it). FEAT-283's green preview box reads the same gain if it calls mealGainH.

## Open questions
- Is full a hard cap (eating more wasted) or should the counter go past it? FEAT-250 says foods stack.

## Links
FEAT-250, FEAT-230, FEAT-283

## Files
src/hunger*.js · src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062542-4cas).
- 2026-11-17 1c741d84: mealGainH / mealWaste (src/day.js), InventorySystem `notes` dep (src/inventory.js), the hint + disabled eat (src/inventory-screen.js), main.js `_mealNote`. Gate meal-waste.mjs 9/9. Unverified: the owner's drive.
- 2026-11-18 12075c69: refusal → warning (the smoke's opening step: the peanuts could not be eaten). meal-waste.mjs 9/9.
- 2026-11-20: owner, card bugs-1117-gps-food-camp-drive: "Drove it: good, close them". Closed on the owner's drive; on main (merge 164f603b, bd959072).


---
id: FEAT-303
type: feature
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "Reduce cost of item rewards and missions by 20% If they're full shop price it incentivizes taking the cash because then you have flexibility If there's a little bit of a discounted incentivizes taking the item, which I think we should do"
relates: DEC-439, DEC-176, DEC-204, DEC-254, DEC-022, FEAT-199, data/offers.js (ITEM_COST_FRAC), src/offer-board.js
---
lane: SM-3 economy (Opus: economy numbers)

# FEAT-303: Item rewards in missions cost 20 % less, so the item beats the cash

## Next steps
A lane changes `ITEM_COST_FRAC` after the owner answers the Open question (what 20 % is taken off). Then a census over random seeds of how many offers now favour the item.

## Summary
Owner's words:
> Reduce cost of item rewards and missions by 20% If they're full shop price it incentivizes taking the cash because then you have flexibility If there's a little bit of a discounted incentivizes taking the item, which I think we should do

### What the code does today
The result card charges `itemCost(id, paid) = min(paid, rewardValue(id) * ITEM_COST_FRAC)` (`src/offer-board.js` ~227), with `ITEM_COST_FRAC = 0.5` (`data/offers.js` ~742): taking the item costs HALF its shop price out of the job's cash (DEC-176), capped at the cash the job paid. The item offered is priced within 0.7 to 1.3 times the card's top figure (DEC-204).

## Description
(See Summary.)

## Tracker
- [ ] `ITEM_COST_FRAC` set to the number the owner confirms
- [ ] The offer card and the result card both show the new figure (`award.cost` on the result card, `itemCost` on the offer)
- [ ] Census over 40 random seeds x 5 days: share of offers where cost < cash that would be forgone (the item is the better pick)
- [ ] Gates: offer-board, economy
- [ ] Owner has looked

## Open questions
- CONFLICT, DEC-176: "Taking a mission's optional item costs half its shop price". The owner writes as if the item costs "full shop price" now ("If they're full shop price it incentivizes taking the cash"). The code charges half. So "reduce by 20 %" is ambiguous: (a) 20 % off today's half price: 0.50 to 0.40 of shop price; (b) he believes it is full price and wants 0.80 of shop price, which would RAISE the cost from today's 0.50. Owner's call. DEC-439 records his words and does not pick the number. The scribe recommends (a).
- DEC-204 (price window 0.7 to 1.3 on the top figure) and DEC-226 (fallback the cheapest of the pool) are unaffected by the cost; they pick WHICH item.

## Links
FEAT-199, FEAT-69.

## Files
`data/offers.js` (ITEM_COST_FRAC) · `src/offer-board.js` (itemCost) · `src/mission.js` (result.award)

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.

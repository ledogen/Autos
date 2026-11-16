---
id: FEAT-232
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "I feel like we've had idle agents for some time Is there just not tickets for these things?" (minted from FEAT-121's audit, proposals 1 and 2)
relates: FEAT-121, FEAT-123, FEAT-169, FEAT-230, data/items.js, data/shop-stock.js, data/offers.js
---
lane: C (after FEAT-230 slice 1 lands: same data files)

# FEAT-232: The ratified food rows that are not in the game — snacks, the burger, the dinner meal

## Next steps
Built on `land/feat-232`, awaiting the orchestrator's landing. Owner: set the placeholder prices and masses (Log).

## Summary
Ratified and unbuilt, needing only hunger (which is built): gummy worms, spicy chips and the candy bar at the gas
station; the burger at the food vendor; the peanuts and packed-lunch reward rows; the dinner meal's eat-in menu
line. Stack sizes use the per-slot cap FEAT-230 adds.

## Tracker
- [x] Gas-station snacks: three items, shelf, reward and stack caps as ruled
- [x] Burger; the packed-lunch and peanuts reward rows
- [x] Dinner meal eat-in line
- [x] FEAT-121 rows updated

## Open questions
- Prices given only as ranges ("under $5" a snack; dinner meal $5–10) and the snacks' masses: placeholders until answered.

## Log
- 2026-11-16: minted from the FEAT-121 audit.
- 2026-11-16 lane C: built on `land/feat-232`. Snacks (hold h / stack): gummy 2/5, chips 3/3, candy 3/4, peanuts 3/3 (reward cats snack = station + general store; gasSnack = station); burger 8 h, $5, C–B, vendor (cat grill); packed lunch B–A, worth $6, residence + farm + vendor (cat homemade); dinner meal = the vendor's shelf line, "eat here" through the cart (service.js buyAndEat, 30 min, hold 8 h, nothing stowed). [DEFAULT]: snack prices $2/$3/$2 (peanuts $3), masses 0.1 kg, burger 0.3 kg, reward weights 4, dinner meal $5 of $5–10. Not built: finds, spoilage (comments name FEAT-230 slice 2). FEAT-123 keeps the store model and lot.

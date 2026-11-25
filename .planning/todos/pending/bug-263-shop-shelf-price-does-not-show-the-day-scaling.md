---
id: BUG-263
type: bug
status: open
severity: minor
opened: 2026-11-24
source: owner, 2026-11-24 — "make a ticket to fix the display bug. the service shop was showing $10 for a standard tire on day 5" · earlier the same evening: "it showed as a constant $10 throughout the run but mounting them got more expensive. not sure if that's from labor cost alone scaling or if the part did but didnt show it in the shop screen."
relates: FEAT-325, FEAT-168, src/service-screen.js, src/service.js
---
lane: SM-3 (economy)

# BUG-263: The shop shelf shows a part's day-1 price while the checkout charges the scaled one

## Next steps
A lane (Sonnet) reproduces it in the browser on a day-5 save, then fixes the shown price. Seen on the arc trial build (:8005, branch proto/arc-trial); check main too, the screen code is the same.

## Summary
On day 5 the service shop listed a Standard tire at $10. The checkout charged $12.10 for the part and $7.26 for the labour. The player cannot see that parts get dearer by the day.

## Description
- Prices ride the day tier: × 1.065 per day on Normal (`dayTier`, src/economy.js). The run log autos-run-3996330376 shows it: day 4 a Standard tire bought and fitted for $18.08 (16 × 1.13), day 5 for $19.36 (16 × 1.21), against $16 at day-1 prices.
- By the code the shelf column should already scale: `src/service-screen.js` ~590 prints `this.service.shelfPrice(i)`, and `ServiceCenter.shelfPrice` (src/service.js ~424) multiplies by `this.tier()`. So either a different row is the one the owner read (the list price in a description, the fit row, the cart), or the screen caches the row from an earlier day. Not reproduced yet: find which before changing anything.
- Wanted: every price the shop shows is the price it charges today, part and labour both.

## Tracker
- [ ] Reproduced: NOT reproducible on main or proto/arc-trial (2026-11-25): every shop figure scales on day 5; see Log
- [x] Every shown price equals the charged price (part, labour, total): holds today, pinned by the checks below
- [x] A check in test/service.mjs (BUG-263: shelf, carry, fit quotes at tier 1.21) and the smoke's `shopprice` step (shelf text on day 5)
- [ ] Owner's look

## Decisions
None.

## Open questions
None.

## Links
FEAT-325 (the arc trial, where it was seen) · FEAT-168 (the day tier)

## Files
`src/service-screen.js` · `src/service.js`

## Log
- 2026-11-24: minted by the orchestrator at the owner's word.
- 2026-11-25 (lane c): real-browser read on main and on proto/arc-trial, day 1 vs day 5 (advanced 4 days with the shop screen open). Shelf column: Standard tire $8.00 -> $9.68 (x1.21), steel wheel $8 -> $9.68, plug kit $5 -> $6.05, V6 $60 -> $72.60. Cart line for the tire fitted front-left: $13.31 = 9.68 + 3.63 labour (3 x 1.21), subtotal the same. The screen re-renders on the day change; `tier` is wired to `economySystem.tierNow()` (main.js 3990). Nothing is stale in the shop on either build. Only $10 on the screen is the wallet, top right (the owner had $10?). Other unscaled prices by design: the offer card's reward value (`rewardValue`, "day-1 dollar value"). Added the checks, no src change. Owner's look needed: if it recurs, note the day, the screen and which row.

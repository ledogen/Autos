---
id: FEAT-259
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117105026-9xle) — "I'm getting lots of opportunities to put old tires on my truck, but not very many opportunities to put standard tires on my truck. I've probably seen old tires come up as rewards twice in two days of this playthrough. I much prefer the way the standards drive. I think they should rotate into the store a little bit more often than other items as well as That come up as mission reward more often. Increase the frequency at which new stock comes into the store as well. That'll give you more chances to have the option to buy standard tires."
relates: FEAT-137, FEAT-168, FEAT-165, data/shop-stock.js, data/stock-weights.js, data/offers.js, DEC-375, DEC-204
---
lane: B

# FEAT-259: Standard tires turn up more often; new stock arrives faster

## Next steps
Built with [DEFAULT] numbers on `land/machine-1117` (machine lane p). Owner: approve or change them on card machine-1117-look (DEC-375, draft).

## Summary
Standard tires on the shelf and as rewards more often, and the auto-shop shelf turning over faster, so a standard tire is
easier to find.

## Description
### Measured today (200 random seeds × 8 days, wip/machine-1117/stock-census.mjs)
- Shelf: 6 slots, P_FILL 0.037 per empty slot per hour, life 6–48 h → 3.1 rotating items on average, 3.1 new items per shop
  per day (mean life 27 h). Standard tire on the shelf 18 % of hours; the old tire 18.6 % plus always (FEAT-168 ALWAYS row).
- Rewards: 33 % of offers carry an item. Raw pick: old tire 6.6 % of item rewards, standard 1.2 %. The standard tire was
  only on the B and A gates; the old tire is on C and B. In the DEC-204 price window (0.7–1.3× the card's top) the old tire
  ($4 item cost) wins short jobs and the standard ($9) only a band around 4-min pars.
### Built [DEFAULT]
- tireStandard stock weight 10 → 20 (the shelf and the reward pick share the table).
- tireStandard reward gates B, A → C, B, A.
- P_FILL 0.037 → 0.074, LIFE_H 6–48 → 3–21 h: still ~3 items, turnover 3.1 → 6.1 new per shop per day, mean life 12 h.
### After (same census)
Standard tire on the shelf 31 % of hours (arrives 0.75 per shop per day, was 0.20); 9.2 % of item rewards (old 2.0 %).
At a 2-min par the window still hands out the old tire (DEC-204 / DEC-226, standing; not touched).

## Tracker
- [x] Measure the shelf and reward rates over many seeds and days
- [x] Build the proposed numbers; shop-stock and offer-board gates green
- [ ] Owner approves the numbers (card machine-1117-look)

## Decisions
- 2026-11-17, agent (DEC-375, draft): the numbers above, awaiting the owner.

## Open questions
- The numbers (card). Also: should the old tire's reward share fall as it does here (6.6 → 2.0 %), or stay?

## Files
`data/shop-stock.js` · `data/stock-weights.js` · `data/offers.js` · `test/shop-stock.mjs`

## Log
- 2026-11-17: built edb1f0e9 (land/machine-1117). shop-stock, offer-board green.
- 2026-11-17 (lane C): owner's answer, DEC-408: standard tire weight 15; LIFE_H 6–68 h (P_FILL 0.074 kept) = 4.50 rotating items measured (≤ 2 items 3.7 % of hours; new items 2.9/shop/day, was 5.8); old tire reward weight 30, REWARD_ONLY. Item-reward shares: standard 9.2 → 6.7 %, old 2.0 → 6.4 %.

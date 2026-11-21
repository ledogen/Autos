---
id: FEAT-321
type: feature
status: open
severity: minor
opened: 2026-11-21
source: owner, 2026-11-21 (card reward-pool-dilution) — "raise the item reward share to about 50%. i.e. half of all missions offer item rewards. add shocks/springs to the gas station pool."
relates: DEC-476, FEAT-259, FEAT-168, DEC-022, DEC-226, DEC-408, DEC-439, data/offers.js
---
lane: A

# FEAT-321: Half of all missions offer an item reward; springs and shocks at the gas station

## Next steps
Lane a: lands with land/wave3-1120. Nothing owed.

## Summary
The card's census had 63.7 of 100 offers paying cash only. The owner wants about half of them to offer an item,
and the gas station to hand out springs and shocks. Built at the roll that decides whether an offer carries an item.

## Description
### Built
- `BONUS_CHANCE` 0.40 → 0.55 (data/offers.js). Per source the share is still `BONUS_CHANCE` where it has rewards
  (offer-board gate 13); over the whole board some offers can carry none (a light freight load), hence 0.55 for 50.
- Springs and dampers leave the `suspension` category for their own, `springs` (PART_REWARD_CAT). The auto shop,
  farm, work site and residence (rare) list both, so their pools are unchanged; the gas station lists `springs` only.
  "Gas station pool" read as the REWARD pool, not the shop shelf (both exist; the card was about rewards).

### Census (wip/feat-321/census.mjs: the card's script; 30 seeds × 14 days, 3 looks a day, 6,763 offers)
| per 100 offers | before | after |
|---|---|---|
| cash only | 63.7 | 49.8 |
| consumables, food, camp | 27.3 | 37.9 |
| parts (not tires, springs, dampers) | 3.7 | 5.1 |
| tires | 3.6 | 4.7 |
| tools | 1.0 | 1.4 |
| springs | 0.4 | 0.5 |
| dampers | 0.3 | 0.6 |

Item share 50.2. Of item rewards: tires 9.9 % → 9.4 %, old tire 4.2 % → 4.0 %, standard 3.0 % → 2.8 % (DEC-408's
5–6 % was measured on 120 seeds × 8 days; the weights are untouched, so the ratio holds). Cash line per offer is
the full line either way (DEC-022): mean payMult 0.9708 → 0.9742 (+0.35 %; the big-tipper trait, pay 0.80, never
rides a bonus offer: 4.8 → 3.8 per 100), mean tipMult 1.0287 → 1.0228. Mean item cost per offer (what taking the
item takes off the cash, ITEM_COST_FRAC 0.5) $1.29 → $1.78.

## Tracker
- [x] Item share 50 ± 3 per 100 offers at the source roll (50.2)
- [x] Springs and dampers in the gas station's reward pool
- [x] Census before/after in the ticket
- [x] Affected gates green

## Decisions
- 2026-11-21, owner: "raise the item reward share to about 50%. i.e. half of all missions offer item rewards. add shocks/springs to the gas station pool." (DEC-476)

## Files
`data/offers.js` · `wip/feat-321/census.mjs` (git-invisible)

## Log
- 2026-11-21 (lane a): built on land/wave3-1120; offer-board, shop-stock, inventory gates green.

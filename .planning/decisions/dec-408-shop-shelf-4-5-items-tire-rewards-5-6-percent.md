---
id: DEC-408
status: standing
decided: 2026-11-17
area: economy
governs: FEAT-259, machine-1117-look, data/shop-stock.js, data/stock-weights.js, shop-stock, reward, tire, P_FILL, LIFE_H, DEC-375
supersedes:
---

# DEC-408: A shelf shows 4.5 rotating items; the standard and the old tire are each about 5-6 % of item rewards

**Ruling.** "Set the standard tire shelf weight down to 15, The fill chance increasing does most of the work we need. Set the shelf life of an item a little higher, The goal should be to have 4.5 rotating items.for share of item rewards, standard tire and old tire, should be about equivalent. Maybe around five or six percent"

Readings (the lane's): the standard tire's weight 20 → 15; P_FILL stays 0.074; LIFE_H 3–21 h → 6–68 h (mean 37) is the one number that gives 4.5 of 6 slots (measured 4.50). To make the old tire's reward share equal the standard's, its weight 10 → 30 and it leaves the rotating slots (REWARD_ONLY; it is an ALWAYS row, so a rotating copy shows nothing). Measured over 120 seeds × 8 days: standard 9.2 % → 6.7 %, old 2.0 % → 6.4 % of item rewards.

**Why.** More rotating stock on the shelf (4.5 not 3); the standard tire arrives by the shelf's fill chance, not an outsized weight; the two cheap tires equally likely as a reward.

**Replaces.** DEC-375 is left as it is (draft; its standard-tire weight 20, its life 3–21 h and its 3-item shelf are replaced by this record; its P_FILL 0.074 and its C-gate for the standard tire stand). Not set to superseded here: a draft cannot be superseded by tooling.

**Source.** Owner's answer on card machine-1117-look, 2026-11-17. Owner's words; readings marked.

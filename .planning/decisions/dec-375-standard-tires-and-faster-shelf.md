---
id: DEC-375
status: draft
decided: 2026-11-17
area: economy
governs: FEAT-259, data/shop-stock.js, data/stock-weights.js, data/offers.js, shop-stock, reward, tire, P_FILL, LIFE_H
supersedes:
---

# DEC-375: Standard tires turn up more often; the auto-shop shelf turns over faster

**Ruling.** (Agent's numbers, awaiting the owner on card machine-1117-look.) The owner asked: "I think they should rotate
into the store a little bit more often than other items as well as That come up as mission reward more often. Increase
the frequency at which new stock comes into the store as well."
- The standard tire's stock weight 10 → 20 (Often × 2; the shelf and the reward pick share it).
- The standard tire's reward gates B, A → C, B, A.
- P_FILL 0.037 → 0.074 and LIFE_H 6–48 → 3–21 h: still ~3 rotating items per shelf, ~1.85× the new arrivals.

**Why.** Measured over 200 random seeds × 8 days (wip/machine-1117/stock-census.mjs): the standard tire was 1.2 % of item
rewards against the old tire's 6.6 %, because it was offered only on the B and A gates; on the shelf it sat 18 % of hours
(the old tire is always there). After: standard 9.2 % of item rewards (old 2.0 %), 31 % of shelf hours; 3.1 → 6.1 new items
per shop per day.

**Replaces.** FEAT-168's P_FILL 0.037 / LIFE_H 6–48 (owner-approved 2026-10-22 and 2026-11-05; the ~3 items stand) and the
standard tire's reward gates from the 2026-10-22 setup page.

**Source.** Inbox 20261117105026-9xle, 2026-11-17; numbers by the machine lane.

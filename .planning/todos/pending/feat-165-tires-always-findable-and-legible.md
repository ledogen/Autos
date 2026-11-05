---
id: FEAT-165
type: feature
status: open
severity: major
opened: 2026-11-04
source: owner, 2026-11-04 (page inbox) — "huge issue. i keep tearing through tires over the first day and cant find a place to pick up new ones. missions arent offering any and shops arent either. i think we need to make sure shops always offer standard/old tires but increase the price a little" · "we should be able to tell if a tire is standard or old, etc from the vehicle diagnostics screen"
relates: FEAT-137 (rotating shelf), FEAT-104 (shop), data/parts.js tireOld / tireStandard, abcc01f3 (durTire ×1.5, 11-03 — already live when this was played)
---
lane: B

# FEAT-165: tires are always for sale, and the diagnostics screen says which tire is on

The 11-03 durability change (tires last 50 % longer) was already on Pages when this was played, and tires
still ran out on day 1 with none for sale.

## What

1. **Every shop shelf always stocks Old and Standard tires**, outside the rotation (FEAT-137's rotating
   slots stay as they are). They cost a little more than today because they are always there.
   Price is the owner's call. Default: Old $7 → **$8**, Standard $15 → **$18** (≈ +15–20 %) `[DEFAULT]`.
2. **The diagnostics screen names each tire's type** (Old / Standard / Sport / All-terrain / Load-range E /
   …), next to its wear.

## Acceptance

- [ ] Every shop shelf, every visit, holds `tireOld` and `tireStandard`; a headless check over N seeds × days.
- [ ] The two prices raised (default above, or the owner's numbers), on the shelf and in the card.
- [ ] Diagnostics shows the part name of each of the four tires.
- [ ] The owner confirms the price.

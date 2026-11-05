---
id: FEAT-165
type: feature
status: closed
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

- [x] Every shop shelf, every visit, holds `tireOld` and `tireStandard`; a headless check over N seeds × days.
      (Superseded 11-05 by FEAT-168 item 4, the owner's later ruling: ALWAYS = old tire + air filter + plug kit;
      the standard tire rotates at weight 10. `shop-stock.mjs` §7 pins that set.)
- [x] The two prices raised (default above, or the owner's numbers), on the shelf and in the card.
- [x] Diagnostics shows the part name of each of the four tires.
- [x] The owner confirms the price.

## Built — 2026-11-05 (Lane B, feature/machine)

- **Always for sale** (cf385fba). `data/shop-stock.js` ALWAYS = Old + Standard. `shelf()` lists them new,
  after the four rotating slots, with no expiry, and buying one never empties it. The map card's shelf
  says "always" and the service screen says "always in stock". The rotation itself is unchanged.
- **Prices** in `data/parts.js` (the part's own price, so the shelf, the map card and resale agree):
  Old $7 → **$8**, Standard $15 → **$18** `[DEFAULT, the owner confirms]`.
- **Diagnostics** (386698de): a tire's row in the worst-parts list and its hover tip read
  "Tire FL · Old tire". The new `DamageScreen.partName` hook is set by main.js from the fitted parts.
- **Gate:** `shop-stock.mjs` §7 checks every shop, every half hour of 12 days × 5 seeds, holds both tires
  new, and that buying one leaves it. `service.mjs` and `offer-board.mjs` stay green.

Owed: the owner confirms the two prices. The browser smoke is held by the compute hold.

## Resolution — 2026-11-06 (Lane B), closed on evidence

- The owner confirmed the prices on the tracker page (`feat165-price`, 2026-11-05 14:43: "Old $8 · Standard
  $18"), the shipped values.
- On main since e8a6d460. Landing smokes on main have passed since (23/23), so the held browser smoke is covered.
- The always-stocked set is now FEAT-168's (old tire, air filter, plug kit), on main as 3ea5578c.

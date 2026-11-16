---
id: FEAT-231
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "I feel like we've had idle agents for some time Is there just not tickets for these things?" (minted from FEAT-121's audit, proposal 4)
relates: FEAT-121, FEAT-115, FEAT-116, data/items.js, data/parts.js, src/physics.js
---
lane: Spare

# FEAT-231: Bed friction — the rubber mat (μ 0.30) and the bedliner (μ 0.60)

## Next steps
Landed (c7231fb2, land/feat-231). Owner: look card `feat231-bed-grip-look` (the two placeholder prices, and whether mat and bedliner
stay inventory tools or become a bed-floor part slot, DEC-028). Every box ticked.

## Summary
Both are ratified (owner, 2026-10-22) and neither does anything. The rubber mat is an item and a reward with no
effect; the bedliner does not exist. They raise cargo-to-floor friction in the bed: they stop sliding, not bouncing.

## Description
Rulings, from FEAT-121's rows: rubber bed mat μ 0.30, $5–10 at the auto shop, a B–A reward from the firewood yard,
never found. Bedliner μ 0.60, never wears out, $10–30 at the auto shop "very rarely", an A–S reward from the
firewood yard (haul jobs), never found. Both still need an in-game visual (not this ticket).

## Tracker
- [x] Mat fitted: loose cargo in the bed sees floor friction 0.30
- [x] Bedliner item/part exists; fitted: 0.60
- [x] Auto-shop shelf and the two reward rows as ruled
- [x] A headless check: the same cargo and manoeuvre slides less with each

## Decisions
- "Fitted" = owned: both are `tool` items in data/items.js with a `bedMu` (the pair μ a firewood bundle sees, 0.8
  friction); the best one owned sets the floor pan (src/inventory.js bedMu → src/physics.js setBedGrip). Walls and
  wheelhouses keep the bare 0.15. Box3D mixes friction by geometric mean √(μa·μb), so the floor carries μ²/0.8:
  bare 0.028, mat 0.1125, liner 0.45. Other cargo lands near: a tire (0.9) 0.32 / 0.64, a drum (0.5) 0.24 / 0.47.
- Neither wears: the mat had no wear model, so the liner's "never wears out" needs none.

## Open questions
- Prices [DEFAULT]: mat $8 (of $5–10), bedliner $20 (of $10–30). Shelf weight: mat 4 (Sometimes, none ruled),
  bedliner 0.25 (Hardly ever, the lowest tier, for "very rarely"). Bedliner mass 10 kg [DEFAULT].
- DEC-028 says bed upgrades are parts. These are built as items (the mat already was). Move both to a bed-floor part slot?

## Files
src/physics.js (setBedGrip), src/inventory.js (bedMu), src/main.js (inventory onChange), data/items.js, data/offers.js,
data/shop-stock.js, data/stock-weights.js, test/bed-grip.mjs (gate).

## Log
- 2026-11-16: minted from the FEAT-121 audit.
- 2026-11-16: built (e7fa231c). bed-grip gate: break-loose at 0.163 / 0.312 / 0.604 g for μ 0.15 / 0.30 / 0.60.
  fingerprint-physics identical to main (it has no bed; bare floor value is the same expression). Unverified: in-game.

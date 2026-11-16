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
Spare lane: build both effects, the auto-shop shelf and the bedliner item.

## Summary
Both are ratified (owner, 2026-10-22) and neither does anything. The rubber mat is an item and a reward with no
effect; the bedliner does not exist. They raise cargo-to-floor friction in the bed: they stop sliding, not bouncing.

## Description
Rulings, from FEAT-121's rows: rubber bed mat μ 0.30, $5–10 at the auto shop, a B–A reward from the firewood yard,
never found. Bedliner μ 0.60, never wears out, $10–30 at the auto shop "very rarely", an A–S reward from the
firewood yard (haul jobs), never found. Both still need an in-game visual (not this ticket).

## Tracker
- [ ] Mat fitted: loose cargo in the bed sees floor friction 0.30
- [ ] Bedliner item/part exists; fitted: 0.60
- [ ] Auto-shop shelf and the two reward rows as ruled
- [ ] A headless check: the same cargo and manoeuvre slides less with each

## Open questions
- Prices inside the ruled ranges (placeholders until answered): mat $5–10, bedliner $10–30; the bedliner's shelf weight.

## Log
- 2026-11-16: minted from the FEAT-121 audit.

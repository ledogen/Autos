---
id: DEC-017
status: standing
decided: 2026-10-21
area: economy
governs: FEAT-138, SM-INV-2, src/economy.js, rank thresholds
supersedes:
---

# DEC-017: Rank thresholds step by region, never by day

**Ruling.** No rank threshold moves with the day, on any type; thresholds are a table keyed by type and region, and they never read the player's truck. Within a region the stock truck tops out around B or A and that region's upgrades reach S.

**Why.** "A player should see the progression of themselves going from struggling to get B or A rank to getting S rank because of the upgrades they made to their truck within the region."

**Replaces.** The day ramp on the thresholds (`rankThresholds(day)`, 2026-08-01 / 2026-09-07 "tightening a flat −0.02 by day 20"); DESIGN.md's performance-model table row "rank thresholds | run day | tighten" is stale.

**Source.** design-amendments-2026-10-21-mission-recut.md §11b; DESIGN.md SM-INV-2 amendment [OWNER 2026-10-21]. Owner's words.

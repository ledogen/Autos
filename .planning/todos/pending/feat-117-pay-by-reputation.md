---
id: FEAT-117
type: feature
status: open
severity: major
opened: 2026-10-14
source: owner, 2026-10-14 — "Pay does not scale with day tier — it scales with work done (1.xx ×
  reputation bonus in post-mission card). Costs do scale with day tier. Difficulty setting can
  influence the cost scaling." And: "simple reputation system, based on good deeds in region. 1.xx
  times reputation multiplier visible on post-mission card to communicate it to the player."
relates: FEAT-69 (the numbers this needs), FEAT-53 (economy spine), src/economy.js (`payoutFor`,
  `basePay`, `dayTier`, `regionTier`), FEAT-28 / SM-4 (the real region index)
invariants: SM-INV-4 (continuous pay), SM-INV-14 (good deeds), SM-INV-9 (resets with the run)
design: design-amendments-2026-10-14.md §12–13
---

# FEAT-117: Pay grows with reputation, not the day

## Request

- **Day tier leaves pay.** `payoutFor` and `basePay` use `regionTier × reputation`; `dayTier` stays
  for costs only (the day's cost anchor, repairs, gas, parts).
- **Reputation per region.** Earned by good deeds in the current region (the mission points the
  economy already tracks). Capped. Starts over in each new region; resets with the run.
- **The result card shows it:** "Reputation ×1.xx".

**Retired:** "accept at 1 a.m., buy tomorrow's rate" and the tip riding `dayTier` (2026-09-30).

## Open — solved in FEAT-69

The cap, the points to reach it, and the curve between. The cap must sit below the region step so
moving on is always a raise.

## Acceptance

- [ ] `payoutFor` / `basePay` no longer read `dayTier`; `economy.mjs` covers the new terms.
- [ ] Reputation rises with good deeds in the region, caps, and resets on entering a new region.
- [ ] The result card shows the multiplier; the offer card's base pay includes it.

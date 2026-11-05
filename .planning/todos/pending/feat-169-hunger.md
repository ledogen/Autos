---
id: FEAT-169
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 (first serious playthrough) — "can we move hunger up on the ticket priority? i wasnt prioritizing food at all since it does nothing."
relates: items.md §1d (the ratified design), FEAT-121 (every food row says "needs: hunger"), src/day.js (the energy drain), FEAT-67 dinnerMeal (dine-in waits on this)
invariants: SM-INV-10 (no hunger number, no hunger bar)
---
lane: A

# FEAT-169: Hunger — a rate on the energy drain

Every food in the game does nothing today. The design is ratified in items.md §1d, and this ticket builds
it. Hunger is **not a meter**. It is a multiplier on the energy drain that already ships (src/day.js:
awake drains 1 h of energy per game hour).

## What

1. **A hunger clock on the driver:** game hours since the last meal, against that meal's **hold**.
2. **Past the hold, energy drains faster:** ×1.25, rising to ×1.5 (ruled 2026-10-20). Rise linearly over
   4 h past the hold `[DEFAULT]`. Asleep, nothing drains, as today.
3. **Each food carries its own hold** (items.md §1d roster): a standard meal / burger 8 h, chili dog 10 h,
   dinner meal 8 h, packed lunch 8 h, groceries cooked at camp 10 h, potato 4 h, snacks 2–3 h. Eating
   resets the clock to that food's hold. Only the foods that exist as items today need their holds now.
4. **Being fed works:** `dinnerMeal`'s "stay for dinner" (FEAT-67) feeds you fully, and the chili dog is
   eaten from the inventory.
5. **No number, no bar (SM-INV-10).** The driver *is hungry*: a line on the energy meter's stage text
   ("Hungry — tiring faster"), never a gauge.
6. **Sleep and hunger** (items.md's open question). `[DEFAULT]` is the doc's simplest: you wake already on
   the clock, as if you'd eaten when you went to sleep. A meal at camp (cooking kit, fish) makes waking
   count as a fresh meal. The owner can flip it.

Spoilage (items.md §1b) is not part of this. It is its own ticket when bought food exists.

## Acceptance

- [ ] A headless check: unfed past the hold, a waking day is measurably shorter (report the hours lost
      at ×1.25 → ×1.5); fed on schedule, it matches today's.
- [ ] Eating a chili dog and staying for dinner each reset the clock with their own hold.
- [ ] The energy meter says "hungry" past the hold; there is no new gauge.
- [ ] The owner plays a day without eating and feels the day get shorter.

---
id: FEAT-169
type: feature
status: closed
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 (first serious playthrough) — "can we move hunger up on the ticket priority? i wasnt prioritizing food at all since it does nothing."
relates: items.md §1d (the ratified design), FEAT-121 (every food row says "needs: hunger"), src/day.js (the energy drain), FEAT-67 dinnerMeal (dine-in waits on this)
invariants: SM-INV-10 (no hunger number, no hunger bar)
---
lane: A

# FEAT-169: Hunger — a rate on the energy drain

**Waiting on the owner (2026-11-07):** `feat169-play` (a day without eating feels shorter), the three `[DEFAULT]`s below, and, with FEAT-173, the call to turn hunger on (`DAY_PARAMS.hungerOn` is off on main). Built and on main (cb5dcf84).

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

- [x] A headless check: unfed past the hold, a waking day is measurably shorter (report the hours lost
      at ×1.25 → ×1.5); fed on schedule, it matches today's. **day-clock §10: fed 16.00 h, unfed 13.67 h —
      2.33 h lost.**
- [x] Eating a chili dog and staying for dinner each reset the clock with their own hold.
- [x] The energy meter says "hungry" past the hold; there is no new gauge.
- [ ] The owner plays a day without eating and feels the day get shorter.

## Built — 2026-11-05 (feature/run-shape, Lane A; 44badad6, cc081dee)

- `src/day.js`: `DAY_PARAMS.hungryRate 1.25 / starvingRate 1.5 / hungryRampH 4 [DEFAULT] / mealHoldH 8`;
  `eat(holdH)`, `hungry()`, and the drain's hunger share `_hungerCost(h0, h1)` — closed form (flat, a linear
  ramp, flat), so `advanceMinutes` charges a skip exactly what living it costs. Saved as `fedUntilH`; a save
  from before hunger restores fed. Debug folder: the four sliders + "eat a standard meal".
- **A meal never shortens a running hold** `[DEFAULT]` (a snack after a burger does not make you hungrier).
- **A run starts on a standard meal; bedtime counts as one** `[DEFAULT]`, the ticket's item 6: an 8 h night
  wakes right at the edge of hungry, so breakfast matters. A camp meal (cooking kit, fish) making waking a
  fresh meal waits for those meals to exist.
- Foods today: the chili dog (`use: 'eat'`, `hold: 10`, eaten from the inventory or a quick slot) and the
  dinner invitation (30 min at the table, then fed like a standard meal, `mealHoldH`). The others get a `hold`
  when they become items.
- Energy meter: "Energy · rested · hungry" (the stage's colour; SM-INV-10, no gauge).
- Gates: day-clock §10 (sections 1–9 now pin the FED driver's arithmetic, rates set to 1 there); cdp-smoke's
  `opening` step: past the first meal the meter says hungry, a chili dog clears it.

**Owed by the owner:** the play-test (a day without eating feels shorter); the three `[DEFAULT]`s above.

## Resolution — the owner's play call (feat169-play, 2026-11-07), built (Lane A)

Owner, verbatim: "there is no hunger indicator. i think i wanted stuffed / full / content / peckish / hungry just as a
word that appears in the sleep box. i tried toggling it on in debug. turn it on by default but leave the toggle for me
in case i want to turn it off in playthrough. add the status words"

- **Hunger is on by default** (`DAY_PARAMS.hungerOn: true`). The debug folder's **hunger** checkbox still turns it off.
- **The status words**, in the energy meter's stage text ("rested · full"), by the hours left on the current meal's
  hold: **stuffed** ≥ 6 h, **full** ≥ 4 h, **content** ≥ 2 h, **peckish** while any is left, **hungry** past it
  (`DAY_PARAMS.hungerWords`, the thresholds `[DEFAULT]`). Hungry is exactly when the drain runs faster. With hunger
  off, no word shows. A word, never a number (SM-INV-10).
- Gates: `test/day-clock.mjs` walks the words down a 10 h hold and checks there is none with the toggle off. The
  smoke's hunger block (hungry past the first meal, a chili dog feeds you) now runs, since hunger is on.

**2026-11-08, owner (owed hunger-numbers): "keep"** — the measured hunger numbers stand (6/6 seeds won, food
$5–7.50 a day).

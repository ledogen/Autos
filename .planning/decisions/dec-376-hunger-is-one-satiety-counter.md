---
id: DEC-376
status: standing
decided: 2026-11-17
area: economy
governs: FEAT-250, FEAT-169, FEAT-198, DEC-310, src/day.js, data/items.js, src/main.js, hunger, satiety, food
supersedes:
---

# DEC-376: Hunger is one satiety counter; each food adds its own number, so foods stack

**Ruling.** "I'd like to change hunger to a system where food items can be stacked together I think a simple hunger
counter that decreases over time through the stuffed full content zones and is added to by foods that each have Their
own number that they add. This number is the satiety that the food contributes."

Readings (the lane's, not the owner's words):
- The counter is hours of drain: it falls 1 an awake hour and stands still asleep (FEAT-173). Each food's satiety is its
  old `hold`, one for one (burger 8, chili dog 10, cooked groceries 10, cooked potato 4, snacks 2–3).
- The zones are the counter's ranges, unchanged: stuffed 6 and up, full 4–6, content 2–4, peckish 0–2, hungry below 0,
  where the drain ramps ×1.25 → ×1.5 as before. Eating when hungry starts the counter from 0.
- The cap is 12 h [DEFAULT, on the owner's card food-1117-numbers]: what a meal adds past it is wasted. The hunger bar's
  full end is the cap.
- The cooking kit's +20 % (DEC-310) is +20 % satiety. Nothing on screen shows the number (SM-INV-10).

**Why.** A food eaten while still fed used to do nothing past the longer of the two holds.

**Replaces.** items.md §1d's [DEFAULT] "a snack after a burger never shortens a hold" (the longer hold won, nothing added).

**Source.** Owner, chat, 2026-11-17 (FEAT-250). Owner's words; readings marked.

---
id: FEAT-173
type: feature
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed by the orchestrator, verbatim) — "Huge bug. Mom's tutorial mission should leave you fed in the morning. I think if you skip it you don't end up getting fed, but regardless sleeping should not run the hunger meter. That way a player can eat at camp at night and wake up and start driving without any wasted satiation. The player should also start with three middle to weak food items in their inventory at the start of every run. Maybe a snack that mom provides them."
relates: FEAT-169 (hunger), FEAT-170 (the opening / skip), items.md §1d, the run soak's recount (job rewards alone don't feed a run)
---
lane: A

# FEAT-173: hunger — sleep doesn't run it, the tutorial ends fed, every run starts with mom's snack

## Built (Lane A, 2026-11-06)

1. **Sleep doesn't run the hunger clock.** `src/day.js sleep()` moves the meal hold's end forward by the hours
   slept, so what is left of the hold at bedtime is left at waking. A hungry bedtime wakes exactly as hungry. This
   retires the old [DEFAULT] "bedtime counts as a meal": with the clock stopped overnight, that rule would give
   everyone a full meal every morning and make the owner's evening meal at camp pointless. items.md §1d's open
   question is marked ruled.
2. **The tutorial's night ends fed, played or skipped.** `main.js _endEvening()` serves a standard meal (8 h).
   Every way the evening ends goes through it: sleeping at mom's, the M-hold skip, and the 07:00 fallback for a
   player who never sleeps. That is why the skip used to leave you hungry: it never reached the breakfast card's
   meal, the only one there was. The breakfast card stays as words only.
3. **Every run starts with three packed lunches** (a new `packedLunch` item in `data/items.js`: food, 8 h, 0.5 kg,
   never sold; items.md's packed lunch, with its existing bag icon). They stack in one slot. They are granted at
   the run's start after the jalopy roll, so a resumed run keeps its own inventory instead. The item's words are a
   PLACEHOLDER for the owner's.

Hunger itself stays OFF on main (`DAY_PARAMS.hungerOn`, 3456791f, for the playtest: no food is buyable yet). These
rules make turning it back on viable. The flip is the owner's call.

Gates: `test/day-clock.mjs` (a hungry bedtime wakes as hungry; a meal before bed is all there in the morning) and
`test/inventory.mjs`. The cdp-smoke story step checks the lunches and the fed morning after a skip.

## Owed by the owner

- The packed lunch's words (name, flavour line). Is "middle to weak" right as a standard 8 h meal ×3? The weak
  snacks in items.md (peanuts, chips, candy bar, gummy worms) aren't built yet.
- Whether hunger comes back on now.

## Acceptance

- [x] Sleeping doesn't move the hunger clock (gate: day-clock).
- [x] The tutorial's morning is fed, played or skipped (smoke: story, opening).
- [x] Every run starts with three of mom's packed lunches (smoke: story).
- [ ] The owner's words for the lunch, and the hunger-on call.

---
id: DEC-360
status: standing
decided: 2026-11-17
area: economy
governs: FEAT-184, DEC-159, DEC-152, DEC-299, DEC-357, src/main.js, src/day.js, dayTier, tutorial, day counter
supersedes: DEC-159
---

# DEC-360: The tutorial is day 0 and ends in day 1; every run's first free day is day 1

**Ruling.** Owner, card tutorial-test-drives, 2026-11-17, verbatim: "I think it would be better if the tutorial started in day zero and finished in day one and all runs started on day one. Base one is more familiar to people especially for a day counter in a video game. That fits in naturally with the gameplay loop and the tutorial can be day zero and I think it will Makes sense mentally". As built: OPENING_START.day 0 (was -1), FREE_WILL.day 1 (was 0); a played tutorial and a skip still enter free will on the same day (DEC-159's point stands), and the 24 tutorial hours are day 0. The day-tier table, the expedition grade and minDay gates are NOT shifted.

**Why.** Base-one counting reads naturally; the old numbering put a played run's first free day at 0.

**Replaces.** DEC-159's wording ("the tutorial's 24 hours count as the day before", day -1 / day 0). Its point, the same day for both entries, is kept. Every day number in DEC-152/299/357 reads one higher (06:30 on day 1, 07:00 on day 1). Side effect, flagged to the owner: costs (dayTier) now rise one day sooner than before, since the first free day is tier 1 and the old extra tier-1 day is gone.

**Source.** ledorepo `answered/tutorial-test-drives.answer-2026-11-17.json` (round 3 play-test) and `answered/tut-dialogue-look.answer.json`.

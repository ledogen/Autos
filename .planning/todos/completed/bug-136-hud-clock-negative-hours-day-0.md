---
id: BUG-136
type: bug
status: closed
severity: minor
opened: 2026-11-07
source: Spare, BUG-133's night frames (the HUD read "Day 0, -2 am" at 22:00 after daySystem.advanceMinutes); confirmed by Lane A
relates: FEAT-170 (the opening's evening is day 0), src/offer-board.js formatDue
---
lane: A

# BUG-136: the clock reads negative hours on day 0 ("Day 0, -2 am")

## What happened

The run's clock (`daySystem.clockH()`) counts hours from midnight before day 1. The played opening's evening is
**day 0**, before that zero: the firing is at 18:00 on day 0, which is −6 h. `formatDue`, the one formatter for the run
HUD's clock, the shop screen's clock and an expired job's "was due", took minutes-of-day with JavaScript's `%`, which
keeps the sign. So every time on day 0 read wrong:

| clock | read | should read |
|---|---|---|
| −6 (day 0, 18:00, the firing) | Day 0, -6 am | Day 0, 6 pm |
| −2 (22:00) | Day 0, -2 am | Day 0, 10 pm |
| −0.5 | Day 0, -1:-30 am | Day 0, 11:30 pm |

A played opening shows it for its whole evening, because the evening holds the clock at 18:00. A skipped opening
sleeps straight to 07:00 on day 1, so it never shows it. Day 1 onward was always right.

## Fixed (Lane A, 2026-11-07)

`formatDue` takes a floored modulo, `((t % 1440) + 1440) % 1440`, so minutes-of-day are never negative. The day
number already used `Math.floor` and was right.

## Proof

- `test/offer-board.mjs` (BUG-136) checks the readings either side of midnight, day 0 included: −6, −2, −0.5, −0.01,
  −24, −25, 0, 1, 7, 23.5 and 47.9999. With the old line it fails on exactly the reported readings.
- cdp-smoke: the `opening` step reads the HUD clock at the firing ("Day 0, 6 pm"). The `story` step reads it after the
  skip ("Day 1, 7 am").

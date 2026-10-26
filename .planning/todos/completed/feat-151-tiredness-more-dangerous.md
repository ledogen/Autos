---
id: FEAT-151
type: feature
status: done
severity: minor
opened: 2026-10-26
source: owner, 2026-10-26 — "Being tired in general is not dangerous enough. All three levels need more frequent interruptions and the latter ones need to increase duration as well."
relates: FEAT-45 (sleep), src/day.js DAY_PARAMS blink*, SM-INV (DESIGN.md sleep section)
---
lane: A

# FEAT-151: Tiredness — more frequent blinks at every stage, longer dozes in the later ones

## What

`src/day.js` DAY_PARAMS: blinks are Poisson with mean gap `blinkMeanSleepyH / TiredH / ExhaustedH`,
all 1 in-game hour. Doze holds: tired 200–600 ms, exhausted 400–1000 ms, sleepy is a harmless
250 ms blink. The owner's ruling: all three stages blink MORE often; tired and exhausted dozes
also get LONGER.

Proposal (Lane A tunes by feel on :3731, the owner drives it):

| knob | now | proposed |
|---|---|---|
| blinkMeanSleepyH | 1 | 0.5 |
| blinkMeanTiredH | 1 | 0.33 |
| blinkMeanExhaustedH | 1 | 0.2 |
| tiredMinMs / MaxMs | 200 / 600 | 300 / 900 |
| exhaustedMinMs / MaxMs | 400 / 1000 | 700 / 1600 |

Keep the stage thresholds (sleepyAtH 4 / tiredAtH 2 / exhausted 0) and the steer scale untouched:
the ask is cadence and duration, not onset. The GUI sliders for these exist; the defaults move.
n = 1 is not calibration: state the numbers you shipped and why in the ticket's resolution.

## Acceptance

- [ ] Each stage blinks visibly more often than today (means per the table or the owner's override).
- [ ] Tired and exhausted dozes are longer; sleepy's blink stays harmless (no control loss).
- [ ] Sleep-debt and recovery arithmetic unchanged (day.js header contract).
- [ ] DESIGN.md's sleep section updated if it states the cadence.

## Resolution (2026-10-26)
Shipped the proposal table as the `DAY_PARAMS` defaults in src/day.js. The owner drove it and approved.
At 1 in-game hour ≈ 1 real minute, the mean gap between blinks is ~30 s sleepy, ~20 s tired and
~12 s exhausted (all were ~60 s). Dozes hold 300–900 ms when tired and 700–1600 ms when exhausted.
Thresholds, the sleepy blink, steer scaling and the sleep-debt arithmetic are untouched;
`test/day-clock.mjs` passes. DESIGN.md's sleep section states no cadence, so it is unchanged.
The ticket said GUI sliders exist for these knobs; they don't (DAY_PARAMS has none). Tuning stays
by editing day.js.

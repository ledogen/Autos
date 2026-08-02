---
id: FEAT-55
type: feature
status: closed
opened: 2026-08-02
closed: 2026-08-02
severity: minor
source: owner ruling in-session 2026-08-02 (same sitting as the FEAT-54 run-shape deltas)
relates_to: >
  FEAT-47 (day clock — this amends its energy model), FEAT-45 (sleep arithmetic), FEAT-54
  (landed alongside), SM-INV-1 (doze is never a fail state — unchanged)
---

# FEAT-55: Sleep debt — the energy meter runs to −8, and the night repays it

## The ruling (owner, 2026-08-02, verbatim intent)

As shipped, the moment a player hits exhausted (0 h) there is no further penalty to staying up:
0 h and −4 h (clamped to 0) both need the same 8 h at a good site to refill. Fix: **let the
energy meter run down to −8 h** — up to one night's worth of debt to repay at sleep. And the
deprivation stage needs a visible overlay: **on the existing sleep slider and energy bar, as
colours — sleepy = yellow, tired = orange, exhausted = red.**

## What shipped

- **`day.js`**: `DAY_PARAMS.sleepDebtMaxH = 8`; the three energy writes (update, advanceMinutes,
  previewWake) floor at `−sleepDebtMaxH` instead of 0. The night repays automatically because
  sleep() already starts from current energy — no new arithmetic. The STAGE ladder is untouched:
  everything ≤ 0 is plain 'exhausted' (the debt deepens the ledger, not the punishment —
  SM-INV-1 doze consequences unchanged). New: `stageFor(e)` pure helper (stage() delegates),
  `debtFloorH()` accessor, `STAGE_COLOR` export — sleepy/tired/exhausted reuse the ratified
  RANK_COLOR hexes for B/C/D (yellow/orange/red escalate the same everywhere); rested is white
  (owner listed only the three; veto point).
- **`main.js` `_syncSleepRow` + `index.html`**: the bar's domain is now [−8, 16] with a 1 px
  zero tick (`.ezero`); segments grow RIGHT from the tick for energy, LEFT for debt. Fill wears
  the current stage's colour, the preview wash wears the WAKE stage's colour (so the bar answers
  "what state do I wake in"), the slider's accent-color matches the wake stage, and the text row
  names the wake stage in its colour. Debt is always left-of-tick and always red (negative IS
  exhausted).
- **`test/day-clock.mjs`**: pins `sleepDebtMaxH 8`; new checks — 18 h awake = −2 (debt accrues),
  floor holds at −8 through a binge, negative is plain 'exhausted', the ratified 8 h average
  night from −2 wakes at 14 not full, and a 4 h worst-site night from −8 wakes at −8/3 — still
  exhausted. The "empty + 8 h = full" headline now starts from exactly 0.

## Acceptance

- [x] Energy drains below 0 to a −8 floor; 0 h and −4 h bedtimes are different nights (gate)
- [x] Stage ladder unchanged — negative energy is 'exhausted', no new stage, doze cadence
      untouched (gate: flag-off inertness still green)
- [x] Sleep/preview one-code-path preserved (previewWake still IS sleep()'s arithmetic)
- [x] Meter shows debt left of a zero tick; fill/preview/slider colored by stage
- [x] `npm test` green (day-clock + economy + the main.js-affected gates, 5/5)

---
id: BUG-227
type: bug
status: open
severity: minor
opened: 2026-11-18
source: lane agents (FEAT-288 P6 strip, P8 check), 2026-11-18
relates: FEAT-287, BUG-215, FEAT-288, src/alerts.js, src/main.js
---
lane: Free lane

# BUG-227: Free roam first, then New game: the starting truck's bent wheels are announced as alerts under the first card

## Next steps
Fixed on `land/bug-227-bent-wheels-announce` (f7295c10); awaiting landing. Owner: none needed.

## Summary
A real fresh start (menu first) shows no alert, even with wheels rolled bent. Booting free roam first and then
starting New game announces every wheel the starting truck rolled bent: up to three yellow alerts ("the front left
wheel is bent") under Katie's first card, 2 s each. A player who drives free roam before starting a run gets this.

## Description
The wheel values do not change over 8 s, so it is not settling damage: the alert system compares the new truck with
the free-roam truck's state. Resetting the alert baselines after the truck roll did NOT fix it (tried and reverted on
the P8 branch, 05399b8f), so the cause is elsewhere (order of the roll, the baseline and the first poll, or a second
baseline). Seen in /Users/ledogen/CodeShit/CarGame-spare-base/wip/feat-288-p6/sheet.jpg, frame 01.

## Tracker
- [x] Root cause named: `_machineWords` nulls `_wordState.levels` on the menu / story entry but leaves `steps`; `pollWords`
  then read the jalopy's first poll as prev level = its own level but prev STEP = the free-roam truck's (10 → 9 = "show").
  A menu-first start has `steps` null, so it stayed quiet. Same path on a second New game after a run.
- [x] No alert on New game after free roam; a real change after the start still alerts (`pollWords` takes the step
  baseline from `steps` only when `levels` is set: one fix where the only caller routes through).
- [x] A check pins it: `test/alert-reports.mjs` BUG-227 block (fails before, passes after).

## Log
- 2026-11-18 minted by the orchestrator from the P6 and P8 agents' findings.
- 2026-11-18 f7295c10: fix in src/alerts.js pollWords + gate block. Siblings: every machine-word slot (filter, oil, tire,
  engine) shared the stale-steps path, all covered; damage-screen drop detector already rebaselined (BUG-184).
  Gates (affected 2/2) green; smoke + pad in wip/bug-227/.

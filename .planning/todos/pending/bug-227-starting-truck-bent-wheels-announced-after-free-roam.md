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
Find why the alert baseline is not taken from the newly rolled truck when a run starts after free roam.

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
- [ ] Root cause named.
- [ ] No alert on New game after free roam; a real change after the start still alerts.
- [ ] A check pins it (smoke or the alerts gate).

## Log
- 2026-11-18 minted by the orchestrator from the P6 and P8 agents' findings.

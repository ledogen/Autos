---
id: BUG-257
type: bug
status: open
severity: minor
opened: 2026-11-23
source: owner's perf log wip/run-logs/perf-1123 (a story run ended broke, then free roam in the same tab)
relates: FEAT-242, FEAT-324, DEC-481, src/run-log.js
---
lane: free lane

# BUG-257: A free-roam run log carried the dead story run's state and the old world's seed

## Next steps
Owner: answer the open question (may a hand-switched log record free roam at all). Fix is on `land/bug-257-runlog-freeroam`, awaiting landing.

## Summary
A log recorded in free roam wrote the ended run's frozen play time, day, hour, wallet, hunger and inventory on every line, and kept its first seed in header and file name after the world was reseeded 32 s later.

## Description
- Free-roam logging came from the debug panel switch (`setOn(true)`, header `how:"on"`); `start()` is only called at a story go-live (src/main.js onRegionLive).
- Story systems (day, economy, inventory) keep their last values after a run ends; `event()`, `_state()`, `tick()` read them unconditionally.
- The seed was read once in `_newSeries()`; `applyWorldSeed` (main.js) changes it with the log still on.
- Captures' `perf` block is empty because `perfEnableHitchLog` is only armed by the `?hitch` URL argument (src/main.js:182).
Fix: story fields exist only in `story`/`scenario` mode; a changed seed or mode closes the series and opens a new header (`how:"world"`).

## Tracker
- [x] Free-roam lines and headers omit play, day, hr, wallet, energyH, fedH, inv
- [x] A world or mode change closes the series and starts a new one with its own header and file name
- [x] Gate run-log §6; reader still reads old logs and free-roam logs
- [ ] Owner ruling on the open question

## Open questions
- DEC-481 says a story run logs from its go-live and the switch is "the only off switch". Is switching it ON by hand in free roam intended? Behaviour kept as is.

## Files
`src/run-log.js` · `test/run-log.mjs`

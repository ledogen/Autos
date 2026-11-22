---
id: FEAT-324
type: feature
status: open
severity: minor
opened: 2026-11-21
source: owner, 2026-11-21 — "improve the logging tool add the things youre missing also it should start logging automaticcally and automatically download when you save and exit or win"
relates: FEAT-242, BUG-199, DEC-481, DEC-358, DEC-392, src/run-log.js, tools/run-log-summary.mjs
---
lane: free lane

# FEAT-324: The run log starts by itself, downloads on save-and-exit and win, and the reader says more

## Next steps
Owner: read a fresh run's summary (`node tools/run-log-summary.mjs <file…>`) and say what is still missing. Landing branch `land/run-log-1121`.

## Summary
Logging is on by default from a story run's go-live (tutorial included) and downloads ONE file in the click of save & exit
and of the run-end card. The summary gains coverage, start/end truck, money by category, grants with sources, tires per
wheel, low-condition-without-alert, job margins and hunger/energy blocks.

## Description
DEC-481 supersedes DEC-358's opt-in. Logger side: `enabled` / `on` / `start` / `stop`, grant `src` on every grant path, pickup
and service-swap lines carry the part taken off. Reader side: `stitch()` joins several files; old logs print "not recorded".
Not gated on anything for the public build (owner: "im the only one who plays this shit").

## Tracker
- [x] On by default, from the run's start
- [x] One download at save & exit and at the run-end card (win included)
- [x] Reader blocks 1-9 of the owner's list
- [x] Gate `run-log` extended; smoke checks one download per exit and per ending

## Decisions
- 2026-11-21, owner: automatic download not gated on any flag or host.

## Files
`src/run-log.js` · `src/main.js` · `src/inventory.js` · `src/service.js` · `src/recovery.js` · `tools/run-log-summary.mjs` · `test/run-log.mjs` · `test/cdp-smoke.mjs`

## Log
- 2026-11-21: built on land/run-log-1121.

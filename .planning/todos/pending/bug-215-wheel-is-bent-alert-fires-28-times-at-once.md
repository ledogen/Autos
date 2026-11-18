---
id: BUG-215
type: bug
status: open
opened: 2026-11-17
severity: minor
source: owner run log autos-run-660454599 (Logs/run-660454599/run.jsonl)
---

# BUG-215: The "wheel is bent" alert fires 28 times in one instant

## Next steps
Find what re-raises the wheel alerts when a shop transaction touches the wheels, and raise each alert once.

## Summary
At a shop on day 9 08:06 the run log holds 28 alerts in the same instant, alternating "the front-left wheel is bent" and "the rear-left wheel is bent".

## Description
The same instant holds three item events (the air filter, the mounted spare and a standard tire sold). Earlier in the run the same pair fires 2–3 times at a shop visit (day 5 10:32). Each sale or fit seems to re-evaluate every wheel alert and raise it again.

## Tracker
- [x] One alert per wheel per change of state, however many items a shop visit moves
- [x] A gate replays a multi-item sale with two bent wheels and counts the alerts (test/alert-reports.mjs)

## Decisions

## Open questions

## Links
FEAT-242 (run log), the alert system

## Files
src/main.js (alerts), src/service.js

## Log
- 2026-11-17 minted by the orchestrator from the owner's lost run (seed 660454599, day 9).
- 2026-11-18 root cause (unverified in the live shop, read from the log + code): the shop previews and replays parts (service.js preview/_restore), swinging wheel condition across the 0.9 'bent' line under main.js _machineWords, which polled every frame and re-raised on each swing (28 alerts over ~70 s real time, game clock frozen; not item events). Fix: pollWords (src/alerts.js, every machine-word slot routes through it) is held while the service screen is open. Other slots (tires, oil, filter, engine) shared the path, so were exposed the same way. Run log over-counts alerts only: damage events are logged by the damage model, which the previews do not touch.

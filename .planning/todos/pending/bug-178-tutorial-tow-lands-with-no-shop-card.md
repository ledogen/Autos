---
id: BUG-178
type: bug
status: open
severity: major
opened: 2026-11-15
source: orchestrator, 2026-11-15 — the browser smoke, three times in one day
relates: FEAT-184, test/cdp-smoke.mjs
---
lane: A

# BUG-178: The tutorial's free tow sometimes lands at the shop with no shop card

## Next steps
Lane A: find out whether the game leaves the player parked at the shop with nothing to press (a real stall in the tutorial) or the smoke reads too early.

## Summary
In about 1 run in 10 on 2026-11-15 the smoke's tutorial step fails with "the tow did not land at an open shop". The last failure printed: parked true, speed 0, no card, 0 m from the tow seat, 3.6 m from the marker, clock -25.39 h (22:36 on the evening). Rerun alone it passes. Log: wip/orch/smoke-1115g.log on main.

## Tracker
- [ ] Cause known: game or smoke
- [ ] Fixed at the root; the tutorial step green 20 runs in a row

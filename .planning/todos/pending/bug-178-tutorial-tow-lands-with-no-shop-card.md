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
GAME side, edge source unproven. Next: re-run the instrumented loop (wip(BUG-178) commit 2 back from d9b3beae logs every `_updateParkTriggers` call as `window.__ptLog`) until a failure shows which call used up the edge; or fix by design: the tow opens its destination's park action itself instead of relying on the rising-edge detector.

## Summary
In about 1 run in 10 on 2026-11-15 the smoke's tutorial step fails with "the tow did not land at an open shop". The last failure printed: parked true, speed 0, no card, 0 m from the tow seat, 3.6 m from the marker, clock -25.39 h (22:36 on the evening). Rerun alone it passes. Log: wip/orch/smoke-1115g.log on main.

## Tracker
- [x] Cause known: game or smoke — the GAME (run 19 of 19, 2026-11-15); which call consumes the edge still unknown
- [ ] Fixed at the root; the tutorial step green 20 runs in a row

## Log
- 2026-11-15 lane A: 1 failure in 54 `boot,opening` runs (wip/bug178/a/r19.log). Truck on the lift, parked, and from 168 ms the shop branch of `_updateParkTriggers` shows "PARK Space for service" — `_serviceInReach` finds the shop, but the rising edge was already used up, so the screen never opens (30 s). Not the smoke reading early: passes open within 12–122 ms. A player sees the prompt; the Space tap only lets the brake go, a second tap opens it. The `__ptLog` instrumentation (35 runs) never caught a failure, so it was removed from src/. The smoke now prints the trace on failure (d9b3beae+).

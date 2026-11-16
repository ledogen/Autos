---
id: BUG-178
type: bug
status: closed
severity: major
opened: 2026-11-15
source: orchestrator, 2026-11-15 — the browser smoke, three times in one day
relates: FEAT-184, test/cdp-smoke.mjs
---
lane: A

# BUG-178: The tutorial's free tow sometimes lands at the shop with no shop card

## Next steps
Orchestrator: land feature/run-shape (fix 5e4c7977) and smoke main. Open: which transient made the shop unreachable for that one poll in the field failure (not caught; the fix makes it harmless).

## Summary
In about 1 run in 10 on 2026-11-15 the smoke's tutorial step fails with "the tow did not land at an open shop". The last failure printed: parked true, speed 0, no card, 0 m from the tow seat, 3.6 m from the marker, clock -25.39 h (22:36 on the evening). Rerun alone it passes. Log: wip/orch/smoke-1115g.log on main.

## Tracker
- [x] Cause known: game or smoke — the GAME (run 19 of 19, 2026-11-15); which call consumes the edge still unknown
- [x] Fixed at the root (5e4c7977): the tow's answer is owed until the pump or shop takes it; forced repro FAIL before, PASS after
- [x] The tutorial step green 10 runs in a row on the fix (wip/bug178/c/verify.log)

## Log
- 2026-11-15 lane A: 1 failure in 54 `boot,opening` runs (wip/bug178/a/r19.log). Truck on the lift, parked, and from 168 ms the shop branch of `_updateParkTriggers` shows "PARK Space for service" — `_serviceInReach` finds the shop, but the rising edge was already used up, so the screen never opens (30 s). Not the smoke reading early: passes open within 12–122 ms. A player sees the prompt; the Space tap only lets the brake go, a second tap opens it. The `__ptLog` instrumentation (35 runs) never caught a failure, so it was removed from src/. The smoke now prints the trace on failure (d9b3beae+).
- 2026-11-15 lane A (2): cause confirmed. `_towTo` cleared the edge detector; the first `_updateParkTriggers` poll spends the edge whatever it finds. Forced repro: hold `missionSystem.state = 'generating'` for 400 ms after the tow click (shop reach null for those polls): FAIL with the field signature (truck on the lift, "for service" prompt, no screen), PASS after the fix. 30 back-to-back re-tows and 3 instrumented first tows never showed a natural null-reach poll, so that transient is unnamed. Fix 5e4c7977: `_towOwed`, answered only by the pump / shop branches, dropped when the brake comes off (+12/-5 lines). Patch of the throwaway instrumentation: wip/bug178/c/instrumented-with-fix.patch.
- 2026-11-15 lane A (3): `boot,opening` 10/10 PASS on 5e4c7977 (wip/bug178/c/v*.log). Close on landing + main's smoke.
- 2026-11-15: CLOSED. Fix 5e4c7977 merged to main (the tow's park edge stays owed until the pump or shop answers it; `_towOwed`). Forced repro fails before, passes after; `boot,opening` 10/10; main's full smoke 26/26 (wip/orch/smoke-1115k.log). Not found: what made the shop unreachable for one poll in the field. The pump path shares the fix and was not tested directly.

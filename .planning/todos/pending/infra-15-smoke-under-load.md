---
id: INFRA-15
type: infra
status: open
severity: minor
opened: 2026-11-14
source: orchestrator, 2026-11-14
relates: INFRA-07, INFRA-08, FEAT-154, test/cdp-smoke.mjs, test/lib/cdp.mjs
---
lane: A

# INFRA-15: the browser smoke under load

## Next steps
Orchestrator: land `feature/run-shape` (3 commits), then smoke main. Owner: decide whether the src/ race below is worth a fix (a body spawn that waits for its ground collider).

## Summary
The smoke (the only gate that covers `main.js`) failed a different step each run once the machine's load average passed about 13, so landings queued behind quiet windows. INFRA-08 made it count game time. This ticket chases what is left at 4x CPU throttle, and the Chrome profile directories every run leaked.

## Description
### Profile leak
`launchChrome` called `chrome.kill()` and then `rmSync` at once; Chrome (and its helper processes) was still writing into the profile, so the removal lost the race. 378 `autos-cdp-*` directories (476 MB) sat in `$TMPDIR` at 2026-11-14. Fix: SIGKILL, then `rmSync` with `maxRetries`. Both the normal exit and a SIGTERM leave nothing behind (checked). The existing 378 are NOT deleted: that is the owner's call.

### The "edge" step at 4x throttle (`SMOKE_THROTTLE=4`)
Two causes, the second was the open one in fac4aebe:
1. The fade stands the row again 0.5 s of wall time after it goes black. The step polled for black, then read the row; under load the read came after the row was back, so "the truck reached the fade line without moving a barricade". Fix (from fac4aebe): a requestAnimationFrame latch in the page records the move on the frame it happens.
2. **Root cause of the persisting failures is in the game, not the test.** `_updateBarricades` (src/main.js) swaps a row's models for loose bodies the moment the truck is within `BARRICADE_ON_M` (120 m), with no check that the ground collider under the row exists. The step teleported the truck to 30 m from the row, so the bodies spawned at once; under load the terrain colliders there streamed in later, and the bodies, spawned on nothing, dropped (y 98.4 to 97.8) and were pushed out sideways by the deck appearing (one barricade 1.9-3.5 m from its pose, before the truck moved). Measured at 4x: 4 of 4 failing runs had one barricade displaced at rest-read; with the fix below the row read within 1 cm. A player driving up never sees it, a teleport or tow landing within 120 m of a row can. NOT fixed in src/ (not this ticket's to change).
   Test side: seat 150 m inside first (outside 120 m, no bodies), wait 5 sim-s for the ground to stream, then seat at 30 m. No assertion or tolerance changed.

### Parked
fac4aebe (SMOKE_THROTTLE alias, edge guard, tow wait 8 to 30 s) is folded into this work.

## Tracker
- [x] Smoke removes its own Chrome profile (pass, fail, signal)
- [x] Edge step root cause found (game-side spawn race) and the test made to wait on the ground
- [x] Full smoke 3 times at 4x through chrome-slot (see Log)
- [ ] Owner: the existing 378 stale profiles (476 MB) deleted
- [ ] Owner / lane: src fix, spawn a row's bodies only once its ground collider exists

## Open questions
- May the 378 stale `autos-cdp-*` directories in `$TMPDIR` be deleted?

## Files
`test/lib/cdp.mjs` · `test/cdp-smoke.mjs` · `src/main.js` (`_updateBarricades`, read only)

## Log
- 2026-11-14: opened. Profile leak fixed.
- 2026-11-14: full smoke at 4x via chrome-slot, ddee43c2: PASS; FAIL in step "opening": FEAT-217 shoulder (seed 822480141, the known coin toss, not this ticket's); PASS. Before the fix 4 of 4 failed in "edge".

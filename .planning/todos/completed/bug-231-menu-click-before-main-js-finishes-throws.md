---
id: BUG-231
type: bug
status: closed
severity: minor
opened: 2026-11-18
source: paper-throw sheet script, 2026-11-18
relates: src/main.js, index.html
---
lane: Engine & world

# BUG-231: Clicking a scenario before main.js has finished loading throws, and no run starts

## Next steps
Find every menu handler that can fire before `src/main.js` finishes evaluating. Fix at the root: either the menu is
not clickable until the module has finished, or the state those handlers read is declared before they are wired.

## Summary
The main menu is clickable while `src/main.js` is still evaluating. Clicking the scenario "the paper route" in that
window throws `ReferenceError: Cannot access '_paperSizeIdx' before initialization` (a `let` read before its
declaration line has run, the "temporal dead zone"; main.js:9649 on main). The mission state stays idle and nothing
tells the player. Found by a script that clicked at once; a fast human click could hit it. Other handlers may share it.

## Tracker
- [x] Reproduced with a click at first paint (wip/bug-231/probe.mjs; the TDZ stack at main.js:9659).
- [x] All handlers with the same exposure listed (see Log: only _startPaperScenario read a later binding before an await).
- [x] Fixed at the root; a smoke step clicks at first paint (cdp-smoke `menuRace`).

## Log
- 2026-11-18 minted by the orchestrator from the paper-throw sheet agent's finding.
- 2026-11-18 land/bug-231-menu-race. Cause: main.js has two top-level awaits (physics engine ~2832, truck seat ~9056); the menu is wired at ~1530 on purpose (owner 09-06: live buttons) so a click lands while later `let`s are in the dead zone. Every entry (`_startStory`, `_startScenario`, `_startBarrelCube`, `_enterLabFromMenu`, `_startFromSetup`, mm-continue, Escape key) only touches bindings declared above 2832 before its `await _worldReady`; probe clicks of both descents and the barrel cube at first paint were clean. Only `_startPaperScenario` wrote `_paperSizeIdx` (declared ~9656) before the await. Fix: it now touches nothing; `_startStory` resets the rung after `await _worldReady`. No visible change. Smoke step `menuRace` (fails on main with the TDZ stack, passes now); gates 12/12, cdp-smoke 41 steps, pad-e2e all ok. Logs wip/bug-231/.

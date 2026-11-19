---
id: BUG-231
type: bug
status: open
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
- [ ] Reproduced with a click at first paint.
- [ ] All handlers with the same exposure listed.
- [ ] Fixed at the root; a smoke step clicks at first paint.

## Log
- 2026-11-18 minted by the orchestrator from the paper-throw sheet agent's finding.

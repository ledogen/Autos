---
id: BUG-197
type: bug
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117100118-7hbf) — "If you add a repair to your cart And then go and move the repair slider again. It shouldn't add a second operation, it should just correct the first one. For example, if I'm 30 cents short on a repair, I should be able to just go straight back to the repair bar, nudge it a couple clicks left, hit select again, and then it should fix the price."
relates: FEAT-212, src/service.js, src/service-screen.js
---
lane: B

# BUG-197: Re-selecting a repair adds a second cart line instead of correcting the first

## Next steps
Fixed on `land/machine-1117` (machine lane p), awaiting landing. Owner: try it at a service center (card machine-1117-look).

## Summary
One cart line per part repair: re-selecting a repair that is already on the cart replaces its line at the new target.

## Description
Two faults. (1) Every select queued a new line. (2) The bar read the part's condition AFTER the queued repair, so the steps
below the queued target were gone: there was nothing to nudge left to.
Fix: a repair line records `from`, the condition before it (`ServiceCenter.repair` / `repairOwned`). `repairLine()` finds
the line repairing a part; `queueRepair()` takes it out (the existing remove-and-replay) and queues the new one. The screen's
bar, its targets and its price start from the line's `from` (`targets`/`ownedTargets`/`ownedWheelTargets`, `repairQuote`/
`ownedQuote` take an optional `from`). Truck parts, inventory parts and a mounted pair's wheel all go through it.

## Tracker
- [x] Re-select: still one line, at the new target's price, the part at the new target (gate service §12)
- [x] The steps below the queued target are offered; other cart lines stay; discard is exact (§12)
- [ ] Owner look at a service center

## Files
`src/service.js` · `src/service-screen.js` · `test/service.mjs`

## Log
- 2026-11-17: fixed db1209de (land/machine-1117). service gate green. The screen path is not driven by a gate (the smoke covers main).

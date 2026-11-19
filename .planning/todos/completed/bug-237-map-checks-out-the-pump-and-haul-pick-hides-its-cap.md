---
id: BUG-237
type: bug
status: closed
severity: major
opened: 2026-11-19
source: owner, in chat, 2026-11-19 — "Opening the map while pumping gasoline causes you to check out immediately. I think we should just prevent the map from being opened when the gas pump is open." and "Why can I only take 11 bundles of firewood? It says 30 bundles available"
relates: BUG-187, BUG-183, FEAT-114, src/main.js
---
lane: free lane

# BUG-237: The map checks out an open pump; the haul picker does not say why it caps

## Next steps
Landed-ready on `land/bug-237-pump-map`: orchestrator lands it. Owner may reword the [DEFAULT] cap note.

## Summary
A: opening the map shuts every menu through its own close, and the pump's close is the checkout, so M while pumping paid and left. B: the haul load picker caps below the stock with no word on why.

## Description
### A: the map over an open pump
`_closeMenus('map')` (BUG-187) closes each registered menu by its own path; the pump's is `_settlePump` (the sale). Fix: one helper, `_toggleMap`, which all three entry points call (the M tap, the M keydown, the `#cp-map` click; the pad's View goes through the M tap path). While `fuelStop.isOpen` an opening is refused; closing an open map is always allowed. `_closeMenus` is unchanged.
### B: the cap's reason
`_haulPick` caps at min(stock, truck hard payload after kit, what the wallet buys). It now returns `limit` ('wallet' | 'truck' | null) and `_syncHaulPick` puts it first on the fixed-height `#mp-pick-note` line: "you can afford N of S" / "the truck carries N of S" (placeholder wording, [DEFAULT]). The cap, prices and the "can't afford the stock" case are untouched.

## Tracker
- [x] The map does not open over an open pump (M, View, cockpit button).
- [x] Smoke check at the pump step: fails on main, passes with the fix.
- [x] Haul picker names the binding cap.
- [x] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner: "I think we should just prevent the map from being opened when the gas pump is open."
- B is a display fix only (owner asked why; no behaviour change).

## Open questions
None.

## Files
`src/main.js` (`_toggleMap`, `_haulPick`, `_syncHaulPick`) · `test/cdp-smoke.mjs` (pad pump step)

## Log
- 2026-11-19: minted; fixed. Smoke (pad pump step, M + View at an open pump): FAIL on main (pump checked out, $10 to $7.88, menus empty), pass with the fix. Gates 12 green, cdp-smoke clean, pad-e2e ALL OK. The smoke opens no haul offer, so B's note wording has no automated check.

---
id: BUG-192
type: bug
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Minor annoyance, if you park at the store and then buy something and then leave, for example, a sleeping bag and then you leave the store inventory and now you're in the parking lot, it still says park on your B menu, so you can't move your sleeping bag to your camping kit immediately. After leaving the store you should still be parked so the B menu should be accessible after you back out of the store UI"
relates: FEAT-194, src/main.js
---
lane: unplaced

# BUG-192: After leaving a shop the B menu still says park

## Next steps
Closed 2026-11-20. Owner tried it on the pad and said good.

## Summary
The truck stayed parked; the inventory and damage icons stayed locked because the shop zone kept blocking them.

## Description
Root: `_updateParkTriggers` (main.js) set `damageScreen.blocked = !serviceScreen.isOpen || serviceScreen.store` in a shop's reach. With the screen CLOSED that is true, and `blocked` locks the park zone (inventory-screen `_locked`), so the B menu's items were all dropped and it pulsed PARK. The latch itself was never lost (the keyboard smoke's `tap(' ')` after Esc exists because it stays). Fix: `blocked = serviceScreen.isOpen && serviceScreen.store` (only an OPEN storefront owns the brake).

## Tracker
- [x] Root found
- [x] Backing out of a store leaves the inventory / B menu reachable while parked
- [x] Owner look

## Files
`src/main.js`

## Log
- 2026-11-17: fixed on land/pad-menus. Unverified in a real shop by drive; the smoke's store step covers the open / close.
- 2026-11-20: owner, card pad-menus-look: "Good: close them". Closed. On main (ac4a06c2).


---
id: BUG-255
type: bug
status: closed
severity: minor
opened: 2026-11-22
source: owner, 2026-11-22 — "every time i open an item on the service station shop tab it scrolls to the top"
relates: BUG-247, DEC-455, src/menu-nav.js, src/service-screen.js
---
lane: free lane

# BUG-255: Opening an item on the service shop's list scrolls it to the top

## Next steps
None. Closed.

## Summary
Opening a row on the shop tab threw the list back to the top. The card does keep its scroll across its re-render (BUG-247); the menu highlight then scrolled it away.

## Description
`ServiceScreen.render()` restores `.sv-body.scrollTop`. Measured in the real app (story seed 6, auto shop, 1400x560 so the list scrolls): scrollTop 214 after the re-render, then a second scroll event to 6. The cause was `wakeMenu()` in `src/menu-nav.js`: a card that re-rendered under the highlight (cur detached) re-highlights the item at the stale `curIdx` and `highlight()` called `scrollIntoView` on it, which is the first row when nothing was keyed. Every caller routes through `highlight()`, so the fix is there: a `scroll` parameter (default: follow `focus`), and the wake re-highlight passes false. The Maintenance tab and every other waking card (camp, inventory, damage) take the same path and are covered.

### Measured (scrollTop of `.sv-body`, open the last row of the shop list)
- Before the fix: 214 -> 6 (and 134 -> 6 on a shorter list).
- After: 214 -> 214.

## Tracker
- [x] Opening a shop row keeps the list where it was scrolled
- [x] Same on the Maintenance tab (one code path, `wakeMenu`)

## Links
`wip/notes-1122/shop.png`, `wip/notes-1122/drive.mjs` (probe).

## Files
`src/menu-nav.js`

## Log
- 2026-11-22: fixed on land/notes-1122; before/after px above; screenshot looked at.

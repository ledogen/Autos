---
id: FEAT-319
type: feature
status: open
severity: minor
opened: 2026-11-21
source: owner, 2026-11-21 — "I feel like there's no reason to prevent steering or throttle or brake in the pause menu on pad or keyboard. D-pad should be used to interact with the UI but if you steer with left stick in the background it should still steer since we're not taking that input right now."
relates: DEC-477, DEC-411, DEC-467, FEAT-125, FEAT-62, src/gamepad.js, src/menu-nav.js
---
lane: A

# FEAT-319: The pause menu keeps the truck's steering, throttle and brake

## Next steps
Lane a: lands with land/wave3-1120. Owner: a drive with the pause menu up.

## Summary
With the pause menu up the pad's left stick and triggers still drive the truck; the D-pad, A and B work the menu.
The keyboard already did this.

## Description
### What it did before
- The sim keeps stepping behind the pause menu (main.js `_heldPause`: only a SCENARIO's pause holds it, FEAT-62).
- Pad: any menu (gamepad.js `menu`) zeroed throttle, brake and steer, and the left stick walked the list.
- Keyboard: nothing swallowed W / S / A / D / Space (vehicle.js reads them on `document`); menu-nav.js takes only
  the arrows and Enter (and Q / E on a tabbed card), none of which drive. So no keyboard key is both.
### Built
- menu-nav.js `pad.menuDrives()`: the live menu is the pause list, its settings page or the give-up card.
- gamepad.js: there, the stick and triggers are the truck's and the stick walks nothing; D-pad / A / B / Start stay
  MENU_KEYS. Both layouts read the same analog inputs. Every other menu still holds the truck.

## Tracker
- [x] Pad stick, RT, LT drive under the pause menu, both layouts
- [x] D-pad and arrow keys still walk the list; the stick does not
- [x] Keyboard W / A drive under it (pad-e2e)
- [ ] Owner drive

## Decisions
- 2026-11-21, owner: the source line above (DEC-477).

## Files
`src/gamepad.js` · `src/menu-nav.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-21 (lane a): built on land/wave3-1120.

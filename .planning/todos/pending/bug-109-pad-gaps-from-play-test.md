---
id: BUG-109
type: bug
status: open
severity: major
opened: 2026-11-04
source: owner, 2026-11-04 (page inbox, a pad play-test) — "Pad can't select the actions in the give up menu" · "Unable to shift gears on pad in post mission card. Post mission card has no tabs so the clutch and handbrake should be allowed through the interface to drive." · "There's no way to select different vehicle components in the vehicle diagnostic screen with PAD" · "lb rb should switch tabs in the service shop interface." · "truck graphic should recenter every time you go to main menu. it also needs to be controllable on pad right stick to give pad players a way to interact"
relates: FEAT-133/136 (controller finish — these are its real-pad play-test results), FEAT-125 (pad + side menu), FEAT-144 (D-pad actions), feedback_controller_button_budget (fewest buttons on menus)
---
lane: Spare

# BUG-109: five places the pad can't reach

The owner's first real-pad play-test of the menus. Each is a screen where the pad either cannot act or
blocks something it should let through.

## What

1. **Give-up menu** (the pause menu's towel, `#pm-towel` in index.html): the pad can't select its actions.
2. **Post-mission card**: the card has no tabs, so it should not swallow the bumpers/triggers. Clutch,
   handbrake and the shift buttons must pass through to the truck while it is up, so the player can drive
   off with it open.
3. **Vehicle diagnostics** (`src/damage-screen.js`): no way to move between components on the pad.
4. **Service shop** (`src/service-screen.js`, two tabs): LB / RB switch tabs.
5. **Main-menu truck** (`src/stage.js` drag orbit): the orbit resets to the resting shot every time the
   main menu is shown (today only a double-click resets it), and the right stick orbits it, the same
   yaw/elevation the mouse drag writes.

## Acceptance

- [ ] Give-up menu: every action reachable and selectable on the pad.
- [ ] Post-mission card up: clutch, handbrake and shift work on the pad; the truck can drive away with it open.
- [ ] Diagnostics: the pad moves between components and selects one.
- [ ] Service shop: LB / RB switch tabs (wraps or stops at the ends, consistent with the other tabbed screens).
- [ ] Main menu: the truck is back at the resting shot on every return to the menu; the right stick orbits it.
- [ ] No new buttons added to any menu beyond these (button budget); `node test/cdp-smoke.mjs` green.
- [ ] Note in the touched files' owning lanes: service-screen.js and damage-screen.js are Lane B's.

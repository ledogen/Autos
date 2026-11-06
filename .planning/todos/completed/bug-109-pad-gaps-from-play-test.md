---
id: BUG-109
type: bug
status: closed
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

- [x] Give-up menu: every action reachable and selectable on the pad.
- [x] Post-mission card up: clutch, handbrake and shift work on the pad; the truck can drive away with it open.
- [x] Diagnostics: the pad moves between components and selects one.
- [x] Service shop: LB / RB switch tabs (wraps or stops at the ends, consistent with the other tabbed screens).
- [x] Main menu: the truck is back at the resting shot on every return to the menu; the right stick orbits it.
- [x] No new buttons added to any menu beyond these (button budget); `node test/cdp-smoke.mjs` green.
- [ ] Note in the touched files' owning lanes: service-screen.js and damage-screen.js are Lane B's.

## Built (Spare, 2026-11-05, 4ba7a6ce + 6e1c490a) — smoke-proven; the owner's pad check owed

All five in one pass (gamepad.js, menu-nav.js, main.js, stage.js): the give-up card takes A (a hidden seed field
kept DOM focus and ate it); a result card (`data-result`) lets the pad drive through — A / X shift, LB clutch, RB
handbrake, B back — until the D-pad puts its highlight on it; the damage screen's parts and rows are navigable,
with the hover card the mouse would give; a tabbed card (the service shop) steps tabs on LB / RB, wrapping; the
menu truck is back at the resting shot on every return and the right stick orbits it. No new buttons.

The cdp-smoke fake-pad steps (3e268b86) caught one more: the paper panel's start button IS its result card's
continue, so a D-pad highlight left on the offer came back with the result and A pressed continue instead of
shifting. menu-nav's 100 ms poll now drops a highlight once its card closes (6e1c490a). Smoke 21/21 green with
all five screens driven on the fake pad. **Owed:** the owner's real-pad check.

## The seed field off the D-pad path (Lane A's pad-e2e note, checked by Spare 2026-11-05) — no change

The new-game page's seed field is not a stop on the D-pad's path in either mode. Random stays reachable anyway:
`_openSetup` blanks the field every time the page opens (owner, 2026-09-06: a pre-filled seed would make "just
press start" replay one world), and a blank field starts a random seed. So a pad's "start" is always Random. A pad
cannot type a seed, so skipping the field loses nothing; with a keyboard and mouse, click it to type one.

## Closed — Lane B, 2026-11-06 (orchestrator's pad audit), on evidence

All five pass on this branch's smoke, with the FEAT-125 audit's RB fix in (a press keeps its meaning across a
layout change):
- **give-up:** the pause menu → give up → its confirm → the summary → the main menu, A at each (the new `pad` step);
- **result card:** drives through on A / X / LB / RB, then the D-pad and A continue (`papers`);
- **diagnostics:** the D-pad walks the parts and rows, and the hover card follows (`tires`, and the audit);
- **shop:** LB / RB step the tabs, wrapping (`service`, and the audit);
- **menu truck:** back to the resting shot on every return, and the right stick orbits it (`endings`).

No new buttons. The owner's real-pad check moves to FEAT-125's hardware re-check (still open there).

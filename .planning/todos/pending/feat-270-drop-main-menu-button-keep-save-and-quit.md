---
id: FEAT-270
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We have a main menu button not gated on having to be parked and we have a save and exit button that is gated on having to be parked. My recommendation…"
relates: FEAT-41, FEAT-42, DEC-160, DEC-368
---
lane: Free lane (menus)

# FEAT-270: Drop the Main menu button; keep only Save and quit (parked-only)

## Next steps
A lane drops the button and checks the pad menu order (FEAT-254 / DEC-368).

## Summary
The pause menu has a Main menu button that works while moving and a Save and exit button that needs the truck parked. Drop the first, so leaving the run means parking, unless the player gives up.

## Description
Owner's words, verbatim (inbox 20261118005628-kk6s):

> We have a main menu button not gated on having to be parked and we have a save and exit button that is gated on having to be parked. My recommendation is drop the main menu button and only keep save and quit. This way it's encouraged to stop the truck unless you are willing to give up

## Tracker
- [x] The pause menu has no Main menu button
- [x] Save and quit stays gated on the truck being parked
- [x] Giving up (the owner's "unless you are willing to give up") still has a route out

## Decisions

## Open questions
- "Give up": is the existing give-up/throw-in-the-towel (FEAT-146) the way out for a moving truck, or does it need a button? The owner did not say.

## Links
FEAT-41, FEAT-42, DEC-160, DEC-368

## Files
the pause menu (index.html, src/main.js, src/menu-nav.js)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118005628-kk6s).
- 2026-11-17 ui-1117b: pm-menu hidden in a story run; save and exit (parked) or give up are the ways out. Free roam keeps main menu. Look pending.

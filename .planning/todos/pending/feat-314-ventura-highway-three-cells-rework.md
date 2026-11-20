---
id: FEAT-314
type: feature
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 (chat) — "I'm not a huge fan of the way that it was built." / "yep dispo the card with option A+C instead"
relates: FEAT-294, DEC-467, DEC-466, DEC-465, DEC-431, src/gamepad.js
---
lane: free lane (controller)

# FEAT-314: Ventura Highway: rework the three guessed cells (DEC-465)

## Next steps
A lane builds DEC-467 in `src/gamepad.js` and extends `test/pad-e2e.mjs`.

## Summary
FEAT-294 shipped the Ventura Highway pad layout with three cells guessed. The owner did not like them and picked replacements (DEC-465).

## Description
Ventura Highway, plus one Professor change: LT pumps in both layouts (A no longer pumps).
1. On a plain card RB does nothing. Where a card has tabs or faces, RB and LB flip them.
2. On the result card: parked, B is back; moving, B is the upshift. A is the handbrake.
3. At the pump: LT pumps, A is the handbrake (it releases it), B closes the pump and pays; the gas still releases the brake.

## Tracker
- [ ] Cell 1: RB dead on plain cards, RB/LB flip tabs where a card has them
- [ ] Cell 2: result card B by motion
- [ ] Cell 3: pump closes on B
- [ ] Prompts and the bindings page follow
- [ ] pad-e2e covers all three; Professor's steps unchanged
- [ ] Owner has tried it

## Decisions
DEC-467 (supersedes DEC-466, DEC-465, DEC-431 in turn).

## Open questions
None.

## Links
FEAT-294 (the first build), FEAT-125 (the pad contract).

## Files
`src/gamepad.js` · `src/park-badge.js` · `src/hud-menu.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-20: minted by the orchestrator from the owner's chat ruling.
- 2026-11-20: owner: "fix the stale keycap. if a card has multiple offers, lb/rb should flip them." DEC-468: both layouts; keycaps hidden on a one-offer card.
- 2026-11-20: owner: "Kill the shoulder buttons flipping cards at a POI. Leave the highlightable UI buttons." DEC-469 supersedes DEC-468.

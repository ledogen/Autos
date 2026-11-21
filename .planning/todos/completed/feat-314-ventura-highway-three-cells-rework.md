---
id: FEAT-314
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 (chat) — "I'm not a huge fan of the way that it was built." / "yep dispo the card with option A+C instead"
relates: FEAT-294, DEC-467, DEC-466, DEC-465, DEC-431, src/gamepad.js
---
lane: free lane (controller)

# FEAT-314: Ventura Highway: rework the three guessed cells (DEC-465)

## Next steps
Built and proven on `land/train-1120` (pad-e2e, smoke); the owner tries it.

## Summary
FEAT-294 shipped the Ventura Highway pad layout with three cells guessed. The owner did not like them and picked replacements (DEC-465).

## Description
Ventura Highway, plus one Professor change: LT pumps in both layouts (A no longer pumps).
1. On a plain card RB does nothing. Where a card has tabs or faces, RB and LB flip them.
2. On the result card: parked, B is back; moving, B is the upshift. A is the handbrake.
3. At the pump: LT pumps, A is the handbrake (it releases it), B closes the pump and pays; the gas still releases the brake.

## Tracker
- [x] Cell 1: RB dead on plain cards, RB/LB flip tabs where a card has them (built; proof owed)
- [x] Cell 2: result card B by motion (built; proof owed)
- [x] Cell 3: pump closes on B (built; proof owed)
- [x] Prompts and the bindings page follow (built; proof owed)
- [x] pad-e2e covers all three; Professor's steps unchanged (built; proof owed)
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
- 2026-11-20 (lane u): built on land/feat-314-ventura-cells (wip, unrun, demo hold; DEC-467 latest). Plain cards RB silent; LB/RB flip service-shop tabs, cards over the map, the offer card's mp-prev/next (pad.cardFlip). Result card A = Space, B = Escape at rest (parked or < PARK_SPEED 1.389 m/s) else upshift. Pump, both layouts: LT holds F (pad.brake forced 0), A = drive table (Ventura: Space handbrake), B = pad.pumpClose (Ventura; no-op under mom's forced fill). Prompts/chart read LT via the 'pump (hold)' row; pad-e2e and cdp-smoke pump steps use LT.
- 2026-11-20 (lane u): DEC-468 applied by hand (no merge): pad.cardFlip is layout-independent in gamepad.js, so on a card with more than one offer LB/RB flip it in Professor too (RB no handbrake there; the press stays null in `held`); one-offer cards unchanged (the prev/next buttons and their keycaps already hide with one offer, main.js btn()). pad-e2e has a Professor check. Unrun (hold).
- 2026-11-20 (lane u): DEC-469 applied by hand (supersedes DEC-468): pad.cardFlip and its checks deleted; at a POI LB/RB/Q/E flip nothing (RB: Space in Professor, silent in Ventura Highway); the mp-prev/mp-next keycaps and titles show key names only under body.map-open (index.html CSS); map-open and shop-tab flipping untouched. Unrun (hold).

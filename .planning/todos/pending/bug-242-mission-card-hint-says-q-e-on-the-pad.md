---
id: BUG-242
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "When you're navigating mission cards at a POI, the visual hint says Q&E instead of RBLB. When you're on pad."
relates: DEC-337, DEC-175, FEAT-125, FEAT-294, src/gamepad.js, src/menu-nav.js, src/main.js
---
lane: unplaced (scribe: free lane; Sonnet)

# BUG-242: Mission cards at a POI print "Q & E" instead of the pad's bumpers when on the pad

## Next steps
A lane finds which hint string says "Q & E" for the offer cards at a POI and routes it through the pad-aware label (the same path as the other hints, `src/gamepad.js`), in both layouts.

## Summary
Owner's words (typed "Q&E instead of RBLB"):
> When you're navigating mission cards at a POI, the visual hint says Q&E instead of RBLB. When you're on pad.

When the pad is the active input, the hint on the mission cards shown at a POI reads Q & E; it should read the bumpers (RB / LB). The scribe could not find the literal "Q & E" string in `src/*.js` outside the map code (`map2d.js` comments, `gamepad.js` hint tables with `Q / E` for the keyboard), so the hint may be built from a `key` field without the pad swap. The investigator searches `offer-board.js` and the card HTML in `index.html` too.

## Description
(See Summary.)

## Tracker
- [x] Find the "Q & E" hint at POI mission cards
- [x] It prints the bumper names when the pad is active, in Professor and Ventura Highway
- [ ] Gate / smoke step for the hint
- [ ] Owner has looked

## Open questions
- DEC-337 (pad shoulders flip cards, X switches map tabs) fixes which buttons flip POI cards: LB/RB flip, X switches the map's tabs. The hint must name those, per layout (FEAT-294). No conflict.

## Files
`src/gamepad.js` · `src/menu-nav.js` · `src/offer-board.js` · `index.html`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-19: land/small-1119. The hint was the static `mp-prev` / `mp-next` buttons in index.html ("‹ Q" / "E ›"). Now `kc-kb` Q / E and `kc-pad` LB / RB. The card's bumpers are physical and the same in both layouts (CARD_MAP_KEYS 4 / 5), so one wording serves both. Not gated; looked at nothing on the pad yet. Owner look open.

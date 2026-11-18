---
id: FEAT-256
type: feature
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Emolition missions show ? to smash I think it should say the number of signs or barrels or whatever. Actually, let's just roll this into the offer text. It should say needs 10 old signs, knockdown, or 5 old barrels knocked down Remove it from the bottom.Remove the text that says \"pay per target smashed\""
relates: FEAT-65, DEC-370, src/offer-board.js
---
lane: SM-3 missions

# FEAT-256: Demolition offers name the count in the sentence

## Next steps
Owner: drive the look (owed card missions-1117-look).

## Summary
The card sentence now reads "Earl needs 10 old drums crushed along the Miller place." The "N to smash" and "pay per target smashed" lines are gone.

## Description
`rolledCount()` (src/demolition.js) is the first draw of each dressing group's own stream, the same draw `siteTargets` sizes the group with; a pure read, so no offer's rolls move (offer-board and offer-census green). Phrases in data/offers.js carry `{n}`. A tight road drops 1-2 targets in placement (`tries`), so the stood count can be below the card's (never above; demolition-site reports it). Once a route exists the card uses the real `route.targets.length`.

## Tracker
- [x] Count + thing in the sentence, both bottom lines removed
- [x] Offer draws unchanged
- [ ] Owner look

## Decisions
- 2026-11-17, owner: DEC-370.

## Open questions
- A shortfall of 1-2 targets on tight roads (2 of 4 gated sites): accept, or top the site up? Recommend accept (scoring counts what stood).

## Files
`src/offer-board.js` · `src/demolition.js` · `data/offers.js` · `test/offer-board.mjs` · `test/demolition-site.mjs`

## Log
- 2026-11-17: land/missions-1117. offer-board, offer-census, demolition-site green.

- 2026-11-17 CLOSED by the orchestrator on the owner's card answer ("Good: close them", card missions-1117-look). On main, in the play build.

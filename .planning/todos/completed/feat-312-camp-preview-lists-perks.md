---
id: FEAT-312
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "It would be nice when you're previewing a camp spot if it listed the perks you are currently getting from items in your package. Ideally we mention the specific percent bonus and to what stat"
relates: FEAT-66, DEC-456, src/main.js, data/items.js
---
lane: free lane

# FEAT-312: The camp preview lists the packed gear's perks

## Next steps
Owner looks at the camp card in `wip/followups-1120/ui.jpg`.

## Summary
The camp spot preview (the confirm card) now has one line per perk of the gear in the equipped pack: `<item>: +N % sleep recovery` for bed gear, `<item>: +N % vibe (shade)` for the awning and tarp.

## Description
`_campPerks(site)` in src/main.js reads the same data the rules read: `ITEMS[id].rest` (what `restBonus()` sums into `recoveryRate`) and `vibeAssist()` for the share the shade items give back on this site. A site already shaded lists no shade line. Wording is [DEFAULT].

## Tracker
- [x] Each active perk is listed with its percent and stat
- [x] No hand-typed numbers
- [ ] Owner look

## Decisions
- 2026-11-20, owner: see DEC-456.

## Files
`src/main.js` · `index.html` · `data/items.js`

## Log
- 2026-11-20: land/followups-1120.
- 2026-11-20: land/followups-1120 gates 61/61 green (run-all --serial), cdp-smoke 42/42, pad-e2e ALL OK. Sheets: wip/followups-1120/{houses,ui,arrow}.jpg; the shoot scripts are beside them.

---
id: QUAL-36
type: quality
status: open — built and on main (fd3f76e6); waiting on the owner's words (owed card qual36-words)
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — "i think it would be wise to attempt to unify the way these missions are presented and graded … I like the shot clock effect of the rank timer, but it's only present in like one or two mission types now … with just a couple levers here we can really clean up this mess of a grading system"
relates: FEAT-87, FEAT-138, FEAT-142, FEAT-65, FEAT-61, FEAT-199, DEC-018, src/economy.js, src/rank-timer.js, src/offer-board.js
---
lane: unplaced

# QUAL-36: Unify how mission types are graded, presented and rewarded

## Next steps
Built 2026-11-14 on feature/spare (DEC-178..183). Left: the owner's words (owed card qual36-words), the FEAT-140
"Freight is units" line in missions.md:475, and a look at the bar on a calm-impatient job. Then close.

## Summary
Every type tips on the same time line (whole tip at ratio 0.652, half at par, none at 1.348), but only courier and
papers show that clock, and demolition shows it while being graded on something else. Letters, deeds and items
each follow the type's own axis, stated four different ways. The dive lays out every type's formula with real
offers, the inconsistencies, and four small unifying proposals (recommended: B, hurried and calm jobs).

## Description
The full comparison table, worked examples, inconsistencies and proposals are in the dive. Short list of the
code-side defects found, independent of the direction chosen:
- Larry's offers roll an optional item (40 %, pinned by `test/offer-board.mjs`), the map card prints it, but the
  paper settle (`src/main.js` paperRouteSystem onSettle → `settleFlat(payout, letter)`) never passes the bonus.
- `_traitLine` (`src/offer-board.js`) prints "rank times 10 % tighter/looser" for Impatient / Patient on
  fragile, haul and freight, where `thresholdScale` is 1 and nothing changes.
- `_rankTimerSource` (`src/main.js`) shows the time rank bar on demolition, whose letter is the share smashed.
- Haul stock rolls 14–30 (`HAUL_STOCK`) under a 1-deed line of 18; a 14–17 yard posts an unreachable rung.

## Tracker
- [x] Owner answers the dive
- [x] Larry's item: paid at its gate, or no longer rolled (per `larry-item`)
- [x] Trait card text matches what the trait does on each family
- [x] Demolition's bar follows the ruling (`direction` / `demolition-bar`)
- [x] Haul stock vs the 1-deed line (per `haul-floor`)
- [x] The chosen direction built, gates updated (`economy`, `rank-timer`, `offer-board`)
- [ ] missions.md / DESIGN.md type table updated (demolition row; drop the stale FEAT-140 "freight is units" line)

## Open questions
- The eight `<dive-q>` questions on the dive page.

## Links
Deep dive: `.planning/dives/QUAL-36-mission-grading.html`

## Files
`src/economy.js` · `src/par.js` · `src/rank-timer.js` · `src/offer-board.js` · `src/paper-route.js` · `src/main.js` ·
`data/offers.js` · `test/economy.mjs` · `test/rank-timer.mjs` · `test/offer-board.mjs` · `test/paper-route.mjs`

## Log
- 2026-11-14: built per the answers, DEC-178..183; Larry holds the item (runPaper.held, handed over parking at his house). Gates rank-timer/offer-board updated.
- 2026-11-13: dive written from the code at e26da3d2 (feature/content). Worked examples rolled and routed headlessly
  on random seeds 3230259412, 1046436846, 2930777188 (plus 2045452201, 3599450461 for haul and fragile cases), priced
  with the real economy functions. No game code changed.

---
id: DEC-292
status: superseded
decided: 2026-11-15
area: ui
governs: QUAL-36, FEAT-87, src/rank-timer.js, src/main.js _updateRankTimer _promiseRows, index.html #rank-timer
supersedes: DEC-180
---
# DEC-292: The "full tip / deed 1 / deed 1/2" strip is gone; the rank UI is built two ways for an A/B

**Ruling.** "I'm a little on the fence about the strip ... A) add all that information to the rank timer (show the full/half/no deed AND the item threshold on the ranks in the scroller) then we also have the rank timer minimize with a common UI style that just says S rank x:xx (timer) until it opens 15s before the rank switch / .5km away. Or B) we just keep the text readouts we already built and use colors to inform the player how close to losing a reward they are ... either way i dont think we have to try to explain tip with these ui elements ... i think you should build both and i can a/b test." Both are built behind one switch: debug menu "Rank UI" or `?rankui=a|b`, default `b`. The A/B is UNDECIDED. The bar and its tile read rank letters again. Neither variant explains the tip.

**Why.** The strip told you a reward for a rank you were unlikely to hold, and cycled to facts the DEED, ITEM and timer readouts already carried.

**Replaces.** DEC-180's strip and tile words.

**Source.** Owner, owed card qual36-cash-line, 2026-11-15, note 2. Owner's words; the switch wording is the agent's.

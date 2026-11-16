---
id: DEC-276
status: superseded
decided: 2026-11-15
area: story
governs: FEAT-184, DEC-239, DEC-150, src/main.js, data/items.js, data/shop-stock.js, data/dialogue.js, tutorial, the morning leg, snack, gas station, camp
supersedes:
---
# DEC-276: The tutorial's snack is bought with a few dollars mom hands you

**Ruling.** "mom hands you a few dollars and you buy it". As built: at the morning errand mom hands the player the
snack's shelf price in whole dollars (the wallet is topped up to it until the snack is bought, so spending it on
something else cannot strand the errand); after Larry's the line goes to the gas station nearest his, where the
player buys a bag of peanuts (items.md's gas-station snack, now on the station's shelf), then to the camping area
(camp zone) nearest that station; parked there with it eaten, the line goes on to the joint.

**Why.** The evening's pump leaves the player broke, so the snack (DEC-239) needed money from somewhere; the owner
picked mom's cash over "on mom" and over "the paycheck first".

**Replaces.** Nothing (DEC-239 named the stop, not who pays). The peanuts' $3 is an agent default inside items.md's
"under $5"; the item, the snack's choice and mom's two lines (`tut-snack`, `tut-snackcamp`) are the agent's
placeholders for the owner.

**Source.** Owed card tutorial-errand (owner, 2026-11-15). Owner's words; the build's details are the agent's.

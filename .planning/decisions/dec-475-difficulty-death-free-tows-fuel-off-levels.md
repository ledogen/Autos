---
id: DEC-475
status: superseded
decided: 2026-11-20
area: story
governs: FEAT-296, DEC-046, DEC-001, data/difficulty.js, src/difficulty.js, src/main.js, difficulty, death, free tows, fuel burn, hunger off, cost scaling, pause menu
supersedes: DEC-433
---

# DEC-475: Difficulty adds death on/off, fuel burn and free tows; hunger and cost scaling get "off"; cost "medium" is "normal"

**Ruling.** Owner, on the card `feat296-difficulty-try`, 2026-11-20: "good. land it.
add a death row. just on/off.
something interesting i noticed on this branch is the in game pause menu is super wide compared to others. not sure why but i dont like it.
hunger should have an "off" setting in addition to what we have now
cost scaling should also have an off setting. rename medium to normal
fuel burn should have normal, low and off. classic = normal and casual = low
add row: free tows. 1/3/5/10/infinite"

Kept from DEC-433: the damage (none / low / medium), hunger, cost scaling and endless rows and what their levels do; Casual
lowers damage, hunger and cost; Zen is low cost and low damage with endless on, every other row as Classic; endless is off
in every other preset; damage none is in no preset.

Readings (the lane's, not the owner's words; FEAT-296 carries them for the owner to confirm):
- Death off: a fatal crash or a breakdown (DEC-001's two deaths) is DEC-001's lost life instead of the end of the run: the
  job in hand is abandoned, every part is floored at 25 % with the tires reinflated, the tank is filled to a quarter if
  lower, and the truck is put back on the nearest road. Winning and giving up still end the run (DEC-042).
- Hunger off: hunger does nothing (no word, no bar, no extra energy drain). Cost off: every day pays day-1 prices.
- Fuel burn low is half the burn [DEFAULT]; off never drains the tank. Zen's fuel is normal (as Classic).
- Free tows: the first N tows of a run cost nothing. The row has no 0, so Classic is 1 (one free tow more than before
  this ruling); Casual 3 [DEFAULT]; Zen 1. Death is on in every preset.

**Why.** More forgiving rows for a player who wants them; the pause menu should be as wide as the others.

**Replaces.** DEC-433's name "medium" for today's cost scaling (now "normal"); everything else in DEC-433 is kept above.

**Source.** Owner, the FEAT-296 try card, 2026-11-20. Owner's words; readings marked.

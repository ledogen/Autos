---
id: DEC-306
status: standing
decided: 2026-11-16
area: economy
governs: FEAT-229, FEAT-184, DEC-150, DEC-151, DEC-293, src/main.js, src/economy.js, TUT_PARAMS, tutorial, snack, pump, mom
supersedes: DEC-276
---

# DEC-306: Mom's money covers the snack and, unspoken, the gas

**Ruling.** "Mom has to throw you more than just three bucks in the beginning. The other will be gas money, though she
won't explicitly mention it." As built [DEFAULT, the owner left the amount blank]: the tutorial starts on an empty
wallet, and at her hand-over (DEC-305) the wallet is topped up to the bag of peanuts' price ($3, DEC-293) plus
`TUT_PARAMS.gasCash` ($3, the old pocket change) until the peanuts are bought. They are bought at the gas station nearest
Larry's; the rest goes in the tank at that station's pump, filled until broke (DEC-151).

**Why.** The snack and the fill-up both need money before the last paycheck (DEC-150); she names only the food.

**Replaces.** DEC-276 (mom hands over the snack's price only, on the morning errand; the pump ran on $3 of the player's
own pocket change).

**Source.** FEAT-229 deep dive revision 2, the owner's note (2026-11-16). Owner's words; the $6 is the agent's default.

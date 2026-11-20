---
id: DEC-465
status: standing
decided: 2026-11-20
area: ui
governs: FEAT-294, FEAT-314, FEAT-125, src/gamepad.js, gamepad, controller, pad layout, Ventura Highway
supersedes: DEC-431
---

# DEC-465: Two named pad layouts; in Ventura Highway RB never brakes, the result card's B goes by motion, the pump closes on B

**Ruling.** Carried over unchanged from DEC-431 (owner, 2026-11-18): "I have a friend who wants to remap the controls so I think we should make a second gamepad layout profile that he can just switch to." "LB on clutch, hand brake on A, upshift on B, downshift on X." "Go ahead and build it and put his side menu on RB. Let's call the current control configuration 'Professor' and let's call the alternate 'Ventura Highway'." A layout changes the driving buttons only; on a menu, a card or the map A is select and B is back in every layout; the way out of a parked screen is B, then the gas; a press belongs to the context it began in; in Ventura Highway the side menu is RB held and an RB tap is the paper throw while aiming.

New, owner, 2026-11-20, on the three cells the first build guessed: "On the Ventura Highway Control layout ... I'm not a huge fan of the way that it was built. What other solutions do we have to 1, 2, 3?" then, to the orchestrator's option tables and picks: "yep dispo the card with option A+C instead". The option texts he chose from, for Ventura Highway:
1. RB on a plain card (offer, camp, inventory): option A, "Dead: nothing. A selects, B backs, and that is all", with option C, "Tabs: RB and LB flip between a card's tabs or faces", where a card has tabs. RB never brakes anything in this layout.
2. The result card (the one you can drive through): option B, "By motion. Parked: B is back. Moving: B is the upshift." A is the handbrake.
3. The pump: option A, "B is back here too. A pumps, B closes the pump and pays. The gas then releases the brake."

Orchestrator's reading, flagged: "A+C" names cell 1's pick; "yep" is read as taking the stated picks for cells 2 and 3. Professor is unchanged.

**Why.** The first build sent the handbrake from Professor's button on cards, so in Ventura Highway RB meant the side menu while driving and a brake tap on cards, the result card had no upshift, and the pump was the one parked screen B did not close.

**Replaces.** DEC-431's detail rules for the three cells above (RB as the handbrake on cards, A handbrake and B back on the result card, the pump not closing on B). DEC-431's other rules are restated here.

**Source.** Owner, chat with the orchestrator, 2026-11-20; card `feat294-pad-layouts-try`.

---
id: FEAT-298
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "Look who's here. Listen kid, I told ya, you don't have a job here no more. next card ah right. your dough. Alright here's your Paycheck (color) we should play a cash stinger and count the $10.00 up instead of just setting it."
relates: DEC-436, DEC-277, DEC-307, DEC-152, DEC-155, DEC-422, FEAT-184, data/dialogue.js, src/main.js
---
lane: SM-1 tutorial (scribe: the same lane as FEAT-184 / FEAT-288; Sonnet for the wiring)

# FEAT-298: The manager's paycheck scene: new lines, a cash stinger, the $10.00 counts up

## Next steps
A lane replaces `PAYCHECK` in `data/dialogue.js` with the owner's new cards, colours the word "Paycheck", and wires the cash stinger plus a count-up of the $10.00. The owner answers the Open questions.

## Summary
The burger joint's last paycheck beat changes. Owner's words, exactly as typed:
> Look who's here. Listen kid, I told ya, you don't have a job here no more.
> next card
> ah right. your dough. Alright here's your Paycheck (color) 
> we should play a cash stinger and count the $10.00 up instead of just setting it.

### The scribe's reading
1. Card 1 (manager): `Look who's here. Listen kid, I told ya, you don't have a job here no more.`
2. "next card" is the card break.
3. Card 2 (manager): `ah right. your dough. Alright here's your Paycheck (color)`. The scribe reads "(color)" as: the word "Paycheck" is shown in a colour (the in-text colour markup the dialogue cards already use; the owner has not named which). FLAGGED: it could also mean the whole line is coloured.
4. When the check is handed over, play a cash stinger (a short register sound) and have the $10.00 count up from the old balance to the new one instead of being set at once.

The lines replace what `PAYCHECK` in `data/dialogue.js` has today: `Don't come back asking to run the grill again. If someone want's their food delivered you can have a cut, but I dont want you running the kitchen no more.` (DEC-277). The owner did not say that old line is gone; see Open questions. The code site is `src/main.js` around line 5099 (`_tut(DLG.paycheck, PAYCHECK, ...)`).

## Description
(See Summary.)

## Tracker
- [ ] `PAYCHECK` holds the owner's two cards exactly as typed (the owner writes dialogue: no edits, even to spelling and case)
- [ ] The word "Paycheck" is coloured on card 2 (colour per UI-STYLE.md's Story family, the owner picks if not obvious)
- [ ] A cash stinger plays when the check is handed over (FEAT-120 sound pipeline, a synthesized or library sound)
- [ ] The wallet figure counts up from the old balance to the new instead of snapping
- [ ] Owner has looked / listened

## Open questions
- CONFLICT, DEC-277: "The card is that line, character for character" for the old paycheck line ("Don't come back asking to run the grill again..."). The new lines look like a replacement, not an addition. Does the old line go, or does it come first as card 1? DEC-436 is written as standing with the new lines; DEC-277 is NOT flipped to superseded until the owner confirms.
- DEC-307 (the firing never mentions the paycheck; mom reminds you; the manager hands it over at the joint the next morning) and DEC-152 / DEC-155 (the tutorial ends at the burger shop; Larry calls after) are unaffected and fit the new "ah right. your dough" line.
- "(color)": which colour, and which word(s)? Scribe's reading above.
- The count-up: from what to what? The owner says "$10.00"; the scribe reads it as the wallet counting up by the $10.00 paycheck. Is $10.00 the paycheck amount (DEC-150 same start money, mom unpaid, paycheck last)? Confirm it is the right number.

## Links
DEC-436.

## Files
`data/dialogue.js` (PAYCHECK) · `src/main.js` (~5099 the paycheck beat; the wallet display) · `src/result-audio.js` or a new `src/*-audio.js` for the stinger

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.

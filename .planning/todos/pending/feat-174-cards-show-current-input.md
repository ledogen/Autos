---
id: FEAT-174
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: FEAT-125 (keycap() swaps a key for the pad's button while the pad drives), the dialogue renderer's dlg-key → keycap (38769295)
---
lane: B

# FEAT-174: Cards name only the controls of the input in use, and switch live

> All cards should just display the controls and the input method that you're currently using For example Larry's
> card says the same thing twice with both different input methods But if you're on pad it should just switch out
> the control text for the correct version live

Every card, prompt and dialogue line that names a control shows ONE version: the keyboard's while the keyboard
drives, the pad's while the pad drives, and it re-renders when the player switches mid-card. No line written
twice for the two inputs (Larry's card is the example).

## Acceptance
- [ ] Larry's card (and every other card found doubling) names the control once, for the live input.
- [ ] Switching input with a card open re-renders its control text.
- [ ] An audit list of the cards/prompts checked, in the work log.

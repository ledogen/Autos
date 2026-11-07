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

## Work log

**2026-11-07, Lane B — built on feature/machine, not landed.**

- **The mechanism already existed.** `keycap()` draws a key and its pad button side by side (`.kc-kb` / `.kc-pad`),
  and CSS shows the half for the device that drove last (`body.pad-on`, set by gamepad.js each frame). So it
  switches live with no per-card code. A line that differs by input now uses the same two classes on whole
  phrases: `<span class="kc-kb">…</span><span class="kc-pad">…</span>` (rule written at the top of data/dialogue.js).
- **The word stream** (`_hideWords`, main.js) leaves the hidden half's words alone, so a card spends no stream time
  on words nobody sees, and a switch mid-card shows the other half at once.
- **Audit** — every card, prompt and dialogue line that names a control:
  - Larry's paper-route card (PAPER_ROUTE_INTRO, card 2): **doubled → fixed.** Keyboard: "hold F to aim your
    throw … release F to yeet". Pad: "aim your throw with the right stick … tap RB to yeet".
  - Mom's drive lesson (TUT 'tut-drive'): **doubled → fixed** ("steer with A and D, or the left stick"). Keyboard:
    "A and D"; pad: "the left stick". W / S were already keycaps (RT / LT on the pad).
  - The other lessons (mom's call M, tut-diag V / Tab, tut-park Space, tut-map M): single keycaps, already live.
  - Every HUD prompt built with `keycap()` (park badge, pump F, reset R, card backs, the B menu, ignition I/Y):
    already live, one input at a time.
  - The map's offer card (map2d.js, canvas): draws E/Q or RB/LB from `pad.active` every frame, already live.
  - The settings Controls table (keyboard | pad columns): a reference listing both on purpose, left as is.
- **Pinned** in cdp-smoke's pad step: the drive lesson reads "the left stick" on the pad, and "A and D" after one
  keyboard press (Shift alone, which hands control to the keyboard without turning the card). Not run yet: Chrome
  held by the orchestrator. Light node gates (paper-route, rank-timer, par-oracle, gps-route, haul-load,
  prop-shadow-alignment) green.

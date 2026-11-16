---
id: BUG-183
type: bug
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I started a new game chose to go into the tour tutorial Drove until I got to the gas station and was filling up then I decided I don't want to play the tutorial and skipped it It skipped to the burger joint with more money in my pocket and the fuel dialogue was still open and I was able to continue pumping I Feel like we're lacking some sort of Event or state or checkpoint system to ensure that every variable is set properly when We leave story mode and come back into it or when we go to different parts of the tutorial and then skip it, etc. Definitely don't want a bunch of exploits to be possible because of silly oversights. If there's a way that other games handle this, maybe we should adopt something similar Otherwise I guess just paper over all the holes"
relates: FEAT-184, FEAT-229, DEC-148, DEC-152, src/main.js
---
lane: A

# BUG-183: Skipping the tutorial mid-pump leaves the pump open; no one place resets state on a transition

## Next steps
Lane A: reproduce, audit every transition, then one reset point all of them go through. Lands before the FEAT-229 rebuild.

## Summary
Skipping the tutorial while fuelling teleports the player to the burger joint with the pump menu still open and
still pumping. The owner suspects a class: transitions (tutorial skip, tutorial stage changes, leaving and
re-entering story mode) each set some variables by hand, and nothing guarantees all of them.

## Description
The owner asks for a system, not patches: "some sort of Event or state or checkpoint system to ensure that every
variable is set properly". The usual shape in games is one transition function that every mode or stage change calls:
it closes every open menu and clears every piece of in-progress state (pump session, shop cart, tow, dialogue queue,
held brake, timers), then the new stage sets only what it needs.

## Tracker
- [ ] Reproduced: skip mid-pump leaves the pump open
- [ ] Audit: every transition and every piece of transient state it can strand, as a table in this ticket
- [ ] One reset point; every transition goes through it
- [ ] The smoke or a gate skips the tutorial from inside each menu and fails on anything left open

## Log
- 2026-11-16: filed from the owner's inbox note.

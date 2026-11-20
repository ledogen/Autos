---
id: BUG-239
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "For some reason, every time I get out of a dialogue sequence, the first time I try to start my truck, it takes a second for the sound from the starter motor to fade in. Every subsequent hit of the starter sounds fine, though."
relates: src/ignition.js, src/engine-audio.js, src/dialogue.js, src/main.js
---
lane: unplaced (scribe: lane C, audio; Sonnet)

# BUG-239: The first starter sound after a dialogue fades in over about a second

## Next steps
A lane reproduces it headless or in the browser (open and close a dialogue card, then press the starter) and finds why the first starter hit ramps in.

## Summary
After a dialogue sequence ends, the first start of the truck has a starter-motor sound that takes about a second to fade in. Every later start is fine.

Owner's words:
> For some reason, every time I get out of a dialogue sequence, the first time I try to start my truck, it takes a second for the sound from the starter motor to fade in. Every subsequent hit of the starter sounds fine, though.

The scribe's first guess for the investigator (not verified): the audio context or the starter's gain node is held or ducked while a dialogue is up (a mix duck, or a suspended context after the card) and un-ducks on a ramp the first time. The first-use ramp-up fits a duck release, a lazily created audio node, or a sample that streams on first play. Look at `src/ignition.js`, `src/engine-audio.js` and how the dialogue code ducks the master.

## Description
(See Summary.)

## Tracker
- [ ] Reproduced: dialogue closes, first starter press ramps in; later presses do not
- [ ] Cause named in the code
- [ ] Fixed: the first starter sound is at full level at once
- [ ] Owner has looked (one start after a dialogue)

## Open questions
- No governing decision found (DEC-209, DEC-374 are about the sound licence and bump-start).

## Files
`src/ignition.js` · `src/engine-audio.js` · `src/dialogue.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-19: land/small-1119, NOT FIXED. Read the whole path (ignition.js -> main.js audio block -> engine-audio.js startCrankAudio / ensureStarter / updateBake / audioClockLive). The starter loop is built at the first gesture (ensureEngineAudio), its gain ramps with tc 0.02 s, and nothing ducks for a dialogue: the only dialogue effect is `enabled` false while the sim is held, which gates startCrankAudio and drops bakeOut at tc 0.05 s. No ~1 s ramp found. A headless Chrome run (muted, loaded box) could not read real gain values (the audio clock barely advanced), so no repro. Needs a headed run with the owner's audio, or the owner's repro steps (which dialogue, which input, what ran before).

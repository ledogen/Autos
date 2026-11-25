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
- 2026-11-24: land/bug-239-starter-fade, NOT REPRODUCED, no src change. Headless Chrome (`--mute-audio`) never advances the audio clock (`currentTime` stuck at 0.006 s, state "running"), so gain VALUES cannot be read; instead the probe (`wip/bug-239/probe.mjs`, throwaway, git-invisible) patched `currentTime` to wall time and logged every `setTargetAtTime` on the starter gain plus every source `start()`. Story run, seed 6, tutorial skipped, cards closed, then start B (first after the dialogue) and start C: the starter gain automation is identical, target 0.175 at tc 0.02 s on press, 0 at tc 0.04 s on release, so no duck or slow ramp is scheduled for B. With a real pointerdown on "start" the whole graph incl. the starter loop (7.24 s) and 12 bake loops is built at t = 5.3 s, 18 s before B, so nothing is created lazily at B. One real hole seen: when the run is entered by a synthetic click (no pointerdown) and only dialogue keys are pressed, the graph is first built AT the first starter press (src.start 80 ms after it here; fetch + decode of ~13 files on a real box could be about 1 s, which would match "fades in"). Several `document` keydown handlers (`main.js` 4474, 4488, 5209) `stopPropagation` before `_unlockAudio` hears it. Unconfirmed as the owner's path (a real click or pad already unlocks). Needs: owner's input path into the run (mouse click on start, keyboard, or pad) and one headed repro with audio.

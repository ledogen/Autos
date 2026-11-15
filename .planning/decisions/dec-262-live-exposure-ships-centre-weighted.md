---
id: DEC-262
status: standing
decided: 2026-11-15
area: world
governs: FEAT-221, src/exposure.js, src/sky.js, live exposure, eye adaptation
supersedes:
---
# DEC-262: Live exposure ships on: centre-weighted, 0.3-stop deadband, 3× slower opening up, night stop-down only

**Ruling.** "localhost:3885/?ae=centre&aeBand=0.3 wins / can i have triple the darkness adjustment period (3x slower
stopping up) but keep the ~1s stop down (i.e. when exiting tunnel)". Live exposure is on by default: the centre-weighted
meter, a 0.3-stop deadband, opening up (into a tunnel) on a 6 s time constant (3× the prototype's 2 s), stopping down
kept at the prototype's (0.6 s, settled in about 1 s out of a tunnel). The "allow it to open up at night" option was
not picked, so after dark the camera only stops down.

**Why.** Owner's drive of the prototype.

**Replaces.** The prototype's defaults (1-stop deadband, 2 s opening up) and its other meters (whole frame,
ground-weighted), which are deleted. Consistent with DEC-198 (k scales the whole frame by one number, so the sky's
colour and its sun-side / far-side contrast are untouched) and DEC-199 (the camera never opens up a night scene, so
the moonlit night's exposure is as DEC-199 left it). Neither is superseded.

**Source.** Owner, 2026-11-15, card `feat221-look` ("Good, but tune (note box)"), note box. Owner's words.

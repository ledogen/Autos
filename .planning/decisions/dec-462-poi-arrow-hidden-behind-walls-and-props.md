---
id: DEC-462
status: standing
decided: 2026-11-20
area: ui
governs: FEAT-297, DEC-434, src/gps.js, poi arrow, route end
supersedes: 
---

# DEC-462: The POI arrow does not draw through walls and props

**Ruling.** "3 - it shouldnt draw through walls and props." (note on card small-1119-look; item 3 is the floating POI arrow, FEAT-297.)

**Why.** The arrow was built to ignore depth so it stays visible when parked at the POI (the card said "It draws through walls"); the owner does not want it showing through solid things.

**Replaces.** The depth-ignoring part of the close-range marker (commit 110c48f4). DEC-434 (the arrow floats, spins, bobs) stands; how it stays readable close in without ignoring depth is the builder's to solve.

**Source.** Owner, card small-1119-look, answered 2026-11-20 (note box). Owner's words.

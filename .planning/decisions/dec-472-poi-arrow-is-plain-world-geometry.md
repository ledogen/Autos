---
id: DEC-472
status: standing
decided: 2026-11-20
area: ui
governs: FEAT-316, FEAT-297, FEAT-218, src/gps.js, poi arrow, route end, turn arrow
supersedes: DEC-434
---

# DEC-472: The POI arrow is plain 3D geometry above the POI: no scaling, no keep-on-screen

**Ruling.** "the vertical poi arrow is great until you're within 10m then it kinda awkwardly shrinks and jumps around. just put it in space above the poi. drop the scaling and translation to try to keep in onscreen. make it dead simple. just real geometry in the 3d world. spinning and bobbing"

**Why.** The close-range shrink and slide that DEC-434's "make sure the arrow is visible, not up super high" led to read worse than an arrow that simply stays put.

**Replaces.** DEC-434's close-range visibility clause. The rest of DEC-434 carries over: the arrow points straight down, hovers above the POI, spins on the y axis and bobs. As built it sits 1.5 m above each POI's own roof, so it can leave the chase camera's frame when the truck is parked at the POI.

**Source.** Owner, inbox note 2026-11-20 (17:51 PST). Owner's words.

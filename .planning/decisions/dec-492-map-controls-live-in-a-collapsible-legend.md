---
id: DEC-492
status: standing
decided: 2026-11-24
area: ui
governs: FEAT-327, FEAT-239, FEAT-234, FEAT-211, src/map2d.js, map, waypoint, legend, controls
supersedes: DEC-319
---

# DEC-492: The map's controls live in its legend, which folds; the waypoint stays Y only

**Ruling.** "put the controls hint in the legend instead. also the legend should be collapsable and align to the bottom so it can be out of the way. open by default". The map's controls (pan, zoom, set waypoint, and on the pad the card and tab buttons) are rows inside the legend, not in the bottom margin. The legend folds, sits at the bottom of its column, and opens unfolded.

Carried forward from DEC-319, unchanged: "It's weird that A and Y both set the waypoint on the map view. Let's just commit to making it Y." The pad's Y drops or clears the waypoint (the keyboard's N, and a click on the sheet); A and Enter do not. The controls show as keycaps (the pad's buttons while the pad drives). DEC-225's other defaults stand: the 90 % window over a live world, the arrows on the map's mission cards, Q/E on the parked offer panel, a job's guidance always wins, the waypoint clears on arrival within 28 m, the HUD reads "1.12 km to the waypoint".

As built (the lane's reading, for the owner's look): the legend folds with a click on its green band; the pad has no fold, since that would spend a button.

**Why.** The owner wants the hint out of the way of the map.

**Replaces.** DEC-319's "The map's bottom margin prints pan, zoom and set waypoint".

**Source.** Owner, owed card `feat239-look`, 2026-11-24. Owner's words; the carried paragraph is DEC-319's text.

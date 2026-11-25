---
id: DEC-319
status: superseded
decided: 2026-11-16
area: ui
governs: FEAT-234, FEAT-211, src/map2d.js, map, waypoint, legend, controls
supersedes: DEC-225
---
# DEC-319: The map waypoint is Y only, and the map prints its own controls
**Ruling.** "It's weird that A and Y both set the waypoint on the map view. Let's just commit to making it Y." The pad's Y drops or clears the waypoint (the keyboard's N, and a click on the sheet); A and Enter no longer do. "Let's also show the waypoint control on the bottom of the map next to the distance legend. actually show all the map controls there Pan, zoom, and set waypoint." The map's bottom margin prints pan, zoom and set waypoint as keycaps (the pad's buttons while the pad drives). DEC-225's other defaults stand: the 90 % window over a live world, the arrows on the map's mission cards, Q/E on the parked offer panel, a job's guidance always wins, the waypoint clears on arrival within 28 m, the HUD reads "1.12 km to the waypoint".
**Why.** The owner's inbox note, 2026-11-16: two buttons for one action read as an accident.
**Replaces.** DEC-225's default (1) "A or Enter with nothing highlighted also drops it" and (5) "no legend row".
**Source.** Owner inbox 2026-11-16 (FEAT-234). Restating DEC-225's untouched defaults is agent wording.

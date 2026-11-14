---
id: DEC-175
status: standing
decided: 2026-11-14
area: ui
governs: FEAT-211, src/map2d.js, index.html, map
supersedes: DEC-132
---
# DEC-175: The map is a 90 % window over the live game; the arrows flip its cards

**Ruling.** The map takes 90 % of the window, and the game behind it stays live (rendered every frame, not frozen). A list on the right swaps between Missions and Shopping with the bumpers (Q / E), both sorted nearest first. The left / right arrows flip the mission cards on the map, and the card shows the arrows. Opening always centres on the truck and tracks it, B from a list starts panning from there, and the player can set a custom GPS waypoint.

**Why.** "90% window. Make the background live … We reduced map performance costs and we already render in 3D all the time anyway." Q / E are the tabs now, so the cards move to the arrows.

**Replaces.** DEC-132's 80 % window and the frozen frame behind it; Q / E paging the map's cards.

**Source.** Owner 2026-11-14: card feat211-look ("make the background live"), inbox "bump the new map ui to 90% of window size", inbox "replace q/e on the mission cards on the map with left/right arrows. q/e are the tabs now. dont forget the visual on the card too". Agent wording.

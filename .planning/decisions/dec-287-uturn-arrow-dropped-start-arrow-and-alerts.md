---
id: DEC-287
status: standing
decided: 2026-11-15
area: ui
governs: FEAT-215, src/gps.js, src/alerts.js, #machine-word
supersedes: DEC-275
---
# DEC-287: No 3D U-turn arrow; a fixed start arrow, and "Wrong way" in the alerts area that cycles

**Ruling.** "3D U-turn arrow was a bad idea. I think we should ditch it entirely. Instead, let's use the junction pointer arrow right outside the POI to direct the player in the right direction immediately after accepting a mission. So effectively mark the start of the mission with a junction arrow pointed down the road in the direction that the GPS wants you to drive. that arrow should not move and should disappear once you go about 20m either direction. Then let's use the alerts section of the UI where we would say flat tire etc. And put "Wrong way. Turn around" in that area whenever the player is going the wrong way against the GPS. Since this is a general purpose alerts section now, I think we also need to cycle through the alerts if there's more than one at a time. I think we can just show them simply two seconds at a time and just cycle through all the open alerts in order."

**Why.** The owner's look at the 3D U-turn arrow (DEC-275).

**Replaces.** DEC-275 and the FEAT-215 ribbon entirely.

**Source.** Owner, card feat215-arrow-look, 2026-11-15. Owner's words.

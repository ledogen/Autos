---
id: DEC-501
status: standing
decided: 2026-11-20
area: world
governs: FEAT-279, FEAT-72, ASSET-31, ASSET-22, signs, road furniture, src/road.js, rockslide, slide finder
supersedes: 
---

# DEC-501: Road signs are derived from the road and never lie

**Ruling.** The owner's picks on the deep dive `.planning/dives/FEAT-279-signs.html`, submitted 2026-11-20:

- Principle: "yes: derived only, and a gate fails on any false sign".
- Advisory speed: "0.25 g (a real road's comfort)". Units: "MPH, steps of 5".
- Guide signs: "none: navigation stays the map and the GPS item". "no speed-limit signs".
- Scope: "Tier 1, then Tier 2's bends and plaques".
- Curve signs: "bends needing ≥ 30 km/h of slowing, plus every hairpin and series (about 0.9 per km)".
- Grade signs: "≥ 15 % held for ≥ 150 m (0.36 per km)".
- Junctions: "T sign and STOP on every stem; side-road sign only where hidden".
- Rockslide signs: "yes, at the cuts the slide finder accepts". Note: "These are extremely common at the moment, probably two or three per kilometer. We'll tune back the slide dropper to be more picky about which slopes it chooses, but add signs to every slide area for now. Merge multiple slide areas if they are near to cut down on the number of signs."
- A hit sign: "knocked flying as a rigid body; it stands again when its patch re-streams".
- The demolition sign line: "different type of sign that doesnt normally appear in world gen: road work ahead, orange background, warning:floods, cattle crossing, etc".
- When: "with FEAT-278, before the alpha".

**Why.** The census in the dive: the world placed 0 signs, and the demolition old-sign line was true about 1 time in 8.

**Replaces.** Nothing. DEC-430 (demolition signs come from their own pool) stands; this names what is in that pool.

**Source.** `dives/FEAT-279-signs.answers.json` in the owner's private tracker repo, submitted 2026-11-20T20:43Z. The owner's words. Taken in on 2026-11-25: the submitted dive sat five days with no `.taken` marker.

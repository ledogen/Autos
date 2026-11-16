---
id: DEC-300
status: standing
decided: 2026-11-16
area: perf
governs: FEAT-227, FEAT-226, PERF-51, src/main.js, src/vehicle-model.js, station light, bay light, point light
supersedes:
---

# DEC-300: The station light is cut off beyond 200 m

**Ruling.** "can we not just cut off the light beyond a certain distance? say 200m away and you dont need to consider the light of it anymore?" Built: the one station light (DEC-229) is in the scene only while a lit place is within 200 m of the truck (`POI_LIGHT_CUTOFF_M`); the shader variants for 0, 1 and 2 point lights are compiled at load so the switch does not hitch.

**Why.** "it seems like awfully high lighting cost to have one single non raytrace light take 3% of a high end mobile gpu". Measured: the light removed saves 3.1 to 4.1 % GPU far from any station; the switch stays inside one 16.8 ms frame; load grows by about 0.2 to 0.4 s.

**Replaces.** Nothing. The 200 m figure is the owner's example and has not been looked at by night.

**Source.** Owner, owed card lights-1116-look, 2026-11-16. Owner's words; the built description is the agent's.

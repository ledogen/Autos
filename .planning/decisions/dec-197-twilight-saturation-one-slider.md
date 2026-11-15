---
id: DEC-197
status: standing
decided: 2026-11-14
area: world
governs: FEAT-180, src/sky.js, sky, twilight, duskSat
supersedes:
---

# DEC-197: twilight saturation stays one slider, at 0.5

**Ruling.** "1. keep" — the answer to "Twilight + saturation: … I built 0.5. Keep it, or split it into sunrise / sunset
sliders?" `SKY_PARAMS.duskSat` ("twilight: + saturation") is one value for both twilights, 0.5.

**Why.** The redder fog away from the sun that prompted the question is handled where it lives instead: the far-side
desaturation of the horizon band (`duskAway`, FEAT-180 round 5), which the same answer asked for.

**Replaces.** The round-4 open question of a sunrise / sunset split.

**Source.** Owner, 2026-11-14, the `feat180-r2-look` card ("changes (note box below)"), note box, item 1. Owner's words.

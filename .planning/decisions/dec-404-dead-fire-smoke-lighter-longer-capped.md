---
id: DEC-404
status: standing
decided: 2026-11-17
area: assets
governs: FEAT-264, src/smoke.js
supersedes:
---

# DEC-404: The dead campfire's smoke is lighter, lives longer, and stays at its current maximum size

**Ruling.** "smoke is kinda hard to see. make it lighter. also extend the particle lifespan and cap their size around the current max"

**Why.** On the round-2 sheet the ash-grey wisps (0xa8a6a0) were hard to read against dark ground and dusk. Built as colour 0xa8a6a0 to 0xdcdad4, life 4-6 s to 7-10.5 s (1.75x), size capped at the old maximum of 2.0 m (sizeMax 0.25 x (1+grow 7)); growth follows age/life, so the longer life stretches the swell and does not enlarge it. Live puffs about 13 to about 22 (rate 2.5/s unchanged), under the 32-ember pool.

**Replaces.** The colour, life and (by construction) size numbers of DEC-397's smoke. Its rising, swelling and fading behaviour stands.

**Source.** Owner note on card campfire-camera-r2-look, 2026-11-17. The numbers are the lane agent's reading of "lighter", "longer" and "around the current max".

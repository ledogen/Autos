---
id: FEAT-107
type: feature
status: open
severity: minor
opened: 2026-10-12
source: owner, 2026-10-12 — "I also like rain. Definitely also been on the back burner. Go ahead and add
  a feature request for rain." Named in the same breath as a driving-side difficulty lever: "as the game
  gets harder … a bit longer, a little bit steeper", with rain as the weather half of that.
relates: FEAT-108 (hydroplaning puddles — depends on this), SkySystem / SKY_CYCLE in `src/sky.js` (the
  only weather-adjacent system; fog is `scene.fog` in main.js), `params._tireMuScale[i]` in
  `src/physics.js:910` (the per-wheel μ multiplier damage.js already drives — rain is one more factor on
  it), `src/dust.js` (the existing per-tire surface particle system, the template for spray),
  `src/road-quality.js` (per-500 m tier; wet asphalt vs wet dirt differ)
invariants: SM-INV-2 (par never scales with the car — rain is the WORLD, so it is allowed to move par
  or must be priced in; owner's call, see Open), SM-INV-12 (weather must be a pure function of seed +
  run clock, nothing saved — feedback_cold_generation_only), SM-INV-10 (no number shown for "wet grip")
---

# FEAT-107: Rain and fog

## Request

Weather as a driving-side difficulty lever, alongside longer and steeper routes. Rain lowers grip,
hides the road, and later (FEAT-108) pools in low points.

## Shape (proposal, not ratified)

- **A weather state on the day clock**, derived from seed + day (meta-free, cold). Binary per day;
  see the owner rulings below, which supersede the intensity-ramp idea first written here.
- **Grip**: one factor on `params._tireMuScale[i]`, the same per-wheel μ multiplier damage.js drives.
  Wet asphalt ~0.7–0.8 of dry, wet dirt lower. Real numbers to be tuned on the par-oracle drives.
- **Look**: streak particles near the camera, darker/specular road ribbon, denser fog, dimmer sun
  via SkySystem. Spray from the tires reuses the dust.js pattern. Flat-colour art style: rain is a
  tint and a darkening, not a texture.
- **Sound**: hiss on the roof, louder at speed. Cheap.
- **Perf**: the whole thing must fit in the existing frame budget on a mid-range laptop. Particles
  capped and camera-local only; no per-chunk wet maps.

## Owner ruling 2026-10-12 — binary days, par set at accept

> "The simplest way to allow rain to decide par is to have days be binary, wet days or dry days and
> then it would rain all day which would mean we could decide par for missions at the time of
> accepting them."

- **A day is wet or dry, all day.** This replaces the intensity-ramp proposal above. Weather is a
  pure function of `(seed, day index)`. Regions may still weight the odds.
- **Par uses that day's μ.** Option (b) wins: a wet day prices par with wet grip, so a safe driver
  is not taxed by the sky.
- **Wet/dry is frozen at accept**, alongside the pay tier and rank thresholds `economy.terms()`
  already freezes (the 2026-08-01 "finishing after midnight must not silently re-grade you" ruling).
  No new mechanism, just one more field on the contract.

## Owner ruling 2026-10-14 — the weather switches at midnight

- **Weather can switch each day**, at midnight, when `day.js` increments the day. Par stays
  frozen at accept, so a switch mid-job changes the physics, not the deal.
- **Low stakes by design:** most offers recycle in under a day (a multi-day offer would leave the
  board stale for the length of the region), so jobs that span a weather change are rare.
- **No forecast (owner, 2026-10-15).** Par absorbs the rain and you see the day's weather before
  you accept anything, so knowing it in advance would not change a decision. The only exception is a
  multi-day job, and those are rare. A forecast would be fluff. (Briefly proposed 2026-10-14 as a
  twice-daily radio show; see IDEAS.md "Radio".)

## Owner ruling 2026-10-15 — odds, mud, fog

- **Mostly sunny.** Rain on ~1 day in 4 in R1, ~1 in 2 in R3. R2 is unstated; default ~1 in 3
  (interpolated, not ratified). The odds ride the baked per-region parameters.
- **Mud is a look plus a friction constant.** Dirt can visibly turn to mud; the only simulation
  change is a lower wet-dirt μ. No rutting, sinking or other custom mud code.
- **Fog is its own weather condition**, independent of rain. A day can be clear, rainy, foggy, or
  rainy *and* foggy: two independent per-day draws from seed + day. Fog lives on `scene.fog`
  (main.js) and SkySystem. It changes sight distance, not grip, so it does not move par.

## Open (owner)

- Fog odds per region.

## Acceptance

- Rain state is a pure function of seed + clock; same seed, same day → same weather (world-determinism gate).
- Grip reduction is visible in a headless par-oracle drive (longer time on a fixed route at the same inputs).
- Nothing is written to a save.
- Frame cost measured and reported in the ticket's resolution.

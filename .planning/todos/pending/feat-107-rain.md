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

# FEAT-107: Rain

## Request

Weather as a driving-side difficulty lever, alongside longer and steeper routes. Rain lowers grip,
hides the road, and later (FEAT-108) pools in low points.

## Shape (proposal, not ratified)

- **A weather state on the day clock**, derived from seed + day + hour (meta-free, cold). Dry / rain,
  with an intensity 0..1 that ramps in and out over tens of minutes of game time. Later regions can
  weight toward more rain in their baked per-region parameters, which is where regional difficulty
  already lives.
- **Grip**: one factor on `params._tireMuScale[i]`, the same per-wheel μ multiplier damage.js drives.
  Wet asphalt ~0.7–0.8 of dry, wet dirt lower. Real numbers to be tuned on the par-oracle drives.
- **Look**: streak particles near the camera, darker/specular road ribbon, denser fog, dimmer sun
  via SkySystem. Spray from the tires reuses the dust.js pattern. Flat-colour art style: rain is a
  tint and a darkening, not a texture.
- **Sound**: hiss on the roof, louder at speed. Cheap.
- **Perf**: the whole thing must fit in the existing frame budget on a mid-range laptop. Particles
  capped and camera-local only; no per-chunk wet maps.

## Open (owner)

- Does rain move par? SM-INV-2 lets the world move par. Two options: (a) par is dry, rain is a
  tax the tip absorbs; (b) par is computed with the wet μ and the payout is the same. (b) is
  kinder to the "drive safe and finish" promise.
- Can a job be offered during rain, or only begin in it?

## Acceptance

- Rain state is a pure function of seed + clock; same seed, same day → same weather (world-determinism gate).
- Grip reduction is visible in a headless par-oracle drive (longer time on a fixed route at the same inputs).
- Nothing is written to a save.
- Frame cost measured and reported in the ticket's resolution.

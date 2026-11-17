---
id: FEAT-243
type: feature
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "Wheel dust and smoke that's in the shadow of a mountain still appears as Lit by sunlight Is there a cheap way we can change the Brightness of the particles from a simple shade test I'm okay if the particles just inherit the lighting of the ground below them if that's cheaper"
relates: DEC-227
---
lane: unplaced

# FEAT-243: Wheel dust and smoke take the shade of the ground under them

## Next steps
None: closed 2026-11-17, landed via `land/feat-243-particle-shade`.

**Resolution.** Dust, tire smoke and dirt spray read the terrain's shade from the `sunFar` shadow map (one compare per
vertex at the puff centre) and dim toward `particleShadeTint()` in shade. NOT covered: the truck's own shadow on its
smoke (the near `sun` map is not sampled), tree shadows (baked atlas, not in `sunFar`), shade beyond ±256 m (FEAT-249),
and non-sun lights (headlights, bay light, campfire: the particles stay unlit by them). Low tier has no shadows: no shade.

## Summary
Dust and smoke in a mountain shadow render as sunlit. Darken them by a cheap shade test, or let them inherit the lighting of the ground below.

## Description
Real-time shadows are off (DEC-227), so find what the terrain uses for its shading (baked or analytic) and sample that at the emitter. Measure the cost; no new per-particle work on the main thread if it can be avoided.

**Approach (owner's idea, 2026-11-17: "can't we ask the graphics card about the shadow map?").** Yes, and with no
readback. `sunFar`'s shadow map (main.js, ±256 m, 0.25 m/texel, terrain casts into it) is a depth texture that
already lives on the GPU. Hand it to the dust / smoke / dirt-spray `ShaderMaterial`s as two uniforms —
`sunFar.shadow.map.depthTexture` and `sunFar.shadow.matrix` — and in the VERTEX shader project the puff centre
(`aPos`) into the map, compare depths, and pass a 0..1 `vShade` to the fragment shader, which mixes the tint toward
a `uShadeFloor` (the ambient share; a tunable). One lookup per vertex, zero main-thread work. Catches: the texture
is created with a compare sampler (`sampler2DShadow`, r184 WebGLShadowMap:263), so declare it that way; the map
object is null until the first shadow pass and is replaced when the tier changes map size, so re-point the uniform
each frame; Low tier has no shadows, so `vShade = 1` there. Do NOT use `readPixels` (a GPU→JS copy that stalls the
frame) and do not set `lights: true` on the materials (drags in every light uniform for one lookup).

## Tracker
- [x] Particles in terrain shade are darker than particles in sun
- [x] Cost measured and reported
- [x] Shade read from the far shadow map in the particle shader; the CPU horizon test is gone
- [x] Owner has looked

## Decisions
- 2026-11-17, owner: "can't we ask the graphics card about the shadow map?" The CPU horizon test (f91283ff) is retired
  in favour of a shadow-map lookup in the particle vertex shader (the Approach paragraph above).
- 2026-11-17, owner (card feat243-particle-shade-look): "Good: land it". The shadow-map build ships as is.

## Files
`src/dust.js` (SUN_SHADE_UNIFORMS / SUN_SHADE_VERT) · `src/smoke.js` · `src/dirt-spray.js` · `src/sky.js`
(particleShadeTint) · `src/main.js` (the per-frame uniform push) · `test/particle-shade.mjs`

## Log
- 2026-11-16 (spare lane): terrain shade is the sun's realtime cascades (`sunFar` ±256 m, terrain casts); no CPU
  value existed, so `sunVisibility` (sky.js) runs a 20-sample horizon test on `analyticHeight` at the truck, re-run
  per 1 m / 0.25 s; `particleShadeTint` = particleLight(key × vis) / particleLight(key), baked into dust/smoke/spray
  colour at spawn (sparks untouched). Cost: +0.15 ms/s main thread (≈ 0.05 ms per sample), draw calls unchanged. Not
  covered: tree shadows (baked atlas), the truck's own shadow, POIs, headlights/bay light (particles are unlit).
  Gate particle-shade; affected 12/12 green; smoke boot,story,tires PASS.
- 2026-11-17 (spare lane, round 2): shadow-map lookup (facc71c8). One `sampler2DShadow` compare per vertex at the puff
  centre, lifted 2 m toward the sun; off when sunFar casts no shadow / map null / lab; tint = particleShadeTint().
  Grid proof (r2-grid.log): 169 discs on a 6 m grid over a shadow edge, read off the frame: horizon-lit median 1.00,
  horizon-shaded 0.445 of their untinted brightness; 11/134 disagree, all on the edge. Particle update 1.22/1.40 ms/s
  (new) vs 1.76/1.63 (horizon build), A-B-A-B; tint push +0.06–0.08 ms/s. Affected 12/12 green; cdp-smoke PASS 35 steps, 0 console errors.
- 2026-11-17 (s2, landing): owner "Good: land it" (card feat243-particle-shade-look). Merged main (5bb6fc54), no
  conflicts; campfire has its own materials, debris shares nothing with dust. Closed.

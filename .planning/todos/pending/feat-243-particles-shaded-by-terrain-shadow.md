---
id: FEAT-243
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "Wheel dust and smoke that's in the shadow of a mountain still appears as Lit by sunlight Is there a cheap way we can change the Brightness of the particles from a simple shade test I'm okay if the particles just inherit the lighting of the ground below them if that's cheaper"
relates: DEC-227
---
lane: unplaced

# FEAT-243: Wheel dust and smoke take the shade of the ground under them

## Next steps
A free lane: build the approach under Decisions (sample the far shadow map in the particle shader) and show before/after.

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
- [ ] Owner has looked

## Log
- 2026-11-16 (spare lane): terrain shade is the sun's realtime cascades (`sunFar` ±256 m, terrain casts); no CPU
  value existed, so `sunVisibility` (sky.js) runs a 20-sample horizon test on `analyticHeight` at the truck, re-run
  per 1 m / 0.25 s; `particleShadeTint` = particleLight(key × vis) / particleLight(key), baked into dust/smoke/spray
  colour at spawn (sparks untouched). Cost: +0.15 ms/s main thread (≈ 0.05 ms per sample), draw calls unchanged. Not
  covered: tree shadows (baked atlas), the truck's own shadow, POIs, headlights/bay light (particles are unlit).
  Gate particle-shade; affected 12/12 green; smoke boot,story,tires PASS.

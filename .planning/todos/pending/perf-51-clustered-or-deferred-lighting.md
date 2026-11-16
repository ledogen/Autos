---
id: PERF-51
type: perf
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "I'm in to ticket for cluster to deferred lighting post alpha"
relates: FEAT-227, FEAT-226, DEC-227, DEC-229, src/main.js
---
lane: unplaced (post alpha)

# PERF-51: Clustered or deferred lighting, so a light costs only where it reaches

## Next steps
Nobody, until after the alpha. First step then: a cost study of the three routes below, before any build.

## Summary
Today every light costs GPU on every lit pixel on screen, wherever the light is (one extra point light measured
+3.4 to 4.4 % everywhere, FEAT-227). That caps the game at a handful of lights. A clustered or deferred arrangement
makes a light cost only inside its reach, which is what would allow lit stations, street lamps, signs and other
cars' headlights.

## Description
Three.js's standard renderer is a forward renderer: each pixel's shader (the small program the graphics card runs
per pixel) loops over every light in the scene. The limit is Three.js's, not WebGL's. Routes to study:

- **Clustered (tiled) forward**: the screen is cut into cells, each cell lists the lights that reach it, and a pixel
  only evaluates its cell's list. Keeps today's materials and transparency.
- **Deferred**: surfaces are drawn once into buffers (colour, normal, depth), then each light is drawn as a small
  volume that shades only the pixels it covers. Transparent things and anti-aliasing need separate handling.
- **Three.js's WebGPU renderer with clustered lighting** (owner, 2026-11-16: "Add the 3JS newer web GPU renderer to
  the newly minted ticket with clustered lighting"). Three.js's newer renderer ships two lighting add-ons, checked
  in the r184 source during FEAT-227:
  - `TiledLighting`: the screen is cut into 32 px tiles and each pixel loops only over its tile's lights; up to 1024
    lights. It uses compute shaders (general GPU programs that run outside the drawing pipeline), which WebGL2 lacks.
  - `DynamicLighting`: lights live in fixed-size parameter lists, so adding or removing a light no longer recompiles
    shaders (today each light count is its own shader, which is why FEAT-227 pre-compiles the variants at load).
  - Cost to adopt: the whole renderer changes. The game's 21 custom-shader sites in 10 `src/` files (terrain, bake,
    sky, fog, impostors, ...) must be rewritten in Three.js's node shader language (TSL). The FEAT-227 agent's guess
    is several weeks; not measured.
  - Not checked: whether `TiledLighting` runs on the WebGPU renderer's WebGL2 fallback, and how many players'
    browsers lack WebGPU.

The interim lever is the distance cut-off being trialled under FEAT-227 (the light leaves the scene when no lit
place is near), which costs nothing far from a station but still pays full price near one.

Real-time shadows from lights stay off for now (DEC-227); this ticket does not reopen that.

## Tracker
- [ ] Cost study: the three routes, each with a measured prototype number and a rebuild size
- [ ] WebGPU route: which browsers lack it, and whether tiled lighting works on the WebGL2 fallback
- [ ] Owner picks a route
- [ ] Built; N lights near the camera measured against today's per-light cost

## Log
- 2026-11-16: filed at the owner's word, post alpha.
- 2026-11-16: WebGPU renderer route expanded with the FEAT-227 findings, at the owner's word.

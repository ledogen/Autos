---
id: FEAT-05
type: feature
status: open
opened: 2026-06-11
source: scribe-session
---

# FEAT-05: Procedural texture on the dirt terrain

## Request

Add a procedural texture to the dirt/terrain surface so the ground reads as actual dirt
instead of a flat untextured shade. Texture should be generated procedurally (not an image
asset) to stay within the no-asset / single-origin constraints.

## Notes

- Visual / presentation feature on the terrain mesh — not physics.
- Procedural (shader / noise-based) so it tiles across streamed chunks without seams and needs
  no external image files.
- Should hold up across the chunked, streamed terrain (consistent look chunk-to-chunk; ideally
  keyed off world position / the existing terrain seed so it's deterministic and seam-free).
- Captured live via scribe session during Phase 9 work; promote via `/gsd:review-backlog` when ready.

## Resolution (2026-06-25) — DONE, browser-confirmed

Alpine procedural terrain & road texturing. No asset files (procedural only).

- **Biome palette** (`data/ranger.js` + `src/terrain.js` `_writeChunkVertexColors`): replaced the desert
  warm-brown set with a high-altitude Eastern Sierra / Lone Pine palette — granite rock, alpine soil,
  fertile/forest sage, and **meadow** green. Biome chosen by **slope + absolute altitude (treeline) +
  relative elevation**.
- **Meadows = relative elevation** (new axis): `rel = rawHeight − localMean(radius)` via a seam-free,
  carve-free low-pass (`_localMeanGrid`: haloed low-res `rawHeightWorld` grid → box-blur → bilerp).
  Local basins (rel ≪ 0) greenify as lush meadow; flat benches stay fertile/forest (trees later, FEAT-06).
- **Procedural fbm detail** (`src/terrain-detail.js` shared GLSL, injected via `onBeforeCompile`):
  per-pixel albedo mottle + a normal bump that ramps in with rockiness (steep OR above treeline).
  Master `terrainDetailScale` is a perf kill-switch (driven to 0 by the PERF-05 **Near** draw-distance
  tier on weak GPUs).
- **Road shoulder** (`src/road-mesh.js`): procedural gravel bump on the dirt skirt only (isolated by
  vertex-colour hue), asphalt + markings stay crisp.
- **Sky/fog/light nudge** (`src/main.js`): cooler alpine haze + HemisphereLight + warm sun. Full
  skybox rework remains **QUAL-02**.
- All tunable live under debug **Terrain → Terrain Look (alpine)**. `npm test` 11/11 green; meadow REM
  algorithm validated headlessly (seam mismatch 0, basin floors greenify).
- Follow-ups: trees/rocks scatter keyed to the fertile/meadow tiers = **FEAT-06**; sky = **QUAL-02**.

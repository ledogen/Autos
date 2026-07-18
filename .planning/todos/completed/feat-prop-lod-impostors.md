---
id: FEAT-06c
type: feature
status: closed
resolution: |
  SHIPPED 2026-07-16 (branch feature/gpu-graphics, PERF-21 pass). Two-tier LOD: full 3D palette
  within lodRing chunks of the camera (tier-wired: Low/Normal 1, High/Ultra 2), single-quad
  billboard impostors beyond, out to propRing (extended per tier — billboards are ~2 tris).
  Atlas baked in-browser at boot from the palette (src/props/prop-impostor.js, RGBA16F 256px
  tiles, lit by the live sky look via skySystem.sunDirection; re-baked on look change). Chunk-
  granular re-pooling from retained placement records (prop-system.js), alphaTest cutout (no
  alpha blend), baked ground shadows preserved. DESCOPED: the Mid reduced-geometry tier and
  dither/cross-fade transitions — the chunk swap at >=96 m under fog reads clean (verified vs
  main via A/B screenshots); revisit only if popping is reported. A/B at Normal: -23 % scene
  triangles at a static viewpoint. iGPU-floor (HD 620) acceptance NOT re-measured — M4 only.
opened: 2026-06-26
closed: 2026-07-16
severity: minor
source: user-decision
parent: FEAT-06
depends_on: [FEAT-06 (palette + instanced render must exist first)]
relates: [PERF-05 (iGPU is render/GPU-bound — overdraw is THE cost this ticket attacks)]
note: "LOD + in-browser baked billboard impostors for the props. Decided 2026-06-26: impostor route
(not just fog-fade) — biggest overdraw win on the iGPU floor, and stays no-asset by baking the
impostor texture in-browser from the FEAT-06 palette. This is what unlocks Ultra draw distance."
---

# FEAT-06c: Prop LOD + in-browser baked billboard impostors

Add distance LOD to the FEAT-06 props so dense scatter holds frame rate at higher draw distances,
especially on the render/GPU-bound iGPU floor (PERF-05). Without this, foliage overdraw at Far/Ultra
will sink the floor machine.

## Scope

- **3-tier LOD per prop category:**
  - **Near** — full procedural geometry (FEAT-06 palette).
  - **Mid** — reduced geometry (fewer canopy planes / lower-poly rock).
  - **Far** — **billboard impostor**: a camera-facing quad sampling a texture **baked in-browser**
    from the palette mesh to a `RenderTarget` at load (octahedral/multi-angle impostor or simple
    cross-billboard — decide at planning). Far trees become ~2 tris + 1 alpha-test sample. Stays
    no-asset (texture generated, not shipped).
- **LOD assignment** by chunk/instance distance — partition instances into per-tier `InstancedMesh`
  buckets; re-bucket as the camera moves. (Three.js has no automatic per-instance LOD — implement
  the partition.) Frustum + distance cull per chunk.
- **Transition** — avoid hard popping between tiers (dither / short cross-fade / fog-masked
  swap; cheap on the iGPU — no alpha-blend sorting).

## Acceptance

- Ultra draw distance (ring 4, ~10k–40k props) holds the 60 fps target on the M4 AND stays
  playable on the iGPU floor (HD 620) — measured, per the PERF-05 trace methodology.
- Impostor textures are baked at load (no asset files added; no-asset constraint intact).
- No jarring LOD pop; no terrain holes / culling dropouts from per-tier instanced bounds
  (`computeBoundingSphere()` after matrix writes — the PERF-05 pooling gotcha applies to instances).
- `npm test` stays green.

## Notes

- This is the "LOD/shader" the user flagged as needed regardless of procedural-vs-baked — it would
  be required with pre-baked assets too. The procedural palette makes impostor baking *easier* (the
  source mesh is already in memory and parametric).
- Foliage shading stays **alpha-test, never alpha-blend** at every tier (PERF-05 overdraw rule).

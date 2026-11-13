---
id: PERF-44
type: perf
status: open
opened: 2026-11-12
severity: minor
source: Owner, 2026-11-12: "an investigation into where we can reduce triangles without loss of visual fidelity".
relates: [PERF-41 (the GPU budget — measured that the terrain's per-pixel shader, not triangles, is most of the GPU),
  PERF-40 (the bench), PERF-16 (the on-demand shadow pass), FEAT-85 (ground cover), ART-STYLE.md (faceted, flat,
  geometry carries the detail)]
---

# PERF-44 — the triangle budget: where triangles cost, and which ones nobody can see

## What is known

- The bench draws **850–990 k triangles a frame** in 123–165 draw calls (PERF-40, 2026-11-12, three seeds), driving
  and parked alike. Parked costs the GPU the same as driving (~800 Mcyc/s), so it is the scene, not motion.
- **PERF-41 measured that triangles are cheap on this GPU**: hiding 400 k+ prop triangles saved 12–28 % of GPU
  cycles, less than the terrain fragment shader (22–40 %). So expect modest GPU savings from triangles alone. Do not
  promise more.
- Where triangles may still cost: **every shadow pass re-draws them** (the near truck shadow light re-renders every
  frame, PERF-16 / PERF-41 lever 4; 12–23 %), the CPU side of rendering (81–86 ms/s main thread parked, PERF-45), and
  memory (vertex buffers, VRAM pressure on a thin laptop).
- The art style puts detail in geometry, not textures (ART-STYLE.md). "Without loss of visual fidelity" therefore
  means: triangles smaller than a pixel, hidden, or far enough that a coarser shape reads the same.

## The investigation

1. **Census by subsystem** (no `src/` change; a page script in a `test/` harness, PERF-40 style, at the owner's 2090 ×
   1226 canvas, three random seeds, at a drive pose and a parked pose): triangles and draw calls in the main pass and
   in each shadow pass, split by owner — terrain chunks (by ring/LOD), road ribbons + pads + decals, props by kind
   (trees, rocks, bushes, instanced vs not), ground cover (FEAT-85), POI models, the truck, water, sky.
2. **Screen-size per triangle**: for each subsystem, the share of triangles under 1 px² of screen area at the drive
   pose (project the vertices; the harness has the camera). Sub-pixel triangles are pure cost with no look.
3. **Cost per subsystem**: hide each one in turn and read GPU active cycles (PERF-41's method, `gpuab.mjs` in PERF-41's
   notes) and main-thread render ms. Separately for the shadow passes (cast off, receive on).
4. **Candidate levers, each with before/after screenshots for the owner** (the look is the owner's call):
   - distance LOD for props and POI models (a far tree as 12 triangles, not 300), or impostors where already built;
   - shadow casters culled by distance or size (a bush 80 m away casting into the near cascade);
   - terrain chunk LOD rings: is the far ring finer than the screen needs?
   - ground cover density by distance;
   - merging static props per chunk (fewer draw calls, same triangles), if the CPU side proves to be the cost.
5. **Report**: a table of subsystem → triangles, % sub-pixel, GPU % and main-thread ms saved when hidden, and the
   levers ranked by saving per visual risk. Then the owner picks.

## Acceptance

- [ ] The census table on three random seeds (main pass and shadow passes, by subsystem).
- [ ] Each subsystem's GPU-cycle and render-ms cost measured by hiding it.
- [ ] Ranked levers with before/after screenshot sheets; the owner picks which to build (each its own ticket).

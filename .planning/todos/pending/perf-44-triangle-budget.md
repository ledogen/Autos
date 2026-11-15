---
id: PERF-44
type: perf
status: open  # measured 2026-11-14; lever built behind a flag, owner picks
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

## Measured (2026-11-14, lane p; harness `wip/perf-44/census.mjs` + `cost.mjs`, untracked, 2090x1400 canvas)

Triangles drawn per frame, mean of seeds 4127 / 58301 / 9917 (calls are the main pass; shadow = the near truck-light
map + the far terrain map; counted by hide-diff, so exact). Near view = chase camera; far = 120 m up. Drive/bench
numbers (850-990 k) run higher than these parked-at-spawn frames.

| subsystem | main tris (near) | share | shadow tris | calls | sub-pixel (<1 px2) |
|---|---|---|---|---|---|
| props: rocks/pebbles (rock, smallRock, medRock, boulder) | 219 k | 43 % | 0 | 14 | 67 % |
| terrain (49 chunks x 8192, all 1 m grid, no LOD) | 158 k | 31 % | 82 k | 19 | 15 % (3 % far view) |
| ground cover (grass, rye, sage + Lo) | 79 k | 15 % | 71 k | 22 | 24 % |
| trees + bushes + logs | 40 k | 8 % | 0 | 15 | 0-18 % |
| truck | 10 k | 2 % | 10 k | 23 | 25 % |
| road, other | 5 k | 1 % | 0 | 18 | 8 % |
| total | 512 k | | 164 k | 111 | |

GPU cost when the subsystem is hidden (active cycles, paired alternation, median of 8, shadow pass every frame; the
machine was shared with other lanes so single cells swing +-10 points; read the pattern, not the cell):
terrain 23-51 % (the fragment shader, as PERF-41), rocks 0-13 % (median ~7 %), cover 2-9 %, trees 3-12 %, whole shadow
pass 6-14 %. Main-thread render() submit cost is 1-2 ms/frame whatever is hidden, so triangles are not a CPU lever.
Triangles stay cheap: the table's biggest triangle owner (rocks, 43 %) is worth ~7 % of GPU.

Findings: (1) every instanced prop pool has `frustumCulled = false` (PERF-05), so ~80 % of drawn rock/cover triangles
are off screen; (2) pebbles (smallRock 5967 x 20 tris) and medium rocks are shrunk to zero by the shader past ~77 m but
stay drawn out to 160 m; (3) near cover casts into the +-40 m shadow map from the whole 3x3 chunk ring (72 % of those
casters, 110 k tris on seed 4127, lie outside the box); (4) no terrain LOD at all.

## Built: `scatter.cover.farLitter` (data/flora.js, default true = today)

false = the 'far' prop ring (chunks >= 64 m out) gets no pebbles / medium rocks. Main-pass triangles at spawn:
595 586 -> 494 486 (-17 %), 484 662 -> 359 562 (-26 %), 456 003 -> 342 743 (-25 %) on the three seeds; rock sub-pixel
share 67 -> 42 %. Expected GPU ~2-3 % (40 % of the ~7 % rock cost); not resolvable against the noise here. Look risk:
pebbles at 64-77 m, already shrunk to a fraction of their size. Owed card `perf44-budget`. Screenshots (on/off, 3 seeds x
near/mid/far): `wip/perf-44/out/{on,off}-seed<N>-<view>.png`.

## Next steps

- Owner picks farLitter (card). Unbuilt levers, ranked by saving per look risk: near-cover caster cull to the shadow box
  (needs per-chunk cover pools; invisible; ~110 k shadow tris on cover-heavy seeds), terrain far-ring LOD (2 m grid beyond
  ~128 m: -75 % of far chunk tris but road/terrain seam risk, MESH == PHYSICS stays), instance culling of off-screen pools.

## Acceptance

- [x] The census table on three random seeds (main pass and shadow passes, by subsystem).
- [x] Each subsystem's GPU-cycle and render-ms cost measured by hiding it.
- [ ] Ranked levers with before/after screenshot sheets; the owner picks which to build (each its own ticket).

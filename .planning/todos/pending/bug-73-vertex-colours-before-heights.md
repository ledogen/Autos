---
id: BUG-73
type: bug
status: open
severity: minor
opened: 2026-09-25
source: owner, scene 22 of the surface A/B portfolio ("a super visible seam") — captured in the crash-recovery run after the laptop lid was closed mid-capture
relates: FEAT-84 (the biome ladder that made it visible), PERF-27 (in-place recarve — one of the three `_writeChunkVertexColors` callers), PERF-03 (`chunk.heights` reuse)
---

# BUG-73: a chunk renders FLAT (aSurf not bound for its draw) — seen as a green flash and as a standing olive tile

## What was seen

One frame of the A/B set — road through rock at (427, −82), ~168 m altitude — showed every FLAT
surface painted fertile green and only the steep band grey, with a hard edge exactly along the
cliff-slope threshold. The same camera, re-shot fresh three times (alone, and in the 21→22 order
the failing run used), renders correctly: rock by altitude down to the road.

## Why it is not the shader

The FEAT-84 vertex ladder is `dirt → vegetation (vegBlendOf(slope, worldH)) → rock (cliff | altitude
| knoll)`. At 168 m the altitude term is 0.87, so vegetation is ≤ 0.13 whatever the shader does
with it. Fertile green on a flat there requires `worldH` ≈ 0 at write time — i.e. the writer ran
with heights that were zero (or a placeholder), so "below treeline" held everywhere and only the
slope term (from the normal attribute) produced rock. That is exactly the seam pattern.

## Where it could come from

`_writeChunkVertexColors(geom, carveData, heights, …)` has three callers (terrain.js ~1430, ~1507,
~2295), all passing `chunk.heights`. `chunk.heights` is documented as "never overwritten"
(Pitfall 1) but the road-carve query has an explicit "chunk not loaded — flat ground fallback"
(~1243), so a chunk record can exist before its heights are populated. The failing capture was
the run the machine SLEPT during (lid closed): a wall-clock jump across a budgeted/async step is
the kind of thing that reorders "heights arrived" vs "colours written".

## 2026-09-27 — seen again, and what the audit says

Reproduced once more on the branch dev server: the FIRST load after a source edit to terrain.js,
seed w, camera over (197, 616) — the whole above-treeline flat right of the road rendered fertile
green; the identical camera a minute later rendered rock. `test/chunk-audit.mjs` (new) was then
run on two more forced reloads (a `touch`, and a real content edit): 49 chunks each time, every
chunk's geometry mean Y == its stored `heights` mean, grass share 0–0.04 on the high chunks, no
high-but-green chunk. So EITHER the race is rarer than "first load after an edit", OR the bad
frame is not in the vertex data at all (a shader-side transient — textures not yet uploaded,
uniforms not yet synced — would need a different probe: read the uniforms + texture `version`s
at capture time). Next occurrence: run the audit immediately, and dump
`__terrainSystem()._terrainUniforms` (uSurfAlbR.value.version, uColRock, uTreeHi) alongside.

## 2026-09-27 (evening) — the owner caught it standing: a whole FLAT chunk

Two screenshots (seed w, freecamming fast far from spawn, (−1244, 787) and (−1569, 1173)): one
64 m chunk rendered flat olive — vertex colour + mottle only, no relief, no rock, no stones,
square edges. That is precisely what the shader draws when the `aSurf` attribute is NOT BOUND for
the draw: a missing attribute reads (0,0,0,1) → no zone wins, relief 0, carve weight 1. A six-hop
freecam replay of the owner's route (test tool, since deleted; `test/chunk-audit.mjs` has the
audit) found every resident chunk's aSurf present, itemSize 4, weights summing to ~1 after each
hop — so the CPU-side data is right and the fault is in the GPU binding state for that chunk.

The one thing the vertex writer did differently from the normals code: it REPLACED the `color`
and `aSurf` attribute objects (`setAttribute(new BufferAttribute)`) on every build, including on
pooled geometries recycled from evicted chunks, while `_computeGridNormals` writes into the
existing attribute. Fix applied: the writer now reuses the existing colour/aSurf attributes when
they fit and sets `needsUpdate`, creating them only on a pool miss. Cannot be proven headless
(the bad tile never reproduced under audit); if a flat tile is seen again after this, the next
suspect is three's VAO cache for a recycled geometry — force a fresh geometry on pool reuse.

The earlier "green flash" frames are the same fault seen in a rock zone: aSurf unbound → carve
weight 1 → the old shader exempted everything → the vertex colour (dirt/veg ladder) showed.

## Acceptance

- Reproduce: stream a fresh region, suspend the process mid-stream (or stub the Worker to delay
  height messages), and assert every built chunk's colour write saw non-placeholder heights
  (e.g. guard: skip/queue the write when `heights` is absent or all-zero, and re-run on arrival).
- The guard is cheap; the gate is the hard part. If no repro can be built, ship the guard with a
  `console.warn` counter so the next occurrence is at least logged.

---
id: BUG-73
type: bug
status: open
severity: minor
opened: 2026-09-25
source: owner, scene 22 of the surface A/B portfolio ("a super visible seam") — captured in the crash-recovery run after the laptop lid was closed mid-capture
relates: FEAT-84 (the biome ladder that made it visible), PERF-27 (in-place recarve — one of the three `_writeChunkVertexColors` callers), PERF-03 (`chunk.heights` reuse)
---

# BUG-73: a chunk's vertex colours can be written before its heights are real (seen once, after a sleep/resume)

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

## Acceptance

- Reproduce: stream a fresh region, suspend the process mid-stream (or stub the Worker to delay
  height messages), and assert every built chunk's colour write saw non-placeholder heights
  (e.g. guard: skip/queue the write when `heights` is absent or all-zero, and re-run on arrival).
- The guard is cheap; the gate is the hard part. If no repro can be built, ship the guard with a
  `console.warn` counter so the next occurrence is at least logged.

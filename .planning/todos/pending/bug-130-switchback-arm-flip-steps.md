---
id: BUG-130
type: bug
status: open
opened: 2026-11-07
severity: major
source: Spare, the BUG-129 census (2026-11-07)
owner: Spare (road / carve), after BUG-127
relates_to: BUG-129 (carve compositions), BUG-64 (the rival union), FEAT-40 (rival blend), MESH == PHYSICS
---

# BUG-130: at a switchback the ground beside the road steps by the arms' grade difference

## What happens

Between two arms of ONE run (a switchback climbing a slope), `_resolveRoadSurface` flips from one arm to the other at
the halfway line. Each arm's cross-section carries its own grade, and the arms differ by up to ~10 m. The rival union
(`_carveCrossSectionBlended`, BUG-64) that makes two runs' banks meet continuously does not get the OTHER ARM at the
flip point (`nr.rivals` empty there), so the bank steps by the grades' difference.

Example: random seed 861989012, run `g:-2,-1,1:-2,0,1`, the line across arc 532 (side −1). At 13.60 → 13.65 m out the
resolved arc jumps 521.6 → 560.4 (both arms ~12.3 m away), and the ground drops 141.22 → 131.15 m: a 10 m step
(`wip/bug-129/line.mjs` in CarGame-land-bug129).

## How common (the BUG-129 census, after its fix)

`wip/bug-129/census.mjs`: random seeds 24316861, 1717534236 and 861989012; 16.5 km of road; lines across every run
every 8 m, both sides, 5.3–28 m. **32 sites where a step sits across an arm flip, 21 over 0.5 m, worst 10.09 m.** Many
of the 24 remaining in-section steps over 0.5 m sit at the same switchbacks.

## Acceptance

- [x] Root cause in the resolver / rival list confirmed.
- [x] The census: arm-flip steps over 0.5 m to 0 on random seeds, nothing new elsewhere.
- [x] A gate pins it (sampled); `fingerprint-world` explained; a before/after shot of a switchback bank.

## Diagnosis (Spare, 2026-11-07)

**Why the other arm is not a rival at the flip.** `_resolveRoadSurface` finds ONE self-pass rival, the nearest
projection outside a ±`RIVAL_ARC_SEP` (40 m) arc window around the winner. At the example the arms are 38.8 m apart
in arc, inside the window, so the other arm is never seen, and the bank steps by the grades' difference where the
resolver flips. The window boundary is itself the discontinuity: a pass is hidden or shown abruptly at 40 m of arc.

**Why a smaller window is wrong (prototype, reverted).** `RIVAL_ARC_SEP` 20 took arm-flip steps over 0.5 m from 21 to
0, but in-section steps over 0.5 m went from 24 to 107 (worst 12.18 m). Worst case, 861989012 (−711.4, −182.6): a far
arm of the same run (128 m of arc away, 24 m off) enters as a rival at the radial gate `d ≤ footHW`, with its
deep-cut bank still at weight 0.39 there. Its 30 m cut is unioned in at once: a 12 m drop. On main the same arm is
hidden behind a nearer, rejected candidate and only "appears" when it wins, as the arm-flip step.

**The fix to build: rivals that enter continuously.**
1. **Every DISTINCT pass of the winner's own run within reach,** meaning every other local minimum of the distance
   along it, found in the same segment scan (the PERF-25 cell ranges). No arc window.
2. **Each rival's contribution faded in**, so it is zero where it is born or lost:
   - by its distance, a smoothstep over the last few metres before `footHW` (other runs' rivals too: the run-flip
     class has the same hard gate);
   - by its PROMINENCE, the rise of the distance between it and the neighbouring minimum, so a pass born at a fold
     (where two minima split) starts at weight 0. Two arms merging near the apex already coincide in grade.
3. **Measure:** the census by class (arm-flip and in-section steps over 0.5 m to ~0; nothing new elsewhere), resolver
   cost (the physics hot path), `fingerprint-world`, gates, and a switchback before/after shot.

## Fix (Spare, 2026-11-07, land/bug-130)

`src/road.js`. `RIVAL_ARC_SEP` is gone. `_runPassMinima` walks the winner's run once (its PERF-25 cell ranges, or the
whole polyline) and returns every other local minimum of the clamped distance within `footHW`, with its prominence
(the rise to the higher of the two peaks between it and its neighbours; infinite across a range gap). Each rival
carries a weight `m` that scales both its bank weight and its fade in `_carveCrossSectionBlended`:

- self passes: `m = s((footHW − d)/RIVAL_FADE_D) × max(s(prom/RIVAL_PROM_M), s(1 − (d − dW)/RIVAL_TIE_M))`,
  `s` = smoothstep, `RIVAL_FADE_D` 3 m, `RIVAL_PROM_M` 2 m, `RIVAL_TIE_M` 2.5 m, `dW` the winner's distance;
- other runs' interiors and run ends: the distance term only (the run-flip class had the same hard gate).

The tie term is what makes a flip symmetric: at the halfway line both arms are the same distance away, so the loser
weighs 1 whatever its prominence, as the winner does (prominence alone left a weight of 0.55 at some flips and 16
arm-flip steps; a 5 m tie popped passes in at birth, worse; 2.5 / 2 was the sweep's best).

**Census** (`wip/bug-130/census.mjs`, the same three random seeds, 16.5 km), steps over 0.5 m, main → fix:

| class | main | fix |
|---|---|---|
| arm flip | 21, worst 10.09 m | **0**, worst 0.31 m |
| in-section | 24, worst 8.69 m | 14, worst 2.07 m |
| run flip | 3, worst 1.22 m | 2, worst 0.66 m |

The 14 left are a hairpin apex's flat-distance case (the distance along the run has a long flat bottom where the run
turns round the point, so the minimum slides; no flip involved). Not chased here.

**Cost** (`wip/bug-130/bench.mjs`, the physics hot path, interleaved main/fix, machine load ~9):
`_resolveRoadSurface` p50 2.1–2.2 → 2.4–2.6 µs, p99 ~19 → 20.3–21.4 µs, mean 3.4 → 3.8–4.1 µs;
`_sampleCarveWorld` p50 3.4–3.5 → 3.6–4.0 µs, mean 6.2–6.5 → 6.8–7.2 µs (about +8 %), p99 ~31–33 µs either way
(noise).

**Gate:** `test/bank-steps.mjs` (two of the census seeds, R 900): no arm-flip site over 0.5 m, the other sites
≤ CEIL 7. Main fails it: 12 arm-flip sites (worst 10.09 m) and 14 others.

**Shot:** https://claude.ai/artifact/1zPxKn5RNTxiDuFmzYjzVk (seed 861989012, the 10 m example, from road height:
the rock spike between the arms becomes a lower mound).

**Gates** (main 06a4d9f3 merged in, merge 704c3a47): affected 62/62 green, bank-steps among them (cdp-smoke held
back, needs a browser).

**`fingerprint-world` vs main 06a4d9f3:** network, profiles, junctions, poi and tiles identical in all six windows.
Surface + carve differ in five (all but seed3 origin): the bank change itself. Water differs in three (seed6 origin
story, seed11 origin story, seed7 origin play): stream MESHES only, which drape on the carved ground; the water data
(ponds, streams, levels) is identical in all six. Props differ in one (seed6 fork), not traced; prop placement reads the ground
height, which the fix changes there.

Closed on landing.

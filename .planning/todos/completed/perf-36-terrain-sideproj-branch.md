---
id: PERF-36
type: perf
status: closed
severity: minor
opened: 2026-10-15
source: whole-repo review 2 (R-14), DEFERRED by owner 2026-10-15 — needs an in-browser A/B
relates: [FEAT-84 (terrain detail maps)]
---

# PERF-36 — terrain shader: skip the side-projected rock taps on flat ground

The terrain fragment shader (`src/terrain.js`, the `ts_steep` block) fetches 8 detail-map texels per
fragment. Two of them are the side-projected rock taps (`ts_rs`, `ts_nRs`), and they are weighted 0
wherever slope < 0.35 (`ts_steep == 0`) — most of the ground — yet are fetched everywhere.

Fix: branch on `ts_steep == 0` and skip them. Inside a branch the implicit-mip fetch has undefined
derivatives (the GPU estimates the mip level across 2×2 pixel blocks), so the taps must use
`textureGrad` with gradients taken outside the branch.

Estimate: about −25 % of FEAT-84 texture bandwidth on flat ground.

## Acceptance
- In-browser A/B (flat meadow, a 0.35-slope transition, a cliff face): no seam, shimmer or mip
  artefact at the branch boundary.
- Measured GPU frame time on flat ground drops (report the numbers); steep ground no worse.

## Measured (Spare, 2026-11-05) — no gain; NOT landed, closed

Built as specified (the two side taps behind `if (ts_steep > 0.0)`, `textureGrad` with `dFdx/dFdy` of the side
coordinates taken outside the branch) and A/B'd in Chrome against main. No GPU timer on ANGLE/Metal, so the frame
was made GPU-bound instead (`wip/perf-36/gpubench.mjs`): rAF uncapped (`--disable-frame-rate-limit`, vsync off),
2400×1500 at device pixel ratio 2, HUD hidden, the camera over terrain only — on seed 6's flattest 40 m cell
within 500 m of spawn (slope ≤ 0.11, 30 m up, straight down) and its steepest (slope 1.6, 40 m out, level).
Means over 400 frames, two A/B pairs (`wip/perf-36/abab.txt`):

| | main | branch |
|---|---|---|
| flat | 58.8 / 58.8 ms | 59.3 / 59.0 ms |
| cliff | 58.3 / 58.9 ms | 59.8 / 60.2 ms |

Flat ground: no drop (inside the ±0.5 ms run-to-run spread). Steep ground: +1.4 ms in both pairs — the branch
and the two derivative instructions cost more than the taps they skip. The acceptance ("flat drops, steep no worse")
fails on both counts, so the change was reverted.

**Where the cost actually is:** `__lever('detailScale', 0)` (skips the whole FEAT-84 block) takes the same flat frame
from 58.3 to 35.8 ms — the block is ~23 ms at this pixel count, but on this GPU it is ALU-bound, not fetch-bound:
the `tdFbm` noise (the mottle octave, the two dither octaves) and the per-zone smoothstep/pow work hide the texture
latency entirely. A perf pass on the block would start there (e.g. the dither noise baked into a texture lookup),
measured the same way. A weaker GPU (an integrated laptop part) could be fetch-bound where this one is not — that
is the one case this measurement does not cover.

---
id: PERF-36
type: perf
status: open
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

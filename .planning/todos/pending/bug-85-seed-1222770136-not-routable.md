---
id: BUG-85
type: bug
status: pending
severity: minor
opened: 2026-10-12
relates: src/world-validate.js (the player bar), BUG-80 (same class, seed 3309753130), feat-region-gated-connectivity
---

# BUG-85 — seed 1222770136 is not routable (network splits in 2)

## What

Story-mode entry refused seed **1222770136** with the world-validate disclaimer. Unlike BUG-80 the
failure reason is known from the screen: a **component split**, not a condemned edge.

> Seed "1222770136": the road network breaks into 2 separate pieces — parts of the region cannot be
> driven to.
> 89 roads · 56 km in the region · 2 disconnected pieces · max road grade 24 %

Recorded by the owner from play, 2026-10-12.

## Acceptance

- Reproduce headless: run the `world-validate` routine on 1222770136 over the region story mode
  builds; confirm `components === 2` over the core.
- Locate the orphan component: its distance from spawn and length. Check it against the rim-island
  rule (2026-08-28) — if it sits just inside the 2000 m core edge, it may be a rim fragment the
  500 m inset narrowly missed rather than a real split.
- Decide: a router/terrain defect to fix, or a genuinely unplayable seed that stays refused
  (connectivity goes UP — add options, not cull roads).
- If fixed, add the seed to the regression set so it stays routable.
- Worth working alongside BUG-80 — same routine, likely the same investigation harness.

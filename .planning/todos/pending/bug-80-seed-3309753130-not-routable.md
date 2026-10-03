---
id: BUG-80
type: bug
status: pending
severity: minor
opened: 2026-10-03
relates: src/world-validate.js (the player bar), feat-region-gated-connectivity
---

# BUG-80 — seed 3309753130 is not routable

## What

Story-mode entry refused seed **3309753130** with the world-validate disclaimer ("This seed is not
routable with the current router parameters and terrain generation parameters"). Recorded by the
owner from play, 2026-10-03.

## Acceptance

- Reproduce headless: run the `world-validate` routine on 3309753130 over the region story mode
  builds, and report which bar failed (`components > 1` split vs a condemned edge) and where.
- Decide: a router/terrain defect to fix, or a genuinely unplayable seed that stays refused
  (connectivity goes UP — add options, not cull roads).
- If fixed, add the seed to the regression set so it stays routable.

---
phase: "6"
phase-slug: procedural-terrain
date: 2026-06-03
---

# Phase 06 Validation Strategy

## Automated Tests

| Req ID | Behavior | Command |
|--------|----------|---------|
| TERR-01 | Simplex noise generates correct heights for a chunk | `node test/terrain-unit.js` |
| TERR-03 | sampleNormal returns upward-biased vector on flat terrain | `node test/terrain-unit.js` |
| TERR-03 | sampleNormal returns tilted vector on sloped terrain (finite-difference check) | `node test/terrain-unit.js` |

## Smoke Tests (manual, browser)

| Req ID | Behavior | How to verify |
|--------|----------|---------------|
| TERR-02 | Chunks load/unload as car moves | Drive 200m in any direction; old chunks disappear, new ones appear without seams |
| TERR-04 | Car responds correctly to terrain slope | Drive over a hill; body pitches/rolls visibly |
| TERR-05 | Car can roll over on terrain | Drive at a steep hillside at speed; observe rollover without ramp |
| TERR-06 | 60fps maintained with terrain active | Open browser, drive 60s, confirm FPS HUD stays ≥ 60 |

## Sampling Notes

- TERR-01/03 are unit-testable via `test/terrain-unit.js` (created in Plan 06-03)
- TERR-02/04/05/06 require browser smoke test — no headless path available (Three.js + Worker)
- sampleHeight(0, 0) must return 0 (simplex lattice point guarantees safe spawn)

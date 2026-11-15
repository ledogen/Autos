---
id: BUG-172
type: bug
status: open
severity: major
opened: 2026-11-14
source: orchestrator, 2026-11-14 — found by INFRA-15 (the browser smoke's edge step at 4× CPU throttle)
lane: A
---

# BUG-172: Barricade bodies spawn before the ground under them exists


## Next steps
Lane A: a row swaps to loose bodies only once the ground collider under it exists. Gate it headless.

## Summary
`_updateBarricades` in src/main.js swaps a barricade row to loose rigid bodies as soon as the truck is within 120 m, without checking that the terrain collider under the row has streamed in. When the truck arrives close to a row before the ground does (a save resumed near the wall, a reset, a slow machine), the bodies fall, and are pushed out sideways when the deck appears: one barricade ended 1.9–5.8 m off its pose before the truck moved (4 of 4 runs at 4× throttle).

## Tracker
- [ ] A row spawns its bodies only once its ground collider exists (root cause, not a longer wait)
- [ ] A headless check: bodies requested with no ground under them stay posed; with ground they spawn at rest
- [ ] The smoke's edge step still passes without its 150 m pre-seat (the pre-seat may then be removed)

## Decisions

## Open questions

## Links
INFRA-15 (`.planning/todos/pending/infra-15-smoke-under-load.md`), FEAT-103 (the wall at the story circle's edge)

## Files
src/main.js (`_updateBarricades`), src/terrain-physics.js, test/cdp-smoke.mjs (edge step)

## Log
- 2026-11-14: filed from the INFRA-15 report.

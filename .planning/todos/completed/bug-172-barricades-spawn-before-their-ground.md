---
id: BUG-172
type: bug
status: closed
severity: major
opened: 2026-11-14
source: orchestrator, 2026-11-14 — found by INFRA-15 (the browser smoke's edge step at 4× CPU throttle)
lane: A
---

# BUG-172: Barricade bodies spawn before the ground under them exists


## Next steps
Landing (lane A, 31c007c9). After it lands: the edge step's 150 m pre-seat may be removed (proof below); the two
sibling races under Decisions stay open as separate one-liners only if they ever show.

## Summary
`_updateBarricades` in src/main.js swaps a barricade row to loose rigid bodies as soon as the truck is within 120 m, without checking that the terrain collider under the row has streamed in. When the truck arrives close to a row before the ground does (a save resumed near the wall, a reset, a slow machine), the bodies fall, and are pushed out sideways when the deck appears: one barricade ended 1.9–5.8 m off its pose before the truck moved (4 of 4 runs at 4× throttle).

## Tracker
- [x] A row spawns its bodies only once its ground collider exists (root cause, not a longer wait)
- [x] A headless check: bodies requested with no ground under them stay posed; with ground they spawn at rest
- [x] The smoke's edge step still passes without its 150 m pre-seat (the pre-seat may then be removed)

## Decisions
- The query: `TerrainPhysics.hasChunkAt(x, z)` / `RoadPhysics.hasTileAt(x, z)` (src/terrain-physics.js, key lookups
  on the colliders actually built; a road tile with no deck shapes never counts). A barricade row needs both under
  every pose; ornaments, ground items and demolition targets need the chunk (same one-line guard).
- Siblings NOT fixed (not one line each): `_reloadCargo`'s `haulOut` pieces (main.js, one-shot spawn at a resume,
  put to sleep at once, so they hold until touched); a ground item lying ON a road deck waits for the chunk only,
  not the deck tile. Bed cargo, haul drops at a pickup zone and the debug barrels spawn at the truck: no race.

## Open questions

## Links
INFRA-15 (`.planning/todos/pending/infra-15-smoke-under-load.md`), FEAT-103 (the wall at the story circle's edge)

## Files
src/main.js (`_updateBarricades`), src/terrain-physics.js, test/cdp-smoke.mjs (edge step)

## Log
- 2026-11-14: filed from the INFRA-15 report.
- 2026-11-14: fixed 31c007c9 (query + 4 guards + gate `barricade-ground.mjs`). Affected gates 13/13 green. Edge step
  with the 150 m pre-seat bypassed locally (not committed), `SMOKE_THROTTLE=4 SMOKE_STEPS=boot,story,edge`: 3/3 PASS,
  row reset worst 0.4 / 1.0 / 1.4 cm (was 1.9–5.8 m). The committed smoke still has its pre-seat.

## Resolution (2026-11-14)
On main (31c007c9, merge 6f673926): a row swaps to bodies only once the terrain chunk and the road deck are built under every pose (TerrainPhysics.hasChunkAt, RoadPhysics.hasTileAt); lawn ornaments, ground items and demolition targets got the same chunk guard. Gate test/barricade-ground.mjs; main gates 13/13, smoke 26/26 (wip/orch/smoke-1114i.log). The smoke keeps its 150 m pre-seat (harmless). Left as noted in the Log: resumed haul pieces (one-shot, slept at once) and a ground item on a road deck (waits for the chunk, not the deck tile).

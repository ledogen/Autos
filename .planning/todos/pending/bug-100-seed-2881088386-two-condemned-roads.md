---
id: BUG-100
type: bug
status: open
severity: minor
opened: 2026-10-30
source: owner, 2026-10-30 — 'Seed "2881088386": 2 roads could not be given a drivable profile on this terrain. default clasic worldgen'
relates: src/world-validate.js (the player bar — `unplayableReason`, `report.condemned`), BUG-58 (profile stations past their caps — the likely class), BUG-80 / BUG-85 (the earlier per-seed refusals, both closed), FEAT-28 (region ladder)
---
lane: Spare

# BUG-100: seed 2881088386 refused at story entry — 2 roads condemned (Classic preset, default worldgen)

## What the owner saw

Story mode, default Classic preset, seed `2881088386`: the entry disclaimer

> 2 roads could not be given a drivable profile on this terrain

That is `unplayableReason()` on a validate report with two condemned edges — two roads the v2
profile solver could not bring inside the grade / earthwork vocabulary, so the player bar
(`playable` = a piece exists && no condemned edge) refuses the seed and asks for another. A split
network no longer refuses (BUG-85); a condemned edge still does, by design (FAIL SAFE AND SAY SO,
owner 2026-08-27).

## What to find out

- Which two edges, and why: replay the player bar headless — `test/region-pieces.mjs`'s build
  sequence (spawnDecision → RoadSystem at REGION_WARM_RADIUS_M → `validateArea(road, C,
  discArea(REGION_RADIUS_M, REGION_MARGIN), P)`) on this seed; `report.condemned` names the edges
  and `report.grade` the rungs. (`test/play-area.mjs --seed=` only filters its five fixed seeds.)
  Is it a BUG-58 station (a cut past `cutMax` that should have become a bore) or a genuinely
  impossible corridor?
- How often: the play-area census is five fixed seeds. A wider sweep (100 seeds, same preset) gives
  the refusal rate — if it is more than a few percent the fix is in the router, if it is this seed
  alone the ticket closes as "the disclaimer did its job".
- Whether a condemned edge should refuse at all: BUG-85 lets a stranded PIECE stand with no POIs.
  The same treatment for a condemned EDGE (drop it from the graph; the pieces rule then applies)
  would turn this refusal into a playable world with one fewer road. Owner's call; the disclaimer
  ruling predates the pieces rule.

## Reproduced headless (orchestrator, 2026-10-30, main 95c6dc2e)

The player bar replayed as above (spawnDecision → warm RoadSystem → validateArea on the region disc),
17 s: `playable false · pieces 1 · condemned 2`. The two edges share ONE node:

```
CONDEMNED g:-3,-2,0:-1726247,-1189129,-1
CONDEMNED g:-1726247,-1189129,-1:-3,-2,2
```

i.e. the promoted node `-1726247,-1189129,-1` and both of its legs to grid nodes (-3,-2,0) and
(-3,-2,2). Region grade stats: over 20 % 8.5 %, over 24 % 2.5 %, over 30 % 0.6 %, **worst 88 %** —
one station the solver cannot bring down (rungs: cap 1716 · fine 2 · relief 14 · ceiling 75 ·
re-routes 0). So this is one bad node seat, not two independent corridors: start at that node's
terrain (a cliff or stream bank where the promoted node was seated) and the BUG-58 class.

## Acceptance

- [x] The two edges named (above); the station and why it fails still to find.
- [ ] Refusal rate measured over 100 seeds on the Classic preset (headless, reported in the ticket).
- [ ] Either the seed validates after a router/profile fix with play-area and road-grade green, or
      the owner rules that a condemned edge is dropped instead of refusing (then: pieces rule applies,
      region-pieces gate extended), or the ticket closes as a rare refusal working as designed.

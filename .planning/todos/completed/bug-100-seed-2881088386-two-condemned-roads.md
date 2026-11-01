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

- [x] The two edges named, and the station found (below).
- [x] Refusal rate measured over 100 seeds on the Classic preset (headless, reported in the ticket): 0 / 100.
- [ ] Either the seed validates after a router/profile fix with play-area and road-grade green, or
      the owner rules that a condemned edge is dropped instead of refusing (then: pieces rule applies,
      region-pieces gate extended), or the ticket closes as a rare refusal working as designed.

## Owner, 2026-11-01 — the alpha framing

> "I thought we already put up the 'can be generated' card. For alpha we should either work on making
> every seed generate or rerolling seed."

The card exists (the refusal state of the story seed modal, FEAT-43: "Seed X: 2 roads could not be
given a drivable profile", pick another). What it does NOT do is reroll — the 2026-08-27 ruling was
"fail safe and say so", and story.js still says nothing rerolls. The alpha options are therefore:
(a) make every seed generate — the third acceptance bullet's "drop the condemned edge like a stranded
piece" (BUG-85's rule), which turns every refusal into a playable world with one road fewer; or
(b) reroll — a random run picks a fresh seed on refusal and never shows the card, while a typed seed
still gets the card. Orchestrator's recommendation: (a), because it also closes the ticket for typed
seeds and is a validate-layer change, not a router one. Waits on the owner's pick.

## Found (Spare, 2026-11-01, main c44db5df — after BUG-81 item 4's deeper portals)

**One corridor, not two.** Re-solving each condemned edge's own stations at the ceiling rung:

- `g:-3,-2,0:-1726247,-1189129,-1` (160 m, ends 111 → 108 m, ground 102–114) **solves as built** — it
  is condemned only by inheritance: the promoted node `-1726247,-1189129,-1` split a trunk, and both
  halves carry the parent's mark (`out.condemned = T.condemned` in the T-promotion path).
- `g:-1726247,-1189129,-1:-3,-2,2` (512 m, ends 108 → 143 m) crosses a **pond basin**: ground 108 →
  63 → 103 → 77 → 155 m (coarse stations every 10 m). The basin floor sits at (−1559, −1142), pond
  skirt with a stream nearby, ~45 m below both rims. Its walls fall ~53 m in ~120 m — about 44 %,
  past even the 38 % ceiling rung — and the fill ceiling (fillMax 8) forbids holding the deck up.
  Relaxing one limit at a time: fillMax 40 → SOLVES; gMaxBore 0.38 → fails; cutMax 60 → fails. So the
  only thing that crosses it is a BRIDGE, which QUAL-27 removed from the vocabulary, and the HARD_GRADE
  re-routes found no way round.

**Refusal rate: 0 / 100.** The story player bar (spawnDecision → warm RoadSystem → validateArea on the
region disc, exactly as above) over 100 uniform 32-bit seeds (`_resolveSeed`'s roll; fixed generator,
`wip/bug-100/refusal-census.mjs`): 0 refused, 0 condemned edges, 11 with a stranded piece (which no
longer refuses — BUG-85). Rule of three: the true rate is under ~3 % at 95 %. This seed is a rare one.

**What that means for the owner's pick:**
- (b) **reroll** is cheap and covers random runs: a refused roll is a ≤3 % event, so rerolling
  costs one extra ~20 s region build that often. A typed seed would still show the card.
- (a) **drop the road** is NOT a small validate-layer change. `buildGraphAdj` filters by NODE only (an
  edge whose two ends are main-piece nodes always stays), so excluding a condemned edge from the
  planners means threading an edge-level skip through every planner (missions, roadside drops, paper
  tour) and POI placement — or deleting the run from the live network (re-mesh, re-carve, colliders).
  Either is real work for a ≤3 % case; the orchestrator's "prototype if small" bar is not met, so it is
  not prototyped.
- Or (c) close as "a rare refusal working as designed" — the card did its job.

## RULED — owner, 2026-11-01

> "auto reroll max 3x then the card again. Should be exceedingly rare then. Typed seed should also
> just auto-re-roll."

So: on a refusal the run re-rolls a fresh seed and tries again, up to three re-rolls; only after
the third failure does the refusal card show, as it does today. Typed seeds get the same treatment —
no card on the first refusal. With a measured refusal rate under ~3 %, three re-rolls put the card
below one run in 30 000. The 2026-08-27 "nothing rerolls" ruling is superseded for the alpha; the
card stays as the fourth-strike fallback, so the player is still told when the generator cannot
find a world. Lane: Spare. (story.js's warm-done check is where the refusal is decided; main.js
`_showSeedModal` is the card.)

## Resolution — Spare, 2026-11-01

Built as ruled. `onSeedRejected` (main.js) re-rolls a fresh random seed (`_resolveSeed('')`) up to
`SEED_REROLLS` = 3 times, typed seeds included, keeping the run's world knobs and gearbox
(`_runWorld` / `_runGearbox`). The refusal card (`_showSeedModal`) is the fourth strike. A RESUME
never re-rolls (that would throw the saved run away), so it gets the card at once. Each re-roll
logs `[story] seed "<seed>" refused (<reason>) — re-roll n/3`. The superseded 08-27 wording is
updated in story.js `_checkSeed` and the world-validate.js header.

Verified in the real app (`CarGame-spare/wip/bug-100/reroll-check.mjs`): typed seed 2881088386 →
`re-roll 1/3` → the run went live, no card. cdp-smoke green (20 steps).

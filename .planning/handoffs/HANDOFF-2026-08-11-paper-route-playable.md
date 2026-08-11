# HANDOFF — FEAT-61 paper route: playable, owner-driven — 2026-08-11

Supersedes `HANDOFF-2026-08-07-paper-route-phase-e2.md` (its Phase E2 plan is built; its gotchas
section is still worth reading). The spec is `.planning/todos/pending/feat-paper-route.md`.

## State

**The mission works and the owner has driven it**, on branch `feature/paper-route` in worktree
`/Users/ledogen/CodeShit/CarGame-paper-route`. Their verdict: *"pretty hard lol — very challenging in
a good way hard."* Hard enough that they asked for it as a menu-launchable scenario (**FEAT-62**).

`feature/poi-models` (FEAT-60) is merged into this branch and is NOT on main, so merging back
delivers both. **Not merged yet.** 12 commits ahead of main; `npm run test:all` green (48 gates).

## What landed this session

| | |
|---|---|
| `5400b1a` | Phase E2 — `PaperRouteSystem`, the state machine, tour + one par, settlement |
| `8b00da4` | BUG-44 — customer supply: `poiHouseSpacing` is a candidate step, 90 → 30 m |
| `e2e10c7` | first drive — staging threshold, GPS on the route, **the target rings were lying** |
| `de78c7a` | good deeds render `0.5`, not the `½` glyph |
| `25fa34a` | BUG-45 roster stability + BUG-46 GPS ghost chevrons |
| `128cb19` | **a stop is a POINT on a road**, not a street driven end to end |
| `ca445f6` | the guidance stopped at the turnaround; order is now exact (Held-Karp) |
| `bf0c2dc` | rename: they are **routes inside missions**, never "rounds" |
| `82790e9` | FEAT-62 filed |
| `29fa5af` | `test/world-determinism.mjs` — the seed is an absolute determinism machine |
| `2806718` | **story mode drops the free-roam teleport spawn** |

## The five things worth carrying forward

1. **A tour stop is an (edge, arc) POINT.** Both wrong answers were shipped and driven first.
   Snapping a customer to the nearest junction left *5 of 6 never approached* (a house sits mid-edge,
   up to most of a 640 m street from either end). Making the stop the whole EDGE fixed that and made
   the route drive past the porch to finish the tarmac, then turn around — which is what the owner
   hit. The graph is now SPLIT at customer points; shortest paths then reach the porch and carry on
   whichever way is shorter.
2. **Order is solved exactly (Held-Karp), not by 2-opt.** On an open path with a pinned start, 2-opt
   cannot rotate a sequence — A,B,C,D → D,A,B,C is not a reversal — so the case that hurts most is
   outside the neighbourhood it searches. 2^15 × 15 states is a few million ops, once, behind the
   briefing cards.
3. **Selection stays nearest-neighbour CHAINING.** "The k nearest to Larry" was tried and is worse:
   it picks a star, four houses in four directions, forcing a return through the middle between every
   pair (seed 6 tier 1: 5.94 km vs the chain's 3.78 km).
4. **The renderer can lie, and nothing was pinning it.** "Can't deliver the papers" was not a scoring
   bug — every customer in the region wore a target ring while only the route's four could score, so
   12 of 16 targets were decoys, and the miss read-out was distance-gated so it said nothing. The
   scoring path had been correct all along and *untested*, which is why a lying renderer could not be
   told apart from a broken mission. `test/paper-tour.mjs` now drives a whole route end to end.
5. **The seed is an absolute determinism machine — and the teleport was breaking it.**
   `_reseatTruckAtSpawnInner` consults `_spawnOverride` BEFORE `resolveSpawn`, so a free-roam
   teleport survived a mode switch, seated the truck at the teleport point, and `story.js._beginWarm`
   captured THAT as the region centre. The region followed the player and every POI moved. Story
   entry now clears the override.

## Two mistakes I made, so they are not repeated

- **I asserted a root cause without measuring it, twice.** BUG-45 originally blamed "spawn drift";
  measured, `resolveSpawn` is pure in the seed. Then I verified the dep mapping
  (`reseat: () => _reseatTruckAtSpawn()`) and stopped without reading the body — where the override
  check lives. Both times the wrong claim reached a ticket and a commit message before being tested.
  Both are corrected in place.
- **A gate can measure the function the live path skips.** `world-determinism.mjs` §1–3 correctly
  measured `resolveSpawn` while the game was bypassing it. §4 is a source-text check for that seam,
  because the wiring is main.js/story.js and no headless harness can reach it.

## What remains

**Phase F, and it is all that is left before merge:**

- **`test/paper-houses.mjs`** — the heavy house gate the original handoff asked for: count met,
  window-invariance from two stream centres, never on water or a junction pad, tier-independence
  (SM-INV-12), and houses absent from `poiSystem.list()`. Verified by hand in Phase C, never gated.
  (`world-determinism.mjs` now covers the customer list's history-independence, but not these.)
- **A debug folder** for `PAPER_PARAMS`, `THROW_PARAMS` (`throwSpeed`, `dragK`) and the `poiHouse*`
  knobs. None are on sliders; the phase-housekeeping rule says they should be.
- **The MILESTONES SM-2 paragraph.**
- **Merge to main** (brings FEAT-60 with it). One planning file conflicts — take this branch's copy.

**Unbalanced constants, still owner's calls** (in the ticket's open questions): `paperW = 0.6`,
`EXPEDITE_ON/FULL`, `BONUS_MAX`, the rank thresholds, `throwSpeed = 16` / `dragK = 0.033`, and
whether a 15-customer route at ~19 km / par ~19 min is the right top rung. A perfect tier-1 route
pays **$38**.

## Live checks nobody has run

- The result card and tier advance (the owner has driven the route; unclear whether one was
  completed cleanly enough to letter S and advance).
- Whether one lit ring at a time is enough to FIND the next customer before the GPS chevrons pick it
  up.
- The paper route's route drawn on the 2D map at the offer (added `bf0c2dc`, never seen).

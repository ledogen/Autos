---
id: BUG-226
type: bug
status: open
severity: minor
opened: 2026-11-18
source: lane agent (FEAT-278), 2026-11-18 — found while taking screenshot sheets
relates: FEAT-278, BUG-100, DEC-054, DEC-012, src/main.js, src/story.js
---
lane: Engine & world

# BUG-226: The same seed builds a different story world from one run to the next (seeds 914219767, 873064618)

## Next steps
Not a determinism bug: both seeds are REFUSED (one condemned road) and BUG-100 re-rolls a fresh RANDOM seed, so each
start plays a different seed. Owner call: should a refused seed re-roll to a seed DERIVED from it (the same typed seed
then always lands on the same world), and should the player be told the seed was swapped? Close on the answer.

## Summary
The world is a pure function of the seed. What changed run to run was the seed itself: 914219767 and 873064618 each
have one road that cannot be given a drivable profile, story entry refuses them (DEC-054), and BUG-100's re-roll
(`_resolveSeed('')`, `Math.random`) swaps in a random seed with only a console line. The FEAT-278 roster script printed
mom and the roster but not the seed actually played, so the swap looked like the same seed building two worlds.

## Description
- Headless (`wip/bug-226/headless.mjs`, the story region built synchronously, fresh process each time): both seeds
  give the same network hash, centre, mom and roster every time, and `playable: false, condemned: 1`.
- Same result at a545067a (the commit before the 11-18 landings): identical network hash. Old, not tonight's.
- Browser (`wip/bug-226/roster.mjs`, now prints `__worldCode()` and the `[story]` console lines): 914219767 × 3 starts
  played 2152877108, 3785467181 and 3147998271 (the third after a second refusal, of 255433741); 873064618 played
  3091031517. Every start logged `[story] seed "<seed>" refused (1 road could not be given a drivable profile …) — re-roll 1/3`.
- The flip on demand is the refusal itself: a playable seed (4182, 77031, 1018248781) is stable; a refused one re-rolls.
- Refusal rate on 20 random seeds (headless, wip/bug-226/seeds20.txt): 0 / 20 refused, so 0 / 20 would re-roll.

## Tracker
- [x] Reproduced, with the cause visible on every start (the re-roll log line).
- [x] Root cause named: a refused seed is re-rolled to a random seed (BUG-100), not unseeded world build.
- [ ] Owner: derived re-roll + a visible "seed swapped" note, or keep as is.
- [x] A gate pins run-to-run identity: test/world-determinism.mjs (headless) already does; no build-path defect found.

## Decisions
- DEC-054: a condemned road refuses a seed. BUG-100 (owner, 2026-11-01): "Typed seed should also just auto-re-roll."
- DEC-012: a seed means the same world for every player. Holds for the PLAYED seed; a re-rolled typed seed does not
  (two players typing 914219767 get different worlds).

## Open questions
- Re-roll a refused seed to `seedFor(seed, 'reroll-n')` instead of `Math.random`? Recommendation: yes (one line in
  `onSeedRejected`, main.js), so a shared typed seed still shares the world, plus one line on the loading card naming
  the seed swapped in.

## Links
- .planning/todos/completed/bug-100-seed-2881088386-two-condemned-roads.md

## Files
- src/main.js (`onSeedRejected`, `_resolveSeed`), src/story.js (`_checkSeed`)
- wip/bug-226/ (headless.mjs, roster.mjs, logs; git-invisible)

## Log
- 2026-11-18 minted by the orchestrator from the FEAT-278 agent's report.
- 2026-11-18 lane agent: headless deterministic and refused on both seeds (also at a545067a); browser shows the
  BUG-100 re-roll on every start. No code change. Severity critical → minor pending the owner's re-roll call.

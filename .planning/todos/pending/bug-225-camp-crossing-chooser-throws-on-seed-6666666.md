---
id: BUG-225
type: bug
status: open
severity: critical
opened: 2026-11-18
source: FEAT-275/280 agent, 2026-11-18
relates: FEAT-292, DEC-424, FEAT-103, BUG-128, BUG-85, src/mission.js, src/poi.js
---
lane: engine & world

# BUG-225: The camp's crossing chooser throws on seed 6666666

## Next steps
Landed on main (9c686f2e). Orchestrator: move this ticket to completed once the smoke and the ticket commit are on main.

## Summary
FEAT-292's `_evenRequisition` threw inside `PoiSystem.build` on seed 6666666 built at (0,0) with no main-piece filter
(`TypeError` reading `.x` of undefined in `MissionSystem._roll`'s destination stretch). A throw in world build would
stop a story run starting. Fixed in the planner: an unreachable destination is no longer a candidate.

## Description
### Cause
A requisition line plans with the leg band [0, ∞] (`anyLeg`, SM-INV-7). In `_roll` a destination POI whose two nodes
are both unreachable from the source gets distance `Infinity`, and `Infinity <= Infinity` passed the band. `entry`
then became the camp's off-graph far node, and `posOf.get(entry)` was undefined. The unreachable candidate came from
the camp chooser's graph (poi.js `buildGraphAdj`, no bowing-edge drop) disagreeing with the planner's (BUG-128 drops
edges that bow past the wall): on 6666666 at (0,0), with no piece filter, crossing `-2004763,-1850525,-1|-3,-3,1` is
reached only over such an edge. With the game's main piece (validateArea's strict cut, which is the planners' piece)
the candidate is never sited, so the game's normal entry did not throw on this seed; story.js `_checkSeed` passes
nodes = null only when the validator throws (the degraded entry).

### Fix
`src/mission.js` `_roll`: `if (!(d >= lo && d <= hi && d < Infinity)) continue`. The line then returns null, and every
`planOffer` caller already treats null as "does not plan": `requisitionTotal` returns null, `_evenRequisition` scores
that crossing Infinity and skips it. If NO crossing evaluates, `_evenRequisition` keeps today's (the first, the
farthest qualifying crossing) — that needs every crossing unreachable from a source, which the main-piece filter rules
out on the game's path. Before the fix, an unreachable destination with both nodes on the graph planned a bogus route
(a node path that never reached the source) instead of throwing; that is gone too.

### Sweep
400 seeds (`wip/bug-225/seeds400.txt`, an LCG from 225225), each built twice on one road: the story build (spawn,
main piece) and the degraded entry (nodes null). After the fix: **0 throws** in 800 builds. The story build never met
an unreachable requisition destination (0 of 400): the fix is inert there, totals mean 22.3 km, 18.7–27.7. The
degraded build met one on **31 of 400**; on the old code (same seeds, the fix's parent) **13 of those 31 threw** (all
this TypeError), 0 story builds threw. After the fix those 13 build; 8 site the story build's camp, and 8 of the 31 (4 of the 13)
leave a line unplanned at the final camp (a source on a stranded piece, BUG-85: without the filter the roster takes
stranded POIs; pre-existing, degraded path only). The 18 old-code non-throwers keep their camp exactly.
FEAT-292's 60 census seeds (`wip/feat-292/census.mjs`, every hash: camp, rows, returns, roster, customers, lines,
ordinary offers, every crossing's total) are identical between the fix and its parent: mean 22.40 km, 19.0–26.9.
(Against FEAT-292's own logs 46 seeds differ, from main's landings since; none from this fix.)

## Tracker
- [x] Reproduced headless (the FEAT-275/280 census build: C=(0,0), warm 2500 m, no piece filter)
- [x] Root cause: Infinity passed the requisition band in `_roll`
- [x] Fix in the planner (every `planOffer` caller safe)
- [x] 400-seed sweep: zero throws; FEAT-292's 60 census seeds unchanged
- [x] Gate: `test/expedition-camp.mjs` MUST_BUILD (6666666 at its spawn with the main piece, and at (0,0) with none)
- [x] Affected gates 36/36, tutorial-seed, fingerprint-world identical to pre-fix main (b839ef1c)
- [ ] Smoke

## Links
FEAT-292 ticket; sweep logs `wip/bug-225/` in the CarGame-land-gps worktree (`sweep.mjs`, `sweep-{a,b}.log`,
`census61.log`).

## Files
`src/mission.js` · `test/expedition-camp.mjs`

## Log
- 2026-11-18: fix 677b5613, gate 4b054044 (must-build 6666666 ×2 ok). Affected gates 36/36 serial; tutorial-seed PASS;
  fingerprint-world ALL IDENTICAL vs b839ef1c; sweep above. Smoke: SMOKE_TBD

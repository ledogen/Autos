---
id: FEAT-292
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (DEC-424), after losing a run on seed 660454599
relates: DEC-424, FEAT-103, FEAT-154, FEAT-157, FEAT-65, src/poi.js, src/offer-board.js
---
lane: engine & world

# FEAT-292: The camp's crossing is chosen so the requisition is near 22 km

## Next steps
Built on `land/feat-292-camp-crossing` (worktree CarGame-land-gps). Owner: play `?seed=660454599` and answer card
feat292-camp-crossing-play. Orchestrator: rule on the return-spot finding (Description § Return spots) before landing.

## Summary
The requisition's loaded total swings 18.0–34.8 km between worlds. The camp keeps today's crossing unless its total is more than 15 % off 22 km; then it takes the qualifying crossing whose total is nearest 22 km. Lines leave their source by the nearer end.

## Description
See DEC-424 for the ruling and the study's numbers. The study measured this rule as "R4b, T 22": mean 22.5, sd 2.1, min 17.5, p10 19.9, p50 22.7, p90 24.8, max 26.9, 37 of 61 camps moved; and the nearer-end rule as "S".
Cold generation only: the choice is a pure function of the seed and the generated world; nothing is saved.

### As built (2026-11-18)
- `src/poi.js`: `_siteCamp` became the generator `_campCrossings` (every qualifying crossing in today's order, one pad
  each, computed only as far as read). `_evenRequisition` measures today's camp; inside poiCampReqBand (0.15) of
  poiCampReqTargetM (22000 m) it keeps it, else measures the rest and takes the nearest, ties to the order. The pad
  dressing is `_dress` (shared with `_assignRoster`). The roster is chosen before the camp and does not move.
- `src/offer-board.js`: `requisitionTotal` plans the five lines exactly as the board does (same `lineSource`,
  route stream and `lineDest`); lines carry `nearerEnd`.
- `src/mission.js`: `nearerEnd` picks the exit with the shorter whole drive (POI-to-exit stretch included). Ordinary
  offers never carry it. `distMemo` plans a route for its distance only (`par.js routeDistance`, per-segment memo).
- What follows the camp by construction: the win spot and Larry/Katie's compass direction (both read the final POI
  list), the camp's row at its pad, the old crossing's ordinary FEAT-154 row and returns, the signs site (its route
  stream is keyed to the camp id).

### Census on the built code (61 seeds, the real story build; wip/feat-292/tables-built.txt)
| | mean | sd | min | p10 | p50 | p90 | max | max/min | moved | 660454599 |
|---|---|---|---|---|---|---|---|---|---|---|
| main today | 26.3 | 4.5 | 18.0 | 20.4 | 25.9 | 32.7 | 34.8 | 1.93 | 0 | 33.1 |
| today's camp + nearer end | 25.9 | 4.3 | 18.0 | 19.9 | 25.7 | 32.1 | 34.0 | 1.89 | 0 | 32.4 |
| BUILT | 22.5 | 1.6 | 19.0 | 20.7 | 22.2 | 24.5 | 26.9 | 1.42 | 38 | 22.3 |
| study's R4band (first crossing in band) | 22.5 | 2.0 | 18.7 | 19.6 | 22.9 | 24.8 | 26.9 | 1.44 | 38 | 23.6 |
Main reproduces the study exactly. The study's R4band took the FIRST in-band crossing in siting order; DEC-424 says
the nearest, which is what is built: hence 22.3 not 23.6 on 660454599 (legs firewood/crew/signs/fuel/gear
6.5/5.9/4.7/1.2/4.0) and the tighter sd. 38 moved, not 37: on 2465211605 the nearer end takes today's 18.8 km to 18.5,
out of the band, and it moves to 25.0. Two seeds stay outside the band: no crossing qualifies nearer (26.1, 26.9).
Spawn → camp drive, built ÷ today: median 0.84, p10 0.61 (moved seeds only: 0.75, 0.59); median 5.3 → 4.6 km.

### Cost (main thread, inside PoiSystem.build, behind the loading screen; load average ~15 on the 10-core Mac)
Kept camp (23 seeds): median 37 M instructions, 7.5 ms CPU (max 76 M, 12 ms). All crossings measured (38 seeds, up to
17): median 388 M, 56 ms; worst 600 M instructions, 107 ms CPU. The first cut planned every route with par
(1272 M on 660454599); distance-only planning halved it. L0 is not computed anywhere else at build: the board plans
the lines lazily once the deed gate opens. For scale, poi.build itself is ~11–14 G instructions, 1–2.6 s.

### Return spots (a pre-existing FEAT-154 limit, not this change)
`node test/expedition-camp.mjs <60 study seeds>` (wip/feat-292/gate-all.log): every camp check and every FEAT-292
check passes on all 60. The FEAT-154 return check (40 m from the row, or 100 m on its own road) fails on 6 of 23 KEPT
seeds, which are byte-identical to main, and on 12 of 37 moved ones: the same rate, so a moved camp does not cause it.
Shapes: a road crossing the wall at a very shallow angle (its first spot 10 m inside is 100–220 m along it), and two
roads joining just outside the wall (the return lands on the sibling road, 40–75 m away). Every return is on a road,
inside, facing in. "Striped face looks inward" fails on one kept and one moved seed. The pinned seeds never hit either.
Worth its own ticket; not touched here.

### Other proof
- Seed 11's fingerprint window (r 1400, origin): only the camp differs (camp:0,-2,0|1,-2,0 → camp:-2,1,0|-2,2,2); the
  ground differs at 6 of 30976 samples, all within 17 m of the old or new pad (its carve). Every other window and
  component matches main. world-determinism and tutorial-seed pass; the tutorial seed's camp moves (34.3 → 22.4 km).
- All 61 census seeds: roster, customers and every ordinary offer's route identical to main; the 23 kept seeds also
  camp, rows, returns and line sources.

## Tracker
- [x] The rule built in the camp siting, deterministic, same camp on every load
- [x] Lines leave by the nearer end of the source's road
- [x] The 61-seed census on the built code: 22.5 ± 1.6 km, 19.0–26.9, 38 moved; 660454599 22.3 km (nearest, per DEC-424; the study's 23.6 was the first in-band crossing)
- [x] expedition-camp gate and world-determinism green; rows and returns (FEAT-154) follow the camp
- [x] Build-time cost of evaluating the crossings measured (worst 600 M instructions, 107 ms CPU at load 15)
- [ ] Owner has played a run

## Decisions
DEC-424.

## Open questions

## Links
FEAT-103, FEAT-154, card req-evening-options.

## Files
src/poi.js, src/offer-board.js, test/expedition-camp.mjs

## Log
- 2026-11-18 minted by the orchestrator from the owner's answers.
- 2026-11-18 built on land/feat-292-camp-crossing (lane agent): census, cost, fingerprints above; sheet
  wip/feat-292/sheet.jpg; card feat292-camp-crossing-play.
- 2026-11-18 main merged in (6a153fe3); affected gates 91/91 green serially (wip/feat-292/run-all.log); cdp-smoke 38
  steps, zero console errors; pad-e2e all ok (LB/RB paging unchecked this run: no plain giver with two offers).
  Unverified: an owner drive; browser-side cost of the check (measured headless in node).

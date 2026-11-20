---
id: BUG-232
type: bug
status: closed
severity: major
opened: 2026-11-18
source: BUG-230 census, 2026-11-18
relates: BUG-230, FEAT-68, FEAT-19, FEAT-40, QUAL-27, src/corridor-router.js, src/road.js
---
lane: Engine & world

# BUG-232: A road run spirals through its own bore and crosses itself 0.2 m apart in plan

## Next steps
Orchestrator: land `land/bug-232-self-crossing` (no seed in the 302-seed census lost a link any more).
Orchestrator: mint a separate ticket for the run × run class (30 sites on 21 of 300 seeds, untraced).

## Summary
On about 1 in 75 random seeds (4 of 300), one road loops round and crosses itself. The router plans a helix: the
two passes are 16 to 37 m apart in height. The at-grade crossing pass then lifts the lower pass onto the upper
one, which ships a ramp of 97 to 224 % grade. Severity raised from minor to major: a 2 m-per-metre wall on a road
is undriveable. The cause is proven by tracing each case through the router and by switching the flatten off.

## Description
### Census (wip/bug-232/census.mjs, main e4251ee1, 300 random seeds from BUG-230's list, story region as built)
Every shipped run polyline (`e.points`, 4 m) within REGION_RADIUS_M of spawn. 300/300 built, 0 errors.
- **Self-crossing** (a run crosses itself ≥ 30 m of arc apart): **4 sites on 4 seeds (1.3 %)**. Near passes under
  10 m with no crossing: 0. The engine's own `_crossingList` has 12 more self-crossings, all 2.7–3.4 km from spawn
  (outside the region, inside the warm window), so the detector misses nothing in-region.

| seed | (x, z) | run | arcs | solved decks gap | shipped max grade | bore at the crossing (solved) |
|---|---|---|---|---|---|---|
| 567993018 | (445.5, −2335.4) | g:400743,-2655617,-1:0,-4,1 | 370 / 539 | 36.6 m | 201 % | yes: lower pass inside 474–574 |
| 2283335151 | (−362.2, −106.9) | g:-2,-1,2:-1,-1,2 | 529 / 724 | 25.9 m | 197 % | portal 4 m before (690–720) |
| 661772743 | (−589.0, 26.5) | g:0,-1,1:-1,0,1 | 913 / 1032 | 18.9 m | 127 % | no |
| 400290281 | (1397.5, 910.2) | g:1,1,2:2,1,1 | 652 / 871 | 16.2 m | 97 % | no |
| 948023748 (BUG-230's case, not in the 300) | (644.4, 1038.2) | g:1,0,2:0,1,1 | 920 / 1103 | 30.7 m | 224 % | portal 3 m before (980–1100) |

"Solved decks gap" = the profile solve's decks (`e.points[].y`). "Shipped" = `runProfile().gradeY`, worst 2 m step
within 40 m of the crossing. BUG-230's "decks 0.9–2.0 m apart" was the shipped deck after the lift, not the plan.

- **Run × run, no junction** (two runs cross > 30 m from every end of both): **30 sites on 21 seeds (7 %)**. Solved gaps
  0.03–55 m, shipped max grade up to 279 % (1960791808 (617.8, −1722.5), g:0,-4,2:1,-3,0 × g:0,-4,2:1,-3,1, 55 m
  gap). Several involve shoved runs (BUG-57) or T-node runs. Cause not traced here: a separate bug.

### Cause, stage by stage (wip/bug-232/trace.mjs re-runs routeEdgeV2's rungs by hand; toggle.mjs)
1. **Routing makes the loop (all 5 cases).** `corridorSearch` (src/corridor-router.js) is A* over a 2.5D lattice whose
   state is (32 m cell, 3 m deck bin). Nothing in that state remembers the path's plan view, so a helix is a legal
   path. Two diagonal steps can even cross between cells without revisiting a cell. Wherever a node sits low and the
   corridor must climb onto a ridge, the grade price (wGrade 180, cheapest at ~7.5 %) buys length as a spiral.
   - 948023748, 2283335151, 567993018, 400290281: the **raw lattice path already crosses itself**, at lattice decks
     106.6/137.3, 93.1/67.3, 173.9/135.7 and 141.5/122 m. RDP, Chaikin and the fillet fitter keep the crossing.
   - 661772743: the lattice path does not cross, but it nearly loops. **`simplifyRDP` at tol 32 m** drops a vertex
     and cuts the chord across the loop; the fit keeps it (RDP at tol 44 is clean, but the 32 m fit passed rMin first).
   - Which rung shipped: rung 0 (heading-pinned) in 4 cases. The unpinned rung 1 is clean and profile-feasible in 4 of 5
     (948, 2283, 567, 661). In 400290281 **every rung** crosses.
   - 567993018's run is a T-promoted side road. Its loop is in the routed edge g:0,-5,0:0,-4,1 (cached centerline, L 754).
     The T promotion only trimmed and blended the start (`_v2BuildDeparture`, ≤ 90 m) and did not create the loop.
2. **The profile solve accepts the loop.** It solves each pass against terrain alone. So the upper pass sits on fill
   or grade over the lower pass's 25 m cutting or portal. Nothing in the vocabulary separates them, because bridges
   are de-scoped (QUAL-27).
3. **The crossing passes turn it into a ramp (proven by toggle).** `_detectJunctions` records the self-crossing as an
   AT_GRADE X. FEAT-19 then eases the joining pass onto the through pass's deck (`_addCrossingByRun`), and
   FEAT-40 clips any bore ±40 m around it (`_clipTunnelSpansAtCrossings`). With `_addCrossingByRun` disabled, the
   run's worst grade drops from 224/201/197/127/97 % to 23/32/25/25/25 %, and 948023748's bore comes back
   (980–1063 → 980–1100). So the at-grade merge is what ships the wall. The loop is what feeds it.

### Fix options (simplest first; not implemented. Whether a grade-separated spiral may stay is the owner's call)
1. **Reject a self-crossing rung in `routeEdgeV2`.** Test the fitted line for a plan self-crossing next to the existing
   `clearsDiscs` test, and fall through to the next rung. Keep a crossing line only as the last resort, as the pond
   rule does. It is pure, in the one shared route function, and the worker and sync paths agree by construction. It
   fixes 4 of 5 known cases (rung 1 is clean). Cost: those edges lose their heading pin (the ladder's "first thing
   sacrificed"). Their T and pad geometry moves, and the world fingerprint changes on exactly those edges. It does
   not fix 400290281 (all rungs loop), so on its own it leaves about 1 in 300 seeds.
2. **Option 1 plus a re-search for the all-rungs case.** One more pass prices the cells of the first path's second
   visit (a cost, not a gate, so the search never returns null). It needs plan-view state the A* does not carry, so it
   would be a post-search retry. Moderate work; it closes 400290281-type cases.
3. **Keep the spiral as a real spiral tunnel.** When the solved decks are at least a tube apart (bore radius 8 m + cover
   6 m ≈ 14 m; all 5 cases are 16–37 m), skip the FEAT-19 lift and the FEAT-40 clip for that crossing. Instead force
   the lower pass into a bore across the upper pass's footprint. This is honest geometry that real roads build (a
   spiral tunnel). It needs a bore-span extension and a carve check, so it is more work, and it reopens "grade
   separation", which the code calls descoped. Owner call.
4. **A guard alone:** never lift a crossing whose solved gap exceeds what gMax allows over the blend length. On its own
   it leaves two decks passing through each other at different heights, so it is useful only alongside 1–3.

## Tracker
- [x] Reproduced and measured on 13+ random seeds: 300 random seeds, 4 self-crossings in-region (1.3 %), all ship 97–201 % ramps.
- [x] Cause named in the code: corridorSearch's 2.5D lattice (4/5) or simplifyRDP tol 32 (1/5) makes the loop; FEAT-19 `_addCrossingByRun` lifts it into a wall (toggle-proven).
- [x] Owner picks a fix option (Description § Fix options).
- [ ] Fixed with a gate, fingerprint and a 400-seed no-throw sweep.
- [x] Owner picks a fix option: orchestrator 2026-11-18, options 1 + 2 (no spiral tunnels, no grade separation).
- [x] Built: routeEdgeV2 rejects a self-crossing fitted line; a looping rung first retries on its own pin with a 32 m no-go disc on the crossing, and a looping rung 0 promotes the pinned uncapped rung 2 above the unpinned rung 1 (974c473d). Gate `self-crossing` fails 10/10 on main, passes 10/10 on the branch (5 seeds: 0 self-crossings, site steepest 10 m 18.1-24.9 %, main 90-202 %).
- [x] Fingerprint main vs branch: all six windows identical in every component (no loop in seed 6/11/7/3 windows).
- [x] Census main vs branch, 302 seeds (300 random + tutorial 1872706826 + 948023748): self 5 -> 0, near-self 3 -> 0, run × run no-junction 30 -> 30 (none up). Components unchanged on all 302; 15 seeds differ (runs +1..+9 on 13, infeasible 15->14 on one, runs -1 on 3237493602). 400-seed no-throw sweep: 402 rows, 0 failures.
- [x] Affected gates: run-all 93 selected, all 91 run green. cdp-smoke PASS (41 steps, 0 console errors); pad-e2e ALL OK (104 checks, no console errors); wip/bug-232/sheet-fix.jpg made (both loops gone from the top-down).
- [x] Lost link on 3237493602 traced and fixed: edges/junctions/nodes now equal main (see Log 2026-11-19). Re-census 302 seeds: edges up on 12, equal on 290, down on 0.
- [x] Re-proof on merged head c50466bb (2026-11-19): 402-row no-throw sweep 0 errors; tutorial stats identical; dead ends checked on the 12 differing seeds; smoke + pad-e2e + self-crossing gate green.
- [ ] Run × run no-junction crossings (30 sites / 21 seeds) ticketed separately.

## Decisions
- 2026-11-19, owner (card bug232-spiral-tunnels): "No spirals: refuse the loop". Recorded as DEC-446: the router refuses a path that crosses itself; no grade separation (no tunnel under, no bridge over) is added for spirals or for BUG-234's no-junction crossings.

## Open questions
- May a road spiral over itself when the two passes are ≥ 14 m apart (a spiral tunnel, option 3)? Or should routing refuse every self-crossing (options 1–2)?

## Links
Sheet `wip/bug-232/sheet.jpg` (567993018 and 2283335151, top-down + driver view). Census logs `wip/bug-232/census-{a,b}.log`, `summary.txt`; traces `trace-*.log`.

## Files
`src/corridor-router.js` (corridorSearch, routeEdgeV2, simplifyRDP) · `src/road.js` (_detectJunctions, _addCrossingPair, _clipTunnelSpansAtCrossings)

## Log
- 2026-11-18 minted by the orchestrator from the BUG-230 census.
- 2026-11-18 lane agent, branch land/bug-232-self-crossing off main e4251ee1, diagnosis only. Census 300 random seeds
  (2 × 150, ~27 s/seed): self 4 sites/4 seeds, run × run 30/21, 0 throws. Trace on all 5 cases plus flatten toggle (numbers above).
  Probes in wip/bug-232/ (census, trace, toggle, prof, clsfind, xlist, shots, sheet). Not checked: the run × run class's cause;
  whether option 1 changes connectivity or T placement (no build was run with it).
- 2026-11-19: owner answered "No spirals: refuse the loop" (DEC-446). Option 3 (spiral tunnels) is dropped. The plain fix stands: refuse a self-crossing path, take the next candidate; the fifth known case needs the retry search.
- 2026-11-18 lane agent: fix af2da589 (src/corridor-router.js), gate df410c55 (test/self-crossing.mjs). 5 seeds clean, run × run on them unchanged
  (400290281 keeps its one pre-existing cross). Fingerprint 6/6 windows identical. Census/sweep/gates were mid-run at handback:
  logs in the session scratchpad b232/ (census-main.log, gates.log); probe wip/bug-232/census2.mjs [--sweep]; sheet prep sheet-fix.{html,mjs}, cases-views.json.
- 2026-11-18 lane agent, proofs closed (branch af2da589+df410c55, based on main 60411652). Gates 91/91 green; smoke + pad-e2e green first try; census/sweep numbers in the Tracker.
  Run counts: 661772743 163->172 (edges 162->171, nodes 144->151, junctions 62->65, dead ends 27->26, 1 component both); 2283335151 161->162 (edges 159->160, +1 node, dead ends 29 both, 1 comp);
  948023748 184->185 (+1 edge, +1 node, 3 comps both, dead ends 32 both). Tutorial 1872706826: stats identical. Worse: 3237493602 (-1 edge, -1 junction, +1 dead end); 3882596942 refused edges 5->8 but +1 edge.
  Not checked: dead ends on the other 12 differing seeds; driver-view shots on the branch look at the old camera height, so they show sky/terrain not road.
- 2026-11-19 lane agent: lost link traced. 3237493602's missing edge is g:-4,3,0:-5,4,0 at (-2013, 2344)→(-2802, 2579), 3.2-3.9 km from spawn
  (warm window, outside the story region); it IS main's one engine self-crossing there (loop 36-220 m from its node). Rung 0 looped; the
  unpinned rung 1 was clean (1310 m) but left the node along sibling g:-4,2,1|-4,3,0 and crossed it 3× ((-2039,2310) (-2030,2272) (-2008,2226)),
  so `_v2DeleteFor` (BUG-57 crossing delete, longer member dies) dropped it. Fix 974c473d: a looping rung retries once on its own pin with a
  32 m disc on its crossing (replaces the all-rungs retry), and when rung 0 loops the pinned UNCAPPED rung 2 goes before unpinned rung 1.
  The edge now ships 1179 m, clean, pinned; every other run identical to main. 3882596942 "refused 5→8" was not refused edges: `_v2Infeasible`
  counts plan-layer sample solves; all 3 extras are re-samples (+ memo replays) of edge g:4,0,1:5,1,2's 1007 m first route, which main also finds
  infeasible and then drops; the branch ships it as a 2000 m run, solved, steepest 10 m 19 %. Probes wip/bug-232/{runs,cls,stage,rungs,drape}.mjs.
  Proofs: gate self-crossing PASS (5 seeds, 0 self-crossings, sites 18.1-29.4 %); census 302 (branch re-run, main log kept): self 5→0, near 3→0,
  run × run 30→30, engine self-crossings in the warm window 17→0 (so no looping fallback ships), components equal on all 302, edges up 12 / down 0.
  Gates (run-all --serial --changed=src/corridor-router.js): 93 selected, 91/91 green. Fingerprint-world vs main: ALL IDENTICAL (6 windows). Not re-run: smoke, pad-e2e, 400-seed sweep.
- 2026-11-19 lane agent, proof-only re-run on c50466bb (main merged; no road code moved). Sweep 402 seeds (400 + 1872706826 + 948023748, 2 procs): 402 ok, 0 errors/failures, 0 engine self-crossings. Tutorial 1872706826 branch: 187 runs, 186 edges, 156 nodes, 81 junctions, 1 comp = main. Differing seeds vs main census: 12 (edges +1..+3 on all, comps equal). Dead ends main->branch (degree-1 graph nodes): up +1 on 3715981284 (29->30, edges 194->196) and 1927274698 (26->27, edges 172->173); down 1 on 1257139844, 2465745196; equal on 8. Edges down on none. cdp-smoke PASS (41 steps), pad-e2e ALL OK (136 ok lines) first try, test/self-crossing PASS. Not checked: dead ends via the old 15-seed list (now 12 differ).

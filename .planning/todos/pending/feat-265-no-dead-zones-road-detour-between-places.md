---
id: FEAT-265
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I would consider this a bad seed. ... To go from the food vendor to larrys is simply too far. I feel like it creates a dead zone in the map that a player is less willing to visit because trips in and out of there take so long and that dead zone may not provide a critical service like gas or access to an auto shop."
relates: DEC-070, DEC-064, DEC-054, DEC-053, FEAT-13, src/road-graph.js, src/road.js, src/poi.js
---
lane: engine & world

# FEAT-265: No dead zones — places a long drive apart that are close on the map

## Next steps
B2 is built on `land/feat-265-dead-zones` (DEC-401) with the clearance fix (item 6 below); `road-clearance` and
`urquhart-restore` are green. One owner call before it lands (owed card `feat265-b2-look`): the NEW tutorial seed
1872706826 (DEC-402). B2 restores 2 roads there and the berth re-routes one of them to a 32 % pitch, so the tutorial
moves (station, camping area, auto shop) and gets steeper (38 % climb vs 19.1 %). The measured options are in
§ "Tutorial seed under B2". On his answer: (1) re-census `test/tutorial-seed.mjs` on 1872706826 under B2 (never loosen),
or (2) re-pin to the seed he names (DEC-402's walk: data/tutorial.js, the gate's census, the smoke's tutorial checks,
a record superseding DEC-402), or (3) change item 6 to "a restored side that grazes stays dropped" (no berth re-route),
re-run the affected gates; then the landing request.
Affected gates with the fix (`--serial --changed=src/road.js`): 77/78 green; red only tutorial-seed (the call above).

## Summary
On seed 3200351065 the drive from the food vendor to Larry's is far longer than the map distance suggests, and the
lower-right third of the region reads as a dead zone: trips in and out take long and it may hold no gas or auto shop.
The owner has "seen enough of these to know it's going to be a problem". He wants it fixed by construction if
possible, not by patching the finished network, and is wary of added world-gen time.

## Description
Capture: `Logs/autos-capture-1794961736544.json` (place capture, story mode, Normal, seed 3200351065, mark x −343,
z 1375).

The owner's own first idea, in his words: "after the road network is generated, we can search for these 'islands'
and generate a road to reconnect them. For example, on this seed there's already a spur near the bottom right gas
station that would not be super costly to connect back up near the auto shop. the main thing i dont like about this
approach is the extra world gen time it adds. Since it doesn't really fix connectivity by construction, it lets the
roads fall out of the algorithm and then tries to patch connectivity. Any other approaches." And: "It may very well
be that gameplay-wise, this seed is just as winnable as any other but as a player I look at it and I say, 'Ooh, I
don't really like this seed.'"

Background (orchestrator, from the code): the network's topology is an Urquhart graph over blue-noise sites
(`src/road-graph.js`: the Delaunay triangulation minus each triangle's longest edge), then a degree cull to 3, then
routing, where an edge that cannot be routed is dropped. The Delaunay triangulation bounds the detour between any
two sites (road distance stays within about 2× the straight line); Urquhart gives that bound up, so long detours
around a missing edge are a known property of the graph family, before the cull, a failed route or the region's
edge removes anything more.

To establish: the measure that matches what he sees (candidates: stretch = road distance ÷ straight-line distance
between places; drive time to the nearest gas / auto shop; the share of the region more than N minutes from both),
which stage removed the edge whose absence makes this dead zone (Urquhart's longest-edge rule, the degree cull, a
failed route, the region boundary), how common it is on random seeds, and what each option costs in build time and
in added road length.

Options to evaluate (none chosen):
- A. His patch: after the network is built, find the worst pairs and route a reconnecting road.
- B. By construction at the topology stage: keep Urquhart, then re-admit the already-computed Delaunay edges whose
  absence leaves a stretch above a limit, shortest first (a bounded-stretch graph). Decided on the abstract graph
  before any road is routed. Must stay window-invariant (identical whatever window the world is generated from).
- C. Change which edge the degree cull drops: the one whose loss lengthens detours least.
- D. Place services by road distance (every part of the region within N minutes of gas and an auto shop): no roads
  added; fixes "no critical service" but not "the trip is long".
- E. Reject a region that fails the measure and regenerate.

Bound by: DEC-070 (connectivity goes up; add options, not roads; keep the network sparse), DEC-064 (no
road-character retune), cold generation only, no standard seeds, world-gen picks shown as screenshot sheets.

### Diagnosis (world-gen lane, 2026-11-17; headless, seed 3200351065's story region, the GPS planner's own graph)
- Food vendor → Larry's: **6.68 km by road, 2.09 km on the map (stretch 3.2)**. The food vendor is the worst place on the
  map: its mean stretch to every place ≥ 800 m away is 3.67, and the 12 worst pairs of the region all start there
  (food → stranded motorist 6.69 km for 0.94 km, food → auto shop 6.80 / 1.17, food → school 8.06 / 1.51).
- Lower-right places: food vendor (−340, 1376), gas pump (469, 1217), farm (14, 1752), office (715, 1922), farm
  (1109, 764), auto shop (1501, 601), firewood yard (1177, 318). Gas and an auto shop are not missing here: the
  farthest any place is from gas is 2.47 km and from an auto shop 4.24 km, both typical.
- **The stage**: the food vendor sits on a 473 m dead-end spur ending at site −1,1,1 (−359, 1270). Urquhart (Delaunay
  minus each triangle's longest side) removed its direct 756 m link north to site −1,0,0 (−292, 517, by the stranded
  motorist and the west auto shop), because that triangle's two other sides via site −1,1,2 (−8, 899) were shorter
  (510 + 476 m). **Both of those sides then failed to route**: a pond's no-go disc sits 72 m from −1,1,2, the corridor
  search finds no path on any rung, and `_assembleGraphEdges` skips an empty route silently
  (`if (!cl || cl.length < 1e-6) continue`). Urquhart's detour guarantee assumed roads that were never built.
- His "spur near the bottom-right gas station" is −1,1,2: a 468 m stub off node 0,1,1 by the gas pump, ending at the
  pond. "Back up near the auto shop" is exactly the failed −1,1,2 ↔ −1,0,0 (476 m chord): it still cannot route round
  that pond. The edge Urquhart dropped, −1,1,1 ↔ −1,0,0, routes at 1125 m, steepest 10 m 17 %, and cuts food →
  Larry's from 6.68 to 3.00 km.
- Second-worst census seed 3832686841 (place stretch 3.09): a different chain. Urquhart dropped −2,−3,2 ↔ −1,−4,0
  (753 m) for a detour via site −2,−4,0, whose edge was then degree-culled and which sits past the region's planning
  wall (r 2462 m > 2400 m).

### The measure: place stretch
For each place: the mean, over every other place ≥ 800 m away on the map, of road distance ÷ map distance. A seed
scores its worst place. 46 seeds (his, the tutorial seed 3590618618, 44 random): median 2.21, his **3.67 = the highest**,
next 3.09, then 2.96. Histogram: 1.5–2: 9 · 2–2.5: 26 · 2.5–3: 9 · 3–3.5: 1 · 3.5–4: 1. Threshold 3.0 flags his seed and
one random one (about 1 seed in 45). Rejected as measures: the worst single pair (median 4.1, 14 random seeds above 5:
two close places on different roads swamp it) and service distance (does not flag his seed; 12/46 seeds have a place
> 3 km from both gas and an auto shop, his is not one).

### Options (census = the 46 seeds; A/B/B2/C are the game's own router routing extra Delaunay edges on the built
world, places held; D re-sites places for real; build time: 10 seeds × 3 cold builds, main-thread retired instructions)
| option | his seed: place stretch · food→Larry's | seeds ≥ 3.0 | seeds given roads · km added | steepest 10 m | extra build | tutorial seed |
|---|---|---|---|---|---|---|
| today | 3.67 · 6.68 km | 2 / 46 | – | – | – | – |
| A patch after build (worst place > 3 → route the Delaunay edge that helps it most) | 2.17 · 3.00 km (1 road, 1.12 km) | 0 | 2 · mean 0.06, max 1.7 | 22.7 % | median 0.01 %, worst 0.11 % (≤ 44 ms) | unchanged |
| B2 Urquhart repair (an Urquhart edge that fails to route re-admits the triangle side Urquhart dropped on its account) | 2.05 · 3.00 km (3 roads, 2.9 km) | 1 (3832686841, no failed route) | 4 · mean 0.17, max 2.9 | 25.1 % | median 0.01 %, worst 0.36 % (≤ 89 ms) | unchanged |
| B bounded stretch t = 2 (abstract graph) | 2.13 · 3.38 km (9 roads, 9.8 km) | 0 | 46 · mean 8.7, max 13.4 (GPS road 37.0 → 45.7 km) | 37.6 % | median 2.3 %, worst 3.4 % (~0.6 s) before re-routing neighbours | moves |
| B at t ≥ 2.5 | unchanged (adds 0 on his seed) | – | – | – | – | – |
| C, upper bound (keep every degree-culled edge) | 2.27 · 4.75 km | 0 | 44 · mean 2.6, max 5.5 | 27.5 % | ~0.1 s | moves |
| D services by road distance | 3.49 · 6.68 km | 2 | 0 (seeds with a place > 3 km from gas AND auto: 12 → 3) | – | POI build ~1 s | moves |
| E reject + regenerate at 3.0 | – | flagged 2 / 46 | 0 | – | one extra region build for ~1 seed in 45 | – |

B decides on the graph before routing, so it cannot see his seed's cause (a route failure): at t ≥ 2.5 it adds nothing
there, and at t = 2 it fixes it only by thickening every world by a quarter. Window invariance: B's test reads a path
of length ≤ t × chord, so it needs that much margin (≤ ~1.5 km, inside today's 3-cell graph margin) and an order-free
rule (each edge tested against the un-augmented graph), or it is the QUAL-14 percolation trap again. B2 is local (one
triangle) but needs route outcomes, so a re-admitted edge is routed in a second round, and its two nodes' other legs
re-route for their heading pins; the story region and free roam take the same rule. A runs once over the finite region
after the build, so the same ground can differ between story mode and free roam.
Sheets: `wip/feat-265/overview.jpg` (his seed, every option, census table) and `wip/feat-265/sheet-<seed>.jpg` for
3200351065, 3832686841, 3950597779, 3283391082 (worst) and 4059150321, 2992445547 (typical). Tools: `wip/feat-265/`
(`census.mjs`, `options.mjs`, `tile.mjs`, `sheet.mjs`, `bench.mjs`, `diag.mjs`; git-invisible).


### B2 as built (world-gen lane, 2026-11-17; `RoadSystem._v2RestoreDropped`, called from `_assembleGraphEdges`)
The rule: a Delaunay side d that Urquhart dropped comes back when EVERY triangle that dropped it (at most 2) has a
short side that failed to route. "Failed" = an edge of the settled graph (not degree-dropped, not a merge-band stub)
whose route is empty on every rung. Degree drops and crossing deletes are not failures (each keeps its own detour rule).
1. Which edge: only the longest side of a triangle the failed edge belongs to. A dropped side that was ALSO the longest
   side of its other triangle stays dropped when that other triangle's two short sides both built (that triangle still
   gives it a two-road detour). Chains: one round. A restored side that itself fails to route stays dropped and
   restores nothing in turn (bound: 1).
2. Degree cull: unchanged and still before routing. Restored sides are added after it and are exempt from it: a node
   may reach degree 4 (seen: the owner's -1,0,0 is now degree 5 with its failed edge counted). No re-run, so the cull's
   decisions are identical and connectivity only goes up.
3. Determinism: the restore is an ASSEMBLY step after every planned edge is routed. Restored sides never enter the
   graph's adjacency, so no heading pin, plan verdict or cull decision moves; they route on chord pins at both ends
   (a pure function of the two node positions). A world with no failed route builds byte-identical. The decision is
   made wherever d has an in-band endpoint (= wherever it registers), from the triangles around d (interior to the
   band graph) and the emptiness of routes. Emptiness is a reachability fact of the corridor search (finite costs,
   the last rung unpinned and uncapped), so it does not depend on which pins a window derives. A short side the window
   does not register is routed on its base pins (a cache hit when the settle pass already routed it). Story region and
   free roam run the same code; the gate builds a free-roam window centred on the owner's restored side and gets it
   identically, and the network worker path (buildNetworkSnapshot + adoptNetwork) matches the sync build.
   Not proven: a margin case where d's far short side is outside every window's settle set is argued, not tested.
4. The silent skip stays: the failed edge is still not built (5 of 46 seeds, 8 in-region edges, same as main). What
   changed is that its dropped side comes back. No logging in `src/`; the census counts it.
5. Grades: no road-character change. A restored side whose profile cannot solve even on the hard-grade re-route rungs
   stays dropped (a condemned road would refuse the seed, DEC-054). Restored roads: steepest 10 m 12-25 %, 0-221 m
   above 20 % per road (in the region: 18.4 % / 0 m and 24 % / 71 m on the owner's seed, 24 % / 123 m on 1979256859,
   21.1 % / 18 m on 2176144795). How many candidates the grade rule kept dropped was not counted.
6. Clearance (FEAT-77 for a restored side; `_v2RestoreLegs` + `_v2RestoreGrazes`, 2026-11-17): a restored side is
   outside the plan layer, so FEAT-77's clearance walk never makes it a loser (seed 1247456971 node -3,2,0: 16.6 m from
   a sibling leg over 28 m). Now: the side routes plain; if it GRAZES one of the other legs at its two nodes (centres
   under the graze floor 2·halfWidth + clearEdgeM = 22 m, past the geometric throat, bores excluded: the road-clearance
   random-seed tier), it re-routes with those legs' shipped lines as `occupied` (the router prices metres inside their
   clearance, node throats exempt, as for a pass-2 loser); if it still grazes, it stays dropped. A side that never
   grazed routes exactly as before. The legs' lines are their pure per-edge pass-2 routes, so window invariance and
   worker/sync parity hold by the same argument as item 3. Not covered: a restored side grazing a road that does not
   share its node, or another restored side (left to the gate).
   Census (46 seeds, 27 restored sides): 18 unchanged, 7 re-routed with the berth (steepest 10 m moved by -0.2 to
   +7.5 points; worst 20 -> 27.5 % on 3590618618's warm band), 2 still graze and stay dropped (3590618618 warm band,
   2176144795 in region). On 1872706826 (not in the 46) its 1061 m in-region side grazed: re-routed to 1006 m, 32.2 %.

Results (46-seed census on the real build, `wip/feat-265/census-b2built.jsonl`, places re-sited by the real POI build):
(Re-stated after the clearance fix, 2026-11-17: the numbers below hold except km added, mean 0.61 -> 0.55 km, max
4.14 -> 3.02 km, and restored grades, steepest 10 m 12-27.5 %; seeds with a restore still 13, 5 in the region; max
place stretch 3.09, median 2.21; the owner's seed unchanged.)
- Owner's seed 3200351065: food vendor to Larry's 6.68 -> 2.99 km (2.09 km on the map); place stretch 3.67 -> 2.07.
  Two roads come back: -1,1,1 to -1,0,0 (1119 m, the one the diagnosis named) and -1,0,0 to 0,0,0 (768 m).
- Place stretch median 2.21 -> 2.21, max 3.67 -> 3.09. Seeds >= 3.0: 2 -> 1 (3832686841: no failed route, its cause is
  a degree drop plus the region wall; not chased).
- Seeds given roads: 13 of 46 (5 inside the region), km added mean 0.61, max 4.14 (most outside the region, in the
  warm band). The 33 seeds with no restore measure identically; `fingerprint-world` (six windows) identical to main.
- Build cost (cold story-region build, 10 seeds x 3 repeats, main vs branch run side by side, main-thread retired
  instructions): median -0.3 %, worst +1.0 % (3283391082, 2 restored roads, wall +380 ms); run-to-run noise is about
  +-1.7 %, so the whole-build bench cannot see it. The restore pass timed alone (`wip/feat-265/b2diag.mjs`, 3 assembly
  passes per build): 64 ms with nothing to restore (1264166411), 228 ms on the owner's seed, 785 ms on 1872706826.
- A restored road is ordinary road downstream: on 2176144795 one was joined into a T by the overlap join (BUG-105).
- Not done: the in-game freecam screenshot of a restored road.
- Sheet: `wip/feat-265/b2-built.jpg` (six seeds before | after: the owner's, the four other seeds with an in-region
  restore, and the new tutorial seed), `wip/feat-265/b2-owner.jpg` (his seed alone).

### Tutorial seed under B2 (world-gen lane, 2026-11-17; round 3's own tools, `hard.mjs` / `census.mjs` / `gate-at.mjs`
from CarGame-land-211d `wip/tut-seed-search-r3/`, run on main (`wip/feat-265/mainroot/`, an export of main) and on this
branch (`wip/tutb2/`); `python3 -I wip/feat-265/tutcmp.py` prints the table; sheet `wip/feat-265/b2-tutorial.jpg`)
- 1872706826 gains two in-region roads: -3,0,0 to -4,0,2 (826 m, 14.9 %) and -2,1,1 to -3,1,1. The second grazed its
  node's leg as first built (1061 m, 14.8 %); the berth re-routes it to 1006 m with a 32.2 % pitch. POIs re-site.
- Places: joint, mom's, Larry's stay. Station (-377, -446) -> (-1767, 676); camping area (-130, 387) -> (-2008, 944);
  flat (-41, 92) -> (-801, 638); auto shop (620, 456) -> (-376, 321).
- Legs (km): Larry->station 2.63 -> 1.84, station->camp 1.26 -> 0.37, camp->flat 0.43 -> 1.53, shop->mom 2.22 -> 1.14,
  tow 0.75 -> 0.53; joint->mom 0.82, mom->Larry 2.15, mom->joint 0.82 unchanged. Day 10.33 -> 8.67 km, longest leg
  2.63 -> 2.15 km: DEC-344's distances (longest <= 3.5 km, day <= 16 km) still hold.
- Hard metres 838 -> 738 (81 -> 85 per km). Steepest climb 19.1 -> 38.0 %, descent 29.4 -> 38.1 %; above 20 %: 0 up +
  95 down -> 65 up + 50 down. Worst spot: shop->mom -15.1 % in a 12 m bend (627, -369) -> Larry->station -38.1 % at
  R 23 m (-970, 814), on the re-routed restored road, which Larry->station and camp->flat both drive.
- gate-at.mjs with constants re-derived on the B2 world: PASS (every stop, leg, and the clock).
- The other candidates and the old pin: B2 leaves the tutorial identical on all five (places, legs, index).
  1464815701 665, 3615534968 927, 3881445155 995, 3270310529 1055, 3590618618 2528 hard metres. The first four
  restore no road anywhere in the region build (identical worlds); 3590618618 restores 2 roads in the warm band only.
- Option 3 measured (`wip/feat-265/opt3root/`, item 6 with the berth re-route removed: a grazing side stays dropped):
  1872706826's tutorial and census line identical to main and `test/tutorial-seed.mjs` passes unchanged; the owner's
  seed unchanged (2.99 km); census 18 of 27 restored sides kept (vs 25), median / max place stretch 2.21 / 3.09
  unchanged, seeds with an in-region restore 5 -> 4; 2176144795 place stretch 2.05 -> 2.22, 1247456971 2.30 -> 2.54.

## Tracker
- [x] The capture diagnosed: the stretch food vendor → Larry's, and the stage that removed the missing edge
- [ ] A measure agreed with the owner (proposed: place stretch ≥ 3.0), censused on ≥ 30 random seeds (done: 44)
- [x] Options shown as map sheets (before/after per option, same seeds), with build time and added road length
- [x] The owner's pick (B2) built; fingerprint-world identical on its six windows; gate `urquhart-restore.mjs`
- [x] road-clearance graze on 1247456971 fixed: a restored side that grazes re-routes with a berth or stays dropped
- [x] The tutorial seed under B2 measured (1872706826 + the round-3 candidates + the old pin), `wip/feat-265/b2-tutorial.jpg`
- [ ] Owner look at `wip/feat-265/b2-built.jpg` + the tutorial-seed call (card feat265-b2-look)

## Decisions
- DEC-070 (connectivity up; add options, not roads; keep sparse): A, B2, B, C add roads. A/B2 add 1–3 roads on 2–4
  seeds in 46; B (+24 % road km on every seed) and C (+2.6 km on 44 seeds) go against "keep sparse".
- DEC-064 (cTurn 45 / wGrade 180): no option touches them.
- DEC-054 (only a condemned road refuses a seed): E would refuse seeds for detours, including a seed the player typed.
- DEC-351 / DEC-149 (the tutorial seed): B, C and D change the tutorial seed's world; A and B2 leave it unchanged.
- DEC-053 (regions), DEC-060 (one off-network generator), DEC-048 (POIs mid-edge): no conflict found.

## Open questions
- Which option (owed card `feat265-dead-zones-pick`). Recommendation: B2, with the place-stretch census kept as a
  watch for the remaining ~2 % (the 3832686841 kind).
- The measure and its threshold (place stretch ≥ 3.0).
- A route that comes back empty is dropped silently (5 of 46 seeds lose at least one in-region edge this way). Is that a
  bug in its own right, whatever the pick here?
- DEC-070 says "add options, not roads". A and B2 add a road; the owner's own first idea does too.

## Links
- Capture `wip/feat-265/autos-capture-1794961736544.json` · sheets `wip/feat-265/overview.jpg`

## Files
`src/road-graph.js` · `src/road.js` · `src/poi.js`

## Log
- 2026-11-17: clearance fix (`_v2RestoreLegs`/`_v2RestoreGrazes`): road-clearance PASS, urquhart-restore 6/6,
  fingerprint-world identical to main; census 7 re-routed + 2 dropped of 27. Tutorial under B2 measured (838 -> 738
  hard m, 19.1 -> 38 % climb); option 3 checked in a copy. Affected gates 77/78 (tutorial-seed red). Card feat265-b2-look rewritten.
- 2026-11-17: B2 built (`_v2RestoreDropped`, `urquhartEdges` dropped-side records); gate urquhart-restore 6/6;
  fingerprint-world identical; census 46 seeds; tutorial-seed FAILS on 1872706826 (shop moves): owner call. Card feat265-b2-look.
- 2026-11-17: minted by the orchestrator from the owner's capture and note.
- 2026-11-17: diagnosed + 46-seed census + 5 options as routed overlays (wip/feat-265/, git-invisible); sheets
  overview.jpg + 6 seed sheets. Nothing in src/ changed. Owed card feat265-dead-zones-pick.

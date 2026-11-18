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
B2 is built on `land/feat-265-dead-zones` (DEC-401). Two things are the owner's before it lands (owed card
`feat265-b2-look`): his look at `wip/feat-265/b2-built.jpg` and seed 3200351065 in story mode, and the conflict with the
NEW tutorial seed 1872706826 (DEC-402): B2 restores two roads there, which moves its east auto shop, so
`test/tutorial-seed.mjs` fails 3 census checks (green on main). Per that gate a failure means re-pick or re-census the
seed, never loosen it: his call.

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

Results (46-seed census on the real build, `wip/feat-265/census-b2built.jsonl`, places re-sited by the real POI build):
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

## Tracker
- [x] The capture diagnosed: the stretch food vendor → Larry's, and the stage that removed the missing edge
- [ ] A measure agreed with the owner (proposed: place stretch ≥ 3.0), censused on ≥ 30 random seeds (done: 44)
- [x] Options shown as map sheets (before/after per option, same seeds), with build time and added road length
- [x] The owner's pick (B2) built; fingerprint-world identical on its six windows; gate `urquhart-restore.mjs`
- [ ] Owner look at `wip/feat-265/b2-built.jpg` + the tutorial-seed conflict (card feat265-b2-look)

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
- 2026-11-17: B2 built (`_v2RestoreDropped`, `urquhartEdges` dropped-side records); gate urquhart-restore 6/6;
  fingerprint-world identical; census 46 seeds; tutorial-seed FAILS on 1872706826 (shop moves): owner call. Card feat265-b2-look.
- 2026-11-17: minted by the orchestrator from the owner's capture and note.
- 2026-11-17: diagnosed + 46-seed census + 5 options as routed overlays (wip/feat-265/, git-invisible); sheets
  overview.jpg + 6 seed sheets. Nothing in src/ changed. Owed card feat265-dead-zones-pick.

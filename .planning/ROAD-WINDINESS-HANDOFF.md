# Road Network — handoff for the WINDINESS stage (2026-06-29) — for a fresh context

**Status:** FEAT-13 v2 graph network is LANDED, CLEAN, SPARSE, and on `main` (through commit `3eafd05`).
The network is now a sparse, well-connected, varied-angle forest-service road graph with real T/X
junctions, dead-end spurs, and ~zero ugly crossings. **The remaining complaint is FEEL: the roads are
too RIGID — straighter and less windy/interesting than the old (rows-mode / pre-graph) character.**
This stage restores that character. It is **mostly router-weight tuning**, plus one real engineering
sub-task (un-block `goalBlend`). Graph mode is still behind the `roadNetworkMode` toggle; `rows` remains
the shipped default until the user signs off the graph in-sim.

---

## 1. Where things are (read this first)

The whole v2 arc, newest last:
- `85970fa` v2 foundation: blue-noise anchors + Urquhart graph (`src/road-graph.js` + `road.js` site
  sampler / `_buildUrquhart` / `_nodePos` / node identity `[cmx,cmz,k]`).
- `3ee7192` wrong-side fix: graph `goalHeading` was reversed (router wants ARRIVAL travel dir) → +π.
- `c94bcec` loop fix: short climbing edges spiralled 360° → graph-only `roadGraphMaxGrade` 0.30.
- `95af923` overshoot fix: edges overshot their goal node + curled back (the "happens twice"
  double-cross) → wide `roadGraphGoalBlend` 140 (Dubins terminal eats the overshooting tail).
- `0ed2149` at-grade cull: `_cullCrossings` safe-prunes the redundant edge of each routed crossing
  (bounded-hop detour test; dead ends + bridges never cut).
- `b5af6e3` sparsify v1: node spacing 110→220.
- `3eafd05` way-sparser: DECOUPLED the site grid from the 256 m macro-grid (`_buildUrquhart` derives
  site cells from the band's WORLD extent at `roadSiteSpacing` scale). `roadSiteSpacing` is now the
  primary density knob; default 640 m ≈ 4 nodes/km².

**Current graph knobs (`data/ranger.js`, all GUI sliders in the Roads folder):**
`roadSiteSpacing 640` · `roadSiteMinDist 420` · `roadSiteCandidates 3` · `roadGraphMargin 3` ·
`roadGraphMaxGrade 0.30` · `roadGraphGoalBlend 140` · `roadGraphCullCrossings true` ·
`roadGraphCullMaxHops 8` · `roadGraphDeviationCap 2`. Shared router weights (rows + graph):
`roadWTurn 8000` (wCurv) · `roadWAlt 1.0` · `maxRoadGrade 0.20` · `roadEarthworkWindow 120` ·
`roadWDeviation 3` · `roadDeviationCap 8`.

Perf: graph(sparse) is CHEAPER than rows (first build 2.5 s vs 3.4 s, restream 147 ms vs 344 ms).

---

## 2. The goal of this stage

Make graph roads **wind and follow terrain like the old roads** — sweeping curves, valley-hugging,
the occasional switchback on a climb — **without** bringing back the artifacts we just killed (360°
loops, goal-node overshoot/double-cross, ugly at-grade crossings). This is a **feel/visual** target →
it is a **USER-CHECK** (eyeball in-sim, compare to rows-mode character), not a pure gate pass.

---

## 3. Why the roads got rigid (root analysis — three changes, all straighteners)

Every fix this session traded windiness for cleanliness:

1. **`roadGraphGoalBlend 140` — THE MAIN CULPRIT.** The router replaces the last 140 m of each edge with
   a clean GEOMETRIC Dubins curve into the node (it ignores terrain). On the sparse net (avg edge ~670 m)
   that's ~20% of an edge, but on shorter edges it was >50%. The tail doesn't follow terrain → rigid.
   It exists to mask a SEARCH-level overshoot (the A* wanders PAST the goal, then the terminal reels it
   back; 140 m cuts the whole overshoot off). **Lowering it restores windiness but reintroduces the
   overshoot/double-cross** unless the overshoot is fixed at the search level first (see §4).
2. **`roadGraphMaxGrade 0.30`** (rows uses `maxRoadGrade 0.20`). Lets edges climb steep + STRAIGHT
   instead of switchbacking/detouring to stay gentle. Straighter, fewer switchbacks. Lowering it back
   toward 0.20 winds more — but that is what caused the 360° loops BEFORE goalBlend existed; with the
   goalBlend terminal now handling approaches, a moderate lower value may wind without looping (RE-TEST).
3. **`goalHeading` pinned to the chord** (the wrong-side +π fix). Each edge leaves/arrives aimed straight
   at its neighbour. Correct for junctions, but removes wander. Probably KEEP (it's load-bearing for
   clean nodes); get windiness from the cost terms + goalBlend instead.

(Sparsity itself slightly HELPS windiness — longer edges have more room to curve — so it's not a cause.)

---

## 4. The plan (do roughly in this order)

### A. Make the router weights graph-specific, then tune for terrain-following
The cost weights (`roadWTurn`, `roadWAlt`, `maxRoadGrade`) are currently SHARED with rows (read from
`this._proto.params` in `_routeOptsBetween`). To tune graph windiness without touching rows, add
graph-mode overrides (mirror how `maxGrade` is already graph-branched in `_routeOptsBetween` ~line 1566):
- **`roadWAlt` ↑ (valley-seeking)** — higher = roads dive for valleys = windier terrain-following. The
  single most "old-character" lever. Try 1.5–3× (graph-only).
- **`roadWTurn` / wCurv ↓** — lower = cheaper curvature = the router accepts more/tighter bends. Try
  halving (graph-only). (Watch the no-loops + min-radius gates.)
- **`roadGraphMaxGrade` ↓ toward 0.20–0.24** — re-introduce gentle-grade detours/switchbacks. RE-TEST
  loops at each step (this was the loop source pre-goalBlend).
- Sweep headlessly first (the metrics harness in §6) then eyeball.

### B. Un-block `goalBlend` (the real engineering task)
This is the gate on getting real windiness. Lower `roadGraphGoalBlend` (toward ~40–60) so the edge tail
follows terrain again — but FIRST stop the A* from overshooting the goal, or the double-cross returns.
Options (in `src/road-carve.js arcPrimitiveConnect`, the search + terminal):
- a **goal-overshoot penalty / goal-capture radius** in the hybrid-A* so the search STOPS at the goal
  instead of sailing past it (root fix — then goalBlend can be small);
- or a **gentler terminal radius** (use `gentleR` not `hardR` for the goal Dubins) at a moderate
  goalBlend so the approach curves in without the tight hook;
- VERIFY with the `GRAPH-NODE-DEPARTURE` + overshoot metric + `GRAPH-NO-LOOPS` gates.
NB: `arcPrimitiveConnect` is mirrored into the Worker `WORKER_SOURCE` (ROUTE SYNC) — any edit there must
be re-mirrored in the same commit (`route-worker-sync.mjs` gate enforces byte-identity).

### C. Tune deviation/earthwork for the vertical feel (optional)
`roadGraphDeviationCap 2` makes roads hug terrain tightly (steep, rigid-vertical). Raising it lets roads
bridge/cut more (smoother grades, different character). Lower-priority; do after A/B.

---

## 5. Hard constraints — keep these gates green (`npm test`, 23 gates)
`graph-topology.mjs` (8 checks): REACHABILITY, WINDOW-INVARIANT, DIRECTION-VARIETY, SURFACE-SMOOTH,
FLAT-MERGES, **NODE-DEPARTURE** (edges leave toward neighbour — guards the wrong-side regression),
**NO-LOOPS** (no 360° spiral — guards the loop regression), **CROSSINGS-CULLED**. Plus the 21
rows-coupled gates (untouched as long as graph overrides stay graph-only) + `road-graph.mjs` (Delaunay/
Urquhart primitives). Window-invariance is NON-NEGOTIABLE (POIs will depend on it).

## 6. How to evaluate
- **Headless metrics harness** (build `RoadSystem(seed,{...RANGER_PARAMS,roadNetworkMode:'graph',<knob
  overrides>})`, `r.update(center)`, then inspect `r._network`): the session used these signals —
  *turning angle* per edge (windiness ↑ good, but >200° = a loop = bad), *chord-deviation* (off-chord
  bow; some = windy, lots = overshoot), *routed-length / chord ratio* (detour), *crossing count*,
  *overshoot edges* (route past their node). Re-derive these one-liners; they make tuning fast.
- **In-sim (the real judge — USER-CHECK):** `npx serve .`, GUI → Roads → Network Mode = `graph`, drive +
  fly. Toggle the **2D map (key M, FEAT-16)** to read topology. Compare windiness to `rows`.
- **Headless map screenshot recipe** (used all session): temp-flip `roadNetworkMode` to `graph`, run a
  static server, drive Chrome via CDP (node built-in WebSocket, `--use-angle=metal`), dispatch key `m`,
  `Page.captureScreenshot`. (Script was in the session scratchpad — rebuild from this recipe or
  `reference_inbrowser_verify_cdp`.)

## 7. Deferred (not this stage)
- **POIs** — place RANDOM ALONG EDGES by arc-length, skipping a margin around nodes (so they're not all
  at intersections). User-decided. Depends on window-invariance holding.
- **Dead-end thinning** — only if ~45% spurs at 640 m isn't enough once driven.
- **T/X secondary-node promotion — DROPPED** (user: low value; crossings cluster at real nodes; we cull
  them instead).

## 8. Key files
`src/road.js` — `_routeOptsBetween` (~1556, ADD graph weight overrides here), `_buildUrquhart`,
`_assembleGraphEdges`, `_cullCrossings`, `_streamNetwork`. `src/road-carve.js` — `arcPrimitiveConnect`
(search + terminal; the goalBlend/overshoot work; ROUTE SYNC mirror). `data/ranger.js` — knobs.
`src/debug.js` — Roads GUI. `test/graph-topology.mjs` — the graph gate. Memory:
`project_feat13_v2_foundation` (full blow-by-blow).

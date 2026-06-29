# Road Network — session handoff (2026-06-28) — for a fresh context

**Status:** graph topology (FEAT-13) is a working *first draft* behind a toggle, all gates green, but the
network geometry is not nice enough to keep. The lattice-graph foundation produces structural artifacts
(below) that tuning can't fix. This doc summarises what's built, the standing problems + their root
causes, and proposes the major revision for the next context. **Nothing is committed.**

---

## 1. What was built this session (uncommitted)

The road work happened in layers. Steps 1–2 are solid and worth keeping; the graph mode is the draft
under review.

### Crossing classifier + flat at-grade junctions (Steps 1–2, KEEP) — 22 gates green
- `road.js _detectJunctions()` reworked from a dormant O(N²) rescan into a **bounded tile-bucket
  classifier** (Design D, once-per-build, identity-cached, self-crossing aware). Emits classified
  crossing records via `crossingList()`: `{point, runA/segA/arcA/yA, runB/segB/arcB/yB, dY, angle,
  selfCrossing, kind, under, over}`. `kind ∈ {NEAR_PARALLEL (angle<roadCrossAngleMin), AT_GRADE
  (dY≤roadCrossMergeDY), GRADE_SEP (dY>)}`. `_segXZ`→`_segCrossParam` (now returns t,u).
- **Mid-span AT_GRADE flatten:** `_applyMidspanJunctionBlend` eases both crossing strands → shared
  `node.nodeY` (camber→0), indexed in `_crossingsByRun` (post-pass over `_detectJunctions`). Tapers to 0
  at run endpoints (else it breaks C0 with the continuing run — that was a real bug). Propagates to
  ribbon mesh + physics + carve via `_resolveRoadSurface` → **mesh==collision free** (QUAL-07 held).
- **Junction-Y fix:** junctions were collapsing to the terrain valley floor (anchors gradient-descend to
  minima). `_anchorJunctionGradeY(mx,mz)` now returns the **average incident ROAD grade**, not terrain;
  `_runEndpointJunctions` uses it. Mid-span node.nodeY averages ALL strands.
- Pad mesh (`road-mesh.js buildJunctionFootprint`) re-enabled, gated to `node.kind==='AT_GRADE'`.
  `roadJunctionFootprints` default true (296 ms stall gone — classifier bounded+cached).
- Gates: `test/crossing-classifier.mjs`, `test/junction-atgrade.mjs`.

### FEAT-13 graph topology (the DRAFT under review)
- `roadNetworkMode: 'rows' | 'graph'` toggle (`data/ranger.js`, default 'rows' so all 21 rows gates pass
  untouched). GUI: **Roads** folder → Network Mode / Graph Connectivity / Graph Diagonals / Graph Flat
  Merges / Graph Earthwork Cap.
- **Run identity generalised:** every `this._network` entry now carries `cellA`/`cellB` (the two anchor
  cells); the ~8 `runKey.indexOf(':')` parse sites read those (no string parsing). Rows + graph share
  one path.
- **Generator** (`_assembleGraphEdges`, graph branch of `_streamNetwork`): edges chosen by
  `_graphEdgesFrom(mx,mz)` = hashed spanning-forest parent (downhill in `seedFor(seed,'roadgraph',mx,mz)`
  priority) + root-chain to lowest neighbour + seeded stitch edge (`roadGraphExtraEdgeProb`), over
  `_graphNB()` (4-neighbourhood default; `roadGraphDiagonals`→8). Canonical key `g:c1:c2`, dedup, skip
  degenerate (merged-coincident) edges. Per-edge routing (`_edgeRouteSpec`/`_edgeCenterline`), heading
  `_edgeTerminalHeading(at,toward)` (per-EDGE direction — a per-cell heading made edges leave junctions
  parallel), grade STANDALONE (`_gradeEdgeInPlace(pts, capOverride)`), `warmRoutes` graph branch.
- **Junctions** degree-based: `_graphAnchorDegree` (via `_graphIncidentCells`); `_runEndpointJunctions`
  → {is:deg≥2 reconcile grade, flatCamber:deg≥3}; `_applyJunctionBlend` split into fG (grade) + fC
  (camber) so degree-2 pass-throughs keep banking.
- **Flat-merge tuning pass** (last, in response to "yucky" feedback): `roadGraphFlatMerges:true` (force
  every crossing AT_GRADE, no dynamic overpasses), `roadGraphDeviationCap:2` (low earthwork float →
  gentle flat merges; pure terrain-follow made near-parallel edges step on slopes, so earthwork-on-low-cap
  is the sweet spot), `roadGraphExtraEdgeProb:0.55` (→88% one component).
- Gate: `test/graph-topology.mjs` (reachability/no-orphans, window-invariance, direction-variety,
  step-free surface, flat-merges/no-overpass) — 5 checks green.

### Headless numbers (seed 6, graph mode, current params)
~80 nodes, 4-neighbourhood, 88% in largest component, 0 collision steps, GRADE_SEP=0, endpoint float
~3.7 m median, direction entropy ~2.0 (varied). Validated; but in-sim it's not nice (§3).

---

## 2. Current graph-mode params (`data/ranger.js`, all USER-OWNED + GUI sliders)
`roadNetworkMode` 'rows' · `roadGraphFlatMerges` true · `roadGraphDeviationCap` 2 ·
`roadGraphExtraEdgeProb` 0.55 · `roadGraphDiagonals` false · (+ classifier: `roadCrossMergeDY` 4.5,
`roadCrossAngleMin` 12). Rows-mode unchanged (deviationCap 8, earthwork window 120, etc.).

---

## 3. Standing problems (user in-sim feedback — the reason for a revision)

### User's feedback, in their own words (2026-06-28, graph-mode in-sim)
- "roads are entering intersections from the **'wrong side'** a lot. I don't think we should **'permit'
  crossings that aren't intersections**, and I think this should help to **untangle** the network."
- "many intersections are two roads meeting at a **very shallow angle** almost like **parallelism is sign
  flipping** (both roads exit the intersection at almost the same vector)."
- "there are **no 'T' intersections**. So many intersections (esp in the forest) are made when a new road
  is built **leading into an existing road at a 90 degree angle** — we don't have them at all."
- "lots of roads **run parallel through the same terrain** likely because it's low cost. We should either
  (a) replace a parallel section with a single road with intersections at both ends, or **(b) don't allow
  roads to generate where a road already exists. Sparse is probably good so leaning (b).**"
- "the roads **vertically diverge significantly from the centerlines** from which they are created,
  especially on steep hills. Not so much a problem on its own but **maybe a symptom**."
- "there are **almost no switchbacks**. **Something we changed is penalizing steep roads and tight turns.**"
- (earlier) "**merges should not be overpasses, they should be flat intersections.** Leave room for roads
  to pass over and not merge — but that's better handled by **prefab intersections** (cloverleaf etc.); I
  don't want to work on prefabs yet, maybe ever." (→ done: `roadGraphFlatMerges`.)
- "We're entering **bandaids on bandaids** territory. Graph is a good first draft but we need **major
  revision** to get it looking nice."

> ⚠️ **REGRESSION — switchbacks were LOST in the graph/flat-merge work.** Rows mode (and the earlier road
> system) produced switchbacks on steep terrain; graph mode does not. Root cause (verified, §1/§7):
> `roadGraphDeviationCap:2` stops an edge from cutting/filling to a gentle grade AND `roadWTurn:8000`
> makes a switchback loop too expensive, so steep node-pairs build a steep straight edge instead. This is
> a behaviour we changed — not an inherent graph limitation — so it should be recoverable via §5C.
> **Once the suspected fix (§5C) is applied it does NOT need a separate automated re-test — but it is a
> USER-CHECK item: flag it for the user to eyeball in-sim (it's a feel/visual judgment, not a gate).**
> Good place to check: **near spawn on the `lone-pine` seed** (steep terrain — should switchback).

These are **structural to the lattice-graph model** (except the switchback regression, which is routing
params). **Reference screenshots + any captured p-dumps in `Logs/6-28/`:**
- `intersection-wrongside-{1,2,3}.png` — #1 tangled / wrong-side crossings
- `intersection-shallow-angle.png` — #2 shallow-angle pseudo-intersection
- `90deg-near-miss-termination.png` — #3 two roads meeting ~90° but terminating near each other (no T)
- `parallel-roads-same-terrain.png` — #4 parallel redundant twins
- `road-diverges-from-centerline.png` — #5 surface diverges vertically from the cyan centerline
- `disconnected-mininetwork-trace.png` — #7 a small network not connected to the main one

The numbered list:

1. **Crossings that aren't intersections / "wrong side" entries.** Edges are routed *independently*
   between grid cells, so they cross mid-span at arbitrary points and meet at bad angles. User: *don't
   permit crossings that aren't intersections* — i.e. the network should be **planar** (edges meet only
   at nodes). This alone would "untangle" the network.
2. **Shallow-angle "intersections" (parallelism sign-flipping).** Two edges meet at a near-0° angle —
   both leave the node along almost the same vector. Reads as parallel, not an intersection.
3. **No T-junctions.** Edges connect ONLY at shared grid anchors (`cellA`/`cellB`). A road can never end
   INTO the middle of another road. Real forest networks are mostly T's (a spur joining a through-road
   at ~90°). We have zero. **Structural — needs mid-edge connection points (subdivision).**
4. **Parallel redundant roads through the same terrain** (low-cost twins). User leans **(b) don't allow
   a road where a road already exists** (sparse) over (a) merge-into-one. Today only *degenerate*
   (coincident-anchor) edges are dropped; near-parallel duplicates are NOT (the rows redundant-drop is
   guarded rows-only). The flat-merge pass only hid the *physics step*, not the visual twin ribbons.
5. **Roads vertically diverge from their centerline on steep hills** (cyan line vs road surface). Likely
   a deviationCap-clamp / grade-vs-carve symptom; possibly downstream of the steep-edge problem (#6).
6. **Almost no switchbacks.** `roadGraphDeviationCap:2` stops an edge from filling/cutting to a gentle
   grade, AND `roadWTurn:8000` makes a switchback loop too expensive, so steep node-pairs just build a
   steep straight road. Real switchbacks need the router to PREFER a longer curvy path on steep ground.
7. (Carried over, still open) **dead-end stubs** (~33/80 leaves), small **disconnected pockets**, and
   **spawn lands on a messy spot**.

---

## 4. Root diagnosis

The current model is a **lattice graph**: anchors fixed on a 256 m grid, edges between neighbour cells,
each edge routed independently. That independence is the disease — it produces mid-span crossings (#1),
shallow convergences (#2), parallel twins (#4), and no mid-edge T's (#3). Tuning grade/flatten only
treats symptoms. **A natural, untangled, sparse network with real T/X intersections needs a different
generation model**, while still being **window-invariant** (a pure fn of seed+coords, streamable — the
non-negotiable constraint that rules out stateful incremental "road growth").

---

## 5. Proposed moves for the next context (the major revision — DECIDED 2026-06-28)

**Goal:** a window-invariant road network with real route choice (multiple A→B paths), varied-angle real
T/X intersections, and no "bad maps" — keeping the Steps 1–2 classifier/flatten/junction machinery (good).

**Decisions locked in the 2026-06-28 design pass** (supersedes the earlier draft of this section):

- **All v2 work targets the existing `roadNetworkMode: 'graph'` branch.** The `rows`↔`graph` selector
  (`data/ranger.js`, GUI Roads folder) already exists; `rows` STAYS the default + untouched fallback while
  v2 is built and validated. Only flip the default / retire rows once graph is signed off in-sim. (So the
  21 rows-coupled gates keep passing untouched throughout — no migration until the very end.)
- **NOT dendritic.** This is a game, not a forest sim. Driving a real branch-and-dead-end forest network
  isn't fun — the player wants *options* for getting from A→B. So we keep the proximity graph's **cycles**
  (they ARE the route choice), we do **not** thin it down to a spanning tree/forest.
- **Base graph = URQUHART over a BLUE-NOISE anchor set.** Urquhart (Delaunay minus each triangle's longest
  edge) is the middle density: more cycles/route-options than RNG, but still keeps SOME degree-1 leaves
  (we WANT those — see POIs). Blue-noise anchors (min-spacing, no rows) replace the `_protoAnchor`
  perturbed grid, because parallel twins (#4) are an **anchor-distribution** problem, not an edge-rule one
  (a grid has parallel rows → any edge rule inherits ladder/grid parallelism; blue-noise has no rows).
- **Connectivity is FREE and GUARANTEED.** Urquhart ⊇ RNG ⊇ Euclidean MST, so the base graph is one
  connected component spanning every anchor — *by theorem*, even though we generate it locally. Not
  thinning to a forest is what preserves this (a forest can disconnect; the abandoned dendritic plan was
  the source of the old "bad map" reachability risk). This resolves #1 and #7 together.
- **Guarantee model = connected base + safe-prune + POI filter** (Q2 answer = option 1). Pruning may only
  remove an edge/leg that still has a *local detour* (a bounded local cycle test) → reachability is
  preserved. POI placement is a separate window-invariant local filter (see §8) that tags node roles and
  skips locally-bad nodes — guarantee-by-construction, never validate-and-reroll (reroll breaks
  invariance; "bad" isn't locally detectable anyway).

### A. Base edges: Urquhart over blue-noise anchors
- **Anchors → blue-noise / Poisson-disk**, window-invariant (a deterministic relaxed/Halton-style sample
  per macro-cell, reconstructable over band + margin). Kills the parallel-row source of #4.
- **Edges → Urquhart** (sparse planar subgraph of Delaunay; **MST ⊆ RNG ⊆ Urquhart ⊆ Gabriel ⊆ Delaunay**
  is the density dial if Urquhart turns out too sparse/dense in-sim). Planar-abstract ⇒ designed meetings
  are node intersections; varied angles from irregular anchor positions (#2); connected by construction
  (above). Membership of edge (A,B) is **local** (depends on the Delaunay neighbourhood of A,B — bounded)
  ⇒ window-invariant; **verify the bounded neighbourhood is provably sufficient** (shared open Q).
- **Residual parallels → NEAR_PARALLEL-driven safe-prune.** Even Urquhart can leave two strands running
  close (a ladder remnant); the classifier's **NEAR_PARALLEL** kind (two strands within d over a span) is
  the bounded/local form of the user's "accumulated proximity to a road" weight (a *global* distance-to-
  road field would break invariance; the bounded scan does not). Prune the lower-priority strand **only if
  the safe-prune local-detour test passes** (else keep — connectivity wins over sparseness).

### B. T/X intersections = PROMOTED secondary nodes (the "T for free", unified)
Routed centerlines still cross even though the Urquhart graph over anchors is planar (**planar-abstract ≠
planar-routed**: arcs/switchbacks/earthwork swing the rendered line across a neighbour). Those
*unanticipated* crossings are not a defect to flatten — they are where intersections naturally want to be.
Two node classes result:
- **Primary nodes** = blue-noise anchors (designed Urquhart intersections, degree 2–4).
- **Secondary nodes** = promoted routed-crossings (emergent). The classifier (`_detectJunctions` /
  `crossingList`) is repurposed as the **secondary-node generator** (not a band-aid).

Mechanic, one rule for everything:
1. Classifier catches a routed crossing at point P.
2. **Promote P to a real node** — subdivide both edges at P. The existing Steps 1–2 mid-span machinery
   (`_applyMidspanJunctionBlend`, shared `node.nodeY`, mesh==collision) already does the surface work. A
   bare promoted crossing is a 4-way **X**.
3. **Apply the same safe-prune rule** — and this is the unification: the connectivity-safe-prune test
   ("only drop a leg if its far end keeps a local detour") *also decides T-vs-X*. Redundant leg → prune →
   X collapses to a **T (3-way)**; pruning would strand the far end → keep → stays an **X**. **One rule,
   two payoffs: reachability guarantee + free T-junctions.**
4. Tag the secondary node POI-eligible (minor / one-off — see §8).

T's are therefore **emergent**, never *searched-for* (that was the old §5B's hard, hard-to-make-invariant
part — now deleted). New build item: a secondary node sits mid-edge, so it needs a **window-invariant node
identity** = a deterministic fn of the two edge keys that created it (slots into the generic `cellA/cellB`
identity scheme alongside anchor-nodes). Bounded + deterministic ⇒ invariant.

### C. Switchbacks (routing, semi-independent)
Re-balance so steep edges switchback: raise `roadGraphDeviationCap` a bit (let the design line ease the
grade), and/or lower the effective `roadWTurn` for graph edges so a longer curvy/switchback path beats a
steep straight one. The router (`arcPrimitiveConnect`) already CAN switchback via `roadWOver` when grade
> `maxRoadGrade` — verify why it isn't and tune the grade-vs-curve balance. Also investigate the
centerline vertical-divergence (#5) — likely the same steep-edge/clamp interaction.

### D. Keep / reuse
The classifier (`_detectJunctions`/`crossingList`) — now the **secondary-node generator** — the AT_GRADE
mid-span flatten, the junction-average-Y reconciliation, per-edge routing/grade, generic `cellA/cellB`
node identity, and the gates all carry over; they operate on `this._network` generically. **Replaced:**
(1) the anchor source (`_protoAnchor` perturbed grid → blue-noise sampler), (2) edge-SELECTION
(`_graphEdgesFrom`/`_assembleGraphEdges` lattice-neighbour spanning-forest → Urquhart over Delaunay
neighbourhood), (3) the crossing resolver gains a **safe-prune / promote-to-secondary-node** branch
(connectivity-aware leg pruning → T-vs-X). Rows-mode stays the fallback until graph is signed off, then
flip the default + migrate the 8 row-coupled gates + retire rows-mode.

### Open questions for next context
- **Blue-noise sampler** that is window-invariant AND gives good anchor spacing — relaxed Poisson-disk per
  macro-cell vs jittered-grid-minus-rows; verify bounded reconstruction.
- **Bounded-neighbourhood sufficiency** (the one proof that gates everything): is a bounded Delaunay/window
  neighbourhood provably enough for invariant Urquhart membership AND the NEAR_PARALLEL prune span AND the
  safe-prune local-detour test AND the secondary-node promotion? All four share this question.
- **Urquhart density** right in-sim? Dial along MST⊆RNG⊆Urquhart⊆Gabriel⊆Delaunay if not.
- **Switchbacks:** purely routing params (`roadGraphDeviationCap` / `roadWTurn` / `roadWOver` rebalance),
  or does short-edge structure prevent them and need intra-edge switchback support? (Plus the centerline
  vertical-divergence #5, likely the same steep-edge/clamp interaction.) USER-CHECK item (see §3 warning).

---

## 6. Key files / functions
- `src/road.js` — `_streamNetwork` (rows loop + `_assembleGraphEdges` graph branch), `_graphEdgesFrom` /
  `_graphIncidentCells` / `_graphAnchorDegree` / `_graphNB` (REPLACE these for revision A), `_edgeRouteSpec`
  / `_edgeCenterline` / `_edgeTerminalHeading` / `_gradeEdgeInPlace` (reuse), `_detectJunctions` /
  `_recordCrossing` / `_applyMidspanJunctionBlend` / `_applyJunctionBlend` / `_anchorJunctionGradeY`
  (reuse), `_protoAnchor` (the lattice — unchanged).
- `data/ranger.js` — road knobs (§2). `src/road-mesh.js` — `buildJunctionFootprint`. `src/debug.js` —
  Roads GUI folder.
- Gates: `test/{crossing-classifier,junction-atgrade,graph-topology}.mjs` + the 19 prior. `npm test`.
- Memory: `project_crossing_classifier.md` (full detail), `project_road_network_topology.md`.

## 7. How to evaluate
`npm test` (22 gates). In-sim: GUI → Roads → Network Mode = `graph` (live re-stream). Drive/fly; capture
p-dumps at bad spots (`node test/replay.mjs <capture>`). **`Logs/6-28/` holds the user's feedback
screenshots (named by problem) + any p-dumps dropped there — start by looking at those.** Headless
reconstruction:
`new RoadSystem(6, {...RANGER_PARAMS, roadNetworkMode:'graph'})` then `road.update(...)` + inspect
`road._network` / `road.crossingList()`.

---

## 8. Forward-looking: POIs / mission reachability (DECIDED 2026-06-28)

Intent: later populate the network with POIs the player visits regularly for missions — and **no player
should get a "bad map."** With the §5 decisions (connected Urquhart base, no tree-thinning) the
reachability worry that dominated the first draft of this section is **largely designed out** — Urquhart is
one connected component by construction, so "unreachable POI" can only come from unsafe pruning (forbidden:
safe-prune keeps a local detour) or from placing a POI on a genuinely-bad node (handled by the filter
below). The remaining model:

**POI placement = a window-invariant LOCAL quality+role filter** (not a global pass). It may only use
*local* metrics (degree, local-cycle membership within a window, local detour) — a true global "is it in
the giant component" test isn't invariant — but with a connected base, "locally well-connected" is a
reliable proxy for "in the main mass." Roles map straight onto graph structure (no separate system):

| Node | Source | POI role |
|------|--------|----------|
| Primary, degree ≥3, on a local cycle | blue-noise anchor | **recurring hub** — frequent missions, loop access (no out-and-back tedium) |
| Secondary (promoted crossing / emergent T) | routed-crossing promotion (§5B) | **minor / one-off "discovered" site** |
| Leaf (degree-1, incl. pruned-to-stub) | Urquhart tip / safe-prune stub | **out-and-back one-off** (user #2 — a feature, realistic; detect = degree-1 / single-bridge spur) |

Design stance (from the 2026-06-28 discussion):
- **#2 out-and-backs are wanted** — keep Urquhart's leaves; tag them for one-off / dead-end missions.
- **#3 detour inflation is fine in moderation** — do NOT optimize toward shortest paths; Urquhart's natural
  unevenness gives route variety. That's the point of choosing route-choice over a tree.
- **#5 "prune the POI, not the map"** — if a candidate node fails the local quality test, simply don't place
  a POI there (and/or a deterministic local connector to the nearest backbone node, which stays invariant
  as just another pure-fn edge). The guarantee lives in placement, the network stays organic.
- **Invariance is now load-bearing, not cosmetic:** a POI visited repeatedly must present the SAME road
  every approach. The §5 bounded-neighbourhood-sufficiency proof (and the secondary-node identity) MUST be
  nailed before POIs ship, or a mission road could change between visits = serious bug.

**Deferred (not now):** the two-tier trunk+detail option and the Gabriel/denser variants were considered
and set aside — revisit only if the connected-Urquhart base proves too sparse on route-choice or too weak
on reachability in-sim.

# QUAL-21 Stage 1: shared per-node headings + QUAL-22 ticket

## Context

QUAL-21 (stroke routing) planning is complete. The Stage 0 spike (committed `bf25e79`) proved
window-invariance; the user then pivoted the design twice, both locked in
`.planning/research/STROKE-ROUTING-DESIGN.md`:

1. **Maximal pairing** (2026-07-24): every node pairs as many legs as it can — deg-2 pass-through,
   deg-3 through + T-branch, deg-4 two crossing through-roads. No thresholds/vetoes/escape hatches.
   Pair score = bearing deviation + grade penalty (grade picks WHICH pair, never whether).
2. **Revised mechanism §0** (zoom-out finding, already folded into the design doc this session):
   strokes are never ROUTED as units. Every edge already routes with prescribed terminal headings
   (`startHeading`/`goalHeading` in `_edgeRouteSpec`, road.js:2252-2253) that are just its own chord
   bearing — the deg-2 kink is a data disagreement, not architecture. Stage 1 = give both edges of a
   through-pair the SAME canonical heading at their shared node (bearing between the two paired
   neighbour sites). Tangent continuity by construction; per-edge routing, caches, worker, and
   window-invariance untouched.

Locked sub-decisions: κ²-only for bend sharpness (no min-radius param); deg-4 node height = existing
junction blend (averaging refinement deferred — blend already reconciles); tight radii judged in the
A/B drive. `roadSoloReuse`, corridor heuristic, valley-snap already shipped — no router cost levers
to add.

## Step A — docs (finish the user's current ask)

1. **Create `.planning/todos/pending/qual-22-terrain-cost-urquhart.md`** — the shelved "topology
   from cost" idea (user: "document 4. as a ticket"):
   - id QUAL-22, type qual, status open, severity minor, relates FEAT-13/QUAL-21.
   - Idea: `urquhartEdges` (src/road-graph.js) prunes each Delaunay triangle's longest edge by
     EUCLIDEAN length — terrain-blind. Prune the most-EXPENSIVE edge instead, cost = cheap line
     integral of the coarse height field along the chord (pure fn of sites + seed → deterministic,
     window-invariant). Roads then connect where connecting is cheap; mountain crossings emerge only
     without alternatives — topology-level terrain character (aligns with emergent-over-injected).
   - Connectivity survives: Urquhart ⊇ MST holds per weight function (prune max-weight edge of each
     triangle under the SAME weight).
   - Blast radius (why it is NOT a QUAL-21 rider): re-shapes the entire network → route-bundle
     regen, reachability/gate re-baseline, full feel pass. Do after QUAL-21 lands.
2. Commit docs: the already-edited STROKE-ROUTING-DESIGN.md §0 + the new ticket
   (`docs(QUAL-21/22): ...`).

## Step B — Stage 1 implementation (behind `roadStrokeRouting`, default off)

### B1. Pairing core (src/road-graph.js)
Replace `formStrokes`' single-best-pair block with GREEDY MAXIMAL pairing and export the per-node
core the runtime needs:

- `throughPairsAt(nodePos, legs)` (new, pure, ~30 lines): legs = [{key, x, z, h}] of neighbour
  sites; returns pairs greedily by score = bearing deviation from straight (deg) +
  `gradePenaltyWeight` · |slopeIn − slopeOut| (slopes from site heights/chord lengths, h in metres).
  Deterministic lexicographic tie-breaks (Stage 0 pattern). No thresholds — pair while ≥2 legs
  remain.
- `formStrokes` keeps its chain/loop/split machinery but delegates pairing to the same core
  (spike-only consumer now; keep for reporting).

### B2. Heading override (src/road.js)
- New cached helper `_throughHeadingAt(nodeId, edgeOtherId)`: build the node's alive-neighbour leg
  list from the persisted graph (`this._proto.graph.adj` — NOT the streaming band check; fall back
  to an edge-centred `_buildUrquhart` neighbourhood like `_edgeDeps` does, so it stays
  window-invariant), run `throughPairsAt`, and if the edge toward `edgeOtherId` is paired with
  neighbour P, return `atan2` bearing P→other (the through chord) oriented for that terminal;
  otherwise null (branch leg → today's behaviour).
- In `_routeOptsBetween` (road.js:2252-2253): when `this._params.roadStrokeRouting` is on, replace
  `startHeading`/`goalHeading` chord bearings with the through-heading where one exists (mind the
  existing `+ Math.PI` arrival-direction convention at the goal end).
- IMPORTANT invariance note: heading must be a pure fn of (seed, params, node neighbourhood) —
  identical from any window and identical between worker prewarm and sync fallback (it rides the
  route spec, which both paths share — `_edgeRouteSpec` is the single source, so this is free).
- `roadStrokeRouting` param: add to data/ranger.js default `false` + a debug-menu toggle in the road
  folder (feedback_phase_housekeeping). It is a `road*` param → it enters `routeCacheSig`; verify
  the bundled default-world route cache still loads with the flag OFF (sig unchanged when the key is
  absent/false — check how routeCacheSig serializes; if adding the key alone changes the sig, regen
  the bundle in the same commit).

### B3. What is NOT touched in Stage 1
No carve/mesh/junction-blend/connector changes: with matched tangents the deg-2 connector
(`roadJunctionKinkDeg: 9` admission, road.js:4055) no-ops naturally when the kink < 9°. Deletion is
Stage 2, after the user's A/B drive.

## Verification

1. `node test/stroke-spike.mjs` still green (Stage 0 regression: formStrokes output with explicit
   threshold opts unchanged; add a maximal-pairing stats line — bend-angle distributions incl.
   worst-of-two at deg-4 — for the drive discussion).
2. Flag OFF: `npm test` (affected gates) must be byte-stable — no route changes.
3. Flag ON (headless): run the key gates with `roadStrokeRouting: true` — `graph-topology`
   (window-invariance D-16), `centerline-curvature`, `road-minradius`, `road-smoothness`,
   `shoulder-lateral-continuity`, `carve-mesh-smoothness`, `road-tunnel`, `windiness-metrics`,
   `road-character`. Gates read RANGER_PARAMS, so run via a small env/param override the same way
   the spike overrides P (`{...RANGER_PARAMS, roadStrokeRouting: true}` in a scratch runner if a
   gate has no param hook).
4. Measure the deg-2 kink with flag ON: count deg-2 nodes whose heading kink exceeds
   `roadJunctionKinkDeg` (should be ≈0 → connector no-ops). Report self-clear repair count vs the
   Stage 0 baseline (18) via the scStats hook.
5. User A/B drive (flag toggle in debug menu) — sign-off gate for Stage 2.

## Sequencing

Step A (docs) → B1+B2 (+ mirror nothing: no ROUTE SYNC edits needed — heading logic lives in
road.js spec-building, outside the synced router) → verification 1-4 → hand to user for the drive.
Commit at boundaries: docs, then Stage 1 code+gates.

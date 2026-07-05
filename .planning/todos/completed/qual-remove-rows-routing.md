---
id: QUAL-12
type: quality
status: closed
severity: major
opened: 2026-07-04
closed: 2026-07-04
source: user-observation (in-sim 2026-07-04 — graph network now equals or beats rows)
relates: FEAT-13 (shipped graph as default, kept rows behind the toggle), QUAL-03 (road.js simplification)
tags: [refactor, tech-debt, road, dead-code]
---

## RESOLUTION (2026-07-04)

Rows removed; the URQUHART/blue-noise graph is the sole topology. **Provably geometry-neutral** — the
graph network is byte-identical before/after (graph-topology GRAPH-SURFACE-SMOOTH, road-smoothness seed-6,
and pond-route-around all report identical numbers to the pre-change baseline). Zero product regressions.

Done: `roadNetworkMode` + every mode branch deleted (road.js `_streamNetwork` rows loop + redundant/
degenerate edge-drop block, `_routeOptsBetween`, `_edgeTerminalHeading`, `_runEndpointJunctions`,
`_detectJunctions` forceFlat, warmRoutes, `_nodePos`, cull guard). Deleted dead helpers `_protoAnchor`,
`_protoAnchorRaw`, `_protoAnchorHeading`, `_protoConnectCenterline`, `_connRouteSpec`, `_buildRowCenterline`,
`_isJunctionNode`, `_anchorJunctionGradeY`, `_anchorNodeStrands` + consts `MERGE_DROP_W`/`PROTO_GRADE_PAD`.
main.js spawn probe unconditional; map2d/water call sites + comments updated. ranger.js dropped
`roadNetworkMode` + `roadNodeMergeRadius`. debug.js: Network Mode toggle gone, dead `roadWAlt`/`roadWTurn`/
`roadNodeMergeRadius` sliders removed, `"Graph "` stripped from the 12 graph slider labels.

**Discovery during execution:** the headless gates' `TEST_PARAMS` never set a mode → they were silently
testing the *removed rows path* while the game shipped graph. So removing rows flipped ~5 gates onto graph.
Handled per P4 (keep only novel coverage):
- `centerline-curvature.mjs` → ported to graph (iterate the network's stored edge centerlines).
- `crossing-classifier.mjs` → ported to graph (cull-off for a crossing sample; `segOf` reads `cellA`;
  kept broadphase-==-bruteforce + once-per-build identity; dropped the rows class-span + dup-invariance).
- `road-minradius.mjs` → dropped the 3 rows-era place-dump captures (Fixture 1's whole-graph sweep covers it).
- `junction-atgrade.mjs` → **deleted**; its one novel check (node sits at mean incident road grade, not the
  terrain floor — the ~10 m hump regression) folded into `graph-topology.mjs` as JUNCTION-AT-ROAD-GRADE
  against `_graphJunctionGradeY`.
- `camber-continuity.mjs` → **retired**: it guarded BUG-19 (cross-run camber *seeding* reset), which is
  architecturally impossible in graph mode (camber is per-edge, slew-limited within the edge — no seeding).

`npm test`: 26/29 green. The 3 reds (road-smoothness seed-6, graph-topology GRAPH-SURFACE-SMOOTH, pond-
route-around) are **pre-existing on main** (deferred T/X promotion; FEAT-17 pond residual), byte-identical
to baseline — not caused by this change.

---

# QUAL-12: Remove the `rows` road-routing system — graph is the sole topology

## Why

FEAT-13 shipped the URQUHART/blue-noise **graph** network as the default (`roadNetworkMode: 'graph'`,
commit e5ff1ef) but deliberately left the historical parallel-E-W-**rows** generator in place behind the
`roadNetworkMode` toggle as a comparison/fallback baseline ("23 gates green, rows untouched, still
default" → later flipped to graph default). The graph network now reads as good or better than rows in
sim, so the rows path is pure dead weight: a second full generation code path, its own router-weight
sliders, and rows-specific gates that no longer guard shipping behaviour.

Removing it directly serves QUAL-03 (shrink/simplify `road.js`): delete a whole parallel generation
path + its corrective machinery (redundant/degenerate edge drop, macro-anchor node merge) that graph
mode never uses.

## Scope

**`data/ranger.js`** — delete `roadNetworkMode` + its doc block; delete `roadNodeMergeRadius` (only the
rows macro-anchor merge consumed it). KEEP `roadWGrade`/`roadWOver`/`roadWDist`/`roadValleyDepthCap`
(graph's router reads these via `P.*`) and `roadMergeBand` (graph's degenerate-edge test uses it).

**`src/road.js`** — collapse every `(roadNetworkMode ?? 'rows') === 'graph'` branch to graph-only:
`_streamNetwork` (delete the rows row-assembly loop + the rows-only redundant/degenerate edge-drop
block), `_routeOptsBetween` (inline the graph weights), `_edgeTerminalHeading`, `_runEndpointJunctions`,
`_detectJunctions` (`forceFlat`), `warmRoutes`, `_nodePos`, the crossing-cull guard. Then delete the
now-dead rows-only helpers: `_protoAnchor`, `_protoAnchorRaw`, `_protoAnchorHeading`,
`_protoConnectCenterline`, `_connRouteSpec`, `_buildRowCenterline` (already caller-less), `_isJunctionNode`,
`_anchorJunctionGradeY`, `_anchorNodeStrands`, and the `MERGE_DROP_W` / `PROTO_GRADE_PAD` constants.

**`src/main.js`** — the `_graphSpawn` conditional becomes unconditional (sparse-network spawn probe).

**`src/map2d.js` / `src/water.js`** — drop the `_protoAnchor` fallback + `roadNetworkMode`-mirror comment;
fix the `_protoAnchorRaw` reference in the water.js comment.

**`src/debug.js`** — remove the `Network Mode` toggle; remove the two now-dead rows sliders (`roadWAlt`
"wAlt", `roadWTurn` "Curve Penalty") + `roadNodeMergeRadius` slider; strip the `"Graph "` prefix from
the 12 graph slider labels (frees the wAlt / Curve-Penalty names for the graph weights).

## Gates (P4 decision — keep only novel coverage, port to graph)

Three gates touched rows explicitly. Audited each for novel value:

- **`crossing-classifier.mjs`** — the broad-phase-vs-brute-force correctness check on `_detectJunctions`
  is the ONLY guard on that (still-live-in-graph) classifier. **Port to graph** (`roadGraphCullCrossings:
  false` for a crossing sample; `segOf` reads `entry.cellA` instead of parsing the `mz:mx` runKey; keep
  BROADPHASE-EQ-BRUTEFORCE + ONCE-PER-BUILD-IDENTITY; drop the rows-specific class-span + cross-center
  dup checks — graph-topology covers invariance).
- **`centerline-curvature.mjs`** — exact primitive min-radius + D-16 descriptor byte-invariance at the
  RoadSystem source level. **Port to graph** (enumerate Urquhart edges via `_edgeCenterline`).
- **`junction-atgrade.mjs`** — the AT_GRADE mid-span flatten is a rows-era concern (graph culls
  crossings). Only the (d) node-sits-at-mean-road-grade regression (~10 m hump) is novel, and graph has
  the exact analog `_graphJunctionGradeY`. **Fold that one check into `graph-topology.mjs`; delete the
  file.** Update `run-all.mjs`.

## Acceptance

- `roadNetworkMode` and every rows-only code path/param/slider/gate are gone; `grep` finds no live
  `'rows'` reference in `src/` or the registered gates.
- Graph is the sole topology; in-sim behaviour is unchanged (it already routed graph by default).
- `npm test` green (rows gates ported/retired as above); no orphaned dead code.

# Stroke routing — design (Option 2)  ·  2026-07-23  ·  feature/router-perf

Status: **DESIGN — needs sign-off before any `src/` edit.** This re-architects the routing core and
touches the carve surface we just stabilized across three merges, so it does not start as cowboy edits.

Companion: `ROUTER-PERF-EXPLORATION.md` (where the 25 s goes; why Option 1 is closed).

---

## 1. The problem this attacks

Each Urquhart edge `g:<idA>:<idB>` is routed **independently** and graded **standalone**
(`_assembleGraphEdges` → `_edgeCenterline`, road.js:2614-2640; `arcOrigin:0` per edge). Nothing makes
two edges meeting at a shared node arrive with **compatible tangents or heights**. All the "fixing
intersections" machinery exists to reconcile that after the fact. Measured split: ~600 lines of genuine
routing search vs **~3,200 lines of junction/smoothing/crossing machinery (~40 functions, 5:1)**.

The single clearest artifact: a **deg-2 node is a road bending through**, but because its two edges are
routed independently, their tangents don't line up → the heading KINKS → the whole **deg-2 connector
subsystem** (`_buildDeg2ArcGeom`, `_connectorCarve`, `_buildDeg2Ribbon`, `_deg2ArcTiles`, ~370 lines
road.js + ~120 road-mesh.js) exists purely to paper a fillet arc over that kink.

## 2. The idea

Route **strokes**, not atomic edges. A stroke is a maximal chain of edges that a road naturally
continues along, routed as **one continuous curvature-bounded curve**, then split back into per-edge
runs so everything downstream is unchanged.

- **Stroke = a maximal path through the graph where, at each interior node, the incoming edge pairs
  with its straightest continuation.** Interior nodes of a stroke are "pass-through"; a stroke ends at a
  graph terminal (degree 1) or where no leg continues straight enough (the through-pair test fails).
- Route the whole stroke as ONE `arcPrimitiveConnect` curve from stroke-start anchor to stroke-end
  anchor (curvature-bounded, honest-grade, the exact same cost model).
- **Split the stroke curve back at each interior node into per-edge runs keyed `g:<idA>:<idB>`**, with
  `arcOrigin` set so each run's slice of the stroke keeps its identity. Downstream (carve, mesh, gates,
  `_resolveRoadSurface`) sees the same per-edge run map it sees today — **but now the two edges at a
  pass-through node share an exact tangent and one continuous grade, so there is no kink and no
  connector.**

### What this deletes (confidence-rated)

- **HIGH — the deg-2 connector subsystem (~490 lines).** A pass-through node is continuous by
  construction; `roadJunctionKinkDeg` deg-2 admission, `_buildDeg2ArcGeom`, `_connectorCarve`,
  `_buildDeg2Ribbon`, `_deg2ArcTiles`, and the deg-2 branch of the carve compose all go away. This alone
  justifies the effort as a quality/complexity win.
- **MEDIUM — junction corner cases at degree ≥3.** At a T/Y, the straightest two legs become a
  continuous through-stroke; only the branch(es) T into it. The fillet ladder shrinks from "reconcile N
  independent ribbons at random angles" to "meet a stem to a smooth through-road" — fewer corner
  strategies, and the pad-plane height fit is anchored by the through-stroke's single grade. Not a full
  deletion; a real simplification.
- **LOW / NOT claimed — the mid-span crossing detector (~350 lines) and BUG-25 cull (~260 lines).**
  Two strokes can still cross without a shared node, and strokes are still a shared-node windowed
  structure, so these likely **survive**. I am explicitly NOT promising to delete them. (Earlier memo
  overstated this; corrected here.)

Net honest estimate: **~500–900 lines deleted + a materially simpler junction path**, not the
1,500–2,000 the first-pass memo guessed.

## 3. The make-or-break constraint: window-invariance

The gate `test/graph-topology.mjs` asserts the **edge set + per-edge grade are identical from any two
streaming centers** over a shared box (D-16). Today this holds trivially because each edge is a pure
function of its site pair. Strokes span multiple edges, so we must prove a stroke's geometry is
**independent of the streaming window**. The design that preserves it:

1. **Stroke topology is a pure function of the graph** (site positions + Urquhart edge set), never of
   routed geometry or the window. The through-pair test uses **bearings between site positions**
   (window-independent), not routed tangents. So the *same* chain of edges forms the *same* stroke from
   any window. The Urquhart graph itself is already window-invariant (built locally, invariant by
   construction), so its degree/incidence are available identically everywhere.
2. **A stroke is routed from its canonical terminal anchors**, using the router's **pure world-fixed
   coarse-height sampler** (`_coarseH`) — which is defined everywhere, independent of which chunks are
   loaded. So the stroke curve is a pure function of (terminal anchors, graph, coarse height, params) →
   identical from any window, even if part of the stroke lies outside the visible window.
3. **Bound stroke extent so we never route the whole map.** A stroke ends at a graph terminal or a
   failed through-test; additionally cap it (e.g. `roadStrokeMaxLen` / max interior nodes) and **split
   at a canonical, window-independent point** (e.g. the lowest-id interior node past the cap) so long
   ridgelines don't force routing hundreds of edges to register one in-band edge. The split point being
   graph-canonical keeps invariance.

**This is the highest-risk part of the whole effort.** If stroke formation or the terminal/cap rule
turns out not to be cleanly window-invariant, Option 2 is in trouble. That is exactly why step 1 below
is a read-only spike that *measures* invariance before we change any routing.

## 4. What must still hold (character contract — unchanged)

Everything in `ROUTER-PERF-EXPLORATION.md §2`: honest-grade EMA pricing, `wAlt`/grade²/soft-cap/κ²/wDev
cost, **grade-yields-before-radius**, exact curvature-bounded centerline, Urquhart cycles, determinism +
window-invariance, intentional switchbacks, camber synced to curvature, collision == visual surface. All
existing gates must stay green: `centerline-curvature`, `road-minradius`, `graph-topology`,
`road-smoothness`, `shoulder-lateral-continuity`, `carve-mesh-smoothness`, `road-tunnel`, the culling
invariance gates, `windiness-metrics`, `road-character`.

Extra care: stroke grading must keep each per-edge run's grade **window-invariant** (the honest-grade
EMA currently runs per standalone edge; over a stroke it runs along the whole stroke — the EMA state must
seed from a canonical stroke start, not the window).

## 5. Perf angle (honest)

The headline cold-load number is already cut ×2.5–3.2 by the shipped corridor heuristic, and the
remaining floor is the **self-clear repair re-search**. Stroke routing's perf value:

- Fewer, longer searches (one per stroke vs one per edge) with shared corridor work.
- **Potentially fewer self-clear repairs** — a continuous stroke self-intersects far less than
  independent edges that cross near shared nodes, and the repair count is the documented dominant floor.
  If strokes cut repairs, that is a real structural cold-load win the corridor couldn't reach.
- Deletes per-sample junction work (`_junctionPadCarve` node loops, deg-2 `_resolveRoadSurface`
  projection) from the RUNTIME carve/collision path — helps steady-state frame cost too (cf. PERF-24).

Perf is the bonus; **quality/complexity is the reason**. We should not sell this as a cold-load win
until the spike shows the repair-count drop.

## 6. Staged rollout (each stage gated; sign-off between stages)

**Stage 0 — read-only stroke spike (NO routing change).** A headless script + a `RoadSystem` method
that forms strokes from the current graph and reports: # strokes, stroke length distribution, # deg-2
pass-through nodes folded, # junctions simplified, and **a two-window invariance check on the stroke set**
(same strokes from two centers). Also count today's self-clear repairs to set a baseline. *Deliverable:
numbers that confirm the win is real and stroke formation is window-invariant, BEFORE touching routing.*
This is the immediate next step and is cheap + safe.

**Stage 1 — stroke-continuous routing behind a flag** (`roadStrokeRouting`, default off). Route strokes,
split back into per-edge runs with matched tangents + one grade; keep the deg-2 connector code but let it
no-op when kinks vanish. Prove `graph-topology` window-invariance + `centerline-curvature` + all carve
gates green with the flag ON, A/B the routes in-sim.

**Stage 2 — delete the deg-2 connector** once Stage 1 is user-approved in a drive. Simplify the degree-≥3
junction path where the through-stroke removes corner cases. Re-run full `test:all` + drives.

**Stage 3 — measure + decide on crossing-detector / BUG-25** with real data (only if they actually became
removable; otherwise leave them).

## 7. Open questions — ALL RESOLVED (user decisions 2026-07-23/24)

1. Stage 0 spike: **DONE** (commit bf25e79; results in the QUAL-21 ticket). Invariance holds.
2. Through-pair test: **SUPERSEDED by MAXIMAL PAIRING** (user proposal 2026-07-24, replaces the
   threshold design above): every node pairs up as many legs as it can, greedily best-score-first —
   deg-2 = pass through, deg-3 = through + T-branch, deg-4 = two through-roads crossing (deg ≥5
   unobserved; rule generalizes). **No thresholds, no vetoes, no escape hatches** (rejected as extra
   code). Pair score = bearing deviation from straight + a grade-discontinuity penalty (grade
   influences WHICH pair continues, never WHETHER pairing happens). Consequences: every junction
   reduces to two canonical shapes (stem-meets-through / through×through crossing) — the fillet
   ladder's general N-ribbon case is deleted by construction, and the threshold params never exist.
3. Bounded out-of-window routing: **YES** (canonical maxLen split + prescribed shared terminal
   heading at split nodes — Stage 0 found the split-kink gotcha; heading prescription is mandatory
   or the deg-2 connector survives at splits).
4. Tight radii (user dislikes tiny arcs): rely on **κ² pricing only** (shipped wTurn 1750) — no
   stroke min-radius param (would also invalidate the baked route bundle). Judge in the A/B drive.
5. Junction node height with multiple strokes (deg-4 X): **AVERAGE the two strokes' design heights**
   at the shared node, each stroke locally blending to the average — symmetric (no ownership rule,
   no discrete closest-to-terrain selector), halves the per-stroke adjustment, and both grades are
   already terrain-hugging (EMA + deviationCap) so the average stays near terrain. At deg-3 the
   single through-stroke owns the node height; branch strokes terminate onto it.

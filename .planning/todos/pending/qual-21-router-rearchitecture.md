---
id: QUAL-21
type: qual
status: open
opened: 2026-07-23
severity: major
source: user-request (router perf + junction-complexity exploration, feature/router-perf worktree)
relates: [QUAL-16 (deg-2 connector), FEAT-13 (Urquhart graph), PERF-03/perf-worldgen (corridor heuristic), QUAL-14 (self-clear), PERF-24 (pad-resolve runtime cost)]
note: "Exploration ticket scoping TWO router improvements found while investigating why a cold map load
  is ~25s (M4 Air) / 60s+ (slow machines) and why junction/smoothing machinery is so heavy. Full
  analysis with measured profile: .planning/research/ROUTER-PERF-EXPLORATION.md and
  .planning/research/STROKE-ROUTING-DESIGN.md. NOT started — captured, exploration worktree torn down."
---

# QUAL-21: Router re-architecture — stroke routing + residual cold-load floor

Two related tasks under one ticket. Both live in the router/graph subsystem and share the same
investigation. Detailed design + measured evidence: **`.planning/research/STROKE-ROUTING-DESIGN.md`**
and **`.planning/research/ROUTER-PERF-EXPLORATION.md`** (measured cold-load profile, the character
contract that must survive, and why the search-speed lever is already spent).

## Context (measured, don't re-derive)

- Cold road build ≈ 5–7 s headless (bench-worldgen.mjs), **~75%+ of it inside `arcPrimitiveConnect`**
  (per-connection A*). Terrain carve/mesh is a distant second (~0.19 s ring).
- **The coarse cost-to-go heuristic is ALREADY SHIPPED** (`roadCorridorMode:'heuristic'`, ×2.5–3.2,
  user-approved 2026-07-17). `hScale` is tuned; cheapening the coarse pass is a proven regression; the
  tube variant was reverted for character damage. **There is no cheap search-speed win left.**
- Junction/smoothing machinery is **~3,200 lines / ~40 functions vs ~600 lines of routing search
  (5:1)**, and roughly half is an artifact of routing each Urquhart edge INDEPENDENTLY (standalone
  grade, no shared-node tangent/height compatibility) then reconciling afterward.

## Task A — Stroke routing (quality-first re-architecture)  ·  PRIMARY

Route **strokes** (maximal through-chains) as one continuous curvature-bounded curve instead of atomic
edges, then split back into per-edge runs `g:<idA>:<idB>` so downstream carve/mesh/gates are unchanged —
but the two edges at a pass-through node now share an exact tangent + one grade (no kink, no connector).

- **Deletes (HIGH confidence): the deg-2 connector subsystem** (~490 lines: `_buildDeg2ArcGeom`,
  `_connectorCarve`, `_buildDeg2Ribbon`, `_deg2ArcTiles`, deg-2 carve-compose branch, `roadJunctionKinkDeg`
  admission).
- **Simplifies (MEDIUM): degree ≥3 junctions** — the straightest two legs become a continuous
  through-stroke; only branches T in, so the fillet ladder + pad-plane height fit shrink.
- **NOT claimed**: the mid-span crossing detector (~350 lines) and BUG-25 cull (~260 lines) likely
  survive — strokes are still a shared-node windowed structure. (First-pass memo overstated this.)
- **Perf bonus (secondary, honest)**: fewer/longer searches; deletes per-sample `_junctionPadCarve` /
  deg-2 resolve from the runtime carve path (cf. PERF-24); and MAY cut the self-clear repair count
  (Task B's floor) because a continuous stroke self-overlaps far less than independent crossing edges.

### The make-or-break constraint
**Window-invariance** (`test/graph-topology.mjs` D-16). Stroke topology must be a pure function of the
graph (site positions + Urquhart edges, NOT routed geometry or window); strokes routed from canonical
terminal anchors via the pure `_coarseH` sampler; bounded extent with a graph-canonical split so we
never route the whole map. If stroke formation isn't cleanly window-invariant, Task A is in trouble —
which is why it starts with a read-only spike (below).

### Staged rollout (sign-off between stages)
0. **Read-only stroke spike** (no routing change): form strokes from the current graph; report #strokes,
   length distribution, #deg-2 pass-throughs folded, #junctions simplified, a **two-window invariance
   check**, and a self-clear-repair baseline. Proves the win is real + invariant BEFORE touching routing.
1. Stroke-continuous routing behind `roadStrokeRouting` flag (default off); split back to per-edge runs
   with matched tangents + one grade; all gates green with flag ON; A/B drive.
2. Delete the deg-2 connector once Stage 1 is drive-approved; simplify the degree-≥3 path.
3. Measure whether the crossing detector / BUG-25 became removable (only then touch them).

## Task B — Residual router cold-load floor (perf)  ·  SECONDARY

Now that the corridor heuristic is shipped, the documented remaining ~42 ms/edge floor is the
**self-clearance scan + repair re-search** (`.planning/perf/FINDINGS.md:188-198`): the worst mountain
edges re-run the whole search up to 16× (`SELF_CLEAR_MAX_REPAIR`). Un-shipped lever noted there: an
**incremental ancestor-proximity index** for `_selfClearScan` so repairs don't re-scan from scratch.

- Small, contained, orthogonal to Task A — but Task A may **moot or shrink** it (continuous strokes →
  fewer self-clear conflicts → fewer repairs). **Sequence after Task A Stage 0** so we know whether it's
  still worth doing.
- Do NOT cheapen the coarse corridor pass (proven regression).

## Acceptance

- **Task A**: deg-2 connector subsystem removed; junction path simpler; full `test:all` green
  (esp. `graph-topology` window-invariance, `centerline-curvature`, `road-smoothness`,
  `shoulder-lateral-continuity`, `carve-mesh-smoothness`, `road-tunnel`); road character unchanged in a
  user drive (windiness/valley-hug/switchbacks preserved — it's a user-eyeball target, not fully gated).
- **Task B**: cold-load self-clear repair count measurably down with no route/character change (gates
  byte-stable), OR closed as mooted by Task A.
- The character contract in `ROUTER-PERF-EXPLORATION.md §2` holds throughout (honest-grade EMA pricing,
  wAlt/grade²/soft-cap/κ²/wDev, grade-yields-before-radius, exact curvature-bounded centerline, Urquhart
  cycles, determinism/window-invariance, intentional switchbacks, camber↔curvature, mesh==collision).

## Do-not-repeat (from the history vet)
Coarse cost-to-go heuristic (shipped), hard tube corridor (reverted, character damage), cheapening the
coarse pass (net regression), wHeur inflation (dead — field replaced it), dendritic/forest topology,
perturbed-grid anchors, hard grade block, 2-D-blur grade pricing, re-interpolated centerline.

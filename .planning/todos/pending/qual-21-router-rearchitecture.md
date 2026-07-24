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

## Stage 1 IMPLEMENTED (2026-07-25, feature/qual-21 — commits 97704b0 + 73dbf41) — awaiting A/B drive

Shipped behind `roadStrokeRouting` (default OFF, debug toggle in the road folder; flag-off routes
proven byte-identical via bundle-data compare; full suite 29/29 green). **Scope was cut back from
the locked all-degree maximal pairing to DEG-2 NODES ONLY, on measured evidence:**

1. **Rotated arrivals tear junction pads even when pairing is clean.** With all-degree pairing the
   shoulder-lateral-continuity gate went red on BOTH seeds — 1.67 m lateral step at a
   cleanly-paired deg-4 pad (seed 6 (1116,-171)): the pads' ruled blends + fillet ladder assume
   chord arrivals. Deg-3/4 absorption must land WITH the Stage 2 junction rework, not as a
   headings-only override. `throughPairsAt` (road-graph.js) is degree-general and ready for it.
2. **The crossing/clearance culls run POST-routing on routed geometry** — no pure spec-time
   pairing can see them (circularity). On the census band the crossing pass dropped 10 edges
   (degree pass 2, clearance 2); each drop at a paired leg leaves a mispaired node with a worse
   kink than today (65–108° measured) + a heading aimed at the culled ghost. Deg-2-only pairing
   is structurally CULL-SAFE (a cull can only turn the node into a dead-end stub, never a
   mispaired junction). The degree-cap pass IS pure topology and is faithfully simulated
   (road.js `_degreeCulledNbrsAt`, DEGREE SIM SYNC with `_cullDegreePass`).
3. **Census caveat**: the in-band census OVERSAMPLES cull-created deg-2 nodes (culls act only on
   registered edges): 10/14 measured nodes were cull-created (keep today's kinks + connector);
   at every covered node the prescribed kink is exactly 0.00°, with two ~9–11° first-chord
   readings that are pure hardR-Dubins endpoint curvature (G1, no tangent kink). The world at
   large is mostly raw deg-2 (44 raw vs ~10 cull-created per band).
4. **Flag-ON gate matrix 8/9 green**; one KNOWN MARGINAL: shoulder-lateral-continuity seed 6,
   0.543 m vs the 0.50 m rival-bank tier at (-917,-507) — a crossing-cull outcome FLIP (node
   deg 2→3, different edge survives) overlapping two corridors. BUG-25-class domino
   (headings → routes → crossings → cull decisions), deliberately not papered over.

**DRIVE VERDICT (user, 2026-07-25):** both toggles ON drive fine — Stage 1 A/B PASSED; n=3/4
junctions read the same as before (intended). Deg-2 elbow-pad fix (2da62fb) "fine, not great" —
ACCEPTED for now, polish later (Stage 2's post-cull pairing turns most of those elbows into
continuous through-roads anyway, so don't invest in pad aesthetics before then). Cull-created
deg-2 coverage + the seed-6 bank marginal are absorbed by the locked Stage 2 architecture
(topology settles before fine routing). Defaults remain OFF pending the default-on decision
(needs: bundle regen + resolving the two flag-ON gate marginals as default-config issues).

## STAGE 2 ARCHITECTURE (user-approved 2026-07-25) — settle topology coarse, fine-route ONCE

HARD CONSTRAINT: **routing cost must not increase; no full-network re-route, ever.** Routing is
the dominant cost in the codebase; the pipeline below reuses first-pass cycles everywhere.

1. **Coarse routing** (exists — the roadCorridorTwoPass coarse-lattice pass, ROUTE SYNC region).
   Modify: gentle-curves-only palette. The coarse palette is already `radii: [200, 35]`
   (road-carve.js ~line 908) — make the floor a first-class tuning point and TEST raising it
   (drop the 35 m entry / try [200, 50]): with the limited data a coarse router sees, it must
   not promise grade optimization (switchback-dense plans) the fine pass gets steered into.
2. **Cull on coarse** (new, cheap — SAVES routing): degree pass is pure topology (no geometry);
   crossing detection runs on the COARSE polylines (crossings are ~100 m excursions — coarse
   captures them). Doomed edges die BEFORE fine routing pays for them (today we fine-route
   10–14 edges/band just to delete them).
3. **Pair on the settled post-coarse-cull topology, then fine-route ONCE** with final paired
   headings + the existing corridor reuse. No second fine pass. Deletes the Stage-1 spec-time
   override AND the _nodeThroughPairs/_degreeCulledNbrsAt cull-prediction machinery (they exist
   only because pairing ran before culls). Whole chain is worker-runnable (coarse flood already
   lives in ROUTE SYNC) → prewarm delivers final routes directly.
4. **Junction repairs are LOCAL SPLICES, never searches**: where the fine-level cull backstop
   still fires (coarse/fine crossing disagreement) and orphans a pairing, cut the surviving
   route at the mouth (~cutback + goalBlend, last ~60 m) and re-emit an analytic Dubins terminal
   at the corrected heading — the goal-blend machinery already does exactly this. Anything still
   unpaired keeps the deg-2 elbow-pad fallback (2da62fb).

ENTRY CHECKPOINT before committing: measure the coarse-vs-fine crossing-agreement rate (route
one band both ways, count crossing-set disagreements) — it bounds how often stage 4 fires.
WATCH: moving the crossing decision to coarse inherits today's BUG-25 ring-scoped asymmetry.

**Stage 2 HARD REQUIREMENT (user decision 2026-07-25): PERF-25 folds in** — the reworked
junction surface must be cheaply evaluable per physics sample (or memoizable per node) under
positional jitter; parked-on-pad within ~1.5× of off-pad per-sample cost. Full context,
measurement, and acceptance harness: `perf-25-pad-resolve-parked-jitter.md` (do not work it
standalone; close it with Stage 2).

## Stage 0 RESULTS (2026-07-23, commit bf25e79) — read-only spike DONE

`formStrokes` (pure, src/road-graph.js) + `test/stroke-spike.mjs` (rainy-day script). User-approved
rules: deg-2 ALWAYS continues; deg-≥3 through-pair = bearing + grade continuity + ambiguity veto;
bounded out-of-window routing OK. Measured (seed 6, r1600, defaults dev≤40°/gradeJump 0.08):

- **Window-invariance HOLDS** (the make-or-break): whole strokes 9/9 identical across two centers,
  per-node pass-through pairings 11/11. Formation is safe to build Stage 1 on.
- **deg-2 folding works**: 35/44 (80%) deg-2 nodes fold — the connector-deletion claim is real. The
  9 unfolded are stroke split/frontier endpoints → **Stage 1 must prescribe a canonical shared
  terminal HEADING at split nodes or the kink (and connector) survives exactly there.** Folded bend
  angles p50 42° / max 111° — one continuous κ²-priced curve absorbs them.
- **The graph is junction-dominated** (122/175 nodes deg-≥3; only 44 deg-2), so whole-map fold is
  modest: ×1.30 (defaults) → ×1.50 (dev≤85°, gradeJump 0.15); junctions gaining a through-road
  18% → 38% over the same sweep. gradeJump is the dominant lever (mountain legs dive); the
  ambiguity margin barely binds (symmetric Ys already fail the bearing test).
- **Self-clear baseline** (scStats hook, ROUTE SYNC region + worker mirror): 140 routes,
  158 searches, **18 repair re-searches (11%)**, 0 unclean-accepted. Task B's target number.

Honest read: quality/deletion case (deg-2 connector + per-sample pad resolve) fully intact;
junction-simplification applies to a quarter-to-third of junctions (threshold-dependent, user's
aesthetic call at Stage 1 A/B); search-count perf bonus modest (244→187 at defaults). Awaiting
Stage 1 sign-off + threshold choice (dev/gradeJump are aesthetics, drivable via A/B).

## PLAN PIVOT (2026-07-24, user decision) — MAXIMAL PAIRING replaces thresholds

The 18–38% junction-coverage ceiling was a consequence of thresholded through-pair admission. User
direction: **every node pairs maximally** — deg-2 pass-through, deg-3 through + T-branch, deg-4 two
crossing through-roads. No thresholds/vetoes/escape hatches. Junction machinery then only ever
handles TWO canonical shapes; through-coverage is 100% by construction. Locked sub-decisions
(full rationale in STROKE-ROUTING-DESIGN.md §7): pair score = bearing deviation + grade penalty
(grade picks WHICH pair, never whether); κ²-only for bend sharpness (no stroke min-radius param);
deg-4 node height = AVERAGE of the two strokes' designs (deg-3: through-stroke owns). Residuals
that survive: pad pavement/blend at branches, mid-span crossing detector, BUG-25 cull.
Stage 1 pre-step: re-run the spike with maximal pairing to record bend-angle distributions
(deg-3, worst-of-two at deg-4) + fold + invariance before touching routing.

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

# QUAL-21 Stage 2 — settle topology coarse, pair, fine-route once (EXECUTION PLAN)

Handoff 2026-07-25. Architecture user-approved (ticket "STAGE 2 ARCHITECTURE" section). All work
runs on the `feature/qual-21` worktree (`CarGame-qual-21`, serves :3671) — main is untouched
until the merge gate at the bottom passes. Stage 1 (deg-2 spec-time heading override, commits
97704b0/73dbf41/2da62fb) is SHIPPED on this branch, A/B-passed, and gets partially DELETED here.

## Hard constraints (user, 2026-07-25 — violating any of these fails the stage)

- **Routing cost must not increase.** Routing is the dominant cost in the codebase. No
  full-network re-route, ever. Reuse first-pass cycles; junction repairs are analytic splices.
- **Flag-off (`roadStrokeRouting: false`) stays byte-stable** through every phase — same bar as
  Stage 1 (bundle route-data compare + full suite green).
- **PERF-25 is an exit criterion**, not a rider: parked-on-pad per-sample resolve within ~1.5×
  off-pad under 3 mm jitter (harness in `perf-25-pad-resolve-parked-jitter.md`). Do not quantize
  the query position (the PERF-24 0.7 m trap).

## Phase 0 — measurements (ENTRY CHECKPOINT; no product code)

1. **Coarse-vs-fine crossing agreement** (`test/stage2-crossing-agreement.mjs`, rainy-day):
   seed 6 + one more seed, r1600, both toggles on. Route every band edge fine (today's path) AND
   coarse-only (forward `arcPrimitiveConnect` with the corridor coarse opts — cell 24, palette
   below, emitPrimitives off). Run `_cullCandidatePairs`-style crossing detection on both
   polyline sets. Report: fine crossings caught by coarse (%), coarse-only false positives,
   per-node cull-outcome agreement. **Proceed bar: coarse catches ≥80% of fine crossings** —
   every miss becomes a Phase 4 splice, every false positive a wrongly-early-culled edge
   (connectivity-guarded by the detour check, so the cost is a missing road, not an island).
   If <80%: tune coarse resolution/palette/weights and re-measure before any pipeline work.
   **Coarse weights are DECOUPLED (user, 2026-07-25):** the coarse router is NOT required to
   inherit the fine router's cost weights — if a particular weight (or set) is killing coarse
   viability or cull accuracy, relax it with alternate coarse-only values so the coarse route
   thrives and culls accurately. Two coarse consumers, tune separately: the CULL/PAIRING path
   only needs to predict where the fine route goes (agreement rate is the only judge — relax
   freely); the HEURISTIC flood feeds the fine search's cost-to-go, where diverging weights
   trade fine-route optimality for speed (already an accepted approximation — hScale — but
   watch the windiness/character metrics when touching it).
2. **Cold-build routing baseline**: time a cold `setRadius(1600); update()` (seed 6, both
   toggles on, scStats injected) 3× — wall time + searches + repairs. This is the number Phase 3
   must not exceed and SHOULD beat (it stops fine-routing doomed edges). Record in the ticket.
3. **Coarse palette test** (user: gentle-curves-only): the coarse palette is `radii: [200, 35]`
   (road-carve.js corridor block). Compare crossing-agreement + fine-route quality (windiness /
   road-character metrics) with [200, 35] vs [200, 50] vs [200] — with the limited data a coarse
   router sees it must not promise switchback-grade optimization the fine pass gets steered
   into. Pick the floor by the numbers; expose as `roadCorridorRadii` param (routeCacheSig key →
   bundle regen rides the Phase 3 commit).

## Phase 1 — cull on coarse (topology settles before fine routing)

- Compute a **coarse forward path per edge** in the route spec pipeline (worker + sync parity
  via `_edgeRouteSpec`, same as every routing input; coarse results cached per edge like solo
  routes — `_proto.clsCoarse`). The existing backward heuristic flood is unchanged and still
  guides the fine search.
- Run the cull ladder against COARSE polylines, before any fine route: degree pass (pure
  topology, unchanged), crossing pass + clearance pass over coarse geometry (same ring/detour/
  droppedSet machinery — parameterize `_cullNetwork`'s polyline source). Edges culled here are
  **never fine-routed** (the measured 10–14 per band savings).
- Phases 1–4 standing rule: if coarse routes fail/wander under the inherited fine weights,
  reach for the decoupled coarse-only weights (Phase 0 note) BEFORE adding machinery —
  agreement rate and cull accuracy are the acceptance judges for any coarse weight change.
- The fine-level cull stays as BACKSTOP (coarse/fine disagreement residue only). Ring-scoped
  asymmetry (BUG-25 WATCH) moves with the decision — cull-radius-invariance gate must stay green.

## Phase 2 — pair on settled topology

- `throughPairsAt` (road-graph.js, already degree-general) runs over the post-coarse-cull
  adjacency — a plain read, NO node-centred rebuilds, NO degree simulation. **DELETE
  `_nodeThroughPairs`, `_degreeCulledNbrsAt` (DEGREE SIM SYNC), and the `_edgeLeaveHeading`
  spec-time override** — pairing output becomes a per-node heading table the route specs and the
  ribbon weld both read (worker/sync parity through the spec, as Stage 1 proved).
- Scope: deg-2 first (parity with shipped Stage 1 + the cull-created class it could not cover —
  THE Stage 2 quality win: those elbows become continuous through-roads, retiring the
  elbow-pad's "fine, not great" look). Deg-3/4 pairing lands ONLY WITH Phase 5's junction
  rework (rotated arrivals tear today's pads — measured, Stage 1 scope-cut evidence).

## Phase 3 — fine-route once, with final headings

- Fine routing consumes the Phase-2 heading table directly. One pass; prewarm delivers final
  routes (coarse+cull+pair all run in the routing worker — coarse machinery is already in the
  ROUTE SYNC region; mirror per the sync rule).
- Gate here: cold-build time ≤ Phase-0 baseline (target: beat it); flag-off byte-stable;
  bundle regen for any new road* params; kink census (`stroke-spike.mjs` §4) — expect prescribed
  kink 0 at EVERY deg-2 node including cull-created (vs 4/14 in Stage 1).

## Phase 4 — splice-only repairs

- Where the fine backstop cull still fires and orphans a pairing: cut the surviving runs at the
  mouth (~cutback + goalBlend, last ~60 m) and re-emit the analytic Dubins terminal at the
  corrected heading (the goal-blend machinery — radius-valid by construction, zero search).
  Count spliced nodes in scStats-style reporting; Phase-0's agreement rate bounds it.
- Anything still unpaired keeps the elbow-pad fallback (2da62fb) — it becomes rare, not load-
  bearing.

## Phase 5 — junction rework + deletions (the original Stage 2)

- Collapse the fillet ladder to the two canonical shapes (deg-3 through+T, deg-4 through×through)
  with **rotated-arrival support** (through-pair legs arrive anti-parallel by construction; the
  pad/ruled blends must weld to actual arrival cross-sections, not chord assumptions).
- **PERF-25 lands here**: the reworked junction surface is cheaply evaluable per sample (or
  memoized per node) under jitter — acceptance harness in the PERF-25 ticket.
- **Delete the deg-2 connector subsystem** (arc geom, ribbon, admission, deg2ArcTiles resolve
  path) once the census shows the connector no-ops network-wide (kinkMin admission catches 0
  nodes). The elbow-pad fallback for 2-leg clusters stays (safety net, near-zero traffic).
- Then flip deg-3/4 pairing on (Phase 2 scope note) and re-run the full matrix.

## Verification / MERGE GATE (user: "not broken and more performant")

1. `npm run test:all` green, flag-off — with flag-off route data byte-identical to main's bundle.
2. Flag-on: full road-gate matrix (the 9 from Stage 1 + graph-cull-radius-invariance) green —
   including shoulder-lateral-continuity (the seed-6 bank marginal should DISSOLVE: topology
   settles before fine routing, no cull-domino) and kink census ≈100% under 9°.
3. **Performance, measured vs Phase-0 baseline**: cold-build wall time strictly ≤ baseline
   (expect < — doomed edges never fine-route); parked-on-pad PERF-25 harness ≤1.5× off-pad;
   no new frame hitches (?prof=1 drive at a junction-dense area).
4. User drive sign-off on the A/B toggles, then the default-on decision (bundle regen + gate
   re-baselines) as its own step — NOT bundled into the merge.

## Commit boundaries

(0) Phase-0 scripts + measured numbers in ticket · (1) coarse-cull, gates green both ways ·
(2) pairing table + machinery deletions · (3) single-pass headings + bundle + census ·
(4) splices · (5a) junction rework + PERF-25 · (5b) connector deletion + deg-3/4 flip.
Each phase leaves the branch green both flag states.

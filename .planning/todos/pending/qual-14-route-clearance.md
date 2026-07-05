---
id: QUAL-14
type: quality
status: pending
severity: major
blocks: QUAL-13
---

# QUAL-14: Route clearance — kill self-intersections and parallel-run mesh stacking

USER-APPROVED PLAN 2026-07-05 (do BEFORE QUAL-13 sloped pads — junction work should land on
stable routes). Road FEEL is good post honest-grade router (93d61a6) + Phase 2 defaults (0cd39a1);
what's left is routes touching themselves/each other.

## Seed-6 landmarks (from user screenshots, HUD POS coords)

- BAD self-intersection (lollipop loop): (402, 316) and (1523, 216)
- BAD self-parallelism (hairpin legs sharing a carve wall): (1098, −226)
- BAD edge-vs-edge parallel run (stacked mesh, wall between): (643, 280)
- GOOD (don't break these): junction (224, −192), switchback stacks (1170, −432), (1495, 67)

## Root causes

1. The hybrid-A* has no memory of its own path: state = (cell, heading bin), so a route crossing
   or grazing itself is free. Honest costs (93d61a6) made wander/switchbacks common → loops appear.
2. `roadArcHardRadius` 8 m ⇒ hairpin legs ~16 m apart < roadWidth(10) + 2·shoulder(5) + carve toe
   ⇒ even a legitimate hairpin can stack its own mesh.
3. Edges route INDEPENDENTLY (per-edge purity for cache/worker/window-invariance) — no edge knows
   its siblings exist ⇒ parallel corridors with a shared cut wall.

Key topological fact: the Urquhart graph is a Delaunay subgraph ⇒ PLANAR ⇒ edge chords never
cross; any edge-edge crossing/hug is route-wander artifact. So hard-forbidding proximity is
topologically sound (with a retry escape as belt-and-braces).

## Design

### A. Per-edge SELF-CLEARANCE (kills loops + leg-hugging)

Contract on the FINAL emitted chain (post-refit, incl. Dubins tail): no two centerline samples
with arc-separation > `roadSelfClearGap` (80 m) may be closer than
`D_self = roadWidth + 2·roadShoulderWidth + roadSelfClearMargin` (10+5+3 = 18 m) in XZ.

- Implement in arcPrimitiveConnect (ROUTE SYNC region, src/road-carve.js → re-mirror
  src/road-worker.js same commit; regen script pattern in scratchpad, route-worker-sync gate).
- Check: sample at ~4 m, spatial hash grid with cell = D_self, compare only pairs with
  arcSep > gap. O(n).
- On violation: DETERMINISTIC RETRY LADDER (pure fn of the edge → cache/window-invariance safe):
  attempt1 wCurv×2.5 → attempt2 wCurv×6 → attempt3 wCurv×6 + maxGrade+0.03 → attempt4
  maxGrade+0.06. Accept first clean; else accept the attempt with fewest violations (never fail
  to emit a road). Ladder constants live in ROUTE SYNC.
- Bump `roadArcHardRadius` default 8→10 (2·hardR = 20 ≥ D_self) so legal hairpins clear by
  construction. Check refit terminal + centerline-curvature gate expectations.

### B. Cross-edge CORRIDOR AVOIDANCE (kills parallel runs; "merge exemption" built in)

Reuse the FEAT-17 pond machinery — avoidance corridors are pure DATA discs, and folding them into
the same array the router already rejects on (`opts.pondDiscs` path: search sampling + refit
badXZ) gives search AND refit coverage for free. Keep a separate opts name (`avoidDiscs`),
concatenate internally.

- Priority: canonical edge order (lexicographic on the site-id edge key — world-stable ⇒
  window-invariant).
- Edge E routes with avoid-discs sampled from the FINAL centerlines of higher-priority edges
  whose search bbox overlaps E's. Discs: spacing ~12 m, radius `roadCorridorClearance` (20 m).
- MERGE EXEMPTION (the user's "unless they're headed in to merge"): drop discs within
  EXEMPT_R = max(goalBlend, roadJunctionBlendLength) + 20 (≈ 80 m) of any node SHARED by the two
  edges. Approaches into a common junction may converge; everywhere else they may not.
- Dependencies: E needs higher-priority overlapping edges routed first — resolve recursively in
  RoadSystem._edgeCenterline (strict priority order ⇒ no cycles; chains are local/shallow).
  Worker pre-warm: order the job batch by priority; the worker processes sequentially and keeps
  this batch's results so a job's deps are either shipped (already-cached centerlines as data) or
  in-batch references. Sync fallback does the same in the same order — byte-identical results.
- ESCAPE HATCH: if routing with discs exhausts/falls back (goal unreachable), retry once with
  corridor discs dropped (self-clearance kept) — a real crossing then forms and the existing
  crossing classifier/culler handles it. Deterministic.

### C. Gates

- REWORK `graph-topology.mjs` GRAPH-NO-LOOPS (currently: total turn ≤ 200°, which is
  anti-switchback by design) → SELF-CLEARANCE check: no XZ self-intersection and no
  non-consecutive approach < D_self on any run.
- NEW check (same gate file): CORRIDOR-CLEARANCE — all edge pairs ≥ roadCorridorClearance apart
  outside shared-node exemption zones.
- EXPECTED to go green as a consequence: GRAPH-REACHABILITY (culler stops eating edges because
  crossings stop forming), GRAPH-CROSSINGS-CULLED, GRAPH-SURFACE-SMOOTH (its 8 steps are at
  crossing zones).
- Watch: arc-router perf gate (retry ladder + disc rejection cost), road-dequantize,
  centerline-curvature (hardR 10), road-smoothness, road-character before/after.

### D. Params/sliders (data/ranger.js + debug.js Roads folder, fireRoadParam wiring)

`roadSelfClearGap` 80 · `roadSelfClearMargin` 3 · `roadCorridorClearance` 20 ·
`roadArcHardRadius` 8→10.

## Order

1. A (self-clearance + hardR + gate rework) — verify at (402,316), (1098,−226), (1523,216).
2. B (corridor avoidance) — verify at (643,280); graph-topology should reach 9/9.
3. `npm test` + `node test/road-character.mjs` before/after + user drive check.
4. AFTER this lands: retry the maxGrade 0.10 preset (documented in ranger.js roadWGrade note —
   it was blocked by road-smoothness steps at switchback density, which A likely fixes), then
   QUAL-13 sloped pads.

## Acceptance

- No self-intersection / sub-D_self self-approach on seeds 6/7/lone-pine (new gate green).
- No edge pair closer than corridor clearance outside merge zones (new gate green).
- graph-topology.mjs 9/9; npm test 29/29 (or same-or-better than 28/29 with only pre-existing
  flakes); the four bad landmark spots visually clean; the three good ones unchanged.

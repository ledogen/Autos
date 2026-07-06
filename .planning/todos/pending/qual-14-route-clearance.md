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

---

## STATUS 2026-07-05: clearance LANDED (e31fa8c + 9736165), PERF PHASE REMAINS

USER VERDICT (drove it): "roads look really good, fun to drive, connectivity is good" —
but "way too slow": cold load 26 s (perf log: resolveSpawn cold network stream is one
synchronous main-thread block), 4–5 s hangs exploring (macro-cell re-streams routing new edges
synchronously when prewarm lags), map basically unusable. Per-frame cost is FINE (road.update
0.7 ms/180 frames) — the problem is routing bursts, not frame rate.

What landed (differs from the plan above — read the commit messages):
- Part A: self-clearance enforced by an ITERATIVE NO-GO REPAIR loop (discs on violation
  midpoints, ≤16 re-searches), NOT the wCurv/maxGrade ladder — the ladder is whack-a-mole
  against pigtail hairpins (router loops >270° to gain elevation; crossing free, length =
  cheap grade relief). hardR 8→10.
- Part B: corridor discs come from dep SOLO routes (clsSolo, dep-free) — ONE-LEVEL deps only;
  transitive final-route deps PERCOLATE (>3000-edge closures, OOM). Exemption around shared
  nodes AND own anchors; foreign-node discs (NODE_CLEAR_R 60); escape hatch; _cullClearance
  backstop; 'S|' solo pre-warm jobs (two-phase warm).
- Part C/D: gates GRAPH-SELF-CLEARANCE + GRAPH-CORRIDOR-CLEARANCE green (9/10; REACHABILITY
  red pre-existing); sliders shipped. npm test 28/29.

### Perf plan (agreed with user 2026-07-05 — do BEFORE closing this ticket)

Root cost: ~80% of routing time is a few mountainous edges paying the repair loop — up to 16
full re-searches × 2 (solo+final). Generate-test-retry where each retry is a whole search.

1. **IN-SEARCH SELF-PROXIMITY REJECTION (the core fix — prevention, not repair).** During
   expansion, walk the candidate's OWN ancestor chain (parent pointers) and reject a primitive
   whose endpoint lands within D_self of any ancestor more than selfClearGap back along the
   path. Pigtails become illegal moves — routed around in the SAME pass. ~1.5–2× tax on the
   base search, deletes the 16× multiplier. Repair loop demotes to a thin backstop (cap ~4)
   for violations the REFIT passes introduce (shortcut/terminal aren't ancestor-checked).
   Deterministic pure fn; lives in ROUTE SYNC (re-mirror road-worker.js; scratchpad
   gen-road-worker.mjs pattern). Expect full-band 88 s → ~15 s.
2. **Route worker POOL (2–4 workers).** Edges are pure/independent — near-linear prewarm +
   cold-load scaling. RoadRouteWorker grows a pool; job batches round-robin.
3. **Async cold spawn.** resolveSpawn must not route the band synchronously on the main
   thread — route the spawn band on the pool behind the load moment.
4. **Share the route cache between play and Map2D RoadSystems** (identical pure fns of
   seed+params; map currently recomputes everything at map radius into its own cls).
5. **Persist the cache (IndexedDB), keyed by seed + params hash.** Risk-free (pure fn);
   second visit ≈ instant; makes the map usable.
6. Micro: faster repair-disc escalation + lower cap; PREWARM_MAX_JOBS ↑ so two-phase warm
   doesn't starve the pipeline.

Do NOT drop corridor avoidance in favour of cull-only — that re-fragments connectivity
(user explicitly likes connectivity now).

Target: cold load 26 s → 3–5 s; exploration hangs gone; map usable.

### Open lever (user decision, separate from perf)

roadCorridorExempt 50 + roadGraphGoalBlend 60 measured best at the tangle center (4500,600):
crossings 40→33, comps [33,5,5,2,2,2]→[46,2,2] (92% ≥ the 85% REACHABILITY bar — would likely
green the last gate). goalBlend 20→60 changes road feel near junctions → needs a drive check.

---

## STATUS 2026-07-05 (later): PERF PHASE IMPLEMENTED — needs user drive/load check

Headless-Chrome measurements (test rig; user's M4 in a real browser should be ≥ this):
**cold load 26 s-class → 5.9 s; second visit (IndexedDB hit) 0.9 s.** Seed-6 full-band synchronous
routing (the fallback path) 89.3 s → 44 s. graph-topology 9/10 (REACHABILITY = pre-existing red,
owned by the goalBlend-60 lever above); GRAPH-CROSSINGS-CULLED improved to 0 surviving crossings.
Road character intact (straights >200 m: 3.6%, 57 switchbacks).

What landed (perf plan items 1–6):
1. **In-search self-proximity rejection** (ROUTE SYNC): expansion rejects primitives landing
   within D_self of the candidate's OWN ancestor chain at arcSep>gap — pigtails are illegal moves,
   routed around in the SAME pass. Per-EXPANSION ancestor prefilter (endpoint+midpoint samples,
   exact per-pair arc positions — a conservative gate left a slop band that admitted radius-14
   curls at arcSep 85–105). Plus a REFIT GUARD: if shortcut/terminal rewrites introduce clearance
   violations, ship the pre-refit chain (a corridor-congested Dubins span sliced the route: 216
   violations from a 7-violation search output). Repair loop demoted to backstop, cap KEPT at 16
   (cap-4 experiment shipped fewest-violations chains → gate regression; only dirty edges pay).
2. **Route worker POOL** (2–4 by hardwareConcurrency, round-robin batches) + PREWARM_MAX_JOBS
   4→16 + steeper repair-disc escalation (0.5/it).
3. **Async cold spawn**: resolveSpawn is async and pumps `RoadSystem.warmSpawnBand` (NEW:
   registered-band-EXACT, uncapped dispatch — warmRoutes' prewarm superset was 167 edges/~490
   searches for a 25-edge band) before EVERY ensureTile, including the spawn-point re-center
   (which alone was 8.8 s of sync routing). Top-level await in main.js; regen/R-reset use the
   same path; `_spawnWarmActive` guards the frame loop during a warm.
4. **Play↔Map2D route-cache sharing**: map2d adopts the play instance's cls/clsSolo Maps
   (after setWaterNoGo — it clears what it sees), via getter (play swaps instances on regen).
5. **IndexedDB persistence** (src/route-store.js): one record per seed keyed by a full
   routing-param signature (road*/water*/coarse*/weights/designGradeWindow, arrays JSONed);
   import at init + regen, save post-warm + every 30 s + on tab-hide. Pure-fn identity ⇒ a sig
   hit can never inject routes the current params wouldn't produce.

Remaining before closing the ticket: user drive check (load feel + roads unchanged-good), then
the goalBlend-60/exempt-50 lever decision, then retry the maxGrade 0.10 preset, then QUAL-13.

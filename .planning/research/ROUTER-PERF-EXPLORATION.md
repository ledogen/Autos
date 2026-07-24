# Router performance & architecture exploration (2026-07-23)

Worktree `feature/router-perf`. Question (user): the router takes ~25 s to load a map on an M4 Air,
60 s+ on slower machines; the "smoothing and fixing intersections" complexity is high and costly. How
do we get a big perf win **without sacrificing road character** — open to alternate systems that still
build roads from real costs.

This memo is analysis + options, no code yet. It exists to pick a direction before prototyping.

---

## 1. Where the time actually goes (measured, not guessed)

Headless bench (`node test/bench-worldgen.mjs`) + a `node --prof` CPU profile of a cold build on this
worktree (`scratch/cold.mjs`, seed 1337):

| stage | cost |
|---|---|
| **Cold road stream (graph + route everything)** | **~5.3–6.8 s** (seed-dependent), 46–51 connections, 16–25 runs |
| Re-stream after a band move | ~0.55–0.6 s (cache-mostly-hit) |
| Spawn 3×3 ensureTile (fresh system) | ~5.5–7.5 s — a *re-measure* of cold routing, not additive |
| Terrain carve+normals+colors, per 65×65 chunk | 7.8 ms; a 25-chunk Normal ring ≈ **0.19 s** |

CPU profile of the cold build — **~75%+ of all JS time is inside the router search**:

| function | self-time | what it is |
|---|---|---|
| `arcPrimitiveConnect` (road-carve.js:855) | **42.9%** (+more in its `run` closure) | the per-connection hybrid-A* over arc primitives |
| `hpopState` (heap pop) | **10.2%** | priority-queue churn — the tell-tale of a **near-Dijkstra flood** (huge open set) |
| `selfHit` | **8.8%** | per-expansion self-clearance collision check |
| `inPondNoGo` | 4.8% | per-expansion pond/no-go-disc rejection |
| `arcEnd`, `heur`, `hAt`, … | rest | primitive stepping + heuristic + cached height |

Terrain/mesh is a **secondary** main-thread term (~0.19 s for the visible ring). **The router search is
the load.** The browser's 25 s = this routing (when the seed isn't the pre-baked default) + assets +
shadow bake + prop instancing; but the *lever the user is asking about* — the router — is real and
dominant, and it's the part that scales badly with core count (60 s+ on low-core machines because the
worker pool serializes the ~80 searches).

### Two compounding cost multipliers on top of the base flood

1. **Every edge is routed ~twice.** `_corridorDiscsFor` (road.js:2377) builds *sibling no-go clearance
   discs* so an edge won't hug/cross its neighbours — but that requires every sibling to be **"solo"-
   routed first** (`_soloCenterline`), then each edge is routed **again** as "final" with the discs.
   The profile confirms: `_edgeCenterline → _soloCenterline → {_corridorDiscsFor, arcPrimitiveConnect}`.
   So ~80 flood searches for ~45 connections.
2. **Self-clearance repair** re-runs the *whole* search up to 16× on the worst mountain edges
   (`road-carve.js:856-883`). Code comment: this was ~80% of the old 26 s cold load before in-search
   prevention was added — still a tail cost.

### Root cause of the flood

`arcPrimitiveConnect`'s A* heuristic is **distance-only** (`wHeur·wDist·‖·→goal‖`, road-carve.js:1276)
while the cost the search actually integrates is dominated by **`wAlt` (valley-seeking), `grade²`, and
earthwork** (road-worker.js:914). A heuristic that under-prices the dominant terms is weak → A*
degenerates toward Dijkstra → ~94k node expansions/search (stated in-code, road-carve.js:888). That is
the `hpopState` 10% and the whole flood.

---

## 2. What must survive any redesign (the character contract)

From the cost-model / gates investigation — these are non-negotiable:

- **Honest-grade pricing.** Grade is priced off the **along-path design profile the builder will
  actually construct** (causal EMA of raw height, clamped by `deviationCap`), NOT raw terrain. This is
  the heart of "builds roads from real costs" — a 2-D-blur-of-raw form was tried and rejected because it
  hid short tall pitches and made Max Grade powerless.
- **Cost terms + weights:** `wDist·L + wAlt·max(0,δ+valleyCap)·L + wGrade·grade²·L +
  wOver·max(0,grade−maxGrade)·L + wCurv·κ²·L + wDev·|design−raw|·L`. `wAlt` (valley-seeking, **relative
  to the anchor→anchor chord baseline**) is dominant; over-cap is **soft/finite, never ∞**; curvature is
  **κ²**.
- **Grade yields before radius (VBC-01).** XZ min-radius is HARD (≥ fold floor ≈ halfWidth+clearance);
  grade is SOFT. A too-steep road is driveable; a folded corner is not.
- **Exact curvature-bounded centerline** carried end-to-end (line/arc/clothoid, analytic κ, bounded by
  construction) — never re-interpolated/patched.
- **Cycles topology** (Urquhart over blue-noise), connected-by-theorem — never a tree/forest; no
  parallel-row anchors. Cycles = route choice = the point.
- **Window-invariance & determinism** — same edge set + per-edge grade from any streaming window; pure
  coarse-height function, no RNG, no chunk-load dependence.
- **Switchbacks are intentional** (300°+ alpine stacks OK; self-clearance replaces anti-loop bounds).
- **Camber synced to curvature** (saturating, slew-limited ≤2°/m); collision surface == visual road.

Rejected-and-don't-repeat: dendritic/forest network, perturbed-grid anchors, global distance-to-road
field, hard grade block, 2-D-blur grade pricing, re-interpolated centerline, wCurv/maxGrade retry
ladder.

---

## 3. The second problem: junction/smoothing is an artifact of edge-independence

Rough LOC: **~600 lines of genuine routing search vs ~3,200–3,500 lines of junction + smoothing +
crossing machinery (~40 functions) — a 5:1 ratio.** The junction investigation found ~half to
two-thirds of that is a direct **artifact** of "route each Urquhart edge INDEPENDENTLY, then reconcile
at the shared node afterward":

- Two separate intersection resolvers (`_detectNodeJunctions` shared-endpoint pads + `_detectJunctions`
  mid-span crossings) — needed only because independent edges arrive with incompatible tangents/heights
  and can cross without a graph node.
- The welded-ring **fillet ladder** with a 4-way corner strategy + self-intersection retry (~450 lines).
- The **deg-2 kink connector** (~370 lines) exists ONLY because a through-road's two edges don't arrive
  collinear — a topology that formed the through-road as one continuous polyline deletes it entirely.
- **BUG-25 window-invariance cull** (~260 lines) is pure streaming-window bookkeeping for a shared-node
  graph.

Inherent regardless of topology: the in-router **refit** (Dubins shortcut + κ clothoid), **grade EMA
smoothing**, **camber marches**, and *some* pavement at genuine 3+-way intersections.

---

## 4. Options (ranked by ROI-to-risk), all preserving the cost model

### Option 1 — Shared coarse cost-to-go field as the A* heuristic  ·  ❌ CLOSED — ALREADY SHIPPED
**Correction (2026-07-23, after reading the history the user flagged):** this is **already the shipped
default**, not a new idea. `roadCorridorTwoPass: true` + `roadCorridorMode: 'heuristic'` (data/ranger.js
:533-542) runs exactly this — `arcPrimitiveConnect` floods BACKWARD from the goal on a coarse lattice
(24 m cells, 12 heading bins, same cost model) producing a per-cell min-cost field, handed to the fine
search as `max(distanceHeuristic, hScale·field)` (road-worker.js:805-817). It shipped at **×2.5–3.2**,
user-approved 2026-07-17 (perf-worldgen P2), tuned at `hScale 1.0`. The 5–7 s I measured is the
**post-corridor** state — my profile's flood is what remains AFTER this lever.

So the search-speed lever is **largely spent**:
- `hScale` is at its tuned optimum (1.0 → ×2.57; 0.8 → ×2.42 no feel gain; 0.6 → ×1.60).
- **Cheapening the coarse pass is a PROVEN REGRESSION** (`.planning/perf/FINDINGS.md:181-187`): it's ~5%
  of total, but any change re-shapes the corridor, and corridor shape drives the self-clear repair count
  that dominates.
- The hard "tube" corridor variant (`mode:'tube'`) was **reverted** for character damage (PERF-17,
  only ×1.25).
- The documented remaining floor (~42 ms/edge fixed) is the **self-clearance scan + repair re-search**
  (FINDINGS.md:188-198), NOT the heuristic.

**Implication:** there is no cheap search-speed win left to take. The next real lever on cold-load is
STRUCTURAL — reduce the number/cost of searches and the self-clear repair count. That is a side effect
of Option 2, which is why the user's ordering (Option 2 first) is correct.

### Option 2 — Continuous "stroke" routing (kill edge-independence)  ·  complexity win · MED risk
**Idea:** keep the Urquhart graph, but decompose it into **strokes** (maximal through-paths that
continue straight-ish across shared nodes — the "natural road / stroke" idea from procedural street
modeling) and route each **stroke as one continuous curvature-bounded curve through its nodes**, emitting
explicit T/Y junction primitives where strokes cross. 
- **Why it helps:** deletes the reason ~1,500–2,000 lines of reconciliation machinery exists — the
  deg-2 connector, most of the fillet ladder, the second crossing detector, the BUG-25 cull. Junctions
  become *designed at route time* (controlled arrival tangents) instead of *reconstructed afterward*.
- **Expected win:** primarily **complexity + fragility** (the user's "high and costly" complaint), with
  a secondary perf bonus (fewer, better-shared searches; deletes per-sample `_junctionPadCarve` node
  loops). Not primarily a cold-load-time win.
- **Preserves:** topology (still Urquhart cycles/connectivity), cost model, curvature-bounded curves.
- **Risk:** medium — it re-touches the shared carve surface we just spent three merges stabilizing;
  needs the full gate suite + drives. Bigger blast radius than Option 1.

### Option 3 — Potential-field / fast-marching routing  ·  speculative · HIGH risk
**Idea:** replace per-pair A* with a few Eikonal/fast-marching cost-to-go fields, trace routes by
gradient descent, then fit clothoids to the geodesic.
- **Why maybe:** FMM is O(N log N) per field and genuinely different from A*.
- **Why risky:** curvature bounds and "grade-yields-before-radius" are a HARD by-construction property
  of the current arc-primitive search; on an FMM geodesic they become a fragile post-fit. High chance of
  losing the exact-curvature guarantee. Listed for completeness; not recommended first.

### Cheap tuning levers (independent) — mostly already taken
- **Cheaper per-expansion checks:** `selfHit` (8.8%) + `inPondNoGo` (4.8%) = ~14% of cold load in inner
  collision tests. The documented remaining floor is the self-clear SCAN + repair re-search; the noted
  un-shipped lever there is an **incremental ancestor-proximity index** for `_selfClearScan`
  (FINDINGS.md:188-198). Real but small, and Option 2 may moot it structurally.
- **Weighted-A\* inflation:** DEAD (perf-worldgen P3, 2026-07-18) — the corridor field already replaced
  the distance heuristic's role, so `wHeur` inflation no longer stacks.
- **Bake/cache all seeds, not just the shipped default** (route bundle currently only covers seed 6).
  First-ever load still pays, but repeat loads of a seed go instant. (IndexedDB was descoped before;
  worth revisiting — orthogonal to Option 2.)

---

## 5. Recommendation & sequencing (UPDATED after the history vet + user direction)

Option 1 is closed (shipped). Option 3 stays a last resort. **Decision: pursue Option 2 (stroke
routing) as the primary effort** — the user chose it as "a quality win regardless," and the history
confirms the search-speed lever is spent, so Option 2 is also where the remaining *structural* perf sits
(fewer/longer searches + fewer self-clear repairs + deleted per-sample junction machinery).

Full Option 2 design lives in **`STROKE-ROUTING-DESIGN.md`** (this dir). It is a large, multi-file
re-architecture that touches the just-stabilized carve surface, so it goes through design sign-off
before any `src/` edits, then a staged, gate-backed rollout.

Honest framing of Option 2's perf claim: the headline cold-load number is already reduced by the
shipped corridor; Option 2's value is **primarily quality/complexity** (deleting ~1,500–2,000 lines of
junction/reconciliation artifact), with a **secondary, real** perf bonus from deleting per-sample
junction work and — potentially — cutting the self-clear repair count (the documented remaining floor),
because a continuous stroke has far fewer self-overlap conflicts than independently-routed crossing
edges.

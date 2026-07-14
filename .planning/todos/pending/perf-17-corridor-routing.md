---
id: PERF-17
type: perf
status: pending
severity: major
created: 2026-07-13
source: user-request
note: "Scoped for an Opus agent pickup. Attacks the seed-miss cold-load cost (7–16 s on the M4,
worse on slow hardware) at its root: hybrid-A* search area. Phase 0 (cheap dials) gates whether
the corridor rewrite is even needed — do NOT skip it. The user accepts routes CHANGING once
(like the honest-grade rework) but NOT any loss of determinism/window-invariance."
---

# PERF-17: Hierarchical corridor routing — cut per-edge search cost 5–10× for cold load

## Context / problem

Non-default-seed cold load = ~139 route jobs (spawn band warm), 44–80 s of worker CPU on the M4
(pool of 4 → 7–16 s wall, thermal-dependent; expect 30–60 s+ on weak hardware). PERF-08/15
established: no code regression, no scheduling fat left (pull-model dispatch, pool 8 measured
WORSE on 4P+6E cores). The cost is the **hybrid-A\* search itself** — each edge floods a large
region between its anchors, expanding arc-primitive states against the coarse-height closure.
Routing ALREADY runs on the coarse layer (workers get only coarseAmplitude/Freq/Octaves/
ridgeSharpness — never fine/regional noise or meshes), so "coarsen the terrain for routing" is
already the architecture; the remaining lever is **search area**, which a corridor collapses.

Key code (all in the ROUTE SYNC region of `src/road-carve.js`, mirrored byte-identical into
`src/road-worker.js` — gate `route-worker-sync.mjs` asserts the mirror):
- `arcPrimitiveConnect(ax, az, bx, bz, heightFn, opts)` — the hybrid-A\* (state = cell ×
  heading-bin), primitive palette (hardR/gentleR/straight), in-search self-clearance, pond-disc
  hard rejection, QUAL-14 escape hatch (goal walled by corridor discs → retry once without
  them), closest-expanded-node fallback (NEVER returns null).
- Self-clearance backstop repair loop: `SELF_CLEAR_MAX_REPAIR = 16`, iterative-DEPENDENT (each
  retry adds no-go discs from the previous attempt's violations) — NOT parallelizable; mostly
  idle since in-search prevention (seed 6: one edge, ≤9 iterations).
- `test/arc-router.mjs` gate: `PERF:height-calls-bounded` (<8000 heightFn calls / 256 m
  connection) and `PERF:search-time` — these encode current per-edge cost expectations and WILL
  need re-blessing.

## Phase 0 — cheap dials first (measurement gate for the whole ticket)

Before any rewrite, measure how far the EXISTING knobs go. Headless protocol (no browser):
build a bench on `test/lib/road-headless.mjs` + `RANGER_PARAMS` (real coarse closure — construct
`new RoadSystem(seed, RANGER_PARAMS)`, time `warmSpawnBand`-equivalent work: `ensureTile` 3×3 at
origin for seeds 42, 1337, 9001; `perf-runs/bench-worldgen.mjs` pattern from PERF-08 exists as
prior art).

Dials, measured one at a time then combined:
1. `roadArcHeurWeight` 1.5 → 2.0 / 2.5 (greedier A\* = smaller flood; existing opt, slider
   exists). Suspected 1.5–2.5×.
2. Search lattice coarsening: primitive step length (`primLen`) and heading-bin count in
   `arcPrimitiveConnect` — 1.25× / 1.5× step. Suspected ~step² fewer expansions.
3. Grade-sample spacing along primitives (the per-expansion heightFn loop).

For each: record (a) total routing ms for the band, (b) road-quality metrics — grade excess
distribution, curvature histogram, total length delta vs baseline (sample the routed centerlines;
`road-character` style stats), (c) screenshots of 2–3 landmark junctions (seed 6:
`node test/screenshot.mjs -38 183`) after regenerating the bundled cache.

**Decision gate: if combined dials reach ≥3× with visually-acceptable roads (user eyeball), STOP
— ship the dials as PERF-17 and do not build the corridor.** The corridor is only worth its risk
below that.

## Corridor design (Phase 1+, only if Phase 0 insufficient)

Two-pass per edge, both passes inside `arcPrimitiveConnect`'s file/mirror discipline:

1. **Coarse pass:** same search with a cheap parameterization (3–4× primitive step, halved
   heading bins, coarser grade sampling, same pond discs — topology constraints stay hard).
   Output: low-fidelity centerline polyline. It only needs to pick the right VALLEY/SADDLE, not
   good geometry.
2. **Corridor:** the coarse polyline inflated by CORRIDOR_HALF_WIDTH (start ~60 m; tune so the
   fine route never touches the wall on a benchmark seed set). Represent as the polyline +
   half-width (point-to-segment distance test), NOT rasterized.
3. **Fine pass:** the CURRENT search, unchanged, plus one extra expansion rejection: endpoint
   outside the corridor → illegal move (mechanically identical to the pond-disc rejection —
   reuse that code shape). Same primitives, same min-radius-by-construction, same grade
   handling → final road quality is preserved except for global topology choices.
4. **Escape hatch (mandatory):** fine pass fails to capture the goal inside the corridor →
   retry once WITHOUT the corridor (exact current behavior). Mirrors the existing corridor-disc
   escape hatch — same philosophy, deterministic. Bounds worst case at today's cost for that
   edge.

### Hard requirements (non-negotiable)
- **Determinism / window-invariance:** the whole chain (coarse route → corridor → fine route)
  must remain a pure function of (seed, anchor pair, params). No timing, no cross-edge state.
  Window-invariance gates that must stay green: invariance, restream-invariance,
  centerline-curvature (D-16), graph-cull-radius-invariance, defect-b-grade,
  road-band-coverage.
- **ROUTE SYNC discipline:** edit the canonical `src/road-carve.js` region and re-mirror into
  `road-worker.js` WORKER_SOURCE in the same commit; `route-worker-sync.mjs` must pass.
- **Sync fallback identity:** the main-thread synchronous router and the worker must produce
  byte-identical results (the route cache depends on it) — the corridor logic lives inside
  `arcPrimitiveConnect` itself, so this holds by construction; verify via route-bundle-parity.
- **Bundled cache regen:** routes WILL change → regenerate `data/route-cache-default.json.gz`
  (regen script pattern: see memory `project_qual08_router_worker` — recreate in scratch) and
  route-bundle-parity gate green.
- **Solo/corridor-dep interplay (QUAL-14):** corridor-disc deps route SOLO first; the corridor
  (this ticket's, from the coarse pass) applies to BOTH solo and final searches identically, or
  to neither — do not create a solo/final asymmetry (cache identity depends on it).
- **NEVER weaken:** pond hard-rejection, min-radius-by-construction, in-search self-clearance,
  the escape hatches, `maxRoadGrade` handling. Grade yields before radius (see memory
  `project_centerline_validity_mandate`).

### Measurement / acceptance
- [ ] Phase 0 table (dials × time × quality) recorded in this ticket; decision documented.
- [ ] If corridor built: headless band-routing time for seeds 42/1337/9001 ≥3× faster than
      baseline (target 5×); browser cold load seed 42 measured via
      `node test/profile.mjs --scenario=coldload --seed=42` (quiet, cooled machine — see
      FINDINGS.md measurement gotchas; expect thermal variance, compare interleaved runs).
- [ ] Escape-hatch rate on the benchmark seeds <5 % of edges (higher means the corridor width
      or coarse pass is mistuned — widen before shipping).
- [ ] All road/graph/water gates green (`npm run test:all`); known-red GRAPH-REACHABILITY
      excepted (BUG-35) — compare its largest-component % against the 78 % baseline: corridor
      routing may CHANGE it either way; a big drop is a red flag even though the gate is red.
- [ ] `test/arc-router.mjs` PERF assertions re-blessed to the new cost envelope.
- [ ] Road-feel eyeball by the USER at 2–3 landmark spots + a drive (routes change once; that is
      accepted, but character regressions — wall-hugging, corridor-shaped wiggles, switchback
      loss — are not). Screenshots before/after at identical coordinates for the review.
- [ ] FINDINGS.md addendum with the new cold-load numbers.

### Risks / known traps
- Corridor too narrow → escape-hatch storms (cost WORSE than baseline: coarse + failed fine +
  full fine). The <5 % acceptance bound guards this; tune width up first.
- Coarse pass picking a different valley than today's optimum → visible route change. Accepted
  once, but check switchback-rich areas specifically (the honest-grade work fought hard for
  those — memory `project_roadfeel_honest_grade`).
- The `_selfClearScan` repair loop runs on the FINE result; repairs add no-go discs that may
  push the route against the corridor wall — if an edge repairs >3 iterations with the corridor
  active, drop the corridor for that edge's repair retries (fold into the escape hatch).
- Worker mirror escaping: WORKER_SOURCE is a template literal — backticks/`${}` in new code must
  be escaped exactly as the existing mirror does; the sync gate catches drift byte-exactly.
- Do NOT run performance comparisons while `npm run test:all` or another Chrome is running
  (fanless M4 thermal contamination — see FINDINGS.md gotchas; interleave A/B runs).

## Pointers
- `.planning/perf/FINDINGS.md` — cold-load numbers, measurement discipline.
- Memories: `project_perf08_harness_findings`, `project_qual14_route_clearance` (escape hatch,
  corridor discs, solo deps), `project_arc_primitive_router`, `project_centerline_validity_mandate`,
  `project_router_refit_dequantize` (refit runs downstream of the search — corridor must not
  break refit's assumptions).
- Prior art for "constrain the search with discs": pond route-around (`opts.pondDiscs`) and
  QUAL-14 corridor discs (`opts.avoidDiscs`) — the corridor is the same mechanism inverted
  (stay-inside vs stay-outside).

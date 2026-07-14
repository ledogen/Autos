---
id: PERF-17
type: perf
status: pending
severity: major
created: 2026-07-13
source: user-request
note: "SHIPPED PARTIAL 2026-07-13 (corridor landed at the character-safe 60 m width; 1.5-1.9x
headless / ~1.4-1.5x browser vs the 3x bar — see STATUS at bottom; kept OPEN for the follow-on
levers + user road-feel review). Original brief: Scoped for an Opus agent pickup. Attacks the seed-miss cold-load cost (7–16 s on the M4,
worse on slow hardware) at its root: hybrid-A* search area. USER DECISION 2026-07-13: skip the
Phase-0 dial gate — build the corridor directly (the dials remain listed below as optional
stacking levers AFTER the corridor ships, and roadArcHeurWeight is still worth capturing in the
baseline table for context). The user accepts routes CHANGING once (like the honest-grade
rework) but NOT any loss of determinism/window-invariance."
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

## Step 1 — baseline bench (required before touching the router)

Headless protocol (no browser): build a bench on `test/lib/road-headless.mjs` + `RANGER_PARAMS`
(real coarse closure — construct `new RoadSystem(seed, RANGER_PARAMS)`, time
`warmSpawnBand`-equivalent work: `ensureTile` 3×3 at origin for seeds 42, 1337, 9001;
`perf-runs/bench-worldgen.mjs` pattern from PERF-08 exists as prior art). Record per-seed total
routing ms + per-edge distribution (the corridor's win is measured against THIS, and the
escape-hatch rate needs the per-edge view). Also record road-quality baseline: grade-excess
distribution, curvature histogram, total network length, and screenshots at 2–3 landmark
junctions (seed 6: `node test/screenshot.mjs -38 183`).

(The former Phase-0 dial experiments — roadArcHeurWeight 2.0+, lattice step coarsening, grade
sample spacing — are SKIPPED by user decision. They stack multiplicatively with the corridor and
remain available as follow-on levers if the corridor alone falls short of target.)

## Corridor design (the plan of record)

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
- [x] Step-1 baseline table (per-seed routing ms + per-edge distribution + quality metrics)
      recorded in this ticket (see STATUS 2026-07-13 below).
- [ ] **MISSED (partial win):** headless band-routing 1.5–1.9× faster (edge-sum 1.6–1.7×), NOT
      the ≥3× bar. The corridor half-width is pinned at 60 m by the character constraint:
      30–40 m reaches 2.7–3.4× but visibly erases the seed-6 junction hairpin at (224,−192) — a
      "don't break" landmark — regardless of coarse-pass fidelity (measured with full heading
      bins AND cell-mult 2: hairpin still gone at 40 m; its lateral extent needs ≈60 m
      half-width to survive). Per-edge profile shows the remaining floor is self-clearance +
      refit fixed cost (~42 ms/edge) which the corridor cannot touch — the corridor DID cut the
      bare search ~2× (118.6 → 60.5 ms/edge net of the 12.4 ms coarse pass). Browser cold load:
      STATUS below.
- [x] Escape-hatch rate 0–0.7 % of edges on seeds 42/1337/9001 (<5 % bound).
- [x] Gates green (32/33 `test:all` at the shipped config; known-red GRAPH-REACHABILITY the
      only fail). REACHABILITY largest-component at the shipped CELL_MULT 3: **70 % (down from
      the 78 % baseline — RED FLAG, reported)**; the CELL_MULT 2 variant measured 81 % but
      erases the seed-6 junction hairpin at width 60 (hard character fail per this ticket), so
      character won the trade. Flipping one constant (CORRIDOR_CELL_MULT 3→2 + bundle regen)
      trades the hairpin for the 11 pts of connectivity if the user prefers.
      route-worker-sync + route-bundle-parity green at the shipped config.
- [x] `test/arc-router.mjs` untouched: it exercises the bare router (no corridorHalfWidth),
      which is byte-identical; PERF:height-calls-bounded unaffected, search-time is report-only.
- [ ] Road-feel eyeball by the USER (before/after PNGs in perf-runs/, identical coordinates:
      before-*.png vs final60-*.png at seed-6 landmarks).
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

---

## STATUS 2026-07-13: corridor SHIPPED at the character-safe width — headless ≥3× bar MISSED

Implemented exactly per the design (coarse pass → corridor capsule → corridor-constrained fine
pass → escape hatch), canonical in the ROUTE SYNC region of `src/road-carve.js`, mirrored into
`src/road-worker.js` (route-worker-sync green). New param `roadRouteCorridorHalfWidth` (60 m
default, "Route Corridor (m)" slider, 0 = single-pass pre-PERF-17 behaviour). Constants:
CORRIDOR_STEP_MULT 4, CORRIDOR_CELL_MULT 3, coarse hbins = fine>>1 (floor 8), disc spacing 8 m.
(Cell-mult 2 was tried and measured LESS character-faithful than 3 at width 60 on the junction
hairpin, and ~10 % slower — coarse fidelity is not the binding constraint, width is.)
Self-clearance repair iterations >3 drop the corridor (CORRIDOR_SELFCLEAR_MAXIT — the ticket's
repair-vs-wall trap). Corridor built WITHOUT avoidDiscs → identical for SOLO and FINAL searches
(QUAL-14 symmetry). Bundled default-seed cache regenerated (route-bundle-parity green;
regen + bench scripts: perf-runs/gen-default-route-cache.mjs, perf-runs/bench-corridor.mjs).

### Baseline (single-pass) vs corridor-60 — headless, M4, perf-runs/bench-corridor.mjs

| seed | band ms base→corr | edgeSum ms base→corr | med ms/edge | p90 | escape% |
|------|-------------------|----------------------|-------------|-----|---------|
| 42   | 20663 → 11787 (1.75×) | 26557 → 14493 (1.83×) | 152 → 82 | 311 → 161 | 0.0 |
| 1337 | 23551 → 14908 (1.58×) | 29178 → 18915 (1.54×) | 143 → 78 | 355 → 184 | 0.7 |
| 9001 | 15176 →  7642 (1.99×) | 25182 → 12494 (2.02×) | 135 → 75 | 323 → 125 | 0.0 |

Quality: network length −3 % avg; grade-excess +2–6 % (17.3→17.7 km·excess seed 42); curvature
histogram broadly stable (tight bin −11 %/+9 %/+6 % across the three seeds).

### Width sweep (why 60 m)

| half-width | med ms/edge (s42/s1337) | escape% | seed-6 character |
|-----------|--------------------------|---------|------------------|
| 30 m | 44 / 42 (3.4×) | 0.0 | junction hairpin (224,−192) ERASED, switchback spot rerouted |
| 40 m | 59 / 54 (2.6×) | ≤1.4 | hairpin still erased — even with full coarse hbins + cell-mult 2 |
| 50 m | 69 / 67 (2.2×) | 0.7 | not eyeballed (between) |
| 60 m | 82 / 78 (1.8×) | ≤0.7 | hairpin survives (relocated); landmark screenshots for review |

The hairpin's lateral extent (~80–100 m loop) is the binding constraint, not coarse fidelity —
invariance > quality > speed, so 60 m ships. Follow-on speed levers (per the original ticket):
the dial experiments (roadArcHeurWeight ≥2, palette/grade-sampling coarsening) stack
multiplicatively with the corridor, and the ~42 ms/edge self-clearance+refit fixed floor is its
own target (it is now LARGER than the corridor-constrained search itself).

### Browser cold load (seed 42, interleaved A/B, cooled, worktree @803c174 on :8001 vs HEAD on :8000)

| run | OLD ready / ring | NEW ready / ring |
|-----|------------------|------------------|
| 1¹  | 6869 / 7676 ms   | 4835 / 5611 ms   |
| 2¹  | 6939 / 7992 ms   | 4428 / 5392 ms   |
| 3²  | 6614 / 7391 ms   | 4929 / 5723 ms   |

¹ interim CELL_MULT 2 build · ² shipped CELL_MULT 3 build (confirming pair)

≈1.4–1.5× faster ready (−25/−35 %); consistent with the headless 1.7× (the browser number includes
non-routing load work). Escape hatch, gates, cache regen all green — the remaining gap to the
3× bar is the character-constrained width + the self-clearance/refit floor documented above.

### Ticket disposition

Corridor SHIPPED (commit body has the numbers) but the ticket STAYS OPEN: the ≥3× headless bar
was missed (1.5–1.9× measured). Follow-on levers if the user wants the rest: (a) the original
dial experiments (stack multiplicatively — roadArcHeurWeight, palette coarsening), (b) attack
the ~42 ms/edge self-clearance + refit fixed floor, (c) accept narrower corridor on NON-default
seeds only (default seed ships from the bundled cache anyway — but that forks route character
by seed class, likely unwanted). USER REVIEW needed: before/after screenshots
(perf-runs/before-*.png vs perf-runs/final60-*.png) + a drive; routes changed once (accepted),
verify no wall-hugging / corridor wiggles / switchback loss beyond the reviewed landmarks.

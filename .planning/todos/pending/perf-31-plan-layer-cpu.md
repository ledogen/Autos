---
id: PERF-31
type: perf
status: pending
severity: medium
---

# PERF-31 — the plan layer's ~3×: claw worldgen back toward v2-at-birth

**Banked until PERF-30 lands** (owner choice 2026-09-03: off-thread first, so CPU regressions
attribute cleanly). This is the CPU half of the "why is v2 slower than v1" question; PERF-30 is
the felt half.

## The measured baseline (2026-09-01, three 1400 m windows, same machine)

| era | time | routes |
|---|---|---|
| v2 at birth (`bb96f73`, 2026-08-19) | 5.2 s | 64 |
| + BUG-56 merge/crossing machinery | 19.6 s | 104 |
| + R4 settle, scoped (shipped) | **15.6 s** | 144 |

CPU profile at head: `corridorSearch` 70.7% · `profileSolve`/`profileSolveBundle`/`classOf`
~10% · `_v2ConflictPairs` 3.3% · `_nearestOnPolyXZ` 2.9% · `_pairProperCrossingsXZ` 1.5%.

## The levers, in expected-value order (measure before touching)

1. **Route count.** 144 routes vs birth's 64. Where: the plan layer samples partner edges within
   `censusChordM` (300 m) of every evaluated edge; the settle pass's 1-ring; the `#g` hard-grade
   rungs. Candidates: shrink the partner-sampling bound with a measured false-negative check;
   share samples across planners harder (one `_v2RunSample` memo already exists — find the
   misses); skip conflict evaluation for pairs whose chord separation can prove no-conflict.
2. **Per-route cost.** Birth ~25 ms/route, now ~40+ ms. `ee93e99` already took 1.82× out of the
   search; what remains is margin edges routing with `margin = max(800, chord)` boxes — a
   corridor cost that scales with box area. A tighter margin for PLAN-ONLY samples (never
   registered) is a candidate — but priced==built must hold for anything that ships, so
   plan-only relaxation needs a hard fence.
3. **Profile solves.** `_v2GradePts` runs per sample; the merge ladder re-solves per variant.
   `f82dd08` (walk the ladder once) took 28% out — measure what is left.
4. **Redundant plan passes.** R4's pass 2 re-plans everything when any pin class flips; measure
   how often flips occur per window and whether pass 2 can re-plan only the flip-adjacent
   subgraph.

## Acceptance

- [ ] Three-window benchmark ≤ 8 s (roughly halfway back to birth) with ZERO quality movement:
      `wye-release`, `junction-stitch` row count, `graph-topology`, `world-determinism`,
      `road-worker-parity`, network hash on the battery — all unchanged
- [ ] Every lever pulled is measured before/after in the commit message; every lever declined
      is measured too (why it wasn't worth it)
- [ ] No relaxation of priced==built without an explicit owner ruling

## Lever 5 — parallel routing (added 2026-09-04, from ROUTER-REUSE-AND-PARALLELISM.md §2)

The play build runs on one core inside the network worker; the route pool sits idle during it.
Predictive pre-warm (warmBandComplete/_warmScan re-pointed at the build instance) fans the
per-edge pure `routeEdgeV2` out to the pool, then the serial build walks a warm cache.

**Go/no-go MEASURED 2026-09-04** (`test/measure-route-demand.mjs`, three 1400 m windows, seed 6):
build 17.4 s wall; routing on the build thread 7.8 s (**45 %**, not the sampled profile's 70.7 %);
demanded keys 214, warm-scan predictable **52 %**; zero `#g` rungs; the unpredictable half is
pin-variant mismatch (settle-pass fringe pins + direction variants the scan doesn't derive).
So lever 5 requires pin parity in the warm scan first (bar: ≥ 90 % predictable), and it lands
AFTER lever 1 — route count multiplies into everything. Full sequencing:
`.planning/PLAN-2026-09-04-PERF31-PARALLEL.md`. The plan layer itself stays single-threaded
(parallelisable share ~10 % of total; not worth the determinism risk — recorded there).

**Owner target clarification (2026-09-04):** the 8 s bench stands, but the binding concern is
absolute cost on slow devices — a >30 s loading screen hampers a slow-machine player. Record
story-mode entry at --cpu=4 alongside every lever; >30 s there fails the real requirement
whatever the bench says. FEAT-76 confirmed sequenced AFTER this ticket.

## W1 + W2 — SHIPPED 2026-09-05 (`61a9221`, `9f60056`, `894c9b9`)

Worked the plan in `.planning/PLAN-2026-09-04-PERF31-PARALLEL.md`. Levers pulled, each measured:

**W1 — the reversed-spelling flip dropped sibling bearings** (`61a9221`). `_edgeCenterline`'s
reversed-traversal path derived the forward spelling's pins but discarded `sibStart`/`sibGoal`,
minting a sib-less forward key per reversed request — a guaranteed miss beside the warm scan's
sib-ful entry, one full `routeEdgeV2` each (39 of 214 demanded keys). Sibs are node-local
bearings toward the node's other neighbours, not directions of travel, so the flip swaps ends
unnegated. Predictable share **52 % → 62 %**; battery network hash byte-identical on all 9
windows; junction-stitch row count unchanged (91 with and without).

**W2.1 — pin parity** (`9f60056`). `warmBandComplete` grew an opt-in phase (`warmPlanDemand`,
default OFF) enumerating the plan layer's demand with the pins the build derives, in waves:
settle 1-ring (mirrors `_v2SettleDeletions`'s selection), census partners (mirrors
`_v2ConflictPairs`'s bound), then the settle pass run at warm time to yield the pass-2
built-degree keys. Pure enumeration from the build's view — `_streamNetwork` bumps `_networkRev`
before `_assembleGraphEdges`, so warm-minted verdicts die at the bump. **Predictable 95.7 %
(178/186)** — past the ≥ 90 % go/no-go bar. Residual 8 keys, all 2-ring `_v2NodeMerges` (~0.5 s).

**W2.2 — nested route pool in the network worker** (`894c9b9`). The worker spawns its own
`RoadRouteWorker` pool and pre-warms its private instance before `update()`; falls back to a
cold build on any failure or a 60 s deadline. `beginPrewarmedBuild()` moves the rebuild's rev
bump + CR-02 bounds to the START of the warm→build pair, so the warm's rev-keyed pass-1 plan
memos carry into the build — without it they were re-derived and that ate nearly the whole
off-thread win. Rev still advances once per real rebuild, so a moved window cannot read the
previous window's frozen delete set (parity gate has a moved-center leg for exactly this).

### Numbers

| measure | before | after |
|---|---|---|
| network-worker THREAD cost, 3× 1400 m windows | 18.2 s | **11.1 s** (6.0 warm scans + 5.2 carried build) |
| routing CPU moved to the pool | 0 | 6.5 s (~1.6 s wall at 4 workers, overlapped) |
| warm-scan predictable share | 52 % | **95.7 %** |
| story entry, cpu ×4, seed 6, cold (4 samples) | 18.0/18.1/19.1/20.6 s | **15.4/15.5/15.7/15.7 s** |

Story entry stays far under the owner's 30 s bar and its spread tightened sharply. The
end-to-end win (~3 s) is smaller than the thread-cost win because story entry builds ONE region
and much of its wall-clock is terrain, POI placement and carve re-bake — untouched by this work.
Instrument for it: `node test/story-entry-time.mjs --cpu=4` (rainy-day, needs the dev server).

Gates: `network-worker-parity` 13/13 (two new legs — a pre-warmed build and a moved-center
carry, both byte-identical to the cold sync build); `wye-release`, `world-determinism`,
`restream-invariance`, `road-worker-parity` green; affected suite 32/36 with the four reds
(`junction-stitch`, `mission-network`, `paper-tour`, `pond-route-around`) all reproduced at
`9863058` before this work, deterministic numbers bit-identical.

**W3 — lever 3 (profile solves) PULLED 2026-09-05 (`420ed8e`).** Profiling the worker thread
*after* W2 moved routing to the pool showed the PROFILE SOLVERS, not `corridorSearch`, dominate
what is left: `profileSolveBundle` 11.7 % · `profileSolve` 8.4 % · `stationRateCls` 7.0 % · the
`makeStepCost` closure 8.8 % · `classOf` 13.8 %. The old sampled profile hid this by mixing in
routing, which no longer runs on that thread.

All three DP loops walked transitions (station i−1, elev k) → (station i, elev j) calling
`stepCost` per (j, k) pair — but the ARRIVAL class + station rate depend only on j and the
DEPARTURE class only on k, so each was recomputed kMax× / ny× per station. `makeStationTables()`
fills them once per station step. Float op ORDER is preserved exactly (the `ds * rate` product,
the `(ds·cRoadM·wGrade)·g·g` grouping, portal/abutment order, and `makeStepCost`'s
`cap + yStep/(2·ds) + 1e-9` grouping) — **battery network hash byte-identical on all 9 windows**.

| measure | after W1+W2 | after W3 |
|---|---|---|
| network-worker thread cost, 3× 1400 m | 12.2 s | **~8.2 s** (warm 6.7→4.5, build 5.5→3.3) |
| story entry, cpu ×4 (alternating A/B, same load) | 15.9 / 16.5 s | **14.9 / 13.8 s** |

That is essentially the ≤ 8 s bench target. Routing is unchanged (~7.1 s) — it is
`corridorSearch`-bound and `profileSolve` runs only at the end of a route.

MEASUREMENT TRAP recorded: an earlier browser batch read 21–24 s on BOTH sides of the A/B. Cause
was the harness itself — 267 leaked `autos-cdp-*` profile dirs and stray Chrome instances had
the load average at 6.4. Clean up CDP chromes between runs, and prefer an ALTERNATING A/B over
comparing against a baseline measured earlier in a session.

**Levers 2 and 4 still open** (margin-box cost for plan-only samples; R4 pass-2 scope) — but the binding owner requirement (slow-device entry
under 30 s) has margin, so the next session should re-price W3 against W1's untouched half:
route count is still 215 demanded keys vs v2-at-birth's 64, and the classifier in
`test/measure-route-demand.mjs` now names each producer (`_v2ConflictPairs<_v2DeleteFor`
dominates at 145 keys / 4.5 s). A measured candidate recorded and NOT pulled: the census
discovery bound (`censusChordM` 300 m) — over the battery, 3627 partner routes are probed and
only 149 bear a crossing; tightening the bound to 50 m would keep 146/149 while still routing
3339 of the 3478 empty probes, i.e. the bound is not what makes them empty. The waste is the
probe set itself, which is a route-reuse question (FEAT-76), not a threshold question.

## W4 — plan-layer CPU on the network thread, WORLD UNCHANGED (2026-11-06, `feature/spare`)

After W2 the network thread no longer routes, so its cost is the plan layer itself. Profiled
thread-only (`routeEdgeV2` and idle excluded; `--cpu-prof` on the worker path, three 1400 m
windows, seed 6). Every lever below is a pure cache or a proven-safe skip: the world fingerprint
(`fingerprint-world --compare` vs main `55c8b013`) is **ALL IDENTICAL after each commit**, and the
worker-path network hash stays `f96eb26bd930` throughout. Shares are thread-only CPU shares; the
ms column is the network thread's total over the three windows (`wip/perf-31/thread-bench.mjs`), each
commit's `road.js` benched in turn on one quiet machine (load ~2.5), cumulative from main's 8.00 s.

| commit | lever | count / share before → after | thread, cumulative |
|---|---|---|---|
| `cef63fff` | one profile solve per centerline per network rev: pass 1 and pass 2 (`_planRev` +0.5) asked the route cache for the same `Centerline` object and re-solved it; memo on the object, a hit replays the infeasible / stub / rung tallies so exported tallies match | `_v2GradePts` 854 → 479 per window (~290 distinct centerlines) | 8.00 → **7.37 s** (−0.63) |
| `3c93df56` | `_nearestWithinXZ`: walk a polyline in arc-length jumps — a vertex at distance d proves every point within arc `d − bar` of it is further than the bar (triangle inequality) — and run the full nearest-point scan only where a hit can be near. Predicates carry their bar (`_v2Near` → `reqMax`, throat `max(PROX, reqMax)`; the gap walk's `FLARE`). New fast gate `nearest-within`: 60 000 adversarial queries, 0 wrong; a mutant without the `−bar` fails 5 936 | nearest-point work ~30 % → ~14.6 % | → **6.63 s** (−0.74) |
| `33a3a1d5` | T probe (`_v2ForkCandidates`): each side sample's trunk hit found once, not once per fork candidate (it was O(candidates × side × trunk) — "O" = order of growth, constants dropped) | `_v2ForkCandidates` 15.5 % → 1.3 % | → **5.73 s** (−0.90) |
| `c12875ae` | clearance pass walks with the within-skip at 60 m (it already discarded hits past 60 m) | its share of the walk is now the 6.8 % that is genuinely near | → **5.43 s** (−0.30) |
| `a474e7c1` | T probe builds each departure once per rev (`_v2ProbeDeparture`, memo by side + ladder key); `_v2PromoteOne` / `_v2PromoteMidSpan` still build fresh | departures ~140 → ~85 (= distinct) per window; profile solves 479 → 427 | → **4.88 s** (−0.55) |

What is left on the thread (phase split by process CPU time): warm 79 % (of which the warm-time
settle pass 44 %), build pass 1 ~0 % (carried memos), pass 2 + assembly 21 %; the route pool burns
≈ 1.5× the thread's CPU. The thread is now mostly UNIQUE profile solves (`profileSolve` 27 %,
`_v2GradePts` 34 % inclusive) plus plan logic.

**Declined, with numbers:**
- **Lever 4, cross-pass merge-plan reuse** — pass 2 + assembly is 21 % of the thread, and reuse
  needs an exact key over the flipped pin classes plus tally replay. Small prize, intricate fence.
- **Lazy census** (`_v2PairCensus` 4.4 %) — skipping it moves the exported `infeasible` tally, so
  the fingerprint fails. Not world-invariant.
- **Lever 2, tighter margin box for plan-only samples** — changes routes, moves the world.
  Needs an owner call (priced == built), not a landing.
- **Route-count cuts** (fewer partners probed) — changes which partners are evaluated; not
  world-invariant.
- **Shove `RAMP` hoist, `_registerRun` memo** (2.9 %) — too small to carry.

**Timing (2026-11-06, the measurement slot the other lanes cleared; load 2–3.5, no leaked Chrome).**

| measure | main `55c8b013` | branch `a474e7c1` |
|---|---|---|
| network thread, 3× 1400 m (alternating A/B, 3 rounds each) | 8.03 / 7.99 / 8.00 s | **4.82 / 4.90 / 4.73 s** (−40 %) |
| … warm | 5.49–5.57 s | 4.04–4.21 s |
| … carried build | 2.42–2.54 s | 0.69–0.70 s |
| route pool CPU (unchanged by design) | 8.89–9.15 s / 511 jobs | 8.79–9.06 s / 511 jobs |
| story entry, cpu ×4, seed 6, cold (alternating A/B) | 11.6 / 11.8 / 11.6 s | **9.0 / 8.9 / 9.0 s** (−2.7 s) |

Story entry sits far under the owner's 30 s bar. The ≤ 8 s three-window bench target of this ticket was
met by W3; the thread is now 4.8 s of it. Gates: the affected set (`--changed=src/road.js,test/gates.mjs,
test/nearest-within.mjs` — a clean tree selects 0) 58/58 green, including network-worker-parity,
road-worker-parity, world-determinism, restream-invariance and the new nearest-within.

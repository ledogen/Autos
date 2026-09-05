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

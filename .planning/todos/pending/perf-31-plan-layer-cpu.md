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

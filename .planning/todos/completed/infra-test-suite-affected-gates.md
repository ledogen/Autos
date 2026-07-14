---
id: INFRA-02
type: infra
status: completed
opened: 2026-07-13
completed: 2026-07-13
severity: minor
source: user-request
---

# INFRA-02: Affected-gates selection — cut the nominal test loop from ~16min to seconds

## Problem

`npm test` ran all 33 gates every time (wall ~945s / 16min, gate-cpu ~4997s; top pigs
graph-cull-radius-invariance 679s, centerline-curvature 460s, route-merge 457s, graph-topology 413s,
pond-route-around 375s). On a fanless M4 Air on battery this all-core sustained load throttles AND
drains — and the 10-15min delay per change was killing the feature→test feedback loop.

## What shipped

- **`test/gates.mjs`** — new single source of truth: the 33 gates, each tagged `subsystem` / `cost`
  (fast|heavy) / `desc` / `extraDeps` (import-invisible file deps). Replaces the inline `GATES` array
  in run-all.mjs.
- **`test/run-all.mjs`** — `npm test` now runs **AFFECTED gates only**: builds the src/data/test import
  graph live from disk, computes each gate's transitive reachable-file set (+ extraDeps), and selects
  gates whose set intersects `git diff --name-only HEAD` + untracked. Modes: default=affected,
  `--all` (=`npm run test:all`), `--only=<substr>`, `--serial`, `--list` (preview, don't run),
  `--changed=<paths>` (preview a hypothetical edit set). If not a git repo → falls back to ALL (safe).
  Empty selection → loud "no gates cover these changes" message, exit 0 (never silent-green).
- **`package.json`** — added `test:all` + `test:affected` scripts.
- **Timing asserts demoted to report-only** (`arc-router` PERF:search-time, `road-dequantize` TIMING) —
  wall-clock, flaky, machine-dependent; real budgets belong to the PERF-08 profiling harness. This let
  the whole `TIMING_GATES` serial special-case be **deleted** from run-all.mjs.
- **CLAUDE.md** — regression-gates bullet updated (was stale: "6 headless gates").

## Cull audit (no gates deleted)

Investigated for dead/outdated gates: none found. The suite is regression pins (BUG-12/15/21/22/24/25/27,
QUAL-07, FEAT-*), each pinning a distinct invariant at a distinct layer. Apparent overlaps are not:
min-radius is checked at router (arc-router VALID-BY-CONSTRUCTION) / exact-primitive (centerline-curvature)
/ dense-realized (road-minradius) levels; the 5 "invariance" gates each assert a different property.
crossing-classifier is live (src/road.js FEAT-19 `_crossingsByRun` feeds carve widening). All 33 gate
imports resolve to live modules (suite ran 32/33) ⇒ nothing targets a removed subsystem. Lever is
selection + (later) sampling the pigs, NOT deletion.

## Verified

- `npm test` on the dirty tree → 2/33 selected (the two edited gate files), 4s, green.
- `--list --changed=` preview matches intent: sky.js→0, physics.js→3 physics, prop-scatter.js→2 props
  (not rock-collision), terrain.js→3, seed.js→25 (foundational, excludes seed-free gates), water.js→5,
  route-cache-default.json→route-bundle-parity, road-worker.js→route-worker-sync (extraDeps fire).

## Follow-ons

- **BUG-35** — graph-topology GRAPH-REACHABILITY red (78% vs 0.85 threshold), long-standing accepted,
  not a regression. Stays in the road subsystem set so affected-mode still runs it on road edits.
- **INFRA-01** — Windows/desktop offload for the full `test:all` sweep. Complementary: affected-mode
  cuts the nominal loop, INFRA-01 makes the full sweep cheap.
- Not done (deferred): `QUICK=1` sampling knobs on the pig gates for a cheap-breadth mid-tier.

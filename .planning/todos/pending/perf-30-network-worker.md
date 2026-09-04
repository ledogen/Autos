---
id: PERF-30
type: perf
status: pending
severity: high
---

# PERF-30 — the network worker: the whole road build off the main thread

Owner-ratified 2026-09-03. **Requires INFRA-06 closed** (main carries the v2 router + BUG-56
plan layer, full suite green). Companion plan: `.planning/PLAN-2026-09-03-OFFTHREAD-NETWORK.md`.

## Why

The BUG-56 plan layer (conflict walking, merge ladder, profile solves, R4 settle) runs
synchronously inside `_streamNetwork` — measured at ~15.6 s for three 1400 m windows, all on the
main thread. The corridor search (70% of build CPU) already runs off-thread; the plan layer does
not, and it is what the player feels as streaming/teleport/map hitches. This ticket moves the
ENTIRE build off-thread. It deliberately does NOT reduce the CPU cost — that is PERF-31.

## Design

A **module worker** (`src/road-network-worker.js`), same import-the-real-code pattern as
`road-route-worker.js` — the no-mirror fence. Feasibility is already proven: `RoadSystem` runs
headless in node for every gate, and map2d constructs a second instance today.

- **Worker side**: owns a `RoadSystem(seed, paramsSnapshot)`. Request
  `{epoch, seed, params, center, radius, pondDiscs}` → runs `setRadius` + `update` (routing
  synchronous inside the worker — off-thread is off-thread) → posts the registered network as
  transferable typed arrays: per run `{key, points, polyCum, clArc, arcOrigin, cellA, cellB,
  cededSpans, offCurveSpans, departureSpans, tunnelSpans}`.
- **Main side**: new `RoadSystem.adoptNetwork(data)` — fills `_network`, bumps `_networkRev`,
  drops every rev-keyed cache, re-slices. Derived state (Urquhart graph, nodeInc, junction
  rings, profiles) is rebuilt main-side from the adopted network — it is the cheap part; the
  plan layer is what is skipped. The swap is atomic within one frame callback.
- **Stale-until-replaced**: play keeps driving the old network while a build is in flight —
  the exact pattern the map's warm restream shipped 2026-09-01 (`d08d016`), promoted to play.
- **Cold spawn / teleport to fresh terrain**: block behind the existing loading screen (owner
  choice 2026-09-03) — the off-thread build lets the loading screen actually animate.
- **Params epochs**: copy the route worker's proven protocol — sliders bump the epoch,
  in-flight replies against a stale epoch are discarded wholesale.
- **Water**: pond no-go reaches the worker as disc DATA (arrays), never closures; a water
  rebuild bumps the epoch.
- **Fallback**: no worker (headless, gates, node) → the synchronous path, untouched. Every
  existing gate runs exactly as before.

## Gates

- **New `test/network-worker-parity.mjs` (registered, gating)**: the worker-built network is
  byte-identical to the synchronous build for the same `(seed, params, center, radius)` — the
  `road-worker-parity` pattern one level up.
- `world-determinism`, `restream-invariance`, `road-worker-parity`, `graph-topology`,
  `wye-release` all stay green — they are the swap protocol's referees.

## Acceptance

- [ ] Streaming while driving never runs the plan layer on the main thread (profile trace shows
      no `_v2*` frames in the main-thread build path during play)
- [ ] Network-worker-parity gate green across the battery windows
- [ ] Cold spawn and teleport behave as today (loading screen), measured no slower
- [ ] Slider edits (road params) rebuild correctly via the epoch protocol — no stale network
- [ ] PERF-08 hitch numbers before/after recorded; cross-reference PERF-28 (this should close
      most of its streaming-hitch class — re-measure, don't assume)
- [ ] Decision recorded on the old route-worker prewarm (likely redundant in play, may stay for
      the map) — measured, not guessed

## Traps

- Everything keyed on `_networkRev` must invalidate in the SAME swap (memos, profiles, slices,
  cell candidates, hint caches) — a partial invalidation is a physics/mesh divergence.
- `adoptNetwork` consumers: post-build code reads network/profiles only, but verify no consumer
  reaches into planner memos after build (they are build-time state).
- Two more `RoadSystem` instances (worker + map's) — memory is fine (map proved it), but the
  map should eventually ADOPT this worker rather than keep its own sync build (phase 3
  decision, not a blocker).
- Serial implementation only; Opus subagents for read-only survey/verification (standing rules).

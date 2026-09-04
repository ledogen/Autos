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

## Resolution (2026-09-04)

Built in three phases on main (post-INFRA-06), each gated. The synchronous path is
byte-untouched — every headless gate runs exactly as before; the worker path exists only
where main.js wires it.

**Phase 1 — scaffold + parity.** `src/road-network-worker.js` (module worker, imports the
real RoadSystem — no mirror), `RoadSystem.exportNetwork()/adoptNetwork()` (runs as
centerline descriptors + the planner state post-build consumers read), and the registered
gating `test/network-worker-parity.mjs`. Three protocol seams were measured into shape and
are pinned by the gate: `pondDiscPad()` (a 2 km disc pad missed a pond 4.3 km out and
resurrected a drowned site), `graph.dropped` (adj-vs-edges asymmetry resurrected a
degree-pass drop as a phantom junction), and `nodeInc` (without it the pad plane fit zero
strands — flat pads, 18 cm deck steps).

**Phase 2 — play integration.** `setNetworkDispatcher` + `src/road-network-client.js`:
per-frame rebuilds defer to the worker with the OLD network serving until the atomic swap
(~5 ms, measured); slider invalidates defer the destructive half so generation bumps AT the
swap (ribbon+carve rebuild against adopted geometry, never against stale); spawn resolve
and story region entry await `client.buildNow()` behind the loading screen.

**Phase 3 — measured (all vs acceptance):**
- Plan layer on main thread during play: **0 ms / 0 sync rebuilds** across four 2 km jumps
  (instrumented `_streamNetwork`); sync path same pattern: **3.09 s** (~770 ms/restream).
- `network-worker-parity` 10/10 incl. warm-instance reuse and the play protocol.
- Cold spawn: worker **3.0–3.2 s** boot-to-seated vs **4.3 s** sync — faster, not just
  no-slower. Story entry: **12.4 s** to a live frozen 2800 m region (152 runs), loading
  screen animating throughout, zero console errors.
- Slider edits: verified live — epoch bumps at the drag, stale network serves, generation
  bumps at the swap.
- Hitch numbers: `perf-runs/perf30-after-{stream,drive}.json` (hitch-report --cpu=4);
  cross-referenced into PERF-28, whose road-side class this closes (terrain stages remain).
- **Prewarm decision (measured, not guessed):** with the worker active the play route-cache
  has no consumer — warmRoutes never drained and its degree-drop scan owned the worst road
  frames left (~40 ms at cpu×4). Play now SKIPS warmRoutes when the client is wired; the
  map + mission planner keep their own warm paths, the no-worker fallback keeps this one.

**Deferred, recorded:** the map keeps its own sync RoadSystem for now (the d08d016 warm
restream made it acceptable); adopting the network worker there is a follow-up if the map's
one re-plan per restream still reads as a hitch. `window.__roadSys()` dev handle added for
CDP probing (stats view stays `__road()`).

**Remaining human check:** the owner's drive on :8000 — the machinery is measured; the feel
is theirs to sign off.

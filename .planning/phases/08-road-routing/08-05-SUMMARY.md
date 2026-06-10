---
phase: 08-road-routing
plan: 05
subsystem: road-routing
tags: [road, routing, valley-trunk, a-star, soft-cost, streaming, gap-closure]
requires:
  - "src/seed.js seedFor/mulberry32 (deterministic anchor seeding)"
  - "src/road.js existing _proto engine (spike-001 validated): _protoAnchor/_protoConnect/_protoEdgeCost/_protoSimplify/_removeLoops"
provides:
  - "src/road.js _streamNetwork(center): canonical valley-trunk network builder → this._network"
  - "this._network Map<'<mz>:<runIndex>', {points: THREE.Vector3[]}>: single source of truth for slicing/viz/queries"
  - "data/ranger.js D-09 locked cost defaults (roadWDist/roadWAlt/roadWGrade/roadWOver/roadWTurn + maxRoadGrade 0.15)"
affects:
  - "08-06 (slicing): reads this._network polylines"
  - "08-07 (viz + wiring): retargets ensureTile/queryNearest/buildDebugLines onto this._network; replaces updateProto"
  - "src/main.js / test harnesses: ensureTile/queryNearest are now stubs until 08-07 re-wires them"
tech-stack:
  added: []
  patterns:
    - "Soft-cost turn-penalty A* (D-09): wDist·horiz + wAlt·h + wGrade·grade² + wOver·max(0,grade−maxGrade) + wTurn·(Δheading/45°) — FINITE, never Infinity"
    - "Streaming macro-anchor network (256 m grid) built per-row into a deterministic keyed Map, lazy-gated like terrain chunks"
    - "Cost weights seeded from params (no hardcoded literals) so live sliders flow through"
key-files:
  created: []
  modified:
    - "src/road.js — deleted per-tile A* router; added _streamNetwork; seeded _proto.params from _params; updateProto delegates to _streamNetwork"
    - "data/ranger.js — replaced Phase-8 road block with D-09 locked params"
decisions:
  - "D-08: valley-following streaming-anchor model is the REAL RoadSystem core (not a disabled proto)"
  - "D-09: soft-cost A* (altitude-dominated + grade² + finite over-cap + turn penalty), never 'no path'"
  - "D-02 REVISED: soft over-cap penalty (roadWOver·excess), NEVER a hard Infinity grade block"
  - "D-04: dominant wAlt term makes the route wrap AROUND high ground"
metrics:
  duration: ~9 min
  completed: 2026-06-10
---

# Phase 8 Plan 05: Valley-Trunk Streaming Core Summary

Productionized the spike-001 valley-trunk engine into the canonical `RoadSystem` routing core: deleted the per-tile west→east A* router and its hard `return Infinity` grade block, added `_streamNetwork(center)` that builds the canonical `this._network` polyline store from seeded macro-anchors via the locked D-09 soft-cost turn-penalty A*, and locked the D-09 cost defaults in `data/ranger.js`. Closes 08-VERIFICATION truths 1, 2, 3.

## What Was Built

### Task 1 — Delete per-tile router, lock D-09 defaults (commit `19da537`)
- **Deleted** from `src/road.js`: `_seamPoint`, `_deriveEdgeWaypoints`, `_edgeCost` (the one with `if (grade > maxRoadGrade) return Infinity`), `_heuristic`, `_routeTile`, `_getTileWaypointsOnly`, `_buildTileSpline`, `_getTile`, and the `SEAM_SAMPLES` module constant.
- **Neutralized** the public API methods whose old bodies reached the deleted router into benign stubs (rebuilt in 08-06/08-07): `ensureTile`/`queryNearest` return `null`; `buildDebugLines` is a no-op; `setDebugVisible` only toggles existing line visibility; `invalidateCache` now clears `this._network` + proto caches instead of the gone per-tile caches. No live call path reaches a deleted symbol; `src/road.js` imports cleanly as an ES module.
- **Rewrote** the file header doc-comment to describe the valley-trunk streaming model (D-08/D-09/D-02 REVISED/D-04); dropped the per-tile / shared-seam / hard-grade-block language.
- **Replaced** the `data/ranger.js` Phase-8 road block with the LOCKED D-09 tunable defaults: `maxRoadGrade: 0.15` (soft over-cap target), `roadWDist: 1`, `roadWAlt: 0.85` (dominant valley-seeking), `roadWGrade: 400`, `roadWOver: 8000` (FINITE over-cap), `roadWTurn: 120`; kept `spurProbability: 0.15` for the deferred D-01 spur pass; deleted `routeGridSize`/`roadSlopePenalty`/`roadAltWeight`.

### Task 2 — Promote streaming network builder (commit `bccdc01`)
- **Added** `_streamNetwork(center)`: builds the canonical valley-trunk polylines into a new `this._network` Map keyed deterministically `"<mz>:<runIndex>"` → `{ points: THREE.Vector3[] }`. Factored the data-building half of `updateProto` into it — per-row continuous-polyline concatenation (dropping shared anchors), centripetal sampling, `_removeLoops`, and the inter-row same-direction overlap split (PROTO_COVER_* spatial hash; rows registered only after emit so a straight road never self-culls). Allocates **no** scene lines and applies **no** visual y-lift/surfaceY (render-only, deferred to 08-07) — the network y is the raw routed height.
- **Seeded** `this._proto.params` from `this._params` (D-09 defaults) in `_protoInit` — replacing the hardcoded literals — so the network uses the locked params and 08-07 live-slider edits flow through. Verified: constructing with `roadWAlt: 0.42` yields `this._proto.params.wAlt === 0.42`.
- **Re-pointed** `updateProto` to delegate DATA to `_streamNetwork` (single source of truth), then draw debug lines from `this._network` for the existing proto toggle (replaced by 08-07's viz).
- **Lazy streaming preserved**: `PROTO_REGEN_MOVE` move-threshold, `dirty` flag, `PROTO_PARAM_DEBOUNCE` gating; `this._network` is cleared+rebuilt on a real re-stream and bounded (cleared past 3000 entries) for endless play.
- Rewrote the proto section banner from "PROTOTYPE … If validated, this replaces the per-tile router" to "VALLEY-TRUNK STREAMING CORE (the real routing engine — D-08)".

## Verification

| Check | Result |
|-------|--------|
| `return Infinity` in non-comment src/road.js | 0 (no hard grade block — D-02 REVISED) |
| Old per-tile symbols (`_routeTile`/`_seamPoint`/`_deriveEdgeWaypoints`/`_buildTileSpline`/`SEAM_SAMPLES`) non-comment | 0 |
| `data/ranger.js` D-09 params (roadWDist/roadWAlt/roadWGrade/roadWOver/roadWTurn) | present; maxRoadGrade 0.15 |
| `data/ranger.js` retired params (routeGridSize/roadSlopePenalty/roadAltWeight) non-comment | 0 |
| `src/road.js` ES-module import | clean |
| `_streamNetwork` builds non-empty `this._network` at origin, 300 m radius, lone-pine | NET_OK (5 runs) |
| `_proto.params.wAlt` seeded from constructor `roadWAlt` | WIRED (0.42 → 0.42) |
| Determinism: identical inputs → identical polylines | DETERMINISTIC |
| `_streamNetwork` allocates zero scene lines | confirmed (proto.lines = 0) |

**Environment note:** This repo has no `node_modules` — `three` and `simplex-noise` are supplied at runtime only via the browser importmap (CDN). The plan's headless verify commands assume `node` can resolve `three`. To run them, a minimal `three`/`simplex-noise` ESM stub (Vector3, CatmullRomCurve3.getPoints, BufferGeometry/Line, deterministic noise) was placed under a temporary `node_modules` symlink for the smoke test only, then removed — mirroring how the browser importmap supplies these deps. No project file was modified to support testing. The structural greps run natively and pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Headless ESM smoke test could not resolve `three`/`simplex-noise`**
- **Found during:** Task 1 verification (`node --input-type=module … import('./src/road.js')`).
- **Issue:** The plan's automated verify commands import `three` (and road.js transitively imports `simplex-noise`), but this project ships no `node_modules` — those packages exist only as browser-importmap CDN entries. The verify command therefore failed on dependency resolution, not on any code defect.
- **Fix:** Created a throwaway minimal ESM stub for `three` (Vector3, CatmullRomCurve3, BufferGeometry, Line, LineBasicMaterial) and `simplex-noise` (createNoise2D) under `/tmp`, symlinked it as `node_modules` for the duration of each smoke run, then removed the symlink. This is a test-harness-only accommodation; **no repository file was added or changed** to support it. The structural greps (the load-bearing acceptance checks) run natively with no stub.
- **Files modified:** none (temporary `/tmp` stub only).
- **Commit:** n/a (no code change).

## Known Stubs

These are intentional, documented in code, and explicitly resolved by downstream gap-closure plans (not stubs that block this plan's goal — the goal is the network core, which is built and verified):

| Stub | File | Reason / resolved by |
|------|------|----------------------|
| `ensureTile()` returns `null` | src/road.js | Old per-tile body deleted; 08-06 retargets onto `_streamNetwork`/`this._network`. |
| `queryNearest()` returns `null` | src/road.js | No sliced queryable network until 08-06 (`_sliceNetwork`/`this._tiles`); 08-07 wires spawn/Phase-9 queries. |
| `buildDebugLines()` no-op | src/road.js | 08-07 rebuilds centerline viz from `this._network`. |

The network DATA (`_streamNetwork`/`this._network`) — the actual goal of this plan — is fully built and verified non-empty/deterministic; the stubs are only the downstream consumer methods this plan's scope explicitly defers to 08-06/08-07.

## Self-Check: PASSED
- `src/road.js` modified — FOUND (commits 19da537, bccdc01)
- `data/ranger.js` modified — FOUND (commit 19da537)
- `.planning/phases/08-road-routing/08-05-SUMMARY.md` — created this commit

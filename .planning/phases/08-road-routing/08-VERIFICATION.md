---
phase: 08-road-routing
verified: 2026-06-10T00:00:00Z
status: gaps_found
score: 2/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/6
  gaps_closed: []
  gaps_remaining:
    - "Valley-trunk architecture (_streamNetwork/_sliceNetwork/_network/_tiles) does not exist"
    - "Per-tile A* router, hard grade block, and old router symbols fully intact and the ONLY live network"
    - "main.js calls updateProto / setProtoRadius / onProtoToggle / onProtoParam — proto scaffolding not retired"
    - "debug.js still has the Valley Trunk (proto) subfolder, retired roadSlopePenalty/roadAltWeight sliders"
    - "data/ranger.js carries old per-tile params (maxRoadGrade 0.12, routeGridSize, roadSlopePenalty, roadAltWeight) — D-09 locked params absent"
  regressions: []
gaps:
  - truth: "RoadSystem builds a continuous valley-following trunk polyline from seeded macro-anchors (256 m grid) via soft-cost A*, with no per-tile west-east A* and no hard grade block anywhere in road.js"
    status: failed
    reason: "src/road.js contains the complete per-tile west-east A* router (_routeTile, _seamPoint, _deriveEdgeWaypoints, _edgeCost with hard Infinity grade block at line 336, _buildTileSpline, _getTileWaypointsOnly). This is the ONLY live routing core. _streamNetwork, _sliceNetwork, this._network, and this._tiles do not exist anywhere in the file. The hard grade block — 'if (grade > this._params.maxRoadGrade) return Infinity' — is at line 336 in a non-comment code path."
    artifacts:
      - path: "src/road.js"
        issue: "Lines 271–566: _seamPoint, _deriveEdgeWaypoints, _edgeCost (Infinity block at line 336), _routeTile, _getTileWaypointsOnly, _buildTileSpline all present and live. No _streamNetwork, no this._network, no this._tiles, no _sliceNetwork anywhere in the file."
    missing:
      - "_streamNetwork(center) method that builds canonical valley-trunk polylines into this._network Map"
      - "_sliceNetwork() method that converts this._network polylines into per-tile Catmull-Rom splines stored in this._tiles"
      - "Removal of _routeTile, _seamPoint, _deriveEdgeWaypoints, _buildTileSpline, and the hard Infinity grade block"

  - truth: "Every routed edge cost is finite — the router NEVER returns 'no path' on the locked lone-pine coarse terrain"
    status: failed
    reason: "The live _edgeCost at src/road.js:336 returns Infinity for any edge where grade > this._params.maxRoadGrade. This is the exact hard-block architecture the plans specified must be removed. The _protoEdgeCost (soft-cost model) exists only inside the prototype path, which is disabled by default and not the routing core."
    artifacts:
      - path: "src/road.js"
        issue: "Line 336: 'if (grade > this._params.maxRoadGrade) return Infinity' — hard grade block intact and live in the canonical _edgeCost used by _routeTile/ensureTile/queryNearest"
    missing:
      - "Remove the hard Infinity grade block from _edgeCost (or remove _edgeCost entirely)"
      - "Route ensureTile/queryNearest through the soft-cost _protoEdgeCost / _protoConnect pipeline"

  - truth: "The continuous trunk polyline is post-processed (segment dedupe + collinear-simplify + loop removal) into the canonical network store keyed deterministically by macro-row"
    status: failed
    reason: "_streamNetwork does not exist. The canonical network store (this._network) does not exist. Post-processing (loop removal, collinear simplify) exists inside updateProto/the prototype path but is not connected to the public ensureTile/queryNearest API."
    artifacts:
      - path: "src/road.js"
        issue: "No this._network Map, no _streamNetwork method. The canonical data store is this._tileCache, populated by the old per-tile A* router."
    missing:
      - "this._network Map store with deterministic 'mz:runIndex' keying"
      - "_streamNetwork method that populates it from the proto pipeline"

  - truth: "The continuous trunk polyline is sliced at 64 m tile boundaries into per-tile Catmull-Rom splines whose consecutive endpoints/tangents match exactly (C0/C1) because they are one curve sliced — no shared-seam-waypoint machinery"
    status: failed
    reason: "_sliceNetwork() does not exist. this._tiles does not exist. The current queryable splines in this._tileCache are built by the old _buildTileSpline (per-tile A* with ghost seam points) which is the architecture the phase goal required to be replaced. The phase 08-01 PLAN.md explicitly states 'SEAM_SAMPLES' constant must be deleted; it is still at line 54."
    artifacts:
      - path: "src/road.js"
        issue: "Lines 488–535: _getTileWaypointsOnly, _buildTileSpline still intact and active. this._tiles does not exist. SEAM_SAMPLES constant still present at line 54."
    missing:
      - "_sliceNetwork() method that cuts this._network polylines at CHUNK_SIZE boundaries into this._tiles"
      - "this._tiles Map<'tileX,tileZ', {spline, points}[]>"

  - truth: "queryNearest(wx, wz) returns the nearest network point and a unit tangent, or null beyond radius, allocation-light at query cadence"
    status: failed
    reason: "queryNearest exists (line 596) and searches this._tileCache — but this._tileCache is populated exclusively by the per-tile A* router (_getTile/_routeTile), NOT the valley-trunk network. The method operates over the wrong (retained old) network. The phase goal requires queryNearest to operate over this._network / this._tiles."
    artifacts:
      - path: "src/road.js"
        issue: "queryNearest at line 596 iterates this._tileCache (old per-tile router output). There is no this._tiles or this._network for it to search."
    missing:
      - "queryNearest must be retargeted to search this._tiles (sliced valley-trunk splines)"

  - truth: "Shipped road viz is centerline splines only, toggled by a single lil-gui checkbox, off (clean) by default; the proto 'Valley Trunk' folder and retired per-tile sliders are gone"
    status: failed
    reason: "src/debug.js at lines 206-229 still contains: roadSlopePenalty slider, roadAltWeight slider, and the full 'Valley Trunk (proto)' subfolder with onProtoToggle/onProtoParam callbacks and all five proto cost-weight sliders. src/main.js at lines 758-759 and 779/1014 still wires onProtoToggle, onProtoParam, setProtoRadius, and updateProto. None of these were retired."
    artifacts:
      - path: "src/debug.js"
        issue: "Lines 206-229: roadSlopePenalty and roadAltWeight sliders present; Valley Trunk (proto) subfolder with 6 controls present"
      - path: "src/main.js"
        issue: "Lines 758-759: onProtoToggle/onProtoParam callbacks; line 779: setProtoRadius(640); line 1014: roadSystem.updateProto(streamCenter) — proto scaffolding intact"
    missing:
      - "Delete Valley Trunk (proto) subfolder from debug.js"
      - "Delete roadSlopePenalty and roadAltWeight sliders from debug.js"
      - "Add D-09 cost-weight sliders (roadWAlt, roadWGrade, roadWOver, roadWTurn) to debug.js Roads folder"
      - "Replace roadSystem.updateProto(streamCenter) with roadSystem.update(streamCenter) in main.js render loop"
      - "Remove onProtoToggle/onProtoParam callbacks and setProtoRadius from main.js"

  - truth: "Moving the maxGrade or cost-weight sliders re-routes the network deterministically (debounced); the truck spawns on the nearest road facing down it via queryNearest"
    status: partial
    reason: "resolveSpawn correctly calls ensureTile 3x3 + queryNearest + atan2(tangent.x, tangent.z) for D-07 spawn (lines 132-153). However the cost-weight sliders do not exist in debug.js (only the per-tile roadSlopePenalty/roadAltWeight are present). debouncedRoadRebuild fires invalidateCache + buildDebugLines which re-routes the per-tile network, not the valley-trunk network. The spawn D-07 wiring is correct but the network it queries is the wrong (per-tile) architecture."
    artifacts:
      - path: "src/debug.js"
        issue: "No roadWAlt, roadWGrade, roadWOver, roadWTurn sliders. Has retired per-tile roadSlopePenalty/roadAltWeight instead."
      - path: "src/main.js"
        issue: "debouncedRoadRebuild calls invalidateCache + buildDebugLines (correct pattern) but the network being invalidated/rebuilt is the per-tile router, not the valley-trunk."
    missing:
      - "D-09 cost-weight sliders in debug.js Roads folder (roadWAlt/roadWGrade/roadWOver/roadWTurn)"
      - "debouncedRoadRebuild must re-stream the valley-trunk network, not just invalidate the per-tile cache"
---

# Phase 8: Road Routing — Verification Report (Re-verification)

**Phase Goal:** Deterministic valley-wrapping streaming trunk (trunk-only; spurs deferred), per-tile-sliced queryable splines, seam exit gate (C0/C1 continuity across 64m boundaries). The valley-following streaming-anchor trunk replaces the retired per-tile A* router as the real RoadSystem routing core.
**Verified:** 2026-06-10T00:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — previous status was human_needed (score 4/6)

---

## Goal Achievement

### The Central Finding: The Phase Goal Was Not Executed

The previous VERIFICATION.md (08-VERIFICATION.md, status: human_needed, 2026-06-08) documented the original per-tile A* build and deferred C0/C1 seam verification to human UAT. The 08-01 through 08-04 plans were then written to replace that architecture with a valley-following streaming trunk. The SUMMARYs claim this replacement was executed. **The actual codebase tells a different story: the replacement was not executed.**

The complete old per-tile router remains in `src/road.js` as the live routing core. The new valley-trunk architecture exists only as the `updateProto` prototype path (disabled by default, `_proto.enabled = false`). The `_streamNetwork`, `_sliceNetwork`, `this._network`, and `this._tiles` symbols — the four load-bearing data structures of the planned architecture — do not exist anywhere in `src/road.js`.

This is a split-network situation confirmed by code review CR-01: `ensureTile`/`queryNearest` (the spawn and Phase 9 query path) operate over `this._tileCache` (per-tile A* router). The visual rendering via `updateProto` draws from `this._proto.lines` (valley-trunk prototype). These are independent networks that do not share geometry.

The 08-01 through 08-04 SUMMARY files document plans, automated grep checks, and claimed PASS verifications. The automated greps accepted `updateProto` call-count checks as passing without verifying whether the *promoted* architecture was the new one or the old one. The summaries' self-checks verified file existence, not architecture replacement.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RoadSystem builds a continuous valley-following trunk from macro-anchors via soft-cost A*, with no per-tile west-east A* and no hard grade block | FAILED | `_routeTile`, `_seamPoint`, `_deriveEdgeWaypoints`, and hard `return Infinity` at line 336 all present and live. `_streamNetwork` does not exist. |
| 2 | Every routed edge cost is finite — router never returns "no path" | FAILED | `_edgeCost` at line 336: `if (grade > this._params.maxRoadGrade) return Infinity`. Hard block intact in the canonical routing path. |
| 3 | Trunk polyline post-processed into canonical network store (`this._network`) keyed by macro-row | FAILED | `this._network` does not exist. Canonical store is `this._tileCache` (per-tile A* output). |
| 4 | Continuous trunk sliced at 64m boundaries into per-tile splines via `_sliceNetwork` / `this._tiles` (C0/C1 free) | FAILED | `_sliceNetwork` and `this._tiles` do not exist. Per-tile splines in `this._tileCache` built by old `_buildTileSpline` with ghost points. |
| 5 | `queryNearest` operates over valley-trunk sliced splines (`this._tiles`) | FAILED | `queryNearest` at line 596 iterates `this._tileCache` — the old per-tile A* output. |
| 6 | Shipped viz is centerline-only, checkbox-toggled, clean by default; proto folder and retired sliders removed | FAILED | `debug.js` still has Valley Trunk (proto) subfolder (lines 213-229), `roadSlopePenalty` and `roadAltWeight` sliders (lines 206-211). `main.js` still calls `roadSystem.updateProto(streamCenter)` (line 1014), `setProtoRadius(640)` (line 779), `onProtoToggle`/`onProtoParam` (lines 758-759). |
| 7 | Cost-weight sliders re-route deterministically; truck spawns on nearest road facing down it | PARTIAL | D-07 spawn wiring in `resolveSpawn` is correct (lines 132-153). D-09 cost-weight sliders absent from `debug.js`; only retired per-tile sliders present. |

**Score:** 2/7 truths verified (truth 7 is partial; the D-07 spawn wiring exists but queries the wrong network)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/road.js` | Valley-trunk streaming network core; old per-tile router removed; `_streamNetwork`, `_sliceNetwork`, `this._network`, `this._tiles` | FAILED | Old per-tile router completely intact. New architecture methods absent entirely. File is the 08-01 pre-plan version. |
| `data/ranger.js` | D-09 cost defaults (roadWDist/roadWAlt/roadWGrade/roadWOver/roadWTurn + maxRoadGrade 0.15) | FAILED | Old per-tile params present (maxRoadGrade 0.12, routeGridSize 16, roadSlopePenalty 50, roadAltWeight 0.1). D-09 params absent from ranger.js. |
| `src/debug.js` | Roads folder with Show Road Splines + maxGrade + D-09 cost sliders; proto folder removed | FAILED | Valley Trunk (proto) subfolder present; roadSlopePenalty/roadAltWeight sliders present; D-09 cost sliders absent. |
| `src/main.js` | `roadSystem.update(streamCenter)` in render loop; proto wiring removed | FAILED | Render loop calls `updateProto` (line 1014); `setProtoRadius`, `onProtoToggle`, `onProtoParam` all present (lines 758-759, 779). |
| `test/road-test-harness.js` | TEST_PARAMS with D-09 params | VERIFIED | `roadWAlt: 0.85`, `roadWGrade: 400`, etc. present. Retired params removed. |
| `test/test-road-seam.html` | C0/C1 seam exit gate over sliced valley-trunk splines | PARTIAL | File references `ensureTile` and asserts C0/C1, but `ensureTile` returns per-tile A* splines, not valley-trunk sliced splines. Gate is wired to the wrong network. |
| `test/test-road.html` | ROAD-01..04 against valley-trunk API | PARTIAL | References `_protoConnect` for soft-model assertion (line 136) and `_tileCache` for ROAD-01 determinism (line 62). This is a split assertion: soft-model test uses the prototype A*, determinism test uses the old cache. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/road.js _protoEdgeCost` | `data/ranger.js roadW* params` | reads from `this._proto.params` seeded from `this._params` | FAILED | `_protoEdgeCost` reads from `this._proto.params`, not from `this._params` directly. `this._proto.params` is hardcoded in `_protoInit` (lines 702-710) and never seeded from `this._params` or `data/ranger.js`. `data/ranger.js` has no D-09 params. |
| `src/road.js _streamNetwork` | `_protoAnchor / _protoConnect` | streamed macro-anchor chain → continuous polyline | FAILED | `_streamNetwork` does not exist. The `updateProto` method does build from `_protoAnchor/_protoConnect` but is not the canonical network builder. |
| `src/road.js queryNearest` | `this._network polylines / per-tile splines` | samples sliced splines | FAILED | `queryNearest` queries `this._tileCache` (old A* output), not `this._network`/`this._tiles`. |
| `src/road.js ensureTile` | `_streamNetwork` | warms the network around the requested tile | FAILED | `ensureTile` calls `_getTile` which calls `_routeTile` (old A*). No `_streamNetwork` involvement. |
| `src/debug.js Roads folder sliders` | `src/main.js debouncedRoadRebuild` | `onRoadParamChange` callback | PARTIAL | The sliders that fire `onRoadParamChange` are `maxRoadGrade`, `roadSlopePenalty`, `roadAltWeight` — the old per-tile params. The D-09 sliders (`roadWAlt` etc.) do not exist in `debug.js`. |
| `src/main.js resolveSpawn` | `roadSystem.queryNearest` | nearest road point + heading | VERIFIED | `resolveSpawn` calls `queryNearest` with correct `atan2(tangent.x, tangent.z)` pattern. |
| `src/main.js render loop` | `roadSystem` stream-network update | called each frame | FAILED | Render loop calls `roadSystem.updateProto(streamCenter)` (line 1014), not `roadSystem.update(streamCenter)`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/road.js` | 336 | `return Infinity` — hard grade block in live `_edgeCost` | BLOCKER | Directly contradicts phase goal "NEVER a hard Infinity grade block"; is the cause of the original VERIFICATION.md failure this replan was designed to fix |
| `src/road.js` | 688-698 | Comment block: "PROTOTYPE — valley-following... If validated, this replaces the per-tile router" | BLOCKER | The prototype was validated in spike-001 and the plans specify replacement. The "if validated" comment confirms the replacement never happened — the proto is still marked as experimental |
| `src/road.js` | 695 | Comment: "This path does not touch _routeTile / ensureTile / queryNearest (the spawn path)" | BLOCKER | Confirms two networks coexist. Spawn/query path is still per-tile A*, never connected to valley-trunk |
| `src/main.js` | 1014 | `roadSystem.updateProto(streamCenter)` | BLOCKER | Plan 08-03 requires this to be replaced with `roadSystem.update(streamCenter)`. The `update()` method does not exist in road.js. |
| `data/ranger.js` | 195, 200, 206, 212 | Old per-tile params (`maxRoadGrade: 0.12`, `routeGridSize: 16`, `roadSlopePenalty: 50`, `roadAltWeight: 0.1`) | BLOCKER | D-09 locked params (roadWAlt 0.85 / roadWGrade 400 / roadWOver 8000 / maxRoadGrade 0.15 / roadWTurn 120) not present in ranger.js |
| `src/debug.js` | 213-229 | Valley Trunk (proto) subfolder with 6 live controls | BLOCKER | Plan 08-03 task 2 explicitly requires this folder to be deleted |
| `src/debug.js` | 206-211 | `roadSlopePenalty` and `roadAltWeight` sliders | BLOCKER | These are retired per-tile params. Plan 08-03 requires them removed and replaced with D-09 sliders |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ROAD-01 | 08-01/02/03/04 | Roads routed deterministically as a tile-able graph | BLOCKED | Determinism exists in per-tile router but the planned valley-trunk architecture (_streamNetwork/_sliceNetwork) does not exist |
| ROAD-02 | 08-01/04 | Routing uses slope-weighted cost with hard max-grade limit | BLOCKED | ROAD-02 was REVISED to D-02 REVISED (soft over-cap, never hard Infinity). The hard Infinity block at line 336 contradicts the revised requirement. The old ROAD-02 (hard block) technically still exists but the replan explicitly obsoleted it. |
| ROAD-03 | 08-01/04 | Route switchbacks where grade would exceed max | PARTIALLY BLOCKED | `_protoConnect` with soft-cost A* does implement switchbacks (prototype path). Not connected to the live network. |
| ROAD-04 | 08-02/03/04 | Road centerlines queryable as splines | BLOCKED | `queryNearest` exists but operates over the per-tile A* network. The valley-trunk splines are not queryable. |

### Gaps Summary

The phase goal was **the valley-following streaming-anchor trunk replaces the retired per-tile A* router as the real RoadSystem routing core**. This replacement did not happen. The codebase today is structurally identical to the state before the 08-01 through 08-03 plans executed — the per-tile A* router with hard grade block remains the live routing core, and the valley-trunk model remains an experimental prototype.

The 08-01 plan's two primary tasks were: (1) delete `_routeTile`, `_seamPoint`, `_deriveEdgeWaypoints`, `_edgeCost` with Infinity block, and (2) add `_streamNetwork`. Neither happened. The SUMMARYs that report PASS for these tasks contain automated verify commands that checked for the presence of the PROTOTYPE symbols (`_protoConnect`, proto parameters) rather than verifying the OLD symbols were removed and the NEW architecture was wired.

Specific root cause of false PASS verdicts in SUMMARY 08-01:
- The verify command checked `grep -q '_streamNetwork' src/road.js` — this would FAIL on the actual file (no `_streamNetwork` exists). But the SUMMARY reports the verify passed. This means either the verify was not actually run against the committed file, or the file was edited after verification and the SUMMARY was not updated.
- Similarly: `grep -vn... | grep -c 'return Infinity...' | grep -qx 0` would return 1 (not 0) because the Infinity block is at line 336.

The four test files (road-test-harness.js, test-road-seam.html, test-road.html) were correctly updated to reflect D-09 params and valley-trunk API references. But the production code they are meant to test was never rewritten. The harnesses are testing a codebase that does not match their assertions.

---

## Human Verification Required

None — all failures are verifiable via code inspection. No human UAT items have been generated because the code-level gaps are blocking.

---

_Verified: 2026-06-10T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

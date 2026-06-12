---
phase: 09-road-surface
plan: "09"
subsystem: road-surface
tags: [exit-gate, height-agreement, integration-test, cr-01, cr-02, cr-03, cr-04]
dependency_graph:
  requires: [09-07, 09-08]
  provides: [height-agreement-exit-gate]
  affects: [test/test-road-height-agreement.html, test/road-test-harness.js]
tech_stack:
  added: []
  patterns: [integration-test, buffer-geometry-readback, physics-surface-cross-check]
key_files:
  created:
    - test/test-road-height-agreement.html
  modified:
    - test/road-test-harness.js
decisions:
  - "Test reads ribbon vertex Y from geo.attributes.position (centerline lateralIdx = CROSS_SEGS/2) and computes physicsY via rs._sampleCarveWorld blended as raw + blendW*(gradeY-raw) — reproducing terrain.js analyticHeight line 566"
  - "Same syntheticRawHeight function wired as both RoadMeshSystem terrainRef and rs._rawHeightSampler to mirror production wiring where both sites share one carve-free source"
  - "ribbonCenterlineVertex(geo, sectionIdx, crossSegs) added to road-test-harness.js as a reusable export for the BufferGeometry readback pattern"
  - "Three test cases: potholeEnabled=false (CR-01/CR-02), potholeEnabled=true (CR-03), and non-flat terrain variation guard (anti-trivial)"
metrics:
  duration: "~10 min"
  completed: "2026-06-12"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
---

# Phase 9 Plan 09: Integration Height-Agreement Exit Gate Summary

Integration test asserting ribbonVertexY == physics carve Y (_sampleCarveWorld) at real on-road centerline positions using a non-flat synthetic terrain; both potholeEnabled cases covered; `ribbonCenterlineVertex` helper added to harness.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Integration test — ribbonVertexY == physics carve Y at real on-road call sites | (see below) | test/test-road-height-agreement.html, test/road-test-harness.js |

## What Was Built

### Integration Test — test/test-road-height-agreement.html

Phase 9 HEIGHT-AGREEMENT EXIT GATE. Three test cases:

**CASE 1 — potholeEnabled=false (CR-01/CR-02 coverage):**
Builds `RoadSystem` + `RoadMeshSystem` over seed `lone-pine` with a non-flat synthetic terrain
`syntheticRawHeight(wx, wz) = 8*sin(wx*0.02) + 6*cos(wz*0.015) + 5`. Wires the SAME function
as both `RoadMeshSystem` terrainRef (ribbon vertex Y path) and `rs.setRawHeightSampler(...)` (physics
carve path), mirroring the production wiring in main.js. Calls `rms._buildRoadTile(tx, tz, key)`,
reads `geo.attributes.position` at centerline vertex index `sectionIdx * (CROSS_SEGS+1) + CROSS_SEGS/2`
for 5 evenly-spaced sections. Computes `physicsY = raw + blendW*(gradeY-raw)` from `rs._sampleCarveWorld(vx, vz, raw)`.
Asserts `|ribbonVertexY - physicsY| <= 1e-3 m` at every sampled position.

**CASE 2 — potholeEnabled=true (CR-03 coverage):**
Same scenario but with `potholeEnabled=true`, `potholeAmplitude=0.08`, `potholeFreq=0.5`. Both
ribbon and physics now apply `potholeNoise(vx, vz, q, params)` at matching arcS-keyed quality
values (post-09-08 CR-03 fix). Asserts same 1e-3 m tolerance holds with pothole perturbation.

**CASE 3 — Non-flat terrain variation guard:**
Asserts that centerline vertex Y varies by > 0.1 m across the ribbon tile. Proves the synthetic
terrain is meaningfully non-flat so the smoothing window does real work — a flat terrainRef would
make raw==smoothed and the test would trivially pass even with a CR-04 double-count bug present.

### Helper — ribbonCenterlineVertex (road-test-harness.js)

Added `export function ribbonCenterlineVertex(geo, sectionIdx, crossSegs=8)` to the shared harness.
Encapsulates the `vertIdx = sectionIdx*(crossSegs+1) + floor(crossSegs/2)` indexing formula and
reads `{x, y, z}` from `geo.attributes.position`. Exported so future tests can reuse the pattern.

## Deviations from Plan

None — plan executed exactly as written. Test touches no Worker code and no src/ production files.

## Human Verification Required

The test exercises `THREE.BufferGeometry.attributes.position` readback from a ribbon built by
`RoadMeshSystem._buildRoadTile`, which requires a browser environment (Three.js WebGL context,
CDN importmap). Node.js `--check` confirms syntax validity but cannot run the test headless.

### Steps to Verify

1. Start a local HTTP server from the repo root (ES modules require HTTP, not `file://`):
   ```
   python3 test/nocache-server.py
   ```
   or:
   ```
   npx serve .
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:8080/test/test-road-height-agreement.html
   ```
   (port may vary by server; nocache-server.py defaults to 8000)

3. Open DevTools console (F12).

### Expected Pass Output

```
PASS: harness loads
PASS: HEIGHT-AGREEMENT (potholeEnabled=false): ribbon has sections (N_LONG=N)
PASS: HEIGHT-AGREEMENT (potholeEnabled=false): section=0 ribbonY=X.XXXX physicsY=X.XXXX |diff|=X.XXe-N
PASS: HEIGHT-AGREEMENT (potholeEnabled=false): section=N ribbonY=... physicsY=... |diff|=...
... (one PASS per sampled section)
HEIGHT-AGREEMENT (potholeEnabled=false): max divergence = X.XXXe-N m (tolerance = 0.001 m)
PASS: HEIGHT-AGREEMENT (potholeEnabled=false): all sampled vertices agree within 0.001 m
PASS: HEIGHT-AGREEMENT (potholeEnabled=true, CR-03): ribbon has sections ...
... (one PASS per sampled section)
HEIGHT-AGREEMENT (potholeEnabled=true, CR-03): max divergence = X.XXXe-N m (tolerance = 0.001 m)
PASS: HEIGHT-AGREEMENT (potholeEnabled=true, CR-03): all sampled vertices agree within 0.001 m (pothole-perturbed Y matches)
PASS: NON-FLAT terrain produces meaningful Y variation ...: ribbon centerline Y varies by > 0.1 m across the tile ...
```

**No FAIL: lines should appear.** The max divergence values should be well below 1e-3 m
(likely < 1e-4 m or floating-point precision ~1e-6 m), since both sites now read the same
memoized smoothed grade + identical crown/camber/pothole formulas after 09-07/09-08.

### Failure Interpretation

If any `FAIL:` line appears:

- **HEIGHT-AGREEMENT FAIL at section N** with divergence >> 1e-3 m: the ribbon and physics
  surfaces still disagree at that position. Check whether `rs.setRawHeightSampler(...)` was
  called before `_buildRoadTile` (09-08 wiring), and whether `invalidateDesignGradeCache()`
  is being called on param changes (09-07).

- **NON-FLAT terrain variation FAIL** (Y range < 0.1 m): the synthetic terrain function is
  effectively flat for this road path. The other cases may pass trivially. Investigate the
  tile position — the road may be routing through a very flat part of the synthetic domain.

## Known Stubs

None. The test exercises the full integrated call sites; no data is hardcoded or mocked beyond
the synthetic terrain function.

## Threat Flags

None. Test files only — no new network endpoints, auth paths, or production code changes.

## Self-Check: PASSED

- test/test-road-height-agreement.html exists: FOUND
- `grep -q "ribbonVertexY\|_sampleCarveWorld" test/test-road-height-agreement.html`: PASS
- `grep -q "geo.attributes.position\|attributes.position" test/test-road-height-agreement.html`: PASS
- `grep -c "_sampleCarveWorld" src/terrain-worker.js` = 0: CONFIRMED (no worker change)
- `node --check test/road-test-harness.js`: PASS
- `ribbonCenterlineVertex` export present in road-test-harness.js: FOUND
- No src/ production files modified: CONFIRMED

---
phase: 09-road-surface
plan: "12"
subsystem: test-exit-gate
tags: [test, road, exit-gate, re-arch, terrain-below, ribbon-driven, continuity]
dependency_graph:
  requires: [09-10, 09-11]
  provides: [re-arch-exit-gate]
  affects: [test/test-road-height-agreement.html, test/road-test-harness.js]
tech_stack:
  added: []
  patterns: [3-clause exit gate, sampleDesignGradeAt terrain-below assertion, longitudinal continuity check]
key_files:
  created: []
  modified:
    - test/test-road-height-agreement.html
    - test/road-test-harness.js
decisions:
  - "ribbonCenterlineVertex stride updated to vertsPerSection=(crossSegs+1)+2=13 (Plan 09-10 skirt layout) — backward-compatible default, explicit param for new callers"
  - "Clause (a) terrain-below implemented via sampleDesignGradeAt approach (plan approach ii): ribbonY - (designGradeBase - clearanceMargin) >= clearanceMargin - 1e-3; no Worker/DOM terrain build needed"
  - "Clause (c) cross-tile continuity: tries all 4 neighbors, emits SKIP if none has road geometry (within-tile sub-assertion always runs)"
  - "N_LONG now computed as posAttr.count / VERTS_PER_SECTION (13) not / (CROSS_SEGS+1) (9) — old calculation would have given wrong N_LONG after Plan 09-10"
metrics:
  duration: ~15 minutes
  completed: 2026-06-12
  tasks: 1
  files: 2
---

# Phase 9 Plan 12: RE-ARCH Exit Gate (3-Clause) Summary

**One-liner:** Retired the wrong 09-09 equality gate (terrainMeshY == ribbonY) and replaced it with a 3-clause exit gate matching the decal-ribbon-on-top re-architecture: terrain-below clearanceMargin, physics-on-road == ribbon Y, and longitudinal continuity within-tile and across the tile boundary.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Rework exit-gate test to 3 clauses + update harness helper | 369119a | test/test-road-height-agreement.html, test/road-test-harness.js |

## What Was Built

### test/road-test-harness.js

**`ribbonCenterlineVertex` stride update:**
- Added `vertsPerSection` parameter (default `(crossSegs+1)+2` = 13 for Plan 09-10 skirt layout)
- Vertex index now `sectionIdx * vertsPerSection + latIdx` (was `sectionIdx * (crossSegs+1) + latIdx`)
- Backward-compatible: callers that omit the parameter get the correct 09-10 stride automatically
- `node --check` PASS

### test/test-road-height-agreement.html

**Renamed banner:** "Phase 9 RE-ARCH EXIT GATE (terrain-below + ribbon-driven + longitudinal continuity)"

**Retired:** The old 09-09 equality assertion (terrainMeshY == ribbonY at 1e-3) is gone. `grep -c "terrainMeshY == ribbonY|terrain.*==.*ribbon"` returns 0.

**`N_LONG` fix:** Now computed as `posAttr.count / VERTS_PER_SECTION` (13) instead of `/ (CROSS_SEGS+1)` (9). The old formula would have computed a 44% inflated N_LONG after Plan 09-10 added skirt verts, causing out-of-bounds vertex reads.

**CLAUSE (b) RIBBON-DRIVEN (retained from 09-09):**
- `|ribbonVertexY - physicsY| <= 1e-3` at 5 centerline sections
- Uses `_sampleCarveWorld` for physics Y: `raw + blendW*(gradeY - raw)`
- Tested both `potholeEnabled=false` and `potholeEnabled=true` (CR-03 coverage)

**CLAUSE (a) TERRAIN-BELOW (new):**
- For 5 on-footprint centerline sections, computes:
  - `designGradeBase = rs.sampleDesignGradeAt(spline, arcS, rawSampler, params)`
  - `terrainTargetY = designGradeBase - params.roadClearanceMargin`
  - `gap = ribbonVertexY - terrainTargetY`
- Asserts `gap >= clearanceMargin - 1e-3` at every position
- Validates Plan 09-11's below-margin carve contract without requiring a full TerrainSystem+Worker build

**CLAUSE (c) LONGITUDINAL CONTINUITY (new):**
- Reads ALL ribbon centerline Y values across the tile (every section index 0..N_LONG-1)
- Asserts no adjacent-section Y delta > `STEP_THRESHOLD` = 0.5 m
- Finds adjacent neighbor tile (tries tx+1, tz+1, tx-1, tz-1) and asserts the Y delta between last section of tile A and first section of neighbor tile B is also < 0.5 m
- Emits `SKIP` log if no neighbor has road geometry (within-tile sub-assertion always runs)

**CASE 3 (non-flat terrain guard retained):**
- Asserts ribbon centerline Y varies > 0.1 m across the tile (anti-trivial guard)

**Final banner:** Prints "RE-ARCH EXIT GATE: ALL CLAUSES PASS — if no FAIL: lines above" after all tests run.

## Acceptance Criteria Verification

All checks passed:

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| `grep -c "clearanceMargin\|roadClearanceMargin" test-road-height-agreement.html` | >= 1 | 19 | PASS |
| `grep -c "_sampleCarveWorld\|physicsY" test-road-height-agreement.html` | >= 1 | 11 | PASS |
| `grep -c "continu\|STEP_THRESHOLD\|step" test-road-height-agreement.html` | >= 1 | 24 | PASS |
| `grep -c "neighbor\|boundary\|tx+1\|tz+1" test-road-height-agreement.html` | >= 1 | 23 | PASS |
| `grep -c "terrainMeshY == ribbonY\|terrain.*==.*ribbon" test-road-height-agreement.html` | 0 | 0 | PASS |
| `grep -c "vertsPerSection" test/road-test-harness.js` | >= 1 | 6 | PASS |
| `node --check test/road-test-harness.js` | PASS | PASS | PASS |
| `grep -c "clearanceMargin\|roadSkirtDepth\|polygonOffset" src/terrain-worker.js` | 0 | 0 | PASS |
| `git diff --stat src/` | empty | (empty) | PASS |

## Human Verification Required

The test uses Three.js + ES module importmap — no headless runner. A human must run the browser steps below.

### Setup

Start a local HTTP server from the repo root:

```
python3 test/nocache-server.py
```

or:

```
npx serve .
```

Then open `http://localhost:8000/test/test-road-height-agreement.html` in a browser.

### Verification Steps

1. Open DevTools console (F12).
2. Confirm the banner reads: **"RangerSim — Phase 9 RE-ARCH EXIT GATE (terrain-below + ribbon-driven + longitudinal continuity)"**
3. Wait ~2 seconds for all tests to run and the timeout summary to fire.

### Expected PASS Output

Every line starting with `PASS:` and zero lines starting with `FAIL:`. Specifically look for:

```
PASS: harness loads
PASS: CLAUSE (b) RIBBON-DRIVEN (potholeEnabled=false): ribbon has sections ...
PASS: CLAUSE (b) RIBBON-DRIVEN (potholeEnabled=false): section=0 ribbonY=... physicsY=... |diff|=...
  [5 section lines]
PASS: CLAUSE (b) RIBBON-DRIVEN (potholeEnabled=false): all sampled vertices agree within 0.001 m
CLAUSE (b) RIBBON-DRIVEN (potholeEnabled=false): max divergence = X.XXXe-N m (tolerance = 0.001 m)

PASS: CLAUSE (b) RIBBON-DRIVEN (potholeEnabled=true, CR-03): ...
  [similar pattern]

PASS: CLAUSE (a) TERRAIN-BELOW: ribbonY - terrainTargetY >= clearanceMargin: ribbon has sections ...
PASS: CLAUSE (a) TERRAIN-BELOW: section=0 ribbonY=... terrainTarget=... gap=... (need >= 0.5)
  [5 section lines]
PASS: CLAUSE (a) TERRAIN-BELOW: all sections satisfy terrain-below contract

PASS: CLAUSE (c) LONGITUDINAL CONTINUITY: ribbon has sections ...
CLAUSE (c) LONGITUDINAL CONTINUITY: within-tile max step = X.XXXX m (threshold = 0.5 m)
PASS: CLAUSE (c) LONGITUDINAL CONTINUITY: within-tile — no step > 0.5 m between adjacent sections
CLAUSE (c) LONGITUDINAL CONTINUITY: cross-tile boundary step ...
PASS: CLAUSE (c) LONGITUDINAL CONTINUITY: cross-tile boundary step X.XXXX m < 0.5 m
  (or: PASS: CLAUSE (c) LONGITUDINAL CONTINUITY: cross-tile SKIPPED (no neighbor with road data))

PASS: NON-FLAT terrain produces meaningful Y variation (anti-trivial guard): ribbon centerline Y varies by > 0.1 m ...
NON-FLAT terrain ... Y range = [...] (variation=X.XXX m)

──────────────────────────────────────────────────────────────
RE-ARCH EXIT GATE: ALL CLAUSES PASS — if no FAIL: lines above
Clauses: (a) terrain-below, (b) ribbon-driven, (c) continuity
──────────────────────────────────────────────────────────────
```

### Key Failure Indicators

| FAIL line | Likely cause |
|-----------|-------------|
| `CLAUSE (a) TERRAIN-BELOW: ... gap=X.XX (need >= 0.5)` | Plan 09-11 carve contract broken — terrain target not below ribbon by clearanceMargin |
| `CLAUSE (b) RIBBON-DRIVEN: ... |diff|=X.XXe-N > 0.001` | Divergent call sites — _sampleCarveWorld and sweepRibbon disagree |
| `CLAUSE (c) LONGITUDINAL CONTINUITY: within-tile step ...` | Seam jump or NaN in ribbon Y at section boundary |
| `CLAUSE (c) LONGITUDINAL CONTINUITY: cross-tile boundary step ...` | Tile seam discontinuity in the road spline at tile boundary |
| `NON-FLAT terrain ... variation=0.000 m` | syntheticRawHeight is being ignored (flat fallback) |

## Deviations from Plan

None — plan executed exactly as written.

- The `sampleDesignGradeAt` approach (plan approach ii, no Worker/DOM terrain build) was explicitly listed as the preferred option.
- Cross-tile continuity with SKIP fallback matches the plan's "skip with a logged SKIP" instruction.
- N_LONG fix (posAttr.count / 13 not / 9) is a direct consequence of implementing VERTS_PER_SECTION = 13.

## Known Stubs

None. All three clauses have real assertions over the actual call sites with a non-flat synthetic terrain. No placeholder logic.

## Threat Flags

None — test artifacts only, no production src/ changes.

## Self-Check: PASSED

- test/test-road-height-agreement.html: FOUND (modified)
- test/road-test-harness.js: FOUND (modified)
- Commit 369119a: FOUND in git log
- No src/ files modified: git diff --stat src/ empty (FOUND)

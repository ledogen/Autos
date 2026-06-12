---
phase: 09-road-surface
verified: 2026-06-11T19:30:00Z
status: gaps_found
score: 3/6 success criteria verified (height-agreement exit gate VIOLATED)
overrides_applied: 0
gaps:
  - truth: "Driving onto the road, the truck rides on the carved surface — it does not float above or sink below the VISIBLE asphalt ribbon (SURF-04 / EXIT GATE: mesh-Y == physics-Y)"
    status: failed
    reason: >
      The visible road ribbon (road-mesh.js sweepRibbon) computes vertex Y from the
      SMOOTHED design grade (_smoothDesignGrade, a 50 m windowed average of analyticHeight),
      while BOTH physics carve sites compute gradeY from the RAW routing spline Y
      (nr.point.y). The physics surface the truck drives on therefore disagrees with the
      visible asphalt by up to the fine-noise amplitude plus the smoothing offset wherever
      terrain is not locally flat. The phase's declared exit gate is exactly mesh-Y ==
      physics-Y; it is violated at the integrated call sites. Independently confirmed CR-01.
    artifacts:
      - path: "src/road-mesh.js:447,464,215,260"
        issue: "sweepRibbon vy = designGradeY[i] + crown + tilt + pY where designGradeY comes from _smoothDesignGrade (smoothed)"
      - path: "src/road.js:1346"
        issue: "_sampleCarveWorld: designY = nr.point.y (RAW routing spline Y) — feeds analyticHeight (physics)"
      - path: "src/terrain.js:857"
        issue: "_buildCarveTable: designY = nr.point.y (RAW) — feeds sampleHeight + _flushPendingQueue terrain chunk mesh"
    missing:
      - "Unify the elevation source: either sample the memoized _smoothDesignGrade at nr.arcS in both carve sites, or drop smoothing in sweepRibbon so all three use nr.point.y. Until unified, the truck rides a different surface than the asphalt it visibly sits on."
      - "Add an INTEGRATION test asserting analyticHeight(onRoadXZ) == ribbonVertexY at the same on-road world position. The current harness only tests the pure carveBlend/crownProfile/sampleCarve in isolation and never exercises the divergent call sites."
  - truth: "The road camber/crown banks identically in the visible mesh and the physics surface (SURF-03 fold-in)"
    status: partial
    reason: >
      Crown uses the shared crownProfile() function (identical). BUT the camber MAGNITUDE
      uses two different curvature estimators: the mesh (_splineCurvatureSigned) uses
      kappa = dtLen / (du*arcLen) with du≈0.02 in normalized-u; both carve sites use
      kappa = dtLen / eps with eps = 2.0 metres from a second queryNearest probe. These
      estimators only coincide for perfectly unit-speed locally-circular splines, so the
      mesh and physics bank by different amounts at the lateral extremes where camber tilt
      is largest. The 09-03 SUMMARY (line 117) self-documents this as an "approximation"
      asserted to "match closely" — it is not identical. Confirmed CR-02.
    artifacts:
      - path: "src/road-mesh.js:139"
        issue: "mesh kappa = dtLen / (du * arcLen), du = normalized-u finite diff (~0.02)"
      - path: "src/road.js:1371"
        issue: "physics kappa = dtLen / eps, eps = 2.0 m world-space"
      - path: "src/terrain.js:881"
        issue: "terrain carve kappa = dtLen / eps, eps = 2.0 m world-space"
    missing:
      - "Extract ONE shared signed-curvature function and call it with identical arguments at all three sites."
  - truth: "Pothole micro-noise is applied IDENTICALLY in mesh build and physics sampler, severity from the same per-stretch roadQuality (SURF-06)"
    status: partial
    reason: >
      potholeNoise() is world-coordinate keyed (identical lattice at all sites — good). BUT
      the severity input roadQuality(arcS, ...) is keyed on a DIFFERENT arcS per site: the
      mesh uses arcS = arcSOffset + u*arcLen (centerline arc); both carve sites use nr.arcS
      from a per-vertex queryNearest on the laterally-offset vertex, which lands at a
      different arc position than the mesh section above it — especially near the ±500 m
      stretch / 10 m blend tier boundaries where rq (hence severity, hence pothole Y) can
      differ. The 09-06 assertion only checks potholeNoise is deterministic for IDENTICAL
      inputs; it never checks the inputs match across sites. Confirmed CR-03.
    artifacts:
      - path: "src/road-mesh.js:219-220,257"
        issue: "rq = roadQuality(arcSOffset + u*arcLen, ...) — centerline arcS"
      - path: "src/road.js:1388-1389"
        issue: "rq = roadQuality(nr.arcS, ...) — laterally-offset nearest-point arcS"
      - path: "src/terrain.js:895-896"
        issue: "rq = roadQuality(nr.arcS, ...) — laterally-offset nearest-point arcS"
    missing:
      - "Drive pothole severity from a world-coordinate-keyed quality value, or snap all sites to the centerline arcS before calling roadQuality."
deferred: []
human_verification:
  - test: "Drive the truck onto a road segment crossing rolling (non-switchback) terrain at low speed; observe the wheels against the visible asphalt ribbon"
    expected: "Wheels sit ON the asphalt surface — not floating above it or sunk into it"
    why_human: "Visual mesh-vs-physics seating gap requires running the sim and viewing wheel contact; the divergence magnitude depends on live fine-noise terrain"
  - test: "Drive slowly along a low-quality road stretch (potholeEnabled=true)"
    expected: "Slight vertical jolts felt through suspension on the road only, not off-road"
    why_human: "Suspension feel and stretch-tier severity are real-time behaviors not verifiable by static analysis"
  - test: "Fly the free-cam past a road intersection / X-crossing"
    expected: "One merged at-grade paved footprint, no flickering z-fighting between footprint and ribbons, stable (no pop/rebuild)"
    why_human: "Z-fighting and window-stability are visual/real-time; 09-04 explicitly defers real leg-ribbon trim so footprint overlays ribbon — needs eyeball confirmation that footprint dominates"
---

# Phase 9: Road Surface Verification Report

**Phase Goal:** The road exists as a physical ribbon in the world — visible asphalt, shaped with crown and banking, carved into the terrain so the truck feels the elevation change and surface normals through its suspension.
**Verified:** 2026-06-11T19:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The road ribbon EXISTS, looks like asphalt, has crown+camber geometry, carves the terrain, and has junctions and pothole noise — the artifacts are real and wired. However the phase's PRIMARY declared exit gate (HEIGHT-AGREEMENT: the visible ribbon mesh Y must equal the physics surface Y at the same on-road world position) is **violated by a real elevation-source mismatch**. The four Critical findings in 09-REVIEW.md were independently confirmed against the actual call sites, not taken at face value.

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Truck rides on the visible road surface — no float/sink (SURF-04, EXIT GATE) | ✗ FAILED | Mesh uses smoothed grade (road-mesh.js:447,215); physics uses raw nr.point.y (road.js:1346, terrain.js:857). Surfaces diverge by fine-noise + smoothing offset. |
| 2 | Camber banks correctly, curvature-proportional, + crown — on the surface geometry (SURF-03) | ⚠️ PARTIAL | Crown shared (crownProfile, identical). Camber magnitude uses divergent estimators: mesh normalized-u (road-mesh.js:139) vs carve 2 m world-space (road.js:1371, terrain.js:881). |
| 3 | Carve cut-biased, transitions continuously, no degenerate vertical seam (SURF-05) | ✓ VERIFIED | carveBlend is C0-continuous (road-carve.js:103-107); carve-continuity asserted in test/test-road-carve.html:218-241. Cut/fill toe slopes present (terrain.js:900-907). Continuity holds; the FAILED item is the absolute Y agreement, not within-carve continuity. |
| 4 | Road looks like asphalt — dark grey + lane markings, no asset files (SURF-02) | ✓ VERIFIED | Vertex-color material (road-mesh.js:93-96, vertexColors:true); base (0.15,0.15,0.17), per-tier markings (road-mesh.js:189-300); no external asset imports. |
| 5 | (Stretch) Pothole/crack micro-perturbations felt slowly (SURF-06) | ⚠️ PARTIAL | potholeNoise present and wired at all 3 sites (road-carve.js:150, road.js:1389, terrain.js:896, road-mesh.js:257); world-keyed lattice identical, but severity rq keyed on divergent arcS (CR-03). Felt-jolt behavior needs human verify. |
| 6 | Crossing roads merge as single at-grade footprint, no z-fighting, stable (SURF-07) | ⚠️ PARTIAL / human | _detectJunctions + buildJunctionFootprint exist and are wired (road-mesh.js:480-502, 536+). BUT 09-04 explicitly DEFERS real leg-ribbon trim — footprint renders at nodeY OVER the ribbon, z-fighting acknowledged (09-04-SUMMARY:123-129, road-mesh.js IN-03 comment). Needs human z-fight/stability check. |

**Score:** 3/6 success criteria verified (1 FAILED exit gate, 2 PARTIAL, plus SURF-07 needs human z-fight confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/road-carve.js` | Pure no-import sampleCarve/crownProfile/carveBlend/potholeNoise/earClip | ✓ VERIFIED | All functions present, pure, no imports; carveBlend C0-continuous. |
| `src/road-mesh.js` | RoadMeshSystem ribbon sweep + crown/camber + materials + junctions | ✓ VERIFIED (substantive) | sweepRibbon, _buildRoadTile, buildJunctionFootprint, streaming lifecycle all present and wired into render loop (main.js:1083-1085). |
| `src/road.js` (_sampleCarveWorld) | Analytic carve for physics | ⚠️ WIRED but DISAGREES | Exists and wired into analyticHeight (terrain.js:565), but uses raw nr.point.y not the mesh's smoothed grade. |
| `src/terrain.js` (_buildCarveTable + analyticHeight + sampleHeight) | Physics carve table + height sampling | ⚠️ WIRED but DISAGREES | Carve applied consistently across physics paths (all raw-based) but disagrees with the ribbon mesh. |
| `src/road-quality.js` | roadQuality tiers / hashRunKey | ✓ VERIFIED | Present, re-exported via road-mesh.js to break circular import (road-mesh.js:39). |
| `data/ranger.js` | roadWidth/roadHalfWidth/crownHeight/camberStrength/pothole/designGradeWindow params | ✓ VERIFIED | All params present (ranger.js:241-320). roadHalfWidth is a manually-synced derived field (WR-01 latent risk). |
| `src/terrain-worker.js` | Byte-identical CARVE SYNC mirror | ✓ VERIFIED | sampleCarve body + carveTable handler mirror WORKER_SOURCE; Worker stores RAW heights (Pitfall 1 satisfied). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| sweepRibbon | _smoothDesignGrade | road-mesh.js:447 designGradeY | WIRED | Mesh Y source = smoothed grade |
| analyticHeight | _sampleCarveWorld | terrain.js:565 | WIRED | Physics Y source = raw nr.point.y |
| sampleHeight/_flushPendingQueue | _buildCarveTable | terrain.js:642, 1064 | WIRED | Terrain mesh + physics Y source = raw nr.point.y |
| **sweepRibbon Y** | **analyticHeight Y** | (none — no shared elevation source) | ✗ NOT_WIRED | The two surfaces are never reconciled. This is the gate failure. |
| roadMeshSystem | render loop | main.js:1083-1085 syncToChunkRing + flushPendingQueue | WIRED | Ribbon streams with terrain chunks. |

### Data-Flow Trace (Level 4 — height-agreement gate)

| Surface | Y formula | Source of gradeY | Real data? | Status |
|---------|-----------|------------------|-----------|--------|
| Visible asphalt ribbon (sweepRibbon) | designGradeY[i] + crown + tilt + pothole | _smoothDesignGrade = 50 m window-avg of analyticHeight | Yes | ⚠️ Disagrees with physics |
| Physics (analyticHeight via _sampleCarveWorld) | raw + blendW*(gradeY−raw), gradeY = nr.point.y + crown + tilt + pothole | RAW routing spline Y | Yes | ⚠️ Disagrees with ribbon |
| Terrain chunk mesh + sampleHeight (_buildCarveTable) | raw + blendW*(gradeY−raw), gradeY = nr.point.y + ... | RAW routing spline Y | Yes | ✓ Agrees with physics, ⚠️ disagrees with ribbon |

**The truck drives the physics surface (raw-grade). The visible asphalt sits at smoothed-grade. They diverge.** Additionally (CR-04, self-reference): _smoothDesignGrade is fed `this._terrainRef = analyticHeight` (main.js:840), which is CARVE-INCLUSIVE. On-ribbon analyticHeight returns gradeY = nr.point.y + crown + camber + pothole (blendW=1). So the smoothed grade already contains crown/camber/pothole, then sweepRibbon ADDS crown/camber/pothole AGAIN (road-mesh.js:243-260). **Crown (0.05 m) and camber/pothole terms are double-counted in the visible ribbon elevation.** Confirmed against terrain.js:564-566 + road-mesh.js:447.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pure carve fns load + carveBlend correct | test/test-road-carve.html (carveBlend/crownProfile/sampleCarve asserts) | Pass in isolation | ✓ PASS (isolated) |
| Integrated mesh-Y == physics-Y | (no such test exists) | — | ✗ FAIL (gate never asserted at call sites) |

Step 7b note: full behavioral run requires the browser sim (DOM/Worker/Three.js) — routed to human verification. The pure-function harness passes but does NOT exercise the divergent call sites, which is precisely why the gate "passed on paper."

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (none — browser HTML test harnesses, not bash probes) | n/a | n/a | SKIPPED (no scripts/*/tests/probe-*.sh) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SURF-01 | 09-03 | Fixed-width ribbon swept along splines | ✓ SATISFIED | RoadMeshSystem.sweepRibbon + streaming (road-mesh.js) |
| SURF-02 | 09-05 | Procedural asphalt color, no assets | ✓ SATISFIED | vertex-color material, no asset imports |
| SURF-03 | 09-03 | Crown + curvature camber that banks | ⚠️ PARTIAL | Crown shared; camber estimator divergent (CR-02) |
| SURF-04 | 09-02 | Physics carries road height AND normal | ✗ BLOCKED | Physics surface ≠ visible ribbon (CR-01 height-agreement violation) |
| SURF-05 | 09-02 | Cut-and-fill, applied IDENTICALLY in mesh build and physics sampler | ✗ BLOCKED | Blend formula identical; gradeY INPUT diverges (smoothed vs raw) |
| SURF-06 | 09-06 | Pothole noise, identical mesh + physics | ⚠️ PARTIAL | Lattice identical; severity arcS divergent (CR-03) |
| SURF-07 | 09-01/09-04 | Merged at-grade junction, no z-fighting, stable | ⚠️ NEEDS HUMAN | Footprint built but overlays ribbon (leg-trim deferred); z-fight acknowledged |

No orphaned requirements — all SURF-01..SURF-07 are claimed across plans 09-01..09-06.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/road-mesh.js | 447 + road.js:1346 + terrain.js:857 | Divergent elevation source (smoothed vs raw) | 🛑 Blocker | Height-agreement exit gate violated |
| src/road.js | 1434-1500 | _smoothDesignGrade samples carve-inclusive analyticHeight (self-reference) | 🛑 Blocker | Crown/camber/pothole double-counted in ribbon Y |
| src/road.js | 1442 + main.js:269-275 | _designGradeCache invalidated only on `window` change; not cleared on surface-param rebuild | ⚠️ Warning | Stale ribbon grade after crownHeight/terrainAmplitude/camber slider change (debouncedRoadSurfaceRebuild clears tiles but not cache; spline objects persist so WeakMap returns stale) |
| data/ranger.js | 246 + debug.js | roadHalfWidth manually synced to roadWidth/2 (only via slider onChange) | ⚠️ Warning | Latent geometry desync if roadWidth set by any non-slider path |
| src/road-mesh.js | 550-553 | Comment claims leg trim happens "naturally" — it does not (contradicts 09-04 deferral) | ℹ️ Info | Misleading maintainer comment |
| src/road-mesh.js | 39-40 | Re-export then re-import same symbols | ℹ️ Info | Redundant, harmless |

No TBD/FIXME/XXX debt markers found in the modified files.

### Human Verification Required

1. **Wheel-to-asphalt seating** — Drive onto a road over rolling (non-switchback) terrain at low speed. Expected: wheels sit on the asphalt, not floating/sunk. (This is the live manifestation of the CR-01 gate failure — magnitude depends on local fine-noise.)
2. **Pothole feel** — Drive slowly on a low-quality stretch with potholeEnabled. Expected: slight vertical jolts on-road only.
3. **Junction z-fighting / stability** — Free-cam past an X-crossing. Expected: one merged footprint, no flicker, no pop/rebuild.

### Gaps Summary

The phase delivers genuine, wired artifacts — a streaming asphalt ribbon with crown/camber geometry, terrain cut-and-fill carve, junctions, materials, and pothole noise. The Worker CARVE SYNC discipline (byte-identical mirror, RAW-heights-in-Worker) is clean and correct.

However the phase's own stated PRIMARY exit gate — HEIGHT-AGREEMENT between the visible ribbon mesh and the physics surface — is **violated**. Independently confirmed against the real call sites (not taken from the review at face value):

- **CR-01 (TRUE):** ribbon mesh Y uses `_smoothDesignGrade` (smoothed); both physics carve sites use raw `nr.point.y`. The truck rides a different surface than the asphalt it visibly sits on. road-mesh.js:447 vs road.js:1346 vs terrain.js:857.
- **CR-02 (TRUE):** camber magnitude uses two different curvature estimators (normalized-u in mesh vs 2 m world-space in carve). Compounds the float/sink at the ribbon's lateral extremes.
- **CR-03 (TRUE):** pothole severity rq keyed on divergent arcS (centerline in mesh, laterally-offset nearest-point in carve) — perturbation differs near tier boundaries.
- **CR-04 (TRUE):** _smoothDesignGrade samples the carve-inclusive analyticHeight, so crown/camber/pothole are baked into the smoothing window then added again in sweepRibbon — a structural double-count; plus the design-grade cache is not invalidated on surface-param changes.

**The meta-claim is confirmed:** the test harness (test/test-road-carve.html, test-road-mesh.html) asserts the pure functions (carveBlend, crownProfile, sampleCarve, potholeNoise) in ISOLATION and the tests/height-agreement-test.html asserts sampleHeight==analyticHeight (both raw-based, so they trivially agree). NO test asserts `analyticHeight(onRoadXZ) == ribbonVertexY`. The gate passed on paper while the integrated surfaces disagree.

These four findings share one root cause (no single shared elevation source between the visible ribbon and the physics carve), so a focused gap-closure plan should: (1) unify the gradeY elevation source across sweepRibbon and both carve sites, (2) extract one shared signed-curvature function, (3) drive pothole severity from a single keyed value, (4) feed _smoothDesignGrade a carve-free raw-terrain sampler and invalidate its cache on surface-param change, and (5) add an integration test asserting mesh-Y == physics-Y at real on-road positions.

---

_Verified: 2026-06-11T19:30:00Z_
_Verifier: Claude (gsd-verifier)_

---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Mountains & Roads
status: executing
stopped_at: Phase 9 context gathered (intersections scoped in)
last_updated: "2026-06-15T07:33:16.617Z"
last_activity: 2026-06-15 -- Phase 09 execution started
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 42
  completed_plans: 36
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-05)

**Core value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.
**Current focus:** Phase 09 — road-surface

## Current Position

Phase: 09 (road-surface) — EXECUTING
Plan: 1 of 30
Status: Executing Phase 09
Last activity: 2026-06-15 -- Phase 09 execution started

```
v1.1 Progress: [                    ] 0% (0/4 phases)
```

## Performance Metrics

**Velocity:**

- Total plans completed: 12 (v1.1)
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07 | 5 | - | - |
| 08 | 7 | - | - |
| 09 | 0 | - | - |
| 10 | 0 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 09-road-surface P07 | 15 | 2 tasks | 3 files |
| Phase 09-road-surface P10 | 20 | 2 tasks | 4 files |
| Phase 09-road-surface P12 | 15 | 1 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 6: BLOCKED pending dedicated research phase — chunk ring-buffer + Web Worker heightmap questions unresolved
- Phase 4.1 P01: vz threshold 0.5 m/s for ramp-slide gate — g*sin(10°)=1.7 m/s² over 3s; 0.5 distinguishes slide from static-stuck
- Phase 4.1 P01: D-18 audit complete — zero existing assertion scripts probe hubY or hubVy; Phase 4.1 field renames are safe
- v1.1 Roadmap (2026-06-07): Coarse terrain parameters MUST be locked at end of Phase 7 — changing them after Phase 8 invalidates all generated roads
- v1.1 Roadmap (2026-06-07): Road routing (Phase 8) is the highest-risk phase — requires a research spike before implementation to resolve how per-tile A* handles switchback paths at different altitudes
- v1.1 Roadmap (2026-06-07): Carve blend design must be specified BEFORE any Phase 9 mesh or physics code — the post-read blend pattern (chunk.carveWeights Float32Array, never baked into chunk.heights) is the anti-drift discipline
- v1.1 Roadmap (2026-06-07): Road router uses pure coarseHeight(wx,wz) only — never terrainSystem.sampleHeight (chunk-load-order dependent; breaks determinism)
- [Phase ?]: CR-04: rawHeightWorld wraps height()*terrainAmplitude with no carve hook — feeds _smoothDesignGrade a carve-free profile eliminating double-count of crown/camber/pothole
- [Phase ?]: CR-04 stale-cache: invalidateDesignGradeCache() called from debouncedRoadSurfaceRebuild on surface-param changes so memoized design-grade is always fresh
- [Phase ?]: Plan 09-10: vertsPerSection=13 stride locked for Plan 09-12 test harness

### Pending Todos

| # | Bug / Task | Description |
|---|------------|-------------|
| 1 | P7 exit gate | seedFor() determinism test must pass before any other generator uses it |
| 2 | P7 exit gate | height-agreement test: sampleHeight(x,z) == bilinear(chunk.heights)*amp at 5 world positions |
| 3 | P7 exit gate | Lock coarse terrain amplitude/wavelength/octaves — do not change after P8 starts |
| 4 | P8 start spike | Resolve switchback-in-tile routing approach (multi-layer grid vs waypoint graph with U-turn nodes vs recursive sub-tile) |
| 5 | P8 exit gate | Debug splines show no kinks at tile seam boundaries; no self-crossing switchback arms |
| 6 | P9 start gate | Specify carveBlend function signature and chunk.carveWeights build pattern before writing any mesh or physics code |
| 7 | P9 exit gate | Height-agreement test extended to on-road positions: carve result identical in _flushPendingQueue and sampleHeight |
| 8 | P9 exit gate | Shoulder cliff test: no step discontinuity in sampleHeight across chunk seam boundary at road edge |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260612-rw3 | Headless spline-continuity harness (test/spline-continuity.mjs): zero-install Node ESM, vendored centripetal Catmull-Rom + signedCurvature from road-carve.js. Measures max vertical step / curvature rate / camber rate / tile-seam mismatch; gate fixtures set exit code, stress fixtures (tight-turn, steep-grade) are expected-fail demos. Verification tool for the upcoming spline-fix (fix spline at source, not the road surface). Caught camber 12.76°/m on tight turns + 1.15 m vstep on steep grade; also surfaced camber clamp-flip spike at curvature zero-crossings. | 2026-06-12 | 2e97bdb | [260612-rw3-headless-spline-continuity-harness](.planning/quick/260612-rw3-headless-spline-continuity-harness/) |
| 260610-v0y | QUAL-01 (partial): buildDebugLines draws smooth spline (~2 m res) not coarse control polyline; _removeSelfCrossings added (deterministic XZ segment-crossing excision, bounded ≤ 200) wired after _removeLoops in _streamNetwork. D-06 seam gate PASS (3 seams, maxC0=0.00000 m, maxC1=0.02°). Corner smoothing deferred. | 2026-06-10 | 2ae75d2 | [260610-v0y-qual-01-road-corner-smoothing-and-loop-r](.planning/quick/260610-v0y-qual-01-road-corner-smoothing-and-loop-r/) |
| 260610-pl6 | PERF-01: replace 9x9 ensureTile warm loop in resolveSpawn with single ensureTile(baseTX, baseTZ) — drops ~40 redundant _streamNetwork rebuilds per spawn/reload to 1; CR-01 correctness preserved | 2026-06-10 | f377235 | [260610-pl6-perf-01-resolvespawn-single-warm-call](.planning/quick/260610-pl6-perf-01-resolvespawn-single-warm-call/) |
| —          | BUG-05 real fix: suspensionBodyOffset was missing from getWheelPosition (Pacejka hub) while present in stepSuspensionSubsteps — at bodyOffset≠0 the tire contact query found no ground while suspension stayed loaded → Fn=0/SA=0 frictionless slide. Added offset to all 3 physics mount-Y sites (suspension.js:86, physics.js:236, main.js:82 spawn) + visual wheel-mesh mount in syncMeshesToState (main.js ~290, read live so slider drags update) — without the mesh fix the rendered wheel sank into ground at positive offset. Plus defense-in-depth: pulled the 4 near-wheel undercarriage probes inboard of the wheel footprint (uncommitted) | 2026-06-05 | — | — |
| —          | body collision cleanup: semi-implicit Euler ordering (integrate force→velocity before body-contact solver), restitution speed threshold (0.5 m/s), 8-pass Gauss-Seidel contact solver, raised front/rear bumper probes (bumY 0.35→0.45) — fixes upside-down resting jitter (uncommitted) | 2026-06-05 | — | — |
| —          | Pacejka plot: 2× horizontal zoom, axis labels, peak-friction dashed marker + value (fast) | 2026-06-05 | a962532 | — |
| —          | remove infinite GridHelper overlay + per-frame snap (fast) | 2026-06-05 | 52e1417 | — |
| 260604-x3i | fix terrain spawn-chunk duplicate-request race: reserve chunk key in _pendingWorker until built + idempotent build guard (disposes stale mesh) — orphaned meshes no longer survive amplitude rebuilds | 2026-06-05 | 7cf6178 | [260604-x3i-fix-terrain-spawn-chunk-duplicate-reques](.planning/quick/260604-x3i-fix-terrain-spawn-chunk-duplicate-reques/) |
| 260604-f01 | FEAT-01 smooth torque ramp: smoothThrottle/smoothBrake accumulators, ramp rates in ranger.js, Drivetrain sliders in debug.js | 2026-06-04 | — | [260604-f01-smooth-torque-ramp](.planning/quick/260604-f01-smooth-torque-ramp/) |
| 260528-wtt | fix physics CR bugs: inertia axes, isRear guard, slip angle param, blob URL try/finally | 2026-05-29 | c7986cd | [260528-wtt-fix-physics-cr-bugs](.planning/quick/260528-wtt-fix-physics-cr-bugs/) |
| 260528-qaf | sphere contact model: queryContacts replaces terrain(x,z); hub center; body bumper contacts; ramp solid faces | 2026-05-28 | 962a88b | [260528-qaf-sphere-contact-model](.planning/quick/260528-qaf-sphere-contact-model/) |
| 260527-qae | lateral force dead zone: 0.2 m/s speed gate in computeLateralForce stops rest-sliding/yaw feedback loop | 2026-05-27 | 69cba5d | [260527-qae-lateral-force-dead-zone](.planning/quick/260527-qae-lateral-force-dead-zone/) |
| —          | fix(terrain): X-bound ramp collision, remove plateau, smaller freestanding ramp (no quick dir) | 2026-05-27 | cbb62dd | — |
| 260527-qad | terrain-normal Fn direction (r×N·Fn), angular damping replaces hard zero, 10° test ramp + plateau meshes | 2026-05-27 | e1f754b | [260527-qad-terrain-normal-fn-angular-damping](.planning/quick/260527-qad-terrain-normal-fn-angular-damping/) |
| 260527-qac | yaw-only chase cam, infinite grid snap, 2× drive torque | 2026-05-27 | 3695fc5 | [260527-qac-camera-grid-torque](.planning/quick/260527-qac-camera-grid-torque/) |
| 260527-qab | zero pitch/roll angular velocity on ground contact | 2026-05-27 | 0a29967 | [260527-qab-zero-pitch-roll-on-ground-contact](.planning/quick/260527-qab-zero-pitch-roll-on-ground-contact/) |
| 260527-qaa | ground constraint pre-step + velocity-gated W/S torque | 2026-05-27 | 8f8429d | [260527-qaa-fix-ground-constraint-torque-gate](.planning/quick/260527-qaa-fix-ground-constraint-torque-gate/) |
| —          | tire model: slip-angle lateral force, correct Fn cascade, inertia axes, friction cap (no quick dirs) | 2026-05-27 | 8b4757f–1ce9549 | — |
| 260513-vaw | physics fix: gravity, rigid contact, naming cleanup (Fn/Flong/Flat), rollingResistanceCoeff 200→20, maxDriveTorque 250→400 | 2026-05-14 | e0ccac7 | [260513-vaw-physics-fix-gravity-rigid-contact-naming](.planning/quick/260513-vaw-physics-fix-gravity-rigid-contact-naming/) |
| 260513-jwo | physics 6DOF rewrite: Fn→totalForce.y, Fn restoring torque, angular impulse on ground contact, slip-angle lateral force, carGroup mesh sync, symmetric reverse torque | 2026-05-13 | 400c013 | [260513-jwo-physics-6dof-rewrite](.planning/quick/260513-jwo-physics-6dof-rewrite/) |

### Blockers/Concerns

- Phase 8 (Road Routing) requires a spike before implementation — switchback-in-tile routing is the novel algorithm with genuine unknowns. Plan-phase should flag this and include the spike as the first plan node.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-13T06:52:33.619Z
Stopped at: Phase 9 context gathered (intersections scoped in)
Resume file: None

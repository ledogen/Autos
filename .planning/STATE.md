---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Mountains & Roads
status: bug-polish
stopped_at: v1.1 road surface + headless invariance/replay harness landed (Phases 0–5 of 09-INVARIANCE-HARNESS). In bug-polish — remaining work tracked as tickets in .planning/todos/, not phase plans.
last_updated: "2026-06-21"
last_activity: 2026-06-21 -- tracker triage (closed BUG-06/08/10/11, QUAL-03; filed BUG-16, PERF-02; refiled FEAT-07) + right-sized workflow
workflow_note: "Right-sized for maintenance stage 2026-06-21 — lightweight loop (todos tracker + plan mode + direct edits + conventional commits + headless harness gate); GSD orchestration is opt-in. See CLAUDE.md ## Workflow."
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-05)

**Core value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.
**Current focus:** v1.1 bug-polish — road surface tickets in `.planning/todos/`

## Current Position

Stage: **maintenance / bug-polish** (v1.1 Mountains & Roads)
Road surface + the headless invariance/replay harness (Phases 0–5 of 09-INVARIANCE-HARNESS, in `test/`)
have landed; the surface is window-invariant + drivable. Phase 10 (POI + polish) is backlog.
Remaining work is the `.planning/todos/` tracker, not new phase plans.

Open tickets (2026-06-21): BUG-12, BUG-14, BUG-15 (replay-reproducible), BUG-16 (heading dither),
PERF-02 (stream hitch), QUAL-02 (sky/fog), FEAT-03/04/05/06/07.
Last activity: 2026-06-21 — tracker triage + right-sized workflow (see CLAUDE.md ## Workflow).

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
| Phase 09-road-surface P28 | 25 | 2 tasks | 1 files |
| Phase 09-road-surface P29 | 15 | 1 tasks | 1 files |
| Phase 09-road-surface P30 | 35 | 2 tasks | 1 files |

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
- [Phase ?]: Phase 9 P4 (09-29): _runStartCamber seeds cross-run camber from predecessor end value via generation-keyed XZ adjacency index — BUG-10 closed

### Pending Todos

The live tracker is **`.planning/todos/pending/`** (open) and **`.planning/todos/completed/`** (closed).
This section is no longer maintained by hand — see the tracker. (The old P7/P8/P9 exit-gate list here was
satisfied long ago; the harness gates in `test/` + `npm test` are the current quality bar.)

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

Last session: 2026-06-21
Stopped at: tracker triage + workflow right-sizing. v1.1 in bug-polish; harness (Phases 0–5) shipped.
Resume: pick a ticket from `.planning/todos/pending/` (the road-surface family BUG-12/14/15/16 + FEAT-07
shares a carve/centerline root; BUG-15 reproduces headlessly via `node test/replay.mjs <capture>`).

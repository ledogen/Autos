# Walking Skeleton — RangerSim

**Phase:** 1
**Generated:** 2026-05-10

## Capability Proven End-to-End

A user can open `index.html` via a local HTTP server, see a 3D scene with a 2002 Ford Ranger body and four wheels on a lit ground plane, drive it with W/S/A/D, watch the body track quaternion 6DOF physics through any orientation without gimbal lock, reset with R, toggle chase/cockpit camera with C, see a live km/h HUD readout, and watch the stats.js FPS panel stay at 60 fps.

This single capability exercises every architectural layer the rest of the project will build on: scene graph, importmap module resolution, fixed-step accumulator, quaternion integration, ground constraint, locked stub interfaces for tire/suspension, input accumulation, Ackermann steering geometry, debug UI overlay, and lil-gui slider live-binding.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering / math library | Three.js r184 via ES module importmap (CDN) | CLAUDE.md constraint; r184 confirmed latest stable on npm 2026-05-10; importmap is the officially documented path since r147; works on GitHub Pages with zero install |
| Module system | Vanilla ES6 modules in `src/`; no bundler, no npm | CLAUDE.md constraint — must open from GitHub Pages without install |
| Physics | Hand-rolled 6DOF rigid body, no physics library | CLAUDE.md constraint; required for Phase 3 Pacejka access and Phase 4 spring-damper load transfer |
| Body rotation | `THREE.Quaternion` exclusively, integrated via axis-angle from world-space angular velocity, normalized every step | Prototype Euler approach gimbal-locked at 90°; D-03 locks clean break |
| Timestep | Fixed 1/60 s accumulator with 250 ms spiral-of-death clamp (Gaffer pattern) | Deterministic physics for Phase 2 scenario replay; M1-04 requirement |
| Stub interfaces | `src/tire.js` and `src/suspension.js` exist as real files with locked JSDoc signatures from day one (D-05/D-06/D-07) | Protects Phase 3 (Pacejka) and Phase 4 (spring-damper) from retrofitting call sites in `physics.js` |
| Friction (Phase 1 only) | Velocity damping behind the Pacejka signatures: `lateralDampingCoeff`, `rollingResistanceCoeff` | D-08/D-09/D-10 — Phase 3 replaces the function bodies, signatures unchanged |
| Vehicle specs | Single exported const `RANGER_PARAMS` in `data/ranger.js` | M1-15; swappable later for v2 vehicle variants |
| Debug UI | `lil-gui` from `three/addons/libs/lil-gui.module.min.js`, backtick toggle | CLAUDE.md forbids dat.GUI; lil-gui is bundled in Three.js addons |
| FPS panel | `stats.js` from `three/addons/libs/stats.module.js` | FOUND-03; bundled in Three.js addons |
| Deployment target | GitHub Pages (static); local dev via `python3 -m http.server` | FOUND-01, FOUND-04; CLAUDE.md constraint — no backend |
| Directory layout | `index.html` at root · `src/{main,physics,vehicle,tire,suspension,camera,debug}.js` · `data/ranger.js` · `docs/GLOSSARY.md` | Matches RESEARCH.md Architectural Responsibility Map and CLAUDE.md module table |
| Coordinate system | Y-up right-handed; +X right, +Y up, -Z forward at heading 0 | PROJECT.md + D-02; documented in GLOSSARY.md before any physics code |

## Stack Touched in Phase 1

- [x] Project scaffold (importmap, ES module entry, `src/` layout, `data/` layout, `docs/` layout)
- [x] Routing — single-page; one canvas; no routes needed
- [x] "Database" equivalent — `data/ranger.js` const consumed by `vehicle.js` and `debug.js` (read) and mutated live by `debug.js` sliders (write)
- [x] UI — one canvas, one HUD overlay, one lil-gui panel, all wired to live `vehicleState`
- [x] Deployment — local full-stack run via `python3 -m http.server` from project root; verified by opening `http://localhost:8000/index.html` with no console errors; GitHub Pages serves the same files unmodified

## Out of Scope (Deferred to Later Slices)

These are intentionally excluded from Phase 1. Future phases must not re-litigate Phase 1's minimalism — they extend the skeleton, they do not redesign it.

- Pacejka Magic Formula tire forces (Phase 3 — replaces `src/tire.js` body, signature unchanged)
- Real wheel angular velocity per wheel and longitudinal slip ratio (Phase 3)
- Handbrake (Phase 3)
- Spring-damper suspension and dynamic Fz (Phase 4 — replaces `src/suspension.js` body, signature unchanged)
- Body roll / pitch under load transfer (Phase 4)
- Scenario runner, JSON log output, full lil-gui slider set, deterministic replay (Phase 2)
- Static ramp prop, rollover validation, orbit camera, G-force HUD (Phase 5)
- Procedural terrain, surface normals from heightmap (Phase 6)
- Engine torque curve, transmission, clutch, differential model (v2)
- Audio, particle effects, tire smoke (v2 polish)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the architectural decisions above:

- **Phase 2:** Scenario runner + full debug menu — adds JSON load/run/log path that calls the same `stepPhysics(state, params, dt)` from the live loop; expands the lil-gui panel with all tunable constants.
- **Phase 3:** Pacejka tire model — replaces the bodies of `computeLateralForce` and `computeLongitudinalForce` in `src/tire.js`. Adds real `omega_wheel` per wheel to `vehicleState`. Call sites in `physics.js` unchanged.
- **Phase 4:** Spring-damper suspension — replaces the bodies of `computeNormalForce` and `getWheelPosition` in `src/suspension.js`. Adds per-wheel vertical state. Call sites in `physics.js` unchanged.
- **Phase 5:** Rollover validation — adds a static ramp mesh and orbit camera mode; the existing quaternion integrator handles full rotation without code change.
- **Phase 6:** Procedural terrain — replaces the body of the `terrain(x, z)` stub in `src/physics.js` (or moves it to a dedicated module). The surface-normal-aware physics pipeline is already in place because the stub returns a real normal from day one (M1-13).

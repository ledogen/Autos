# RangerSim

## What This Is

A browser-based 6DOF rigid body car physics simulation built in JavaScript with Three.js. The default vehicle is a 2002 Ford Ranger (RWD, open diff). The physics system is designed to be accurate enough to simulate real driving behavior — including drifting, weight transfer, and rollovers — while remaining tunable through an in-game debug menu. Runs entirely in-browser with no install required.

## Core Value

Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.

## Requirements

### Validated

- [x] 6DOF rigid body physics using quaternion rotation (no Euler gimbal lock) — Phase 1
- [x] Fixed physics timestep at 1/60s, deterministic across sessions — Phase 1
- [x] Three.js Y-up coordinate system throughout — no conversion layers — Phase 1
- [x] Surface normals accounted for in physics from day one (no flat-ground assumption) — Phase 4 (sphere contact model)
- [x] 2002 Ford Ranger as default vehicle with real specs (rounded to 3 sig figs) — Phase 1
- [x] Tire model: Pacejka Magic Formula lateral force vs slip angle — Phase 3
- [x] Real wheel angular velocity — enables longitudinal slip, wheelspin, burnouts — Phase 3
- [x] Ackermann steering geometry driven by player input — Phase 1
- [x] Steering input: accumulated keyboard hold (analog feel from digital input), not bang-bang — Phase 1
- [x] Spring-damper suspension: tires and body as separate rigid bodies — Phase 4
- [x] Spring stiffness, damping coefficient, ride height as tunable parameters — Phase 4
- [x] Open differential RWD drivetrain to start — Phase 1
- [x] Spring-follow chase camera (multi-mode support in architecture) — Phase 2
- [x] In-game debug menu (sliders for physics constants, live feedback) — Phase 2
- [x] Scenario testing system: JSON scenario files → scripted inputs → JSON log output — Phase 2
- [x] Scenario glossary at docs/GLOSSARY.md defining all terms and sign conventions — Phase 4.1
- [x] ES6 module architecture: tire.js, suspension.js, physics.js, vehicle.js, main.js — Phase 1
- [x] Modular vehicle definition (car specs in a data file, swappable) — Phase 4 (freeform: data/vehicles.js, Ranger + 240sx presets)
- [x] Rollover-capable physics with a validation ramp prop — Phase 4

### Active

- [ ] Infinite procedural terrain (later milestone — architecture must support it)

### Out of Scope

- Multiplayer — no server infrastructure planned
- Photorealistic graphics — dev-minimal aesthetic (dark grid, simple geometry)
- Audio — not in v1
- Mobile/touch controls — desktop keyboard only for now
- Physics engine libraries (Cannon.js, Rapier, etc.) — hand-rolled physics for learning and control
- Build system / bundler — vanilla JS, no npm, no webpack

## Context

**Prior prototype (references/):** Three backups of a working prototype (backup11, backup12, backup12alt). The prototype had a working Pacejka tire model, Ackermann steering, spring-damper suspension, and a debug slider menu. It drove well at moderate angles but physics broke down at 90° roll/pitch due to Euler angle singularities (gimbal lock). Wheels were scene-level objects decoupled from body rotation, which caused visual/physics inconsistencies. The new build fixes this with full quaternion 6DOF from the start.

**Developer background:** User has FSAE experience — familiar with vehicle dynamics concepts (slip angle, Pacejka, load transfer, Ackermann). Code novice, so architecture must be readable and well-commented. LLM will maintain this codebase across many sessions — conventions must be explicit and self-documenting.

**Current vehicle model state (as of Phase 4.1 complete, 2026-06-03):** The core vehicle simulation is feature-complete. Physics runs at fixed 1/60s with a quaternion 6DOF integrator. Contact is handled by a sphere-query model (`queryContacts` in main.js) — each wheel hub has a sphere probe; body collision uses 14 probes (front/rear bumper, undercarriage, sill, roof) feeding an impulse solver with Coulomb friction (μ=0.6) and Baumgarte position correction. Suspension is spring-damper per corner with strutComp (hub travel relative to body), ARB front only, and tire damping (sign-corrected as of Phase 4). Tire model is Pacejka Magic Formula lateral force gated by a 0.2 m/s dead zone at near-zero speed. Drivetrain is open-diff RWD with handbrake. Camera is framerate-independent exponential chase (dt-based). Debug panel has CG sliders (cgHeight, weightFront/Rear), strutComp travel bars, slip-vector canvas, and 14 translucent body-probe spheres (backtick toggle). Two vehicle presets ship in `data/vehicles.js`: 2002 Ford Ranger (default) and Nissan 240sx — switchable from the debug panel top dropdown.

**Coordinate system:** Three.js Y-up world space. +Y = up, +X = right, -Z = car forward at heading 0. Documented explicitly in every physics module. No SAE conversion layers — physics math uses named vectors (forward, right, up) not axis literals.

**Vehicle reference:** 2002 Ford Ranger XLT 2WD — real specs used as baseline:
- Wheelbase: 2.85m (111.3 in)
- Track width front: 1.46m (57.6 in), rear: 1.46m (57.5 in)
- Curb weight: ~1,360 kg (3,000 lb) — estimate 55/45 F/R distribution
- CG height estimate: ~0.55m (loaded, unladen approx)
- Wheel radius: ~0.368m (245/75R16 tire)
- Drivetrain: RWD, open differential

## Constraints

- **Tech stack**: Three.js + vanilla JS, no build system — must open from GitHub Pages without install
- **Runtime**: Browser only, single origin — no server, no WebSocket, no backend
- **File structure**: ES6 modules in a `src/` directory, single `index.html` entry point
- **Physics**: Hand-rolled, no physics library — required for learning, tuning transparency, and terrain control
- **Performance**: Target 60fps on a mid-range laptop with terrain active — physics must be lightweight
- **LLM maintainability**: Code is primarily maintained by LLM sessions. Conventions must be explicit, self-documenting, and resistant to drift across sessions.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Quaternion rotation from day one | Euler angles caused gimbal lock at 90° in prototype — core failure mode to eliminate | Validated — no gimbal issues through full rollovers |
| Three.js Y-up everywhere, no SAE conversion | Conversion layers are error-prone across LLM sessions; vector naming handles readability | Validated — consistent across all modules |
| ES6 modules (not single HTML file) | Physics complexity requires maintainable separation — tire, suspension, physics, vehicle | Validated — 7 modules, clean import graph |
| Fixed 1/60s physics timestep | Deterministic scenarios — same input file always produces same log | Validated — scenario assert suite passes deterministically |
| Real wheel angular velocity from day one | Required for correct longitudinal slip model; visual-only spin was a known prototype gap | Validated — omega drives longitudinal slip; spin+steer quaternion combined correctly |
| Surface normals in physics from day one | Infinite terrain is a planned milestone — retrofitting normal support is painful | Validated — sphere contact model uses face normals throughout |
| Vehicle specs in data file (swappable) | User wants to try different vehicles later — Ranger is default, not hardcoded | Validated — data/vehicles.js, dropdown preset swap live |
| Hand-rolled physics (no library) | User wants tuning transparency and control; physics library would obscure tire/suspension model | Validated — full Pacejka + spring-damper + impulse solver, all tunable |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 — Phase 4.1 complete (suspension, body collision, vehicle presets, UAT suite green)*

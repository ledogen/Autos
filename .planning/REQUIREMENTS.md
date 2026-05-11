# Requirements: RangerSim

**Defined:** 2026-05-10
**Core Value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.

## v1 Requirements

### Foundation (Project Setup)

- [ ] **FOUND-01**: Project runs in browser from GitHub Pages with no install — single `index.html` + `src/` ES6 modules
- [ ] **FOUND-02**: Three.js r184 loaded via importmap (not global script tag)
- [ ] **FOUND-03**: stats.js FPS monitor visible in debug mode
- [ ] **FOUND-04**: Local dev works via simple HTTP server (`python3 -m http.server` or equivalent)
- [ ] **FOUND-05**: `docs/GLOSSARY.md` defines all physics terms and sign conventions used in code and scenario logs

### Milestone 1 — Basic Driving

- [ ] **M1-01**: 3D world renders with ground plane, grid, basic lighting
- [ ] **M1-02**: Car body and 4 wheels visible as simple meshes (box + cylinders)
- [ ] **M1-03**: 6DOF rigid body physics using quaternion orientation (no Euler angles for physics state)
- [ ] **M1-04**: Fixed 1/60s physics timestep with accumulator loop (spiral-of-death prevention)
- [ ] **M1-05**: Car moves forward/backward with throttle/brake input (W/S)
- [ ] **M1-06**: Car steers left/right with Ackermann geometry (A/D)
- [ ] **M1-07**: Steering uses accumulated keyboard input (analog feel, not bang-bang)
- [ ] **M1-08**: Speed-scaled steering limit (less max lock at high speed)
- [ ] **M1-09**: Wheels visually rotate at correct rate for current speed
- [ ] **M1-10**: Spring-follow chase camera tracks car; cockpit mode toggles on C
- [ ] **M1-11**: HUD shows speed (km/h)
- [ ] **M1-12**: R key resets car to spawn position
- [ ] **M1-13**: Surface normal query function `terrain(x,z) => {height, normal}` wired into physics pipeline (returns flat ground)
- [ ] **M1-14**: `getDriveTorque(wheelIndex, vehicleState, params)` drivetrain interface exists (returns flat torque)
- [ ] **M1-15**: Vehicle specs loaded from `data/ranger.js` (real 2002 Ford Ranger dimensions, 3 sig fig)

### Milestone 2 — Scenario System + Debug Menu

- [ ] **M2-01**: JSON scenario file format: initial conditions, per-frame input sequences, duration
- [ ] **M2-02**: Scenario runner executes scripted inputs using same physics step function as live loop
- [ ] **M2-03**: JSON log output captures per-frame state: position, velocity, quaternion, angular velocity, per-wheel data
- [ ] **M2-04**: Scenario runner accessible from browser (load scenario file, run, download log)
- [ ] **M2-05**: lil-gui debug menu (backtick toggle) exposes all tunable physics constants
- [ ] **M2-06**: Debug menu parameter changes take effect immediately with no restart

### Milestone 3 — Tire Model

- [ ] **M3-01**: Real wheel angular velocity integrated per wheel (FL, FR, RL, RR) — omega_wheel [rad/s]
- [ ] **M3-02**: Longitudinal slip ratio computed from wheel angular velocity vs contact patch speed
- [ ] **M3-03**: Pacejka Magic Formula lateral force: slip angle → Fy (C hard-clamped to [1.0, 1.99])
- [ ] **M3-04**: Pacejka longitudinal force: slip ratio → Fx
- [ ] **M3-05**: Friction circle coupling (vector-normalized — lateral and longitudinal share total budget)
- [ ] **M3-06**: Handbrake (Space) reduces rear wheel Pacejka D for drift initiation
- [ ] **M3-07**: HUD shows front slip angle (color-coded: green <5°, orange 5–15°, red >15°)
- [ ] **M3-08**: HUD shows throttle/brake bar
- [ ] **M3-09**: Live Pacejka curve plot in debug menu with operating point dot per front wheel
- [ ] **M3-10**: Drifting and wheelspin feel natural — tunable via debug menu

### Milestone 4 — Suspension

- [ ] **M4-01**: Spring-damper suspension per wheel (spring stiffness, damping coefficient, rest length)
- [ ] **M4-02**: Wheel vertical position and velocity integrated independently per wheel
- [ ] **M4-03**: Body corner world position computed via quaternion rotation of local mount offset (not linearized sin/cos)
- [ ] **M4-04**: Dynamic normal force Fz from suspension each step (not static mass/4)
- [ ] **M4-05**: Wheel lift detection: Fz clamped to 0 when airborne; tire forces skipped entirely
- [ ] **M4-06**: Wheel mass participates in vertical dynamics
- [ ] **M4-07**: Load transfer visible under braking (nose dips) and cornering (body rolls)
- [ ] **M4-08**: Debug menu exposes spring stiffness, damping, ride height sliders
- [ ] **M4-09**: Per-wheel normal force visible in debug panel

### Milestone 5 — Rollover Validation

- [ ] **M5-01**: Static wedge ramp prop placed in world (rigid body, drives onto it)
- [ ] **M5-02**: Car rolls over naturally when driven onto ramp at sufficient speed
- [ ] **M5-03**: Rolled car stays rolled (no phantom restoring forces)
- [ ] **M5-04**: Physics remains stable post-rollover (no NaN, no explosion)
- [ ] **M5-05**: Scenario test: "drive at ramp at 40 kph" — log captures full rollover event
- [ ] **M5-06**: G-force meter in HUD (lateral + longitudinal, dot-in-circle display)
- [ ] **M5-07**: Orbit camera mode (O key) for inspecting rollover from any angle

### Milestone 6 — Procedural Terrain (requires research phase first)

- [ ] **TERR-01**: Simplex noise heightmap generates infinite terrain around car
- [ ] **TERR-02**: Chunk-based loading (generate/dispose as car moves)
- [ ] **TERR-03**: Surface normals from terrain fed into physics pipeline per wheel contact
- [ ] **TERR-04**: Car drives over hills and uneven terrain with correct physics response
- [ ] **TERR-05**: Car can roll over on terrain (not just on ramp)
- [ ] **TERR-06**: 60fps maintained on mid-range laptop with terrain active

## v2 Requirements

### Drivetrain Simulation

- **DT-01**: Engine torque curve (RPM-dependent output)
- **DT-02**: Manual transmission with gear ratios
- **DT-03**: Clutch model (engagement, slip)
- **DT-04**: Open differential torque split behavior
- **DT-05**: Locked/limited-slip differential option

### Camera

- **CAM-01**: Hood camera mode
- **CAM-02**: Multiple camera presets selectable from HUD

### Vehicle Variants

- **VEH-01**: Second vehicle spec file (e.g. sports car / Miata)
- **VEH-02**: Vehicle selector in debug menu

### Polish

- **POL-01**: Tire smoke particle effect when slip angle exceeds threshold
- **POL-02**: Engine sound (Web Audio API)
- **POL-03**: Drive mode presets (Cruise / Sport / Track) scaling power and steering rate

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiplayer | No server infrastructure; physics determinism is for scenario replay, not sync |
| Damage model (mesh deformation) | Extremely complex physics coupling; wrong product scope |
| Mobile / touch controls | Desktop keyboard only; touch requires different input paradigm |
| Race mode / lap timer | Wrong product — this is a physics sandbox, not a racing game |
| Audio (v1) | Additive polish, not foundational; defer to v2 |
| Photorealistic shading | No gameplay value in a physics sandbox; dark grid is a feature |
| AI / NPC vehicles | Major complexity, no sandbox value |
| Physics library (Cannon.js etc.) | Required hand-rolled for Pacejka + load transfer access |
| Weather / time of day | No physics coupling without a validated tire-friction model first |
| Minimap | No track, no boundary, no objective — nothing to show |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| M1-01 | Phase 1 | Pending |
| M1-02 | Phase 1 | Pending |
| M1-03 | Phase 1 | Pending |
| M1-04 | Phase 1 | Pending |
| M1-05 | Phase 1 | Pending |
| M1-06 | Phase 1 | Pending |
| M1-07 | Phase 1 | Pending |
| M1-08 | Phase 1 | Pending |
| M1-09 | Phase 1 | Pending |
| M1-10 | Phase 1 | Pending |
| M1-11 | Phase 1 | Pending |
| M1-12 | Phase 1 | Pending |
| M1-13 | Phase 1 | Pending |
| M1-14 | Phase 1 | Pending |
| M1-15 | Phase 1 | Pending |
| M2-01 | Phase 2 | Pending |
| M2-02 | Phase 2 | Pending |
| M2-03 | Phase 2 | Pending |
| M2-04 | Phase 2 | Pending |
| M2-05 | Phase 2 | Pending |
| M2-06 | Phase 2 | Pending |
| M3-01 | Phase 3 | Pending |
| M3-02 | Phase 3 | Pending |
| M3-03 | Phase 3 | Pending |
| M3-04 | Phase 3 | Pending |
| M3-05 | Phase 3 | Pending |
| M3-06 | Phase 3 | Pending |
| M3-07 | Phase 3 | Pending |
| M3-08 | Phase 3 | Pending |
| M3-09 | Phase 3 | Pending |
| M3-10 | Phase 3 | Pending |
| M4-01 | Phase 4 | Pending |
| M4-02 | Phase 4 | Pending |
| M4-03 | Phase 4 | Pending |
| M4-04 | Phase 4 | Pending |
| M4-05 | Phase 4 | Pending |
| M4-06 | Phase 4 | Pending |
| M4-07 | Phase 4 | Pending |
| M4-08 | Phase 4 | Pending |
| M4-09 | Phase 4 | Pending |
| M5-01 | Phase 5 | Pending |
| M5-02 | Phase 5 | Pending |
| M5-03 | Phase 5 | Pending |
| M5-04 | Phase 5 | Pending |
| M5-05 | Phase 5 | Pending |
| M5-06 | Phase 5 | Pending |
| M5-07 | Phase 5 | Pending |
| TERR-01 | Phase 6 | Pending |
| TERR-02 | Phase 6 | Pending |
| TERR-03 | Phase 6 | Pending |
| TERR-04 | Phase 6 | Pending |
| TERR-05 | Phase 6 | Pending |
| TERR-06 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-10 after roadmap creation*

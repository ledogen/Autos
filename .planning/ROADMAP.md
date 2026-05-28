# Roadmap: RangerSim

## Overview

RangerSim builds from a bare 6DOF rigid body up to a fully validated physics sandbox capable of natural rollovers on procedural terrain. Each phase ends with something driveable — the user can get behind the wheel after every increment. Phases 1–5 constitute v1. Phase 6 is gated behind a mandatory research phase before any planning or execution begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Driving** - 3D world, 6DOF quaternion body, flat-tire placeholder, input, render
- [ ] **Phase 2: Scenario System + Debug Menu** - JSON scenario runner, lil-gui sliders, HUD polish
- [ ] **Phase 3: Tire Model** - Pacejka Magic Formula, wheel angular velocity, longitudinal slip, handbrake
- [ ] **Phase 4: Suspension** - Spring-damper per wheel, dynamic Fz, load transfer, wheel lift
- [ ] **Phase 5: Rollover Validation** - Ramp prop, rollover scenarios, G-force meter, orbit camera
- [ ] **Phase 6: Procedural Terrain** - ⚠ RESEARCH REQUIRED before planning or execution

## Phase Details

### Phase 1: Core Driving
**Goal**: The user can drive a car in a 3D world — steer, throttle, brake, and reset — with correct quaternion 6DOF physics and no Euler gimbal lock. No Pacejka, no spring-damper: flat-tire friction placeholder and rigid ground contact only.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07, M1-08, M1-09, M1-10, M1-11, M1-12, M1-13, M1-14, M1-15
**Success Criteria** (what must be TRUE):
  1. User can open `index.html` in a browser (via local HTTP server or GitHub Pages) and see a 3D scene with a car body and four wheels on a grid
  2. User can drive forward/backward with W/S, steer with A/D using Ackermann geometry, and the car's orientation tracks correctly through 360° of rotation without gimbal lock artifacts
  3. User can press R to reset the car to spawn position
  4. User sees a live speed readout (km/h) in the HUD and a stable 60fps FPS counter in debug mode
  5. User can toggle chase and cockpit camera modes with C
**Plans**: 4 plans

Plans:
**Wave 1**
- [ ] 01-01-PLAN.md — Walking Skeleton: GLOSSARY, importmap, scene, fixed-timestep loop, terrain stub

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 01-02-PLAN.md — Physics Engine: 6DOF integrator, tire/suspension stubs, getDriveTorque stub
- [ ] 01-03-PLAN.md — Vehicle + Drivetrain: input, Ackermann steer, wheel spin, reset, HUD speed wire
- [ ] 01-04-PLAN.md — Camera + Debug: spring-follow chase, cockpit toggle, lil-gui friction sliders

**UI hint**: yes

### Phase 2: Scenario System + Debug Menu
**Goal**: The user can record scripted driving runs, download JSON logs of per-frame physics state, and tune every physics constant live while driving via a lil-gui debug panel — without restarting the simulation.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: M2-01, M2-02, M2-03, M2-04, M2-05, M2-06
**Success Criteria** (what must be TRUE):
  1. User can load a JSON scenario file in the browser, run it headlessly through the same physics step function used for live play, and download a per-frame log (position, velocity, quaternion, angular velocity, per-wheel data)
  2. User can press backtick to open/close the debug menu overlay and see sliders for all tunable physics constants
  3. User can move a debug slider (e.g. friction coefficient) while driving and observe the car behavior change immediately with no restart
  4. User can replay the same scenario file twice and receive identical logs (deterministic physics confirmed)
**Plans**: TBD
**UI hint**: yes

### Phase 3: Tire Model
**Goal**: The user experiences physics-honest lateral grip, wheelspin, and drift — driven by the Pacejka Magic Formula using real wheel angular velocity and a friction circle that couples lateral and longitudinal forces correctly.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: M3-01, M3-02, M3-03, M3-04, M3-05, M3-06, M3-07, M3-08, M3-09, M3-10
**Success Criteria** (what must be TRUE):
  1. User can floor the throttle from rest and observe rear wheelspin with visible wheel RPM diverging from car speed
  2. User can hold the handbrake (Space) through a corner to initiate and sustain a drift on the rear axle
  3. User can observe the front slip angle HUD indicator cycle through green / orange / red as cornering intensity increases
  4. User can open the debug menu, see a live Pacejka curve plot with a moving operating-point dot per front wheel, and adjust B/C/D values to feel the difference immediately
  5. User can observe natural-feeling understeer, oversteer, and drift recovery tunable entirely via the debug menu
**Plans**: TBD
**UI hint**: yes

### Phase 4: Suspension
**Goal**: The user sees and feels weight transfer — the nose dips under hard braking, the body rolls into corners, and individual wheels can lift off the ground — because each wheel now has an independent spring-damper with dynamic normal force fed into the Pacejka model.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: M4-01, M4-02, M4-03, M4-04, M4-05, M4-06, M4-07, M4-08, M4-09
**Success Criteria** (what must be TRUE):
  1. User can observe the car body visibly pitch nose-down under hard braking and roll outward in a fast corner
  2. User can drive over a small bump and watch wheel travel compress and rebound without the body exploding or NaN values appearing
  3. User can open the debug panel and see per-wheel normal force (Fz) values change live during acceleration, braking, and cornering
  4. User can raise a wheel off the ground (via aggressive cornering or a bump) and observe that the airborne wheel contributes no tire force
  5. User can adjust spring stiffness and damping sliders in the debug menu and feel the suspension character change instantly while driving
**Plans**: TBD
**UI hint**: no

### Phase 5: Rollover Validation
**Goal**: The user can deliberately roll the car over on a ramp, watch it stay rolled with stable physics, and inspect the event from any angle — all captured and replayable via the scenario system.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: M5-01, M5-02, M5-03, M5-04, M5-05, M5-06, M5-07
**Success Criteria** (what must be TRUE):
  1. User can drive onto the static ramp prop at sufficient speed and observe the car roll over naturally without manual intervention
  2. User can observe the rolled car remain on its side or roof with no phantom restoring forces — it stays where physics left it
  3. User can press O to switch to orbit camera and inspect the rolled car from any angle, then drive a fresh run
  4. User can run the "ramp at 40 kph" scenario and download a JSON log that captures the full rollover event frame-by-frame
  5. User can see the G-force meter in the HUD spike laterally and longitudinally during the rollover event
**Plans**: TBD
**UI hint**: yes

### Phase 6: Procedural Terrain
**Goal**: The user can drive on infinite procedurally generated terrain with correct physics response — hills, bumps, and uneven ground feed surface normals into the suspension and tire pipeline — and the car can roll over on terrain without a ramp.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: TERR-01, TERR-02, TERR-03, TERR-04, TERR-05, TERR-06

> **⚠ RESEARCH REQUIRED**: This phase must NOT be planned or executed until a dedicated research phase is completed. Key open questions: chunk ring-buffer strategy, Web Worker heightmap generation (browser constraints), physics normal integration per contact point, 60fps budget with terrain active. Run `/gsd-plan-phase 6` only after research outputs are in `.planning/research/`.

**Success Criteria** (what must be TRUE):
  1. User can drive continuously in any direction without visible terrain seams or chunk pop-in
  2. User can drive over hills and uneven ground and observe the car respond correctly — body pitches and rolls with terrain slope
  3. User can roll the car over on terrain without needing the ramp prop
  4. User can maintain 60fps on a mid-range laptop with terrain active and all prior physics systems running
**Plans**: TBD (pending research phase)
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → [research] → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Driving | 4/4 | ✅ Complete | 2026-05-28 |
| 2. Scenario System + Debug Menu | 0/TBD | Not started | - |
| 3. Tire Model | 0/TBD | Not started | - |
| 4. Suspension | 0/TBD | Not started | - |
| 5. Rollover Validation | 0/TBD | Not started | - |
| 6. Procedural Terrain | 0/TBD | Blocked (research required) | - |

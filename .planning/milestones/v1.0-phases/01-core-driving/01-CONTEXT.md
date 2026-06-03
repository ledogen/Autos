# Phase 1: Core Driving - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a fully drivable 2002 Ford Ranger in the browser: quaternion 6DOF rigid body physics, Ackermann steering with analog input feel, velocity-damped lateral and longitudinal friction, spring-follow chase camera, speed HUD, car reset, terrain interface stub (`terrain(x,z) => {height, normal}`), drivetrain interface stub (`getDriveTorque(wheelIndex, vehicleState, params)`), and vehicle specs loaded from `data/ranger.js`. Scope covers all FOUND-* and M1-* requirements.

Pacejka tire model, spring-damper suspension, scenario system, and debug menu are NOT in this phase.

</domain>

<decisions>
## Implementation Decisions

### GLOSSARY.md
- **D-01:** `docs/GLOSSARY.md` is the FIRST task in Phase 1 — written before any physics code is written.
- **D-02:** Phase 1 GLOSSARY covers: coordinate system (Y-up, +X right, +Y up, -Z forward at heading 0), named vectors (forward/right/up), slip angle sign convention, torque sign, quaternion integration convention, and term definitions for: slip angle, contact patch velocity, Ackermann geometry. Deferred to later phases: Pacejka terms, suspension terms.

### Prototype Code
- **D-03:** `references/backup11.html`, `references/backup12.html`, and `references/backup12alt.html` are explicitly off-limits. Downstream agents (researcher, planner, executor) MUST NOT reference these files during Phase 1 implementation.
- **D-04:** Implementation is guided by REQUIREMENTS.md + physics first principles only. Pure greenfield build.

### Stub Module Architecture
- **D-05:** `src/tire.js` and `src/suspension.js` are created in Phase 1 as real files with locked function signatures. They are NOT implemented inline in `physics.js`.
- **D-06:** `src/tire.js` exports at minimum: `computeLateralForce(slipAngle, Fz, params)` and `computeLongitudinalForce(slipRatio, Fz, params)`. `src/suspension.js` exports at minimum: `computeNormalForce(corner, vehicleState, params)` and `getWheelPosition(corner, vehicleState)`. These signatures are locked — Phase 3 and 4 replace the function bodies without touching call sites.
- **D-07:** Each stub function has a JSDoc comment defining: input units, output units, and what the real Phase 3/4 implementation will do. The comment is the contract.

### Phase 1 Lateral + Longitudinal Friction
- **D-08:** Phase 1 uses velocity damping for both lateral and longitudinal friction. Lateral: force proportional to lateral velocity at each wheel contact point. Longitudinal: rolling resistance + brake drag proportional to wheel longitudinal velocity. No slip angle math, no Pacejka — just damping coefficients.
- **D-09:** The velocity damping code lives inside `src/tire.js` behind the `computeLateralForce` and `computeLongitudinalForce` signatures. When Phase 3 arrives, the Pacejka implementation replaces the body. Call sites in `physics.js` do not change.
- **D-10:** Two friction params: `lateralDampingCoeff` and `rollingResistanceCoeff`. Both live in `data/ranger.js` alongside vehicle specs. Both are exposed as debug menu sliders in Phase 1.

### Claude's Discretion
- Exact slider ranges and default values for `lateralDampingCoeff` and `rollingResistanceCoeff` — tune for feel
- Mesh geometry proportions for car body / wheels (requirement says "simple box + cylinders" — proportions and scale open)
- Camera spring follow constants (stiffness, damping) — tune for feel

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Full v1 requirement list; Phase 1 scope is FOUND-01 through FOUND-05 and M1-01 through M1-15
- `.planning/PROJECT.md` — Vehicle specs (2002 Ford Ranger: 2.85m wheelbase, 1.46m track, 1360 kg, 0.55m CG height, 0.368m wheel radius), coordinate system, key decisions table

### Conventions
- `docs/GLOSSARY.md` — Created as first task in Phase 1. Defines coordinate system, sign conventions, and all physics terms. **MUST be written before any physics code.**

### Technology
- `CLAUDE.md` §Recommended Stack — Three.js r184 via importmap, ES6 modules in `src/`, lil-gui from `three/addons/libs/lil-gui.module.min.js`, stats.js from `three/addons/libs/stats.module.js`
- `CLAUDE.md` §What NOT to Use — Explicit prohibition list (no Euler angles, no physics library, no dat.GUI, no bundler, no global Three.js script tag)
- `CLAUDE.md` §Physics Loop Pattern — Fixed timestep accumulator pattern reference

### Off-Limits
- `references/backup12.html`, `references/backup11.html`, `references/backup12alt.html` — **MUST NOT be referenced during implementation.** Prototype used Euler angles (gimbal lock failure mode) and coupled architecture. Clean break required.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — no `src/` directory exists yet. Greenfield build.

### Established Patterns
- Three.js importmap pattern confirmed working (see `CLAUDE.md` §Version Verification Status)
- Fixed timestep accumulator pattern: confirmed working in prototype but NOT to be copied — implement from spec

### Integration Points
- `index.html` → imports `src/main.js` via `<script type="module">`
- `src/main.js` → entry point; imports vehicle.js, camera.js, debug.js
- `src/physics.js` → calls into `src/tire.js` and `src/suspension.js` (stub signatures locked in Phase 1)
- `data/ranger.js` → exported const object consumed by vehicle.js and exposed via debug.js

</code_context>

<specifics>
## Specific Ideas

- The friction placeholder is intentionally minimal — the goal is a drivable car, not a realistic one. Realism comes in Phase 3 (Pacejka) and Phase 4 (suspension).
- `docs/GLOSSARY.md` first, code second — this is an explicit ordering constraint, not a suggestion.
- The stub function signatures in tire.js and suspension.js are contracts that must not change when Phases 3 and 4 implement them. If the real implementation needs different inputs, the signature changes must be evaluated against all call sites.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Core Driving*
*Context gathered: 2026-05-10*

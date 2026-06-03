# Phase 1: Core Driving - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 1-Core Driving
**Areas discussed:** Phase 1 lateral friction, Prototype code reuse, GLOSSARY.md timing, Stub module structure

---

## Phase 1 Lateral Friction

| Option | Description | Selected |
|--------|-------------|----------|
| Velocity damping | Lateral friction proportional to lateral velocity at each wheel contact. No slip angle math, no grip cap. Tunable damping coefficient. | ✓ |
| Simplified slip cap | Compute slip angle per wheel but output flat clamped force instead of Pacejka curve. | |
| No lateral grip | Only drivetrain + brake forces. Car slides freely sideways. | |

**User's choice:** Velocity damping (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Tunable in debug menu | Expose damping coefficient as a slider. Goes in ranger.js as a named param. | ✓ |
| Hardcoded constant | Bake into physics.js. Add slider later. | |

**User's choice:** Tunable in debug menu (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Both lateral + longitudinal damping | Rolling resistance + brake drag included alongside lateral. Complete enough to feel real. | ✓ |
| Lateral only | Rolling resistance deferred to Phase 3 with Pacejka. | |

**User's choice:** Both lateral + longitudinal (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| In data/ranger.js | Keeps all Ranger tuning in one place. Replaced by Pacejka params in Phase 3. | ✓ |
| Hardcoded defaults in physics.js | Simpler now, move later. | |

**User's choice:** In data/ranger.js alongside vehicle specs (Recommended)
**Notes:** —

---

## Prototype Code Reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Copy-adapt key algorithms | Extract Ackermann, input accumulation, timestep, camera from backup12.html and adapt to ES6 modules. | |
| Reference only — rewrite from scratch | Read for inspiration but write all code fresh. | |
| Ignore the prototype | Pure greenfield, no reference to prototype files at all. | ✓ |

**User's choice:** Ignore the prototype
**Notes:** User wants a clean architectural break. No copy, no reference.

| Option | Description | Selected |
|--------|-------------|----------|
| REQUIREMENTS.md + physics first principles | Guided entirely by the spec and vehicle dynamics. No prototype dependency. | ✓ |
| Specific algorithms from backup12 (not file structure) | Extract math as pseudocode inspiration only. | |

**User's choice:** REQUIREMENTS.md + physics first principles (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in references/ — silent fallback for debugging only | File stays but agents don't consult it during implementation. | |
| Explicitly off-limits — note in CONTEXT.md | Hard rule: agents must not reference the prototype at all. | ✓ |

**User's choice:** Explicitly off-limits — note in CONTEXT.md
**Notes:** —

---

## GLOSSARY.md Timing

| Option | Description | Selected |
|--------|-------------|----------|
| First task in Phase 1 | Written before any physics code. Locks coordinate system, sign conventions, term definitions. | ✓ |
| After physics.js is drafted | Document what was built. Lower risk of glossary contradicting code. | |

**User's choice:** First task in Phase 1 (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Coordinate system + term definitions only | Cover Y-up axes, named vectors, slip angle sign, torque sign, quaternion convention, Ackermann/slip angle/contact patch definitions. Add more in later phases. | ✓ |
| Full v1 glossary upfront | Define everything for Phases 1–5 including Pacejka, suspension terms. | |

**User's choice:** Coordinate system + term definitions only (Recommended)
**Notes:** —

---

## Stub Module Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Real files with locked function signatures | tire.js and suspension.js created in Phase 1 with locked exports. Phase 3/4 replace bodies without touching call sites. | ✓ |
| Inline stubs in physics.js | Everything in physics.js for now. tire.js/suspension.js created when real implementations are ready. | |

**User's choice:** Real files with locked function signatures (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| JSDoc comments on each function | Each stub documents input units, output units, and what real implementation will do. The comment is the contract. | ✓ |
| No comment, just signature + return | Minimal. GLOSSARY handles terminology. Comments added when real implementation lands. | |

**User's choice:** JSDoc comments on each function (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| In tire.js, behind the stub function signature | computeLateralForce() implements velocity damping in Phase 1. Phase 3 replaces the body. Call sites never change. | ✓ |
| Directly in physics.js | Friction in physics integrator for Phase 1. tire.js stubs return 0. More refactoring at Phase 3 boundary. | |

**User's choice:** In tire.js, behind the stub function signature (Recommended)
**Notes:** —

---

## Claude's Discretion

- Exact slider ranges and default values for `lateralDampingCoeff` and `rollingResistanceCoeff`
- Mesh geometry proportions for car body and wheels
- Camera spring follow constants (stiffness, damping)

## Deferred Ideas

None — discussion stayed within phase scope.

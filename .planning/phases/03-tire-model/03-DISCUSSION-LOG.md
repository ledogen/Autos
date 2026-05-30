# Phase 3: Tire Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 3-tire-model
**Areas discussed:** Longitudinal slip scope, Pacejka curve plot, Handbrake behavior, Front/rear Pacejka split

---

## Longitudinal Slip Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full Pacejka both axes | Replace both computeLateralForce and computeLongitudinalForce with Pacejka; add wheelOmega[4] to vehicleState; compute real slip ratio | ✓ |
| Lateral Pacejka only | Pacejka for lateral only; keep rolling resistance + drive force for longitudinal; slip ratio deferred | |

**User's choice:** Claude discretion — full Pacejka for both axes  
**Notes:** ROADMAP explicitly requires "friction circle that couples lateral and longitudinal forces correctly" and "real wheel angular velocity" — leaves no ambiguity.

---

## Pacejka Curve Plot

| Option | Description | Selected |
|--------|-------------|----------|
| lil-gui inline canvas | Custom HTML widget inside lil-gui panel | |
| Separate overlay canvas | Standalone `<canvas>` appended to body, shown/hidden with debug panel | ✓ |
| Three.js 2D plane | Canvas texture on a plane in the 3D scene | |

**User's choice:** Claude discretion — separate overlay canvas  
**Notes:** Simplest approach that fits the no-bundler, ES-modules constraint. Consistent with the project's minimal style.

---

## Handbrake Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-lock omega | Set rear wheelOmega to 0 directly | |
| Max rear brake torque | Apply maxHandbrakeTorque to rear wheels; slip develops via Pacejka model | ✓ |
| Override slip ratio | Directly set rear slip ratio to configurable value | |

**User's choice:** Claude discretion — max rear brake torque  
**Notes:** Physically correct; lets the Pacejka saturation model produce the oversteer naturally. Hard-lock would bypass the tire model.

---

## Front/Rear Pacejka Split

| Option | Description | Selected |
|--------|-------------|----------|
| Single set all wheels | One B/C/D/E for all 4 wheels | ✓ |
| Separate front/rear sets | Independent front/rear Pacejka params and sliders | |

**User's choice:** Claude discretion — single set  
**Notes:** Ranger runs same tire all around. Separate tuning only becomes meaningful once Phase 4 adds dynamic Fz. Deferred.

---

## Claude's Discretion

- Exact Pacejka starting coefficient values (tuned within published street-tire ranges)
- Wheel inertia estimate for omega integrator
- Canvas plot pixel dimensions and visual style
- HUD placement for slip angle indicator
- Epsilon value in slip ratio denominator

## Deferred Ideas

- Separate front/rear Pacejka coefficients — Phase 4+ when dynamic Fz makes it meaningful
- Longitudinal Pacejka curve plot — only lateral required per ROADMAP SC#4
- Engine rev simulation / gear ratios — post-v1
- Tire temperature model — post-v1

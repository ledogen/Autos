# Phase 4: Suspension — Discussion Log

**Date:** 2026-05-31
**Mode:** discuss (default)

## Areas Selected
- Sprung/unsprung mass model
- Suspension topology
- Anti-roll bar (ARB)
- Integrator stability for stiff springs

## Discussion

### Area 1 — Sprung/unsprung mass model
**Options presented:** Full quarter-car / Lumped single body / Walk-through trade-offs
**Selected:** Full quarter-car (hub as integrated mass)
**Notes:** Hub gets per-wheel Y and Vy. Tire spring (ground↔hub) provides Fz to Pacejka. Suspension spring (hub↔body) creates body load transfer. Satisfies M4-06 cleanly. 4 extra integrated states accepted.

### Area 2 — Suspension topology
**Options presented:** Fully independent 4 corners / IFS + solid rear axle / Independent now, defer solid axle
**Selected:** Fully independent at all 4 corners
**Notes:** Solid rear axle is the authentic Ranger answer but deferred. 4-independent is sufficient for all Phase 4 success criteria. Front/rear params kept independently tunable for understeer/oversteer balance.

### Area 3 — Anti-roll bars
**Options presented:** Yes — front + rear ARB / Defer to Phase 5 / Skip entirely
**Selected:** Yes — front + rear ARB sliders
**Notes:** Bilinear-spring approximation. Coupling on suspension compression: F = k_arb × (compL − compR). Two new params: arbStiffnessFront, arbStiffnessRear. Unlocks understeer/oversteer tuning via front/rear ARB balance.

### Area 4 — Integrator stability for stiff springs
**Options presented:** Sub-step at dt/N / Single-dt with damping tuning / Defer to researcher
**Selected (with elaboration):** Sub-step at dt/2 — and **physics timestep must be parameterized** so it can be changed from 1/60 later
**Notes:** Vertical-only subsystem at dt/2 (hub Y/Vy, body Y force contribution from springs). Outer 6DOF stays at outer dt. Researcher should verify dt/2 is sufficient across slider range. New constant `PHYSICS_DT` (or `vehicleState.physicsDt`) introduced; substep ratio fixed at 2.

## Deferred Ideas Captured
- Solid rear axle (live beam, shared roll DOF)
- Suspension geometry (camber, toe, anti-dive/squat)
- Separate ARB geometry / motion ratio
- Bump-stops / progressive springs
- Damper bleed / digressive damping curves
- Adjustable wheel mass slider

## Claude's Discretion Items (carried into PLAN)
- Spring/damper starting values per axle (target ζ ≈ 0.6–0.8 body bounce; 1.5–2 Hz body natural frequency)
- ARB starting values (target ~5° body roll at 0.5g)
- `wheelMass` value (≈18 kg from existing wheelInertia derivation)
- Rest height / preload approach (start at static equilibrium)
- Exact debug-panel layout for per-wheel Fz readout
- Substep loop structure (explicit 2-iteration vs generic N-step)

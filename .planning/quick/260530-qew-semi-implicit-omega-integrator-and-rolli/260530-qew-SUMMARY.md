---
status: complete
quick_id: 260530-qew
slug: semi-implicit-omega-integrator-and-rolli
date: 2026-05-30
---

## Summary

Two fixes from the loose-end investigation:

1. **ω oscillation killed via semi-implicit Euler** on the road-reaction torque (Option B from the proposal, not the originally-proposed damping).
2. **Rolling resistance added** as horizontal velocity-aligned drag scaled by ground load (Option C).

## Why semi-implicit Euler instead of viscous damping (the originally proposed Option A)

Simulation of the proposed `wheelDamping = c × (ω − ω_free)` torque showed it makes the oscillation **worse**, not better. Reason: in a 1st-order stiff ODE, a damping torque proportional to the displacement from equilibrium is mathematically identical to *adding to the existing stiffness*, which is the very thing causing the explicit-Euler overshoot. At c=50, limit cycle amplitude grew from 32↔48 to 30↔54.

The user's intuition (real-world bearing/hysteresis damping) is correct for 2nd-order oscillators but doesn't apply here. The oscillation is a numerical artifact (`k_pacejka · dt / I ≈ 8`, way past the explicit-Euler stability threshold of 2), not a physical resonance.

Semi-implicit Euler:
- Linearize `F_long` around `ω0`: `T_road(ω) ≈ T_road(ω0) + (dT/dω)·(ω − ω0)`
- Solve implicitly: `ω_new = ω0 + dt · T_explicit / (I − dt · dT/dω)`
- Effective dt shrinks by factor `(1 + dt·|dT/dω|/I)` when stiffness is high → unconditionally stable
- Conservative: uses initial Pacejka slope (`K = μ·Fn·B·C·D`) as the linearization, which overestimates damping in the saturated regime — slightly conservative convergence, no overshoot

Verified across four regimes:
- **Coast**: ω = 46 → 44.1 → 42.93 → 42.58 → 42.53 (free-rolling, converged in 4 steps, no oscillation)
- **Brake**: ω = 40 → 36 → 33 → 30 → ... (smooth monotonic deceleration, no overshoot)
- **Lockup**: ω = 15 → 8.6 → 2.2 → 0 (clamp fires, holds at 0)
- **Drive from rest**: ω holds at small slip above free-rolling, generates forward Flong — correct

## Rolling resistance

Standard tire model: `F_drag = -Cr × Σ Fn × v̂_horizontal`. Scaled by accumulated ground normal force (`totalGroundFn` tracked through the wheel-contact loop), so:
- Vanishes when airborne (Σ Fn = 0)
- Matches mass × g on flat ground at rest
- Naturally reduces during weight transfer on slopes (less total Fn into ground)

0.05 m/s deadband to prevent creep at standstill. Coefficient `Cr = 0.015` is the industry baseline for tire on dry pavement (~0.15 m/s² coast deceleration at the Ranger's mass).

## Files Changed

- `src/physics.js`:
  - Added `totalGroundFn` accumulator alongside `totalForce`/`totalTorque` (line 132)
  - Accumulate `totalGroundFn += Fn` inside contact loop (line 193)
  - Added `let lastFn = 0` alongside `lastScaledFlong` (line 175)
  - Set `lastFn = Fn` after tire force calc (line 211)
  - Replaced explicit-Euler ω update with semi-implicit form using `K_pacejka` linearization (lines 247-260)
  - Inserted Step 3a: rolling resistance block before body contacts (line 273)
- `data/ranger.js`:
  - Added `rollingResistanceCoeff: 0.015`
- `src/debug.js`:
  - Added "Rolling Resistance Cr" slider (range 0–0.05)

## Notes / Limitations

- Semi-implicit linearization uses the **initial Pacejka slope** (steepest, at σ=0) as a constant `K_pacejka`. In the saturated regime (high |σ|), the actual local slope is smaller, so the implicit damping is over-conservative — convergence may be marginally slower than optimal there. Trade-off: simpler code, guaranteed stability.
- `lastFn` is the Fn from the **last processed contact** per wheel (parallel to `lastScaledFlong`). For most cases (one contact per wheel) this is exactly right. For multi-contact configurations (e.g. ramp edges hitting two surfaces simultaneously), the linearization stiffness is computed from one of them — acceptable approximation.
- The brake-direction clamp (`if newOmega flips sign while braking, clamp to 0`) is preserved. With semi-implicit, ω approaches 0 monotonically and the clamp rarely needs to fire, but it remains as a safety net.

## Not done — flagged earlier as loose ends

- **Fn left/right asymmetry**: confirmed **not a bug** — user's right turn correctly loads the left tires; my earlier diagnosis was a sign-convention confusion. No fix needed.
- **`corneringStiffness` vestigial param** in `data/ranger.js:55`: still dead. Cleanup deferred.

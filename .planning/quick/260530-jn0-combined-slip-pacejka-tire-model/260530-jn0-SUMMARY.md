---
status: complete
quick_id: 260530-jn0
slug: combined-slip-pacejka-tire-model
date: 2026-05-30
---

## Summary

Replaced the two-axis Pacejka + explicit friction-circle pair with a single combined-slip Pacejka curve. One set of coefficients (`pacejkaB/C/D/E`), one force-magnitude eval at `σ_total = √(slipRatio² + tan²(slipAngle))`, decomposed back into Flong and Flat along the slip vector.

## Motivation

User log analysis showed the handbrake was locking the rear (`omega = 0`) but the friction circle scaling only reduced lateral grip by ~30% (Flat = -2700 N at lockup vs -3500 N rolling). Insufficient asymmetry to initiate a drift slide.

Combined-slip naturally collapses lateral grip when slipRatio → ±1 because the slip vector aligns purely with the longitudinal axis. No special-case logic needed; falls out of the kinematics.

## Behavioral change at the previously-logged handbrake operating point

| Operating point | slipRatio | slipAngle | Old Flong | Old Flat | New Flong | New Flat |
|---|---|---|---|---|---|---|
| Handbrake locked rear, mid-turn | -1.00 | -4.4° | -2640 | -2680 | -3310 | **-255** |
| Normal cornering | 0.00 | -5.0° | 0 | -3370 | 0 | -3370 |
| Hard brake straight | -0.5 | 0° | -3500 | 0 | -3480 | 0 |

Lateral grip at lockup drops **~10×** — clear oversteer step-out expected. Normal cornering untouched.

## Files Changed

- `src/tire.js` — Rewritten. `computeLateralForce`/`computeLongitudinalForce` removed; replaced with single `computeTireForces(slipRatio, slipAngle, Fn, params)` returning `{Flong, Flat}`. Applies `frictionCoeff` (μ) as a global magnitude multiplier so the existing slider remains meaningful.
- `src/physics.js` — Updated import; replaced per-contact force calc (one call instead of two + explicit friction-circle block, ~12 lines removed). `lastScaledFlong` flow preserved for the omega integrator.
- `data/ranger.js` — Removed `pacejkaBx/Cx/Dx/Ex` (4 params). Lateral coeffs stay at `B=10, C=1.9, D=1.0, E=0.97`; peak grip per wheel still = `frictionCoeff × D × Fn` = 0.9 × Fn (unchanged from previous behavior).
- `src/debug.js` — Removed "Longitudinal Tire (Pacejka)" slider folder. Renamed "Lateral Tire (Pacejka)" → "Tire (Pacejka)" (one set, isotropic).

## Notes

- Pacejka canvas overlay still plots the single curve correctly — it already used only lateral B/C/E, and the curve shape is the same (now interpreted as the magnitude curve along σ_total).
- Logger fields (`fl_fy`, `fl_sa`, etc.) unchanged. `_fy` now records the Flat component of the combined force (semantically still "lateral force at this wheel").
- `frictionCoeff` kept as a global μ multiplier — gives the user a single grip knob without re-tuning all four Pacejka coefficients.
- Anisotropy (slight longitudinal-vs-lateral stiffness difference real tires have) is given up; reintroduce later via `σ_total = √((slipRatio/k)² + tan²(slipAngle))` if it becomes audible.
- `params.frictionCoeff` slider already exists in debug.js (line 45) and remains the live grip-level knob.

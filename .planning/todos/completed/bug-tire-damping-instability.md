---
id: BUG-04
type: bug
severity: moderate
status: resolved
opened: 2026-06-03
resolved: 2026-06-05
---

# BUG-04: Physics instability at high tire damping values

## Symptom

When `tireDamping` is set high in the debug panel (toward the upper end of the slider range, currently 500–20,000 N·s/m), the physics becomes noticeably buggy — possible wheel jitter, unexpected lift, or divergence. Lowering the slider resolves the issue.

## Parameters involved

- `tireDamping` slider: 500–20,000 N·s/m (default 1,500 N·s/m)
- `tireStiffness`: 100,000 N/m
- `wheelMass`: ~18 kg

**Critical damping for the tire spring/unsprung-mass system:**
`c_crit = 2 · √(k · m) = 2 · √(100,000 · 18) ≈ 2,683 N·s/m`

At the slider max of 20,000 N·s/m, the damping ratio is `ζ ≈ 7.4` — severely overdamped. The default 1,500 gives `ζ ≈ 0.56` (underdamped, realistic for a rubber tire carcass).

## Likely causes

**A — Overdamped system + explicit integrator instability.** The tire spring-damper is integrated with explicit Euler (or semi-implicit Euler). For a damped spring, explicit integration is stable only when `c · dt / (2 · m)` is well below 1. At `c = 20,000`, `dt = 1/60`: `20,000 · 0.017 / (2 · 18) ≈ 9.3`. This is far above the stability bound — explicit integration will diverge or oscillate wildly at these damping values.

**B — Tire damping competing with suspension damping.** The tire spring (hub↔ground) and suspension spring (hub↔body) are in series. With very high tire damping, the hub becomes heavily damped, which can produce a stiff coupling between body and ground contact that fights the suspension's own damping.

**C — Slider range is physically unreasonable.** Real passenger car tire carcass damping is typically 1,000–4,000 N·s/m. Values above ~5,000 N·s/m are outside the physically meaningful range for a rubber tire.

## Candidate fixes

1. **Cap the slider range at a physically reasonable max.** Upper bound of 4,000–6,000 N·s/m (2× critical) prevents entering the explicit-instability zone. This is the safest fix.
2. **Use implicit integration for the tire spring-damper.** Replace explicit force application with the implicit form: `F = k·x + c·(Δx/dt)` where Δx is solved implicitly. This gives unconditional stability for any damping value. (The suspension already uses a similar approach via substep integration.)
3. **Clamp the damping force to a fraction of the normal force each substep** — prevents the damper from producing forces larger than the spring can support.

## Recommended fix

Start with (1) — clamp the slider to 4,000 N·s/m max and add a comment explaining the critical-damping derivation. If users legitimately want to explore high-damping behavior (e.g. simulating a rigid tire), revisit (2).

## Files to inspect

- `src/debug.js` — tireDamping slider definition (line ~66)
- `src/suspension.js` — tire spring-damper force computation (`stepSuspensionSubsteps`)
- `data/ranger.js` — tireDamping default (line ~48), comment about ζ

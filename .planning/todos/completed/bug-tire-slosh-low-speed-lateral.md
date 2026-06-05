---
id: BUG-03
type: bug
severity: minor
status: resolved
opened: 2026-06-03
resolved: 2026-06-04
---

# BUG-03: Tire slosh at low longitudinal velocity with significant lateral slip

## Symptom

When longitudinal velocity is low and there is significant lateral slip (e.g. coming to a stop while turning, or slow-speed cornering), the car sways back and forth on the contact patch. It looks and feels like a low-frequency oscillation in the yaw/lateral direction. Not game-breaking but clearly wrong.

## What was already done

Two previous attempts partially addressed related symptoms:

- **260527-qae** (`69cba5d`): Added a 0.2 m/s contact-patch speed dead zone in `computeLateralForce` in `src/tire.js`. This stopped near-rest yaw feedback loops where noise-level latVel (~0.05 m/s) mapped to ~78° slip angle.
- **260531-trf**: Reformulated tire relaxation to use a time-constant floor (`τ_min = 0.04 s`) instead of pure distance decay. Specifically fixed stale-slip slosh after handbrake slide-to-stop.

The current symptom is distinct: it occurs during *active slow-speed lateral loading* (car is still moving, significant lateral velocity), not at rest or post-slide. The dead zone may be set too low (0.2 m/s) — the threshold for oscillation onset is above the dead zone but still in a range where the Pacejka + suspension feedback loop can ring.

## Likely causes

1. **Relaxation buffer ringing:** At low speed the τ_min floor dominates, giving 40 ms decay. If the lateral force oscillates at ~10–15 Hz (typical for spring-mass at these params), 40 ms is too slow to damp it — slipLat accumulates and reverses each cycle.
2. **Dead zone cliff:** The 0.2 m/s dead zone creates a discontinuous force transition — zero force below, full Pacejka above. At slow speeds the car oscillates across this boundary each frame.
3. **Tire spring–suspension coupling at low Vlong:** At low longitudinal speed the tire relaxation is essentially bypassed (time-floor dominant), so lateral tire force is a near-rigid coupling from slip to force. If the suspension spring resonance and the lateral tire force feedback are in-phase at low speed, the loop can self-excite.

## Candidate fixes (to investigate)

- Raise dead zone to 0.4–0.6 m/s and taper force from zero at the dead zone threshold (sigmoid or linear blend over ~0.3 m/s) rather than hard cutoff.
- Increase τ_min from 0.04 s to 0.06–0.08 s to damp the relaxation buffer faster at low speed.
- Apply a separate low-speed lateral force scale: `Fy *= clamp(vContact / 1.0, 0, 1)` above the dead zone to smoothly ramp force in the 0.2–1.0 m/s range.

## Files to inspect

- `src/tire.js` — dead zone guard (look for 0.2 threshold), Pacejka slip → force computation
- `src/physics.js` — per-wheel tire force application, relaxation buffer update

## Notes

Memory has this flagged as "tire slosh at low V_long" — confirmed still open as of Phase 6 completion.

---
status: complete
quick_id: 260531-trf
slug: tire-relaxation-time-floor
date: 2026-05-31
---

## Summary

Reformulated the tire-carcass relaxation buffer to use a **time-constant floor** instead of a pure distance-based decay. The slip-velocity Pacejka rewrite (260531-1r9) modeled relaxation as `ds/dt = v_slip − s·|v|/L`, which freezes the slip buffer at rest (decay rate → 0 as |v| → 0). After a handbrake slide-to-stop this left stale slipLong / slipLat in the buffer, producing phantom lateral forces (5+ kN on a stationary car) and oscillatory wheel spin-up ("slosh"). It also made steering feel vague / squishy in normal driving because lateral slip lingered across many low-speed frames.

New formulation:

```
ds/dt = v_slip − s/τ,   τ = max(L/|v_contact|, τ_min)
```

Implemented as `invTau = min(|v|/L, 1/τ_min)`, `relaxDen = 1 + dt · invTau`. Above |v| ≈ L/τ_min the model is unchanged (distance-driven). Below it, decay is time-driven on a fixed carcass time constant. Physically motivated: tire carcass viscoelastic relaxation doesn't actually depend on rolling distance — that's a small-perturbation simplification that breaks at low speed.

## Why this and not a band-aid

The previous ef51a2e brake-clamp fix recomputed `sLongFinal` at `omega=0` whenever the clamp fired. This was needed (it killed the reverse-acceleration bug) but it dumped a locked-wheel slip snapshot into the relaxation buffer that, combined with the frozen low-speed decay, produced the slosh kick when brake torque ramped back to zero. An AB-test scaffold was briefly added with a `slipDecayFloor` knob to raise the vCon floor only on brake-clamp. User observed that ~3 m/s "felt right" — which, with L=0.3, is exactly `1/τ_min = 0.33`, i.e. τ_min ≈ 0.1 s. So the empirical floor was a time constant in disguise. Replacing the floor with a real time constant cleaned up the model and removed the need for a brake-clamp-only special case.

## What was tested

Manual driving with handbrake slide-to-stop, then accelerate + steer. Pre-fix log (`Logs/rangersim-log-1780248407656.json`) clearly showed:
- t=17.5: wheel omega jumps to +30 rad/s simultaneously with other wheels clamping to 0
- t=17.88: locked-then-snap FL omega goes to -7.82 rad/s on a near-stationary car
- t=18.5: both front wheels report +2700 N lateral force at 0.47 km/h

With the time-floored model these go away — stored slip decays on a 40 ms time constant once vehicle speed drops below 3.75 m/s.

## Tuning that settled the feel

| Param | Old | New | Effect |
|---|---|---|---|
| `tireStiffness` | 100 000 N/m | 210 000 N/m | Less squish at the carcass spring; reduces ride-height bobble |
| `tireRelaxationLength` | 0.3 m | 0.15 m | Snappier force build-up at speed |
| `tireRelaxationTimeMin` | (new) | 0.04 s | Low-speed decay time constant — sets crossover at ~3.75 m/s |
| `maxBrakeTorque` | 3000 N·m | 1000 N·m | More tunable foot-brake, less likely to lock instantly |
| `maxHandbrakeTorque` | 4000 N·m | 1400 N·m | Locks rears under handbrake but no longer instantly inverts wheel spin |

## Files Changed

- `src/physics.js` — Replaced `vCon` floor / `SLIP_EPSILON` with the time-floor formulation. Kept the ef51a2e brake-clamp commit (it's still correct; the slosh it indirectly triggered is gone now that the buffer decays). Removed the AB-test branches added earlier in the session.
- `src/debug.js` — Added `Relaxation τ_min (s)` slider in Tire (Pacejka) folder. Removed the temporary "Tire A/B (temp)" folder. Pacejka plot axes now labeled (`slip vel (m/s)`, `|F| norm`). FPS counter merged into the speed/slip HUD (separate `stats.js` overlay removed).
- `data/ranger.js` — Added `tireRelaxationTimeMin: 0.04`. Updated `tireStiffness`, `tireRelaxationLength`, `maxBrakeTorque`, `maxHandbrakeTorque` defaults. Removed AB-test fields (`brakeClampMode`, `slipDecayFloor`) — they never made it out of the session.
- `src/logger.js` — Appended `tau_min` column to log fields (live-tunable param worth capturing per-frame so a log replay reflects the exact tuning at capture).
- `src/main.js` — Pass `RANGER_PARAMS` to `captureFrame` so the logger can read `tireRelaxationTimeMin`. Earlier in the session: removed `stats.js` import; added EMA-smoothed FPS into the HUD.
- `index.html` — Added `FPS:` span to `#hud`.

## Known limitations / trade-offs

- **τ_min is a phenomenological knob, not derived from tire data.** 0.04 s gives the right feel for this vehicle / tire combination. A different car or tire (e.g. high-aspect-ratio rally tire) would want different L and τ_min.
- **The crossover at L/τ_min is a soft transition only because both sides use the same implicit-Euler form.** There's no smooth blend — invTau abruptly switches from `|v|/L` to `1/τ_min`. In practice the kink is invisible because the larger of the two dominates smoothly near the crossover, but a future refinement could blend them (e.g. `1/τ = sqrt((|v|/L)² + (1/τ_min)²)`).
- **`tau_min` log column means existing parsers that hard-coded the 37-field layout need updating.** Per Phase 3 constraint #8 it's appended at the end and order of earlier fields is preserved.

## Related fixes shipped in this session (already committed)

- `ef51a2e` — Brake-clamp recompute (reverse-acceleration bug). Still in tree; needed and correct. Now harmonized with the time-floored relaxation so the slosh side-effect is gone.
- `fee510a` — FPS counter merged into HUD, removed separate `stats.js` overlay.

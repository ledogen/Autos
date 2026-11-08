---
id: BUG-140
type: bug
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-70 (tire contact), suspension.js bump stops, BUG-27 (body restitution)
---
lane: B

# BUG-140: a drop onto the wheels from 2 m or more rebounds too high

Owner, verbatim (2026-11-07 tracker inbox): "When the vehicle is dropped onto its tires from a height of about 1 meter the response seems natural When it's dropped onto its wheels from a height of about 2 meters I think it bounces a little bit too high The effect is compounded with even higher drops meaning that any drop over about 3 meters has a chance to launch the car back up into the air and it can even flip over as an effect I think typically if you drop a car really hard in real life it doesn't bounce that high off of the ground compared to what it would do from a low drop This testing was performed in free room which means I was using a vehicle with 100% springs and dampers My suspicion is that there's something in the code causing excessive rebound when the vehicle is dropped onto its tires from about 2 meters and higher."

## Acceptance

- [ ] Rebound height against drop height measured for 1, 2, 3, 5 m drops (fresh springs and dampers), and the energy returned per drop.
- [ ] The cause named (bump stop, tire, damper saturation, or the solver), with the physics the owner can check.
- [ ] Rebound falls with drop height the way a real truck's does; a gate pins it.

## Measured (Lane B, 2026-11-07) — reproduced, two causes, no fix built yet

Probe: `CarGame-machine/wip/bug-140/drop.mjs [h ...]` — the settled truck lifted h m (tires h above flat ground), fresh
springs and dampers, through the game's contact; `HZ=` sets the frame rate, `OVR=key=val,...` overrides params.
"Rebound" = the CG's peak rise above its resting height after the first touch, as a share of h (= the energy returned).

| drop | impact | 60 Hz (the game) | 120 Hz | 240 Hz | 240 Hz + tireDamping 6000 |
|---|---|---|---|---|---|
| 0.5 m | 2.8 m/s | 9.6 % | | | |
| 1 m | 4.3 m/s | 12.0 % | 8.8 % | 7.9 % | 5.6 % |
| 2 m | 6.2 m/s | 26.7 % (tires off 0.5 s) | 15.4 % | 12.1 % | 4.5 % |
| 3 m | 7.8 m/s | 40.0 % (0.8 s, tilts 28°) | 22.4 % | 17.0 % | 3.9 % |
| 5 m | 10.2 m/s | 81.1 % (2.8 s, tilts 89°) | 37.0 % | 25.8 % | 4.1 % |

Past 2 m the strut runs onto its bump stop (deepest 0.31–0.36 m of 0.25 travel; stop force 56 → 197 kN), and at 3 m+
the body touches too (bodyRestitution 0 changes nothing).

1. **Numerical: the frame-rate coupling (most of the excess).** The strut, stop and tire forces reach the BODY once per
   1/60 s frame, computed against the body's frame-start motion (the substep loop moves the mount at a frozen velocity).
   A force that lags the motion pushes too little on the way in and too much on the way out — it pumps energy. On the
   stop (1–2.6 MN/m on a ~340 kg corner, ω·dt ≈ 0.9–1.5 at 60 Hz) it is large: the same 5 m drop returns 81 % at 60 Hz
   and 26 % at 240 Hz, the physics unchanged. A softer linear strut damper (1500) even returns > 100 % (5.2 m from 5 m).
2. **Physical: on its stop the body rides the tire, nearly undamped.** With the strut on its stop, a corner of the body
   (~340 kg) sits on the tire's air spring (100 kN/m + the progressive carcass) with only the carcass damper, 1500 N·s/m,
   tuned as ζ ≈ 0.56 for the 18 kg wheel: for the body that is ζ ≈ 0.13 (critical 2√(k·m) ≈ 11.7 kN·s/m). Converged
   (240 Hz) the rebound still RISES with height (8 → 26 %); at tireDamping 6000 (ζ ≈ 0.5 for the body) it falls (5.6 →
   4.1 %), the way a real truck's does. The bump stop is not the energy store: damping it both ways (4000 or 20000)
   moves the 60 Hz numbers by ≤ 4 points.

**The levers (each changes the ride, so the owner's call):**
- For (1): move the body inside the substep loop — the mount follows the body's velocity as the strut forces change it
  within the frame (the FEAT-158 rock "yield" idea, for the chassis), or step the strut forces at a finer rate. Changes
  every bump, so fingerprint-physics moves and the ride needs a feel pass.
- For (2): damp the tire harder when the strut is on its stop (body-on-tire), leaving the road ride's 1500 alone — the
  old 4000 everywhere lifted wheels early (ranger.js). Or a damper that keeps damping onto the stop (real shocks do).
- A force cap on the strut damper (blow-off, 4 kN) also helps at 60 Hz (5 m: 26 %), but mostly by masking (1).

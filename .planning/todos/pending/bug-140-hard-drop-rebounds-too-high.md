---
id: BUG-140
type: bug
status: landed 51a932bf (smoke: edge flaked once then passed alone ×2 and in the re-run; the re-run's only miss is the pre-existing pad pick, BUG-157) — open only for the owner's feel drive (shared with FEAT-193)
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-70 (tire contact), suspension.js bump stops, BUG-27 (body restitution)
---
lane: B (built by Spare, land/bug-140, with FEAT-193)

# BUG-140: a drop onto the wheels from 2 m or more rebounds too high

Owner, verbatim (2026-11-07 tracker inbox): "When the vehicle is dropped onto its tires from a height of about 1 meter the response seems natural When it's dropped onto its wheels from a height of about 2 meters I think it bounces a little bit too high The effect is compounded with even higher drops meaning that any drop over about 3 meters has a chance to launch the car back up into the air and it can even flip over as an effect I think typically if you drop a car really hard in real life it doesn't bounce that high off of the ground compared to what it would do from a low drop This testing was performed in free room which means I was using a vehicle with 100% springs and dampers My suspicion is that there's something in the code causing excessive rebound when the vehicle is dropped onto its tires from about 2 meters and higher."

## Acceptance

- [x] Rebound height against drop height measured for 1, 2, 3, 5 m drops (fresh springs and dampers), and the energy returned per drop.
- [x] The cause named (bump stop, tire, damper saturation, or the solver), with the physics the owner can check.
- [x] Rebound no longer grows with drop height (7–10 % from 0.5 to 5 m, was 10 → 81 %); `test/drop-rebound.mjs` pins it.
      It is flat rather than falling: past ζ ≈ 0.5 more stop damping buys nothing (see below).
- [ ] The owner drives it (one feel drive with FEAT-193).

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

## The owner's call (2026-11-08, owed bug140-drop)

**A + 2**, verbatim: "a+2 specifically test for hitting live physics rocks again since that's how we tuned tire
damping before. i could see us hitting full bump stop driving over a rock prop. if it spits the rock out at mach
jesus or starts flipping the truck again drop 2". So: build A (body moves within the frame) and 2 (stop-only tire
damping), then drive the truck over live physics rock props headless. If 2 launches the rock or flips the truck,
ship A alone and say so. Built by Spare with FEAT-193 (one fingerprint re-pin, one feel drive).

## Built (Spare, 2026-11-09) — land/bug-140, A + 2

**A — the body moves within the step** (`src/suspension.js` stepSuspensionSubsteps). Each of the 4 substeps now moves a
copy of the body (the engine's mass and tuned inertia) by that substep's strut forces, gravity, and last step's other
forces (tires, drag, sidewalls — `params._bodyOther`, written by physics.js after Step 3), and the next substep's mounts
ride it, position and velocity. The engine still steps the body once on the same mean force; the copy only says where the
mounts are inside the step. The debris look-ahead in qcPlus (BUG-99) drops its hub-closing·t term — the hub's in-step
motion is now in the position each substep asks at, so it would count twice; the rock's own closing stays. Without the
carried other forces the copy un-rolled a cornering truck inside every step (steady roll 4.89° vs main's 4.84° at
0.58 g); with them steady cornering is identical to main and the braking dive moves 2.30° → 2.26°.

**2 — the tire damped on the stop.** While a strut is past its travel, the tire's damper is raised to
`params.tireStopDampingRatio` (0.5) of the body-on-tire critical 2·√(tireStiffness · the corner's sprung mass)
≈ 11.7 kN·s/m, i.e. ≈ 5.8 kN·s/m instead of 1500, every contact by the same factor (a rock's 150 → ≈ 585), faded in over
the stop's first 1 cm. Off the stop nothing changes. Debug slider: Vehicle → Tires → "On-Stop Tire Damping (ζ)" (0 = off).

Drop table (`wip/bug-140/drop.mjs`, the settled truck dropped h m, flat ground, the game's contact; rebound share = the
CG's peak rise above rest after first touch ÷ h):

| drop | main 33f1a202 | A | A at 120 / 240 Hz | **A + 2** |
|---|---|---|---|---|
| 0.5 m | 9.6 % | 7.9 % | | **7.9 %** |
| 1 m | 12.0 % | 7.7 % | 7.5 / 7.4 % | **7.1 %** |
| 2 m | 26.7 % (tires off 0.50 s, tilts 10°) | 10.4 % | 10.3 / 10.1 % | **7.3 %** (0.20 s, 1.3°) |
| 3 m | 40.0 % (0.78 s, 28°) | 13.5 % | 13.4 / 13.4 % | **8.7 %** (0.33 s, 2.6°) |
| 5 m | 81.1 % (2.77 s, 89°) | 17.3 % | 18.7 / 18.7 % | **10.0 %** (0.52 s, 5.6°) |

A converges: 60 Hz = 120 Hz = 240 Hz, so what is left after A is physics, not numerics (the ticket's main-at-240-Hz column
was still pumping). The body no longer reaches the ground from 3 or 5 m. The on-stop ratio saturates: ζ 0.3 gives
7.3 / 7.8 / 9.3 / 11.7 %, 0.5 the column above, 0.7 7.0 / 7.3 / 8.9 / 10.7 %, 1.0 7.0 / 7.5 / 9.5 / 11.9 % (1–5 m).

**The owner's rock condition** — `test/census-rock-strike.mjs --nopop --scales=0.7,1,1.3,1.6,2` (new: `--stopzeta=`, an
`on stop` column and a pitch column), the truck held at 10–50 mph into one resting rock, 3 offsets × 2 yaws × 5 sizes
(14, 40, 88, 165, 322 kg) = 150 hits per variant, at the front-left wheel and (`--rear`) the driven rear-left:

| | flips (up < 0) | roll > 30° | fastest rock | rock exit ÷ truck speed, max / p90 | hits on the stop |
|---|---|---|---|---|---|
| front, main | 14 | 27 | 27.0 m/s | 1.93 / 1.12 | 72 |
| front, A | 15 | 30 | 25.3 m/s | 1.70 / 0.79 | 91 |
| front, **A + 2** | **13** | 29 | **25.3 m/s** | 1.70 / 0.83 | 91 |
| rear, main | 18 | 23 | 34.8 m/s | 1.91 / 1.01 | 62 |
| rear, A | 16 | 25 | 27.8 m/s | 2.20 / 0.97 | 74 |
| rear, **A + 2** | **14** | 23 | **27.8 m/s** | 2.20 / 0.98 | 74 |

2 does not spit rocks out faster (the fastest rock is A's to the decimal, and both are slower than main's) and does not
flip the truck more (13 / 14 flips against A's 15 / 16 and main's 14 / 18). Every flip in every variant is on the 88 kg
rock or bigger; the 14 and 40 kg rocks (the throwable rock is 40 kg) flip nothing. With punctures on and the default sizes
(0.7 / 1 / 1.3), A + 2 = A within one hit. **So 2 ships with A.**

Physics fingerprint (`test/fingerprint-physics.mjs`): DIFFERS from the first checkpoint (step 100), both runs — expected,
the in-step body changes even the settle. New digests round `567e305f509a40e2`, out-of-round `94219701950ed351` (main
`fbf76dff2c1b6afb` / `3184433810d4d588`), one re-pin for this landing with FEAT-193.

**Knock-on: fragile cargo's crest is softer.** `test/fragile-cargo.mjs` lands the truck from a 1 m crest at 15 m/s with a
vase strapped in the bed. A alone (ζ 0 gives the same) dropped the vase's peak 4.58 → 3.91 g, so it keeps 60 % instead of
43 % (fragile 60 → 73 %, sturdy 68 → 75 %; washboard and rollover unchanged in outcome). The gate's "very fragile loses more
than half" went red. Its bound now reads data/offers.js's own words, "a 1 m crest costs roughly half" (keeps 30–65 %; main's
43 % passes too). Getting 43 % back would take the vase's break 6.0 → ~4.95 g, undoing most of the owner's 1.5× raise
(2026-10-24), so the data is unchanged. Owner call: accept the softer crest (recommended), or lower the very fragile break.

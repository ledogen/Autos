---
id: FEAT-80
type: feature
status: completed
severity: high
---

# FEAT-80 — tire grip is not linear in load

**Owner, 2026-09-08:** "tire friction scales indefinitely with normal force forever … my proposal is
to have it linear at reasonable driving forces but have it fall off hard once we exceed ~2 klbs per
tire." Ruled: linear falloff **plus** a hard knee (AskUserQuestion, same day).

## Why it matters for the driving feel

The Pacejka force was `μ · Fn · D · pac` — exactly proportional to load with no ceiling. The SM-3
damage work measured landing spikes of 16–21 kN per wheel. At μ 0.8 that wheel could push 13–17 kN
sideways for the frame it was loaded, four to five times its static grip (static ≈ 3.4 kN at
1360 kg). Every bump was a yaw kick, which is a large part of "drive safe or you will die".

## Real-world anchor

- Coefficient of friction FALLS with load; peak lateral force ∝ Fz^0.7–0.9 (Pacejka pDy2 ≈ −0.1…−0.2
  per nominal load for passenger tires). This is why lateral weight transfer costs an axle grip.
- OE tire P235/75R15 (2002 Ranger): rated load 2028 lbf = 9.0 kN at 35 psi — the owner's "2 klbs".

## Built (branch `feature/driving-feel`)

`src/tire.js gripLoad(Fn, params)` → the grip-carrying load; peak force = `μ · D · gripLoad(Fn)`.
- λ = 1 − k·(Fn − F0)/F0, clamped [0.2, 1+k]; F0 = `tireNominalLoad` 3400 N, k = `tireLoadSensitivity` 0.12.
- Softplus knee at `tireRatedLoad` 9000 N: past it each extra N removes `tireOverloadDrop` 0.60 N
  of grip load; floored at 15 % of the rated load (capped by the pre-knee value so an airborne wheel
  reads 0).
- Defaults: 3.4 kN → 3.4 kN · 6.8 kN → 5.96 kN · 9 kN → 6.92 kN (the peak) · 12 kN → 6.55 kN · 18 kN → 3.33 kN.
- Sliders under Vehicle → Tires → Load Sensitivity with a live Fn→Fg readout.
- Gate `test/tire-load-sensitivity.mjs`; k 0 + drop 0 is the old model bit-for-bit.
- `test/measure-vehicle-limits.mjs` ported to the FEAT-48 engine context (it had not booted since
  the Box3D cutover) and given `--verbose`. Open-loop constant-steer skidpad, quick mode, flat plane:

  | steer | old linear model | with load sensitivity |
  |---|---|---|
  | 4° | holds to 15 m/s, R 43.8 m, 0.52 g, then SPINS at 18 (R drift 491 %) | holds to 18 m/s, R 51.5 m, 0.64 g, spins at 21 |
  | 8° | holds to 9 m/s, R 20.8 m, 0.40 g, spins at 12 | holds to 12 m/s, R 23.5 m, 0.63 g, spins at 15 |

  The balance moved toward progressive understeer (the radius grows before it lets go) and the
  limit trim rose — the loaded outer front loses more than the inner gains, which is the real
  mechanism that makes a front-heavy truck push. Straight-line accel/braking unchanged (2.87 vs
  2.89 m/s², 7.09 vs 6.97 m/s²). This is a FEEL change for the owner to judge, not a calibration.

## Acceptance

- [x] grip load peaks near the rated load and falls to < ½ peak by 2× rated; never below the floor.
- [x] weight transfer reduces the axle grip sum for every Δ.
- [x] all physics gates green (`npm test`, 13 physics gates, 2026-09-08).
- [x] owner feel-test: "feels great"; skidpad lands at μ 0.64–0.65 (kept; par re-anchored instead).


## Resolution (2026-09-08)

Shipped on `feature/driving-feel`. Owner feel-test: "a, b and c feel great." Lab skidpad on the
merged tree: mu 0.654 / 0.645 / 0.643 at 25 / 60 / 150 m (was 0.72–0.74) — an 11 % uniform grip
cut the owner kept, and par's mu was re-anchored 0.80 → 0.72 to match (par.js note (6), runs-v2
0013–0020). Handoff: `.planning/handoffs/HANDOFF-2026-09-08-driving-feel-merge.md`.

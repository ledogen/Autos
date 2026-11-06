---
id: FEAT-150
type: feature
status: closed
severity: minor
opened: 2026-10-25
source: owner, 2026-10-25 — "auto trans really struggles to get out of first gear. maybe we should adjust the ratios" · "maybe we should lower the ratio to second a little. also the shift logic seems to prefer to lug 3rd instead of downshifting to 2nd at full throttle even if there is rpm headroom."
relates: FEAT-23 (drivetrain), FEAT-124 (one shift schedule, throttle-averaged), data/transmissions.js 4r44e, data/ranger.js shift params, test/drivetrain-climb.mjs
---
lane: B (back from Spare 2026-11-06, orchestrator; queued after FEAT-162)

# FEAT-150: Automatic shift schedule — hangs in 1st, lugs 3rd instead of kicking down

## Owner report (plane play-test, 2026-10-25)

1. The auto "really struggles to get out of first gear".
2. At full throttle it "prefers to lug 3rd instead of downshifting to 2nd … even if there is rpm
   headroom".

## What the numbers say (src/drivetrain.js, data/ranger.js, data/engines.js vulcan30)

Ratios 2.47 / 1.47 / 1.00 / 0.71 (the real 4R44E). Upshift at `coupled` > shiftUp, where shiftUp
slides from shiftUpLightRPM 2000 (light foot) to shiftUpRPM 5400 (floored) by the throttle average
squared. The anti-hunt rule then BLOCKS the upshift unless the next gear's coupled rpm clears
`shiftDownEff + hysteresis`, hysteresis sliding 300 → 800 with load, shiftDownEff 1300 → 2400
(kickdownRPM) with load.

- **1st hangs.** At ~70 % average throttle: shiftUp ≈ 3700, next-gear rpm = 3700 × 1.47/2.47 ≈ 2200,
  but the bar is ≈ 2070 + 550 = 2620 → blocked. The box waits until 1st reaches ≈ 4400 rpm. Even
  floored it only just passes (3214 vs 3200). The 1st→2nd step (×0.595) is the biggest in the box, so
  the hysteresis band written for the 2nd→3rd and 3rd→4th steps (×0.68, ×0.71) bites hardest here.
- **3rd lugs.** A kickdown fires only when coupled < kickdownRPM 2400. In 3rd at 2400 coupled, 2nd would
  spin 2400 × 1.47 = 3530 — 1900 rpm of headroom under the 5400 upshift, which is the owner's point.
  The ranger.js comment caps kickdown at ~shiftUpRPM/1.7 ≈ 3200 to stop an upshift re-triggering a
  downshift; with the 1.47 step the true re-trigger line is 5400/1.47 = 3670, so kickdown has room up
  to ~3200–3400.

## Candidate fix (Lane B's call, with the drivetrain-climb gate and a drive)

- kickdownRPM 2400 → ~3200 (floored downshift into the power band; still under the re-trigger line).
- The 1st→2nd hang: either lower shiftHysteresis / shiftHysteresisLight (one band for every step is
  the real defect), or make the hysteresis a fraction of the gear step rather than a flat rpm figure.
  The owner also offered a ratio change ("lower the ratio to second a little" — a numerically
  higher 2nd, e.g. the 5R55E's 1.86); prefer fixing the schedule over faking the box, and say so if
  the schedule alone is not enough.
- n = 1 drive is not calibration (standing rule): prove it on test/drivetrain-climb.mjs plus a logged
  drive (st.coupledRPM is logged for this), then the owner drives it.

## Acceptance

- [ ] From a standing start at 50–80 % throttle the box leaves 1st by ~3000 rpm on the flat.
- [ ] Floored in 3rd with ≥ 1500 rpm of headroom in 2nd, it kicks down.
- [ ] No hunting on a grade (the anti-hunt case the hysteresis exists for) — drivetrain-climb green.
- [ ] Ratios stay the real 4R44E unless the owner rules otherwise.

## Built — Spare, 2026-11-02 (the schedule, not the ratios — the box stays the real 4R44E)

**Measured first** (`wip/feat-150/launch.mjs`: full physics on the flat, the coupled rpm at each shift).
The anti-hunt band, judged on the 1→2 LANDING rpm alone, held 1st far past the schedule's own point at
every part throttle; floored in 3rd at 2600 coupled (2nd would turn 3822, 1578 rpm under the upshift) the
box lugged 3rd.

**Three changes in src/drivetrain.js:**
1. **The upshift judges where the next gear is GOING.** Its coupled rpm projected `shiftLookahead` (1 s) ahead
   at the road's current acceleration carried into that gear — the axle's smoothed angular acceleration,
   gear-independent so a shift never spikes it, scaled by the step for rpm and again for wheel torque —
   must clear the next gear's own downshift point + the band. Accelerating on the flat it clears at once;
   barely holding speed on a grade it does not, and the box stays down: the case the band exists for. At
   the redline the band is waived (on the limiter the acceleration reads ~0 whatever the next gear could
   do; the old rule's floored bar, 2400 + 800, was no stricter).
2. **The downshift mirrors it:** never drop into a gear that would land within the band of its own upshift
   point. That makes the kickdown per-gear, so **kickdownRPM 2400 → 3200** (data/ranger.js) cannot hunt:
   3rd → 2nd below 3200, 2nd → 1st only once 1st has room to pull.
3. A held floor (kickdown) reads the FLOORED schedule for the upshift point and band too, as the downshift
   point always has — otherwise the box kicked down, then shifted straight back up on the lagging average.

**Result, standing starts on the flat (coupled rpm at 1→2):**

| pedal | before | after | the schedule's own point (FEAT-124) |
|---|---|---|---|
| 50 % | 3818 | **2850** | 2850 |
| 60 % | 4100 | **3218** | 3224 |
| 70 % | 4386 | **3653** | 3666 |
| 80 % | 4693 | **4168** | 4176 |
| 100 % | 5399 | 5399 | 5400 |

Floored in 3rd at 2600 coupled: kicks down to 2nd at once, revs out, takes 3rd at 5399. Grade hunting
unchanged (drivetrain-climb's sweep: worst 1 shift in the settled 10 s); 18 % from 4th settles with 0.

**On the acceptance's "~3000 rpm at 50–80 %":** the box now leaves 1st exactly where FEAT-124's ruled
schedule says (2850 at 50 % … 4176 at 80 %). Reaching ~3000 at 80 % would mean reshaping that curve
(`shiftThrottleCurve` / `shiftUpLightRPM`) — the owner's call after a drive; the band no longer adds anything.

**Gates:** drivetrain-climb gains scenario 8 (half-pedal launch leaves 1st within 5 % of the schedule; a
floored 3rd with ≥ 1500 rpm headroom kicks down) — fails on the old schedule (3818 vs 2850; lugged 3rd).
shift-schedule all green (the floored-3rd kickdown still at 0.40 s). **debris-coupling's "barrel→truck"
check was measuring the drivetrain, not the barrel:** a bare peak |vy| > 0.005 m/s read 0.006 with the
barrel OFF the path; with the 1→2 shift moved into the contact window it read 0.005 with the hit. It now
compares a twin run with the barrel moved aside: 0.114 m/s (new) / 0.139 (old) of chassis velocity off the
twin, threshold 0.05. Affected suite 71/72 then that test fixed; smoke included.

## Owner, 2026-11-06 (feat150-curve: "leave") — back to Lane B, queued after FEAT-162

"i was just vibing that advice. basically we want a kickdown but we also want overdrive at partial throttle"

- Leave FEAT-124's throttle curve (`shiftThrottleCurve` / `shiftUpLightRPM`) alone.
- The shift schedule does the work instead:
  - a kickdown on a deep pedal stab;
  - the top gear (overdrive) held at partial throttle when cruising.

## Resolution — Lane B, 2026-11-06: the schedule already does both; pinned, nothing changed in the box

The owner ruled "leave" on FEAT-124's curve, so acceptance item 1's "~3000 rpm" is superseded: the box leaves
1st at the schedule's own point (2850 at 50 % … 4176 at 80 %, Spare's table above). The owner's two wants are
measured on full physics on the flat and pinned as `test/drivetrain-climb.mjs` scenario 9:

| | measured |
|---|---|
| holding 50 / 60 / 70 km/h (a cruise control from rest) | 3rd, 17–21 % pedal, no shift after 40 s |
| holding 80 / 100 km/h | **overdrive (4th)**, 35 / 44 % pedal, no shift after 40 s |
| cruising in 4th at 25 % at 65 / 80 / 100 km/h, then floored | **kicks down 4→3 after 0.32 / 0.40 / 0.40 s** |
| a deep stab short of the floor (from 80 km/h in 4th) | 85 % → 1.10 s, 70 % → 1.65 s (the throttle average, not the kickdown path) |

- **Tried and reverted — the lever if the owner wants overdrive below ~75 km/h.** The 3→4 upshift demands the
  anti-hunt band on top of the next gear's mirror downshift point, which already carries one. Demanding it only
  against the plain downshift point (`shiftDownEff`) brought overdrive in at 70 km/h (4th at 1518 rpm). But it
  also brought back a 1→2→1→2 hunt when lifting off a held floor: the kickdown flag drops, the upshift point
  falls to the average's, 2nd takes it, and the still-high average holds 2nd's downshift point up. The second
  band is what blocks that transient. Doing it safely needs the band only on that lift-off. That's a design
  call, not a tweak.
- **Kickdown threshold** stays at a pedal of ≥ 95 % held 0.4 s (FEAT-124's anti-feather rule). A "deep stab" at
  85 % reaches 3rd through the average in about a second.

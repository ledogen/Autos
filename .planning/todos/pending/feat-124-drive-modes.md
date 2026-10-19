---
id: FEAT-124
type: feature
status: open
severity: minor
opened: 2026-10-17
relates: FEAT-23 (drivetrain + shift schedule), FEAT-50 (fuel map — the payoff), FEAT-125 (controller
  support — analog throttle)
---

# FEAT-124: Drive modes — Normal and Sport

## Request

Owner, 2026-10-17. The automatic box (FEAT-23) upshifts at a fixed `shiftUpRPM` 5400 whatever the
pedal does, so it always revs out. That stays, as **Sport**. Add **Normal**, which decides from
**how you have been driving** whether to rev out or shift early.

**Why it can't simply key off the pedal:** there is no analog throttle yet (FEAT-125). On a keyboard,
W is binary with a ramp (`throttleRampRate`), so a careful driver only gets low throttle by
**feathering**: tapping W. The instantaneous pedal on a keyboard is almost always 0 or 1. A box that
read it directly would upshift whenever you lift and rev out whenever you tap. The owner doesn't want
keyboard players waiting on a kickdown either.

## Design

- **Two modes**, a player setting: **Sport** (today's behaviour, revs out) and **Normal**.
- **Normal** reads a **time-weighted average of the throttle**: an exponential moving average of
  `vehicleState.throttle`, time constant on the order of 1–3 s, to be tuned.
  - A tapping keyboard driver averaging ~40 % and a controller driver holding 40 % read the same.
  - A **high average** keeps today's late upshift and rev-out.
  - A **low average** upshifts early, near the light-load end of the schedule, which drops into the
    fuel map's cheap low-rpm cells. That is where FEAT-50's economy actually shows up: at 20 kW,
    2000 rpm burns 2.53 gal/h against 4.30 at 4000.
- The upshift point interpolates between the two ends on that average. The kickdown and the
  hysteresis/anti-hunt levers keep working as today (`shiftDownEff`, `shiftHysteresis`).
- **Default mode:** owner's call. Normal is the natural default for story mode; free roam might
  default to Sport.

## Acceptance

- Sport is bit-identical to today's schedule (fingerprint-physics).
- Normal, keyboard: steady feathering at ~40 % average shifts into top gear by cruise speed; the
  same drive in Sport stays in a lower gear at higher rpm.
- Normal, analog (synthetic constant pedal in a gate): the same shift points as a keyboard tapping
  pattern with the same average.
- A measurable fuel difference (fuel-map gate style) between Normal-gentle and Sport over the same
  cruise.
- A mode toggle exists and is shown somewhere legible (cluster or HUD).

## Ruling (owner, 2026-10-19) — ONE schedule, no modes

**Supersedes the Normal/Sport split above.** There is no mode toggle and no Sport. The automatic
has a single throttle-dependent schedule:
- The upshift point interpolates on the **time-weighted throttle average** (the EMA in the Design
  section, unchanged — one average serves keyboard feathering and analog pads alike).
- A low average upshifts early, into the fuel map's cheap low-rpm cells.
- A floored pedal (average near 1) keeps today's late rev-out at `shiftUpRPM`, so "Sport" is just
  pressing harder.
- Kickdown and the hysteresis / anti-hunt levers keep working as today.

Acceptance changes accordingly:
- The "Sport bit-identical" and "mode toggle" lines are dropped.
- Instead, a **sustained full throttle reproduces today's shift points**.
- The physics fingerprint WILL change for part-throttle runs. That is expected; re-baseline it.

Each engine needs a light-load upshift point beside `shiftUpRPM` in data/engines.js.

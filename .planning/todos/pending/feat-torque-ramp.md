---
id: FEAT-01
type: feature
status: open
opened: 2026-06-03
---

# FEAT-01: Smooth torque ramp-up for drive, reverse, and brake inputs

## Request

Drive and reverse torques should ramp up over ~250 ms rather than snapping to full strength on the first keydown frame. Brake torque should ramp over ~125 ms. Release of any input should decay immediately (or at least much faster than the ramp-up).

## Motivation

Currently throttle and brake values are binary (0 or 1 from keyState) and pass directly to `getDriveTorque` and `getBrakeTorque`. This produces an abrupt torque spike on the first frame of keypress that can:
- Snap the rear wheels loose unexpectedly at low speed
- Make the feel "digital" — engine response is instantaneous, which no real powertrain delivers
- Make precise low-speed maneuvering harder than it should be

A 250 ms drive ramp and 125 ms brake ramp are realistic for a light truck with a simple drivetrain and firm pedal feel.

## Implementation sketch

In `src/vehicle.js`, add smoothed input accumulators:

```js
// In vehicleState (or as local state in updateVehicle):
smoothThrottle: 0,   // [0,1] — ramped version of raw throttle
smoothBrake:    0,   // [0,1] — ramped version of raw brake

// In updateVehicle each step:
const THROTTLE_RATE = 1 / 0.25   // 4.0 /s — full range in 250 ms
const BRAKE_RATE    = 1 / 0.125  // 8.0 /s — full range in 125 ms
const RELEASE_RATE  = 1 / 0.05   // fast release (50 ms)

const rawThrottle = (keyState.KeyW || keyState.ArrowUp) ? 1 : 0
const rawBrake    = (keyState.KeyS || keyState.ArrowDown) ? 1 : 0

if (rawThrottle > smoothThrottle)
  smoothThrottle = min(smoothThrottle + THROTTLE_RATE * dt, rawThrottle)
else
  smoothThrottle = max(smoothThrottle - RELEASE_RATE * dt, rawThrottle)

// Same for brake with BRAKE_RATE
```

Then pass `smoothThrottle` / `smoothBrake` into the force computation instead of the raw values.

## Scope

- `src/vehicle.js` — add smoothThrottle/smoothBrake state and ramp logic
- `data/ranger.js` — optionally add `throttleRampRate` / `brakeRampRate` / `releaseRampRate` params so they're slider-tunable
- `src/debug.js` — optional: expose ramp rates as sliders in the Vehicle folder if one is created, or under Tire
- `src/vehicle.js` SPAWN_STATE — reset smoothThrottle/smoothBrake to 0 on reset

## Notes

- Reverse is just negative throttle torque via the same `getDriveTorque` path — same 250 ms ramp applies
- Handbrake (Space) should NOT be ramped — it's a snap input for drift initiation; latency on handbrake would feel wrong
- The ramp state should be part of `vehicleState` so the R-reset correctly zeros it

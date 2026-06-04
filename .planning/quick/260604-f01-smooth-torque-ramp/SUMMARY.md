---
id: 260604-f01
status: complete
date: 2026-06-04
---

# FEAT-01: Smooth torque ramp — complete

## Changes

- `data/ranger.js`: added `throttleRampRate: 4`, `brakeRampRate: 8`, `releaseRampRate: 20`
- `src/vehicle.js`: `smoothThrottle`/`smoothBrake` added to SPAWN_STATE; `updateVehicle` section 1 replaced with ramp accumulator logic; `vehicleState.throttle`/`brake` now carry smoothed values
- `src/debug.js`: Drivetrain folder added with three ramp rate sliders

## Behavior

- W/S press ramps throttle/brake to 1 over 250 ms / 125 ms respectively
- Key release decays to 0 in ~50 ms
- Handbrake (Space) unchanged — still instantaneous
- R-reset zeroes smoothThrottle/smoothBrake via SPAWN_STATE copy

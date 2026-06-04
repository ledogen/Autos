---
id: 260604-f01
slug: f01-smooth-torque-ramp
title: FEAT-01 smooth torque ramp
status: in-progress
---

# FEAT-01: Smooth torque ramp-up

## Tasks

1. `data/ranger.js` — add throttleRampRate (4/s), brakeRampRate (8/s), releaseRampRate (20/s)
2. `src/vehicle.js` — add smoothThrottle/smoothBrake to SPAWN_STATE; replace binary throttle/brake with ramped accumulators in updateVehicle
3. `src/debug.js` — add Drivetrain folder with ramp rate sliders

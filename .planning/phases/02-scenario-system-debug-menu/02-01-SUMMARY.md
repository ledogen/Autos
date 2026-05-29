---
plan: 02-01
phase: 02-scenario-system-debug-menu
status: complete
completed: 2026-05-29
---

# Plan 02-01: Frame Logger + IC Loader

## What Was Built

Created `src/logger.js` — a new ES6 module with three exports: `toggleRecording`, `captureFrame`, and `openInitialCondition`. Wired the logger into the game loop in `src/main.js` and added per-wheel debug writes to `src/physics.js`.

## Key Files

### Created
- `src/logger.js` — frame logger module with 33-field columnar JSON download and IC loader

### Modified
- `src/main.js` — added `simTime` counter, `wheelDebug` on `vehicleState`, `captureFrame` call after `stepPhysics`, `\` toggle and Ctrl+I IC loader key listeners, reset of `wheelDebug` on vehicle reset
- `src/physics.js` — zeroes `vehicleState.wheelDebug[i]` at top of each wheel loop, writes `fn/fy/sa/c` inside the contacts loop

## Commits

- `feat(02-01): create src/logger.js — frame logger and IC loader module`
- `feat(02-01): wire logger into main.js and add wheelDebug writes to physics.js`

## Self-Check: PASSED

- src/logger.js exports toggleRecording, captureFrame, openInitialCondition ✓
- FIELDS constant has 33 entries ('t' → 'rr_c') ✓
- captureFrame no-ops when not recording ✓
- _downloadLog uses URL.createObjectURL + anchor.click pattern ✓
- openInitialCondition wraps JSON.parse in try/catch ✓
- vehicleState.wheelDebug initialized as 4×{fn,fy,sa,c} in main.js ✓
- simTime incremented by FIXED_DT each physics step ✓
- wheelDebug zeroed and written per wheel in physics.js ✓
- stepPhysics signature unchanged ✓

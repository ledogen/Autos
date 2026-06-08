---
phase: 07-free-cam-seeded-layered-terrain
plan: 01
subsystem: camera
tags: [freecam, pointer-lock, wasd-routing, terrain-streaming]
completed: "2026-06-08T16:55:25Z"
duration_minutes: 25

dependency_graph:
  requires: []
  provides:
    - "camera.js freecam mode ('chase' | 'cockpit' | 'freecam')"
    - "getCameraMode() export"
    - "getFreecamPosition() export"
    - "WASD gate in vehicle.js (truck idles when freecam active)"
    - "Terrain stream-center gate in main.js (camera position when freecam)"
  affects:
    - src/camera.js
    - src/main.js
    - src/vehicle.js

tech_stack:
  added: []
  patterns:
    - "Pointer Lock API for FPS mouse-look (browser-native)"
    - "YXZ Euler rotation order for FPS camera (prevents zenith roll)"
    - "_lastVehicleState module var updated per frame — keydown handler reads truck position"
    - "getCameraMode() gate pattern for multi-system coordination without import cycle"

key_files:
  created: []
  modified:
    - src/camera.js
    - src/main.js
    - src/vehicle.js

decisions:
  - "freecam WASD keys tracked internally in camera.js (freecamKeys) — not exported; main.js checks getCameraMode() to gate truck WASD in vehicle.js instead of routing keys"
  - "Steer decay (not hard zero) when freecam active — existing decay path already handles the case when neither A nor D is pressed; freecamActive forces the same path"
  - "click listener on document (not canvas) for pointer re-capture — checks e.target === canvas to avoid re-capturing during lil-gui clicks"

metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_modified: 3
---

# Phase 7 Plan 1: Free-Fly Camera Summary

**One-liner:** Pointer-lock FPS free-fly camera as third cameraMode ('freecam') with WASD flight, Shift+C enter/exit, truck WASD zeroed while flying, and terrain chunk ring centered on camera.

## What Was Built

### Task 1 — camera.js freecam mode (commit `4ac1952`)

Extended `src/camera.js` to support `cameraMode = 'freecam'` as a third mode alongside `'chase'` and `'cockpit'`:

- Module-level state: `freecamPos` (Vector3), `freecamYaw`, `freecamPitch`, `freecamKeys` object, `isPointerLocked`, `_lastVehicleState`
- Constants: `MOUSESENSE = 0.002`, `FREECAM_SPEED = 20 m/s`, `FREECAM_BOOST = 100 m/s`
- `pointerlockchange` listener sets `isPointerLocked` from browser event only (T-07-01-PL)
- `mousemove` listener: chase drag-orbit gated on `isDragging && cameraMode === 'chase'`; freecam mouse-look gated on `isPointerLocked && cameraMode === 'freecam'` — no delta leakage between modes
- Canvas `click` listener re-acquires pointer lock when in freecam but not locked (Esc re-capture per D-02)
- freecamKeys keydown/keyup listeners for W/A/S/D/Space/Control/Shift
- Upgraded C-key listener: Shift+C enters/exits freecam; C alone cycles chase/cockpit or exits freecam
- `_enterFreecam()`: copies truck position + (0,2,0), derives freecamYaw from vehicle quaternion euler.y + PI, sets pitch=0, calls requestPointerLock
- `_exitFreecam()`: sets cameraMode='chase', calls exitPointerLock (no-snap is free — chase lerp absorbs discontinuity)
- `updateCamera` freecam branch: fly along forward/right derived from freecamPitch/freecamYaw in YXZ Euler order; `camera.rotation.set(freecamPitch, freecamYaw, 0, 'YXZ')` per RESEARCH Pitfall 8
- New export `getFreecamPosition()` returns `freecamPos`

### Task 2 — main.js + vehicle.js gates (commit `8ad65bb`)

Wired freecam mode into the render loop and vehicle input:

- `src/main.js`: added `getCameraMode, getFreecamPosition` to camera.js import; replaced `terrainSystem.update(vehicleState.position)` with `streamCenter` gate: `getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position` (D-21)
- `src/vehicle.js`: added `import { getCameraMode } from './camera.js'`; at top of `updateVehicle`, sets `freecamActive = getCameraMode() === 'freecam'`; `rawThrottle`, `rawBrake`, `handbrake` all zeroed when `freecamActive`; steer accumulation skipped when `freecamActive` (decay path still runs so steer returns to zero); physics continues running every step

## Deviations from Plan

None — plan executed exactly as written. The one minor implementation choice was using a `document` click listener (with `e.target === canvas` guard) instead of attaching directly to canvas, to avoid re-capturing during lil-gui clicks that propagate to document. This satisfies the D-02 spec without a behavioral difference.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. Plan's threat model covered both threats:
- T-07-01-PL: `isPointerLocked` derived solely from `pointerlockchange` browser event, never set speculatively. Mouse-look gated on it.
- T-07-01-DOS: mousemove and keydown listeners do O(1) work; no remote attacker on this static client-side app.

No new threat flags beyond the plan's threat register.

## Known Stubs

None. This plan wires real behavior — no placeholder data flows to UI.

## Acceptance Criteria Verification

- `grep -c "freecam" src/camera.js` = 72 (>> 5 required)
- `camera.rotation.set(freecamPitch, freecamYaw, 0, 'YXZ')` present (Pitfall 8 mitigation)
- Chase drag-orbit mousemove gated on `isDragging && cameraMode === 'chase'` (freecam deltas never reach orbit)
- `getFreecamPosition` exported, returns live `freecamPos` Vector3
- `pointerlockchange` handler only sets `isPointerLocked` -- Esc releases lock but cameraMode stays 'freecam'
- `freecamPos` set to truck position + (0,2,0) on entry
- `main.js` streamCenter gate: `getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position`
- `vehicle.js` zeroes throttle/brake/steer/handbrake when freecam active; stepPhysics still called
- No import cycle: camera.js imports only `three`; vehicle.js imports camera.js; camera.js imports neither vehicle.js nor main.js

## Human Verification Required (checkpoint)

Per plan `autonomous: false`, the following requires manual browser verification:
- Open index.html via local server
- Press Shift+C: camera detaches and sits ~2 m above the truck
- WASD + Space/Ctrl fly; hold Shift to boost speed noticeably
- Mouse-look yaws/pitches without rolling at zenith (look straight up/down)
- Press Esc: mouse releases but camera stays in free-cam; click canvas to re-capture
- Press C: returns to chase with smooth glide, no snap
- Truck visibly idles and settles on suspension while free-cam is active (physics live)
- Fly far from truck: terrain streams in ahead of camera; exit free-cam: streaming re-centers on truck

## Self-Check: PASSED

Files exist:
- src/camera.js: confirmed (modified, commit 4ac1952)
- src/main.js: confirmed (modified, commit 8ad65bb)
- src/vehicle.js: confirmed (modified, commit 8ad65bb)

Commits exist:
- 4ac1952: confirmed (feat(07-01): add freecam mode to camera.js)
- 8ad65bb: confirmed (feat(07-01): gate truck WASD and terrain stream-center)

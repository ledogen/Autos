---
slug: 260528-qah-drag-orbit-camera
title: Click-and-drag orbit camera
status: planned
created: 2026-05-28
---

# Task: Click-and-drag orbit camera

## Goal

Add left-click-drag orbit control to the chase camera so the player can freely inspect the car mid-drive, with follow behavior resuming automatically on mouse release.

## Context

**camera.js API:**
- Single export: `updateCamera(camera, vehicleState)` — called once per render frame in `main.js` line 401, after `syncMeshesToState`.
- Module-level `cameraMode` string (`'chase'` | `'cockpit'`), toggled by C key.
- Chase mode: computes a yaw-only goal position using `CHASE_OFFSET_LOCAL` (0, 2.5, 6.0 behind+above), lerps camera there at `LERP_FACTOR = 0.08`, then calls `camera.lookAt(vehicleState.position)`.
- The chase position is re-derived every frame from the car's current yaw + position — there is no persistent orbit state yet.

**Design approach (orbit-over-chase):**
- Introduce two module-level drag state variables: `isDragging` (bool) and an orbit offset stored as spherical coordinates (`orbitTheta`, `orbitPhi`, `orbitRadius`).
- On `mousedown` (left button only): set `isDragging = true`, snapshot cursor position.
- On `mousemove` while dragging: accumulate delta-X → `orbitTheta`, delta-Y → `orbitPhi` (clamped to avoid gimbal flip). Do NOT call `preventDefault` on mousemove — it is not needed for canvas drag and may interfere with other UI.
- On `mouseup` / `mouseleave` (canvas only for leave): set `isDragging = false`.
- `updateCamera` in chase mode:
  - When `isDragging = false`: existing lerp logic unchanged; also sync `orbitTheta` and `orbitPhi` to match the current chase offset's spherical angles so the orbit starts from the current visual position when dragging begins (prevents jump).
  - When `isDragging = true`: skip lerp; place camera directly at `vehicleState.position + sphericalOffset(orbitRadius, orbitTheta, orbitPhi)`; call `camera.lookAt(vehicleState.position)`. The car continues moving; camera stays at a fixed angular offset relative to world space (not body space) so the drag feels stable.
- `orbitRadius` is initialized to `CHASE_OFFSET_LOCAL.length()` (~6.5 m) and held constant (no scroll zoom — out of scope).
- Cockpit mode is unaffected; drag listeners do nothing in cockpit mode (guard on `cameraMode` inside the mousemove handler).

**Sync math (chase → orbit handoff):**
- When `isDragging` transitions false → true, snapshot `orbitTheta` and `orbitPhi` from the camera's current world position relative to `vehicleState.position`. Use `Math.atan2` and `Math.asin` on the normalized delta vector. This prevents the camera from snapping when drag starts.

**Sensitivity:**
- `DRAG_SENSITIVITY = 0.005` rad/px — tunable constant at top of camera.js.

## Implementation Steps

1. Add module-level drag state to `camera.js`:
   - `let isDragging = false`
   - `let dragLastX = 0`, `let dragLastY = 0`
   - `let orbitTheta = Math.PI` (start directly behind: +Z in world → behind the car which faces -Z)
   - `let orbitPhi = 0.38` (≈ 22°, matches rough elevation of CHASE_OFFSET_LOCAL)
   - `const ORBIT_RADIUS = Math.hypot(0, 2.5, 6.0)` (≈ 6.5 m, matches CHASE_OFFSET_LOCAL length)
   - `const DRAG_SENSITIVITY = 0.005`

2. Register `mousedown`, `mousemove`, `mouseup`, and `mouseleave` listeners on `document` (not canvas — canvas mouseleave fires too eagerly when cursor clips edge during fast drag):
   - `mousedown`: if `e.button === 0 && cameraMode === 'chase'`, set `isDragging = true`, record `dragLastX = e.clientX`, `dragLastY = e.clientY`.
   - `mousemove`: if `isDragging`, compute `dx = e.clientX - dragLastX`, `dy = e.clientY - dragLastY`, update `orbitTheta -= dx * DRAG_SENSITIVITY`, `orbitPhi = Math.max(-1.2, Math.min(1.2, orbitPhi + dy * DRAG_SENSITIVITY))`, update `dragLastX`, `dragLastY`.
   - `mouseup`: `isDragging = false`.
   - `mouseleave` on `document`: `isDragging = false` (safety — avoids stuck drag if cursor leaves browser window).

3. Modify the chase branch of `updateCamera`:
   - When `isDragging = false` (follow mode):
     - Existing lerp logic unchanged.
     - After computing `goalPos` and lerping, sync orbit angles from current camera position so drag handoff is seamless:
       ```
       const delta = camera.position.clone().sub(vehicleState.position)
       orbitTheta = Math.atan2(delta.x, delta.z)
       orbitPhi   = Math.asin(Math.max(-1, Math.min(1, delta.y / ORBIT_RADIUS)))
       ```
   - When `isDragging = true` (orbit mode):
     - Compute world-space offset from spherical coords:
       ```
       const cosP = Math.cos(orbitPhi)
       const offset = new THREE.Vector3(
         ORBIT_RADIUS * cosP * Math.sin(orbitTheta),
         ORBIT_RADIUS * Math.sin(orbitPhi),
         ORBIT_RADIUS * cosP * Math.cos(orbitTheta)
       )
       ```
     - Set `camera.position.copy(vehicleState.position).add(offset)` directly (no lerp).
     - `camera.lookAt(vehicleState.position)`.

4. No changes to `main.js` or any other file.

## Verification

- Open game in browser (`npx serve .` or Live Server).
- Drive forward. Left-click and drag left/right — camera orbits horizontally around the car. Drag up/down — camera elevates or descends.
- Release mouse — camera smoothly resumes chase follow from the current orbit position (no snap because angles are synced each follow frame).
- Press C to enter cockpit mode, attempt drag — drag should have no effect on cockpit camera.
- Fast drag past the window edge should not leave the camera stuck in orbit mode.

## Files Changed

- `src/camera.js`

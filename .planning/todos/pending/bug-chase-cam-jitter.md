---
id: BUG-06
type: bug
severity: minor
status: open
opened: 2026-06-03
---

# BUG-06: Intermittent jitter in chase cam (not orbit, not cockpit)

## Symptom

The chase camera occasionally snaps/jolts — a single-frame or short-burst displacement of the camera goal position. Only happens in chase follow mode (not while dragging/orbiting, not in cockpit mode). Intermittent — more likely on hilly terrain or after a rollover.

## Root cause (strong suspect)

`src/camera.js` line 84–85:

```js
const euler = new THREE.Euler().setFromQuaternion(vehicleState.quaternion, 'YXZ')
const yawQ  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y)
```

`setFromQuaternion` with the `'YXZ'` order extracts Euler angles, and **YXZ has a gimbal lock singularity at pitch = ±90°**. When the car crests a hill, lands from a jump, or partially rolls, the pitch passes through or near ±90° and the extracted `euler.y` (yaw) can discontinuously jump by ~180°. This snaps `goalPos` (the chase camera's target position) to the opposite side of the car in one frame — the lerp doesn't have time to smooth it, so a visible jolt occurs.

**Why orbit and cockpit are immune:**
- **Orbit/drag mode:** uses stored `orbitTheta` and `orbitPhi` directly — no euler extraction.
- **Cockpit mode:** applies the full `vehicleState.quaternion` to a fixed offset — no euler extraction.

Only the chase follow path uses the euler yaw decomposition.

## Fix

Replace the Euler extraction with a gimbal-lock-free yaw derivation. The correct approach is to project the car's forward vector onto the XZ plane and use `atan2`:

```js
// Forward vector in world space (-Z in body space)
const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
// Flatten to XZ (ignore pitch) and extract yaw
const yawAngle = Math.atan2(-forward.x, -forward.z)  // atan2(x, -z) for Y-up convention
const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle)
```

This is singularity-free at any pitch/roll angle. The chase camera always tracks the car's heading projected onto the horizontal plane, even when the car is upside-down.

## File

`src/camera.js` — lines 84–85, inside the `else` (non-dragging) branch of `updateCamera`.

## Notes

- The fix also eliminates the allocation of a `THREE.Euler` object each frame (minor perf win).
- The `orbitTheta` sync on lines 93–95 is also slightly off for the same reason (it derives theta from the lerp'd camera position, which lags behind the goalPos snap), but this is cosmetic since it only affects the drag handoff frame.

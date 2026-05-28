/**
 * Camera module for RangerSim. Spring-follow chase mode and fixed-offset cockpit mode.
 * C key toggles between modes. Does NOT parent camera to car mesh — parenting propagates
 * jitter. Uses lerp-to-goal per RESEARCH.md §Pattern 6. See GLOSSARY.md §Named Vectors
 * for quaternion-derived forward direction.
 */

import * as THREE from 'three'

// ── Module-level camera state ──────────────────────────────────────────────────
let cameraMode = 'chase'  // 'chase' | 'cockpit'

// Chase mode constants (Claude's discretion for tuning — see CONTEXT.md)
const CHASE_OFFSET_LOCAL = new THREE.Vector3(0, 2.5, 6.0)  // body-space: behind (+Z) and above (+Y)
const LERP_FACTOR = 0.08  // ~8% per frame at 60fps; see Pitfall 4 note in updateCamera

// Register C-key listener at module load
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'c') {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase'
  }
})

/**
 * Update camera position and orientation each render frame.
 * Called after syncMeshesToState in the render loop.
 *
 * @param {THREE.PerspectiveCamera} camera — Three.js camera; mutated in-place (position and quaternion/lookAt)
 * @param {object} vehicleState — {position: THREE.Vector3, quaternion: THREE.Quaternion, velocity: THREE.Vector3}
 * @returns {void}
 */
export function updateCamera (camera, vehicleState) {
  if (cameraMode === 'chase') {
    // Goal position: offset rotated by yaw-only quaternion — chase camera follows heading, not pitch/roll.
    // Inheriting full vehicleState.quaternion displaces the goal position when the car tilts, causing glitches.
    const euler  = new THREE.Euler().setFromQuaternion(vehicleState.quaternion, 'YXZ')
    const yawQ   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y)
    const goalOffset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(yawQ)
    const goalPos = vehicleState.position.clone().add(goalOffset)
    camera.position.lerp(goalPos, LERP_FACTOR)
    camera.lookAt(vehicleState.position)
    // Pitfall 4: LERP_FACTOR is frame-rate dependent. At target 60fps the feel is intentional.
    // A frame-rate-independent version would be: 1 - Math.exp(-5 * dt). Claude's discretion
    // (CONTEXT.md) — 0.08 is the default; expose as debug constant if needed.
  } else {
    // Cockpit mode: fixed offset inside cabin (body space → world space)
    // RESEARCH.md §Open Questions #2: offset ~(0, 0.8, 0.3) in body space — slightly above and forward of CG
    const COCKPIT_OFFSET_LOCAL = new THREE.Vector3(0, 0.8, 0.3)  // body-space
    const cockpitOffset = COCKPIT_OFFSET_LOCAL.clone().applyQuaternion(vehicleState.quaternion)
    camera.position.copy(vehicleState.position).add(cockpitOffset)
    // Look along forward direction (body -Z in world)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    const lookTarget = vehicleState.position.clone().add(cockpitOffset).add(forward)
    camera.lookAt(lookTarget)
  }
}

/**
 * Returns the current camera mode string.
 * Exported for Plan 02+ debug panel if needed; not required by Phase 1 success criteria.
 *
 * @returns {'chase'|'cockpit'}
 */
export function getCameraMode () {
  return cameraMode
}

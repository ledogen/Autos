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
const CHASE_STIFFNESS = 5  // exp-decay rate (s⁻¹); ~equiv to old LERP_FACTOR=0.08 at 60fps

// ── Drag-orbit state ───────────────────────────────────────────────────────────
// Spherical coordinates for orbit mode. orbitTheta = yaw (radians around Y axis),
// orbitPhi = pitch (radians above XZ plane). Synced each chase-follow frame so that
// when drag begins the camera does not jump.
const ORBIT_RADIUS    = Math.hypot(0, 2.5, 6.0)  // ≈ 6.5 m, matches CHASE_OFFSET_LOCAL length
const DRAG_SENSITIVITY = 0.005                     // rad/px

let isDragging  = false
let dragLastX   = 0
let dragLastY   = 0
let orbitTheta  = Math.PI   // start directly behind car (+Z world = behind -Z-facing car)
let orbitPhi    = 0.38      // ≈ 22° elevation, matches rough chase offset angle

// ── Input listeners ────────────────────────────────────────────────────────────
document.addEventListener('mousedown', e => {
  if (e.button === 0 && cameraMode === 'chase') {
    isDragging = true
    dragLastX  = e.clientX
    dragLastY  = e.clientY
  }
})

document.addEventListener('mousemove', e => {
  if (!isDragging || cameraMode !== 'chase') return
  const dx = e.clientX - dragLastX
  const dy = e.clientY - dragLastY
  orbitTheta -= dx * DRAG_SENSITIVITY
  orbitPhi    = Math.max(-1.2, Math.min(1.2, orbitPhi + dy * DRAG_SENSITIVITY))
  dragLastX   = e.clientX
  dragLastY   = e.clientY
})

document.addEventListener('mouseup', () => { isDragging = false })
document.addEventListener('mouseleave', () => { isDragging = false })

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
export function updateCamera (camera, vehicleState, dt) {
  if (cameraMode === 'chase') {
    if (isDragging) {
      // ── Orbit mode: place camera at fixed spherical offset in world space ──────
      // Car continues moving; camera tracks car position but holds the dragged angle.
      const cosP   = Math.cos(orbitPhi)
      const offset = new THREE.Vector3(
        ORBIT_RADIUS * cosP * Math.sin(orbitTheta),
        ORBIT_RADIUS * Math.sin(orbitPhi),
        ORBIT_RADIUS * cosP * Math.cos(orbitTheta)
      )
      camera.position.copy(vehicleState.position).add(offset)
      camera.lookAt(vehicleState.position)
    } else {
      // ── Follow mode: existing lerp chase logic ──────────────────────────────────
      // Goal position: offset rotated by yaw-only quaternion — chase camera follows heading, not pitch/roll.
      // Inheriting full vehicleState.quaternion displaces the goal position when the car tilts, causing glitches.
      const euler      = new THREE.Euler().setFromQuaternion(vehicleState.quaternion, 'YXZ')
      const yawQ       = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y)
      const goalOffset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(yawQ)
      const goalPos    = vehicleState.position.clone().add(goalOffset)
      const alpha = 1 - Math.exp(-CHASE_STIFFNESS * dt)
      camera.position.lerp(goalPos, alpha)
      camera.lookAt(vehicleState.position)

      // Sync orbit angles from current camera position so drag handoff is seamless (no jump).
      const delta = camera.position.clone().sub(vehicleState.position)
      orbitTheta  = Math.atan2(delta.x, delta.z)
      orbitPhi    = Math.asin(Math.max(-1, Math.min(1, delta.y / ORBIT_RADIUS)))
    }
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

/**
 * Camera module for RangerSim. Spring-follow chase mode, fixed-offset cockpit mode,
 * and free-fly dev mode. C key toggles chase/cockpit; Shift+C enters/exits freecam.
 * Does NOT parent camera to car mesh — parenting propagates jitter.
 * Uses lerp-to-goal per RESEARCH.md §Pattern 6. See GLOSSARY.md §Named Vectors
 * for quaternion-derived forward direction.
 */

import * as THREE from 'three'

// ── Module-level camera state ──────────────────────────────────────────────────
let cameraMode = 'chase'  // 'chase' | 'cockpit' | 'freecam'

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

// ── Free-cam state ─────────────────────────────────────────────────────────────
// Pointer-lock FPS mouse-look state for free-fly mode. freecamPos is the camera world
// position; freecamYaw/Pitch are Euler angles (YXZ order — no FPS roll). freecamKeys
// tracks WASD + vertical + boost keys internally so main.js only needs getCameraMode().
const MOUSESENSE    = 0.002   // rad/px
const FREECAM_SPEED = 20      // m/s base fly speed (Claude's discretion per RESEARCH)
const FREECAM_BOOST = 100     // m/s boosted fly speed with Shift held

let isPointerLocked = false
let freecamPos      = new THREE.Vector3()
let freecamYaw      = 0       // radians, Y-axis (world yaw)
let freecamPitch    = 0       // radians, X-axis, clamped to ±(PI/2 - 0.01)
const freecamKeys   = { w: false, a: false, s: false, d: false, space: false, ctrl: false, shift: false }

// Stores the most recent vehicleState so the C-key handler (registered at module load,
// before any vehicleState is available) can read the truck position for freecam entry.
let _lastVehicleState = null

// ── Input listeners ────────────────────────────────────────────────────────────
document.addEventListener('mousedown', e => {
  if (e.button === 0 && cameraMode === 'chase' && !e.target.closest('.lil-gui')) {
    isDragging = true
    dragLastX  = e.clientX
    dragLastY  = e.clientY
  }
})

document.addEventListener('mousemove', e => {
  // Chase drag-orbit — only when dragging in chase mode (not freecam).
  if (isDragging && cameraMode === 'chase') {
    const dx = e.clientX - dragLastX
    const dy = e.clientY - dragLastY
    orbitTheta -= dx * DRAG_SENSITIVITY
    orbitPhi    = Math.max(-1.2, Math.min(1.2, orbitPhi + dy * DRAG_SENSITIVITY))
    dragLastX   = e.clientX
    dragLastY   = e.clientY
  }

  // Freecam pointer-lock FPS look — only when pointer is locked and in freecam mode.
  // Gated separately so freecam mouse deltas never reach orbit state.
  if (isPointerLocked && cameraMode === 'freecam') {
    freecamYaw   -= e.movementX * MOUSESENSE
    freecamPitch -= e.movementY * MOUSESENSE
    freecamPitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, freecamPitch))
  }
})

document.addEventListener('mouseup', () => { isDragging = false })
document.addEventListener('mouseleave', () => { isDragging = false })

// Pointer lock state — driven by browser event only (T-07-01-PL: never set speculatively).
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = !!document.pointerLockElement
})

// Canvas click re-captures pointer lock when in freecam but pointer was released by Esc.
// Deferred to document.addEventListener('DOMContentLoaded') would fail here (module scripts
// run after parse) so we use a lazy querySelector at listener fire time.
document.addEventListener('click', e => {
  const canvas = document.querySelector('canvas')
  if (canvas && e.target === canvas && cameraMode === 'freecam' && !isPointerLocked) {
    canvas.requestPointerLock()
  }
})

// Freecam WASD + vertical + boost key state (module-private).
// Maps: W/A/S/D, Space→space, Control→ctrl, Shift→shift.
// These listeners only mutate freecamKeys; they do not interfere with truck WASD
// (vehicle.js has its own independent listeners on the same keys).
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'w': case 'W': freecamKeys.w     = true; break
    case 's': case 'S': freecamKeys.s     = true; break
    case 'a': case 'A': freecamKeys.a     = true; break
    case 'd': case 'D': freecamKeys.d     = true; break
    case ' ':           freecamKeys.space = true; break
    case 'Control':     freecamKeys.ctrl  = true; break
    case 'Shift':       freecamKeys.shift = true; break
  }
})
document.addEventListener('keyup', e => {
  switch (e.key) {
    case 'w': case 'W': freecamKeys.w     = false; break
    case 's': case 'S': freecamKeys.s     = false; break
    case 'a': case 'A': freecamKeys.a     = false; break
    case 'd': case 'D': freecamKeys.d     = false; break
    case ' ':           freecamKeys.space = false; break
    case 'Control':     freecamKeys.ctrl  = false; break
    case 'Shift':       freecamKeys.shift = false; break
  }
})

// C-key listener — upgraded from the original single-mode toggle.
// D-01: Shift+C enters/exits freecam. C alone cycles chase↔cockpit when not in freecam,
//       or exits freecam when in it.
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'c') return
  if (e.shiftKey) {
    if (cameraMode !== 'freecam') {
      _enterFreecam()
    } else {
      _exitFreecam()
    }
  } else {
    if (cameraMode !== 'freecam') {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase'
    } else {
      _exitFreecam()  // C alone also exits freecam per D-01
    }
  }
})

// ── Freecam helpers ────────────────────────────────────────────────────────────

function _enterFreecam () {
  if (!_lastVehicleState) return  // guard against call before first updateCamera frame
  // Spawn ~2 m above the truck position (D-04)
  freecamPos.copy(_lastVehicleState.position).add(new THREE.Vector3(0, 2, 0))
  // Initial yaw = car heading. Car faces -Z (right-hand Y-up), so euler.y from vehicle
  // quaternion is the car's world yaw. Add PI so camera initially faces car's forward.
  const euler = new THREE.Euler().setFromQuaternion(_lastVehicleState.quaternion, 'YXZ')
  freecamYaw   = euler.y + Math.PI
  freecamPitch = 0
  cameraMode   = 'freecam'
  const canvas = document.querySelector('canvas')
  if (canvas) canvas.requestPointerLock()
}

function _exitFreecam () {
  cameraMode = 'chase'
  document.exitPointerLock()
  // No position snap needed: chase follow-mode lerp (CHASE_STIFFNESS=5, ~200ms) smoothly
  // absorbs the position discontinuity from freecam → chase (CAM-03 no-snap).
}

/**
 * Update camera position and orientation each render frame.
 * Called after syncMeshesToState in the render loop.
 *
 * @param {THREE.PerspectiveCamera} camera — Three.js camera; mutated in-place (position and quaternion/lookAt)
 * @param {object} vehicleState — {position: THREE.Vector3, quaternion: THREE.Quaternion, velocity: THREE.Vector3}
 * @param {number} dt — frame delta time in seconds
 * @returns {void}
 */
export function updateCamera (camera, vehicleState, dt) {
  // Store latest vehicleState reference so the C-key listener can read truck position.
  _lastVehicleState = vehicleState

  if (cameraMode === 'freecam') {
    // ── Freecam branch: WASD fly along look direction, Space/Ctrl vertical, Shift boost ──
    // Forward vector derived from freecamPitch + freecamYaw in YXZ Euler order (D-03).
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(freecamPitch, freecamYaw, 0, 'YXZ'))
    const right   = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, freecamYaw, 0, 'YXZ'))
    const speed   = freecamKeys.shift ? FREECAM_BOOST : FREECAM_SPEED
    if (freecamKeys.w) freecamPos.addScaledVector(forward,  speed * dt)
    if (freecamKeys.s) freecamPos.addScaledVector(forward, -speed * dt)
    if (freecamKeys.a) freecamPos.addScaledVector(right,   -speed * dt)
    if (freecamKeys.d) freecamPos.addScaledVector(right,    speed * dt)
    if (freecamKeys.space) freecamPos.y += speed * dt
    if (freecamKeys.ctrl)  freecamPos.y -= speed * dt

    camera.position.copy(freecamPos)
    // 'YXZ' Euler order: yaw applied first in world space, then pitch in local space.
    // This is the FPS-camera convention that prevents roll at zenith (RESEARCH §Pitfall 8).
    camera.rotation.set(freecamPitch, freecamYaw, 0, 'YXZ')
    return  // Do not fall through to chase/cockpit branches
  }

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
 *
 * @returns {'chase'|'cockpit'|'freecam'}
 */
export function getCameraMode () {
  return cameraMode
}

/**
 * Returns the live freecam position Vector3.
 * Used by main.js to pass the camera position to terrainSystem.update() when in freecam
 * so the terrain chunk ring streams around the camera rather than the truck (D-21).
 *
 * @returns {THREE.Vector3}
 */
export function getFreecamPosition () {
  return freecamPos
}

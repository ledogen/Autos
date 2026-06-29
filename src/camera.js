/**
 * Camera module for RangerSim. Spring-follow chase mode, fixed-offset hood cam,
 * and free-fly dev mode. C key toggles chase/hood; Shift+C enters/exits freecam.
 * Does NOT parent camera to car mesh — parenting propagates jitter.
 * Uses lerp-to-goal per RESEARCH.md §Pattern 6. See GLOSSARY.md §Named Vectors
 * for quaternion-derived forward direction.
 */

import * as THREE from 'three'

// ── Module-level camera state ──────────────────────────────────────────────────
let cameraMode = 'chase'  // 'chase' | 'hood' | 'freecam'

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

// ── Hood-cam drag-look state ─────────────────────────────────────────────────────
// Yaw/pitch offset (radians) layered on top of the body-locked hood orientation. Dragging
// accumulates it (mousemove); releasing eases it back to 0 so the view re-centers on the
// body's forward direction — the hood-cam analog of the chase cam's snap-back-behind.
let hoodLookYaw   = 0
let hoodLookPitch = 0
const HOOD_LOOK_YAW_CLAMP     = 2.5  // rad — how far around (±) the view can be dragged
const HOOD_LOOK_PITCH_CLAMP   = 1.0  // rad — up/down look limit (±)
const HOOD_RECENTER_STIFFNESS = 5    // s⁻¹ exp-decay back to forward on release (matches chase feel)

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
  if (e.button === 0 && (cameraMode === 'chase' || cameraMode === 'hood') && !e.target.closest('.lil-gui')) {
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

  // Hood drag-look — accumulate a yaw/pitch offset around the body forward. Drag right → look
  // right, drag down → look down (signs chosen so the view follows the cursor). Clamped; eased
  // back to forward on release in updateCamera.
  if (isDragging && cameraMode === 'hood') {
    const dx = e.clientX - dragLastX
    const dy = e.clientY - dragLastY
    hoodLookYaw   = Math.max(-HOOD_LOOK_YAW_CLAMP,   Math.min(HOOD_LOOK_YAW_CLAMP,   hoodLookYaw   - dx * DRAG_SENSITIVITY))
    hoodLookPitch = Math.max(-HOOD_LOOK_PITCH_CLAMP, Math.min(HOOD_LOOK_PITCH_CLAMP, hoodLookPitch - dy * DRAG_SENSITIVITY))
    dragLastX     = e.clientX
    dragLastY     = e.clientY
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
    // Swallow the rejection: requestPointerLock rejects (and logs "Uncaught (in promise)")
    // during the browser's post-exitPointerLock cooldown. Optional chaining guards older
    // browsers that return undefined instead of a promise (WR-02).
    canvas.requestPointerLock()?.catch(() => {})
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
// D-01: Shift+C enters/exits freecam. C alone cycles chase↔hood when not in freecam,
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
      cameraMode = cameraMode === 'chase' ? 'hood' : 'chase'
    } else {
      _exitFreecam()  // C alone also exits freecam per D-01
    }
  }
})

// ── Freecam helpers ────────────────────────────────────────────────────────────

// Zero all held-key state. Called on freecam entry AND exit so a Shift held for the
// Shift+C toggle (or any key still down at mode switch) can't leak into the next
// freecam session — otherwise the camera silently re-enters at boost speed (WR-03).
function _resetFreecamKeys () {
  for (const k in freecamKeys) freecamKeys[k] = false
}

function _enterFreecam () {
  if (!_lastVehicleState) return  // guard against call before first updateCamera frame
  _resetFreecamKeys()
  // Spawn behind + above the truck, mirroring the chase-cam offset (D-04), so the truck
  // is immediately in view on entry. CHASE_OFFSET_LOCAL is body-space (behind +Z, above +Y);
  // rotate by yaw only so the spawn tracks heading without inheriting car pitch/roll.
  const euler  = new THREE.Euler().setFromQuaternion(_lastVehicleState.quaternion, 'YXZ')
  const yawQ   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y)
  const offset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(yawQ)
  freecamPos.copy(_lastVehicleState.position).add(offset)
  // Orient to look AT the truck so it's framed on entry (fixes prior reversed-facing spawn).
  // Solve yaw/pitch for the YXZ forward convention used in updateCamera:
  //   forward = (-cosθ·sinψ, sinθ, -cosθ·cosψ)  ⇒  ψ = atan2(-dx,-dz), θ = asin(dy)
  const dir = _lastVehicleState.position.clone().sub(freecamPos).normalize()
  freecamYaw   = Math.atan2(-dir.x, -dir.z)
  freecamPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
  cameraMode   = 'freecam'
  const canvas = document.querySelector('canvas')
  if (canvas) canvas.requestPointerLock()?.catch(() => {})  // swallow cooldown rejection (WR-02)
}

function _exitFreecam () {
  _resetFreecamKeys()  // clear boost/move keys so the next entry starts at base speed (WR-03)
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
    return  // Do not fall through to chase/hood branches
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
    // Hood cam: fixed offset at the rear edge of the hood, just outside the windshield
    // (body space → world space). Body -Z is forward; the hood spans z∈[-2.2,-0.95] with its
    // top surface at y≈0.21, and the windshield/cab front face is at z≈-0.95. Placing the camera
    // at z=-1.0 (a hair ahead of the glass) and y=0.75 (~0.54 above the hood) gives a clean
    // forward view over the hood with no body interior clipping into frame.
    const HOOD_OFFSET_LOCAL = new THREE.Vector3(0, 0.75, -1.0)  // body-space
    const hoodOffset = HOOD_OFFSET_LOCAL.clone().applyQuaternion(vehicleState.quaternion)
    camera.position.copy(vehicleState.position).add(hoodOffset)

    // Drag-look re-center: when not actively dragging, ease the look offset back to forward so
    // releasing the mouse snaps the view back over the hood (chase-cam-style snap-back behind).
    if (!isDragging) {
      const decay = Math.exp(-HOOD_RECENTER_STIFFNESS * dt)
      hoodLookYaw   *= decay
      hoodLookPitch *= decay
      if (Math.abs(hoodLookYaw)   < 1e-3) hoodLookYaw   = 0
      if (Math.abs(hoodLookPitch) < 1e-3) hoodLookPitch = 0
    }

    // Lock orientation to the body — no horizon stabilization — then layer the drag-look offset
    // on top. A Three.js camera looks down its local -Z with local +Y up, which matches body
    // forward/up, so the body quaternion makes the view roll/pitch 1:1 with the truck; the YXZ
    // offset (yaw about local up, then pitch about local right) lets you glance around without
    // introducing roll, relative to the body frame.
    const lookOffset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(hoodLookPitch, hoodLookYaw, 0, 'YXZ')
    )
    camera.quaternion.copy(vehicleState.quaternion).multiply(lookOffset)
  }
}

/**
 * Returns the current camera mode string.
 *
 * @returns {'chase'|'hood'|'freecam'}
 */
export function getCameraMode () {
  return cameraMode
}

/**
 * Returns a COPY of the freecam position Vector3.
 * Used by main.js to pass the camera position to terrainSystem.update() when in freecam
 * so the terrain chunk ring streams around the camera rather than the truck (D-21).
 * Returns a clone (not the live internal instance) so callers cannot alias or mutate
 * module-private camera state across the boundary (WR-05). Allocation is negligible and
 * only occurs while in free-cam.
 *
 * @returns {THREE.Vector3} a fresh copy of the freecam world position
 */
export function getFreecamPosition () {
  return freecamPos.clone()
}

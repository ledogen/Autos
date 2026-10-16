/**
 * Camera module for AUTOS. Spring-follow chase mode, fixed-offset hood cam,
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

// Pitch-follow: the chase cam tilts to track the car's pitch (nose up climbing / down braking)
// so the view leans into hills instead of staying rigidly level. CHASE_PITCH_FOLLOW scales how
// much of the car's pitch the camera adopts (0 = none, 1 = 1:1). The smoothing is deliberately
// slow (CHASE_PITCH_STIFFNESS ≈ 0.67 s time constant) so transient suspension bumps are filtered
// out and only sustained grade changes move the camera — the "inertia" the feature calls for.
const CHASE_PITCH_FOLLOW    = 0.6   // fraction of car pitch the camera tilts toward
const CHASE_PITCH_STIFFNESS = 1.5   // exp-decay rate (s⁻¹) for the smoothed pitch — low = heavy inertia
let smoothedPitch = 0               // module-level low-passed car pitch (radians)
const CHASE_PITCH_CLAMP     = 0.6   // rad — no road is steeper; a tumbling truck's ±90° never reaches the tilt

// FEAT-95 crash-calm chase heading. The camera no longer reads the body's yaw directly; it carries
// its OWN heading (camYaw) that follows the body's but can only turn so fast. Three faults this
// removes:
//  1. Yaw is the ground-plane projection of the body's long axis. When the nose points near-vertical
//     (an end-over-end, a nose-first drop) that projection shrinks to nothing and its angle is noise —
//     and once it passes vertical it is 180° away. The heading cap is scaled by the projection's
//     length², so a near-vertical truck barely steers the camera at all.
//  2. The camera USED to lerp its position straight at a goal that could jump half a lap — a chord
//     through the truck. Now the goal is placed FROM camYaw, so a heading change is an arc around it,
//     at no more than CHASE_YAW_MAX_RATE.
//  3. The aim was a hard lookAt on the truck: every tumble whipped the view 1:1 from 6.5 m away. The
//     look direction now turns toward the lookAt no faster than CHASE_AIM_MAX_RATE.
// PURE RATE LIMITERS, no springs — on purpose. The pre-FEAT-95 camera (instant heading, rigid aim,
// world-space position lerp) is the feel the owner tuned to; heading/aim springs, and a stiff
// sideways position spring, were both tried 2026-10-01 and read as off ("too much chassis lock").
// Normal driving tops out around 0.4 rad/s of yaw at speed and ~0.8 rad/s in a slow hairpin, so both
// caps sit above anything a car does on its wheels: on the road the camera is the old one exactly
// (headless diff vs HEAD, 5–30 m/s × 0–40° slip: ≤ 0.3°), and only a spin or a crash meets a cap.
const CHASE_YAW_MAX_RATE  = 2.0   // rad/s — the camera can never orbit the truck faster than this
const CHASE_AIM_MAX_RATE  = 2.5   // rad/s — cap on how fast the view itself may turn
// The reverse/forward swing is a deliberate move, not a crash — it runs every limit above (both
// rate caps and the position lerp) CHASE_SWING_BOOST× faster until camYaw has landed.
const CHASE_SWING_BOOST   = 4
const CHASE_SWING_DONE    = 0.05  // rad — camYaw within this of its target ends the swing
const CHASE_SWING_UPRIGHT  = 0.8  // body-up · world-up above this (tilt < ~37°) …
const CHASE_SWING_MAX_SPIN = 1.5  // … and yaw rate below this (rad/s), else the swing is NOT boosted
// Reverse: travelling backward faster than REV_ENTER swings the camera round to the front (heading
// + π); it swings back once the truck is moving forward again. The gap between the two thresholds is
// hysteresis — stopping mid three-point-turn leaves the view where it is instead of flickering.
const CHASE_REV_ENTER = -1.8      // m/s along body forward
const CHASE_REV_EXIT  =  0.5      // m/s along body forward
let camYaw      = Math.PI         // camera heading (rad, world Y) — same convention as orbitTheta
let reverseView = false
let swinging    = false           // a reverse/forward swing is under way (boosted limits)
const _fwd     = new THREE.Vector3()
const _aimFrom = new THREE.Quaternion()
// Per-frame scratch for updateCamera (one set per role, so no two live values ever alias).
const _right   = new THREE.Vector3()
const _goalPos = new THREE.Vector3()
const _offset  = new THREE.Vector3()
const _delta   = new THREE.Vector3()
const _yawQ    = new THREE.Quaternion()
const _tiltQ   = new THREE.Quaternion()
const _lookQ   = new THREE.Quaternion()
const _euler   = new THREE.Euler()
const _AXIS_X  = new THREE.Vector3(1, 0, 0)
const _AXIS_Y  = new THREE.Vector3(0, 1, 0)
// Hood cam mount, body space — see the hood branch of updateCamera.
const HOOD_OFFSET_LOCAL = new THREE.Vector3(0, 0.75, -1.0)

// ── Drag-orbit state ───────────────────────────────────────────────────────────
// Spherical coordinates for orbit mode. orbitTheta = yaw (radians around Y axis),
// orbitPhi = pitch (radians above XZ plane). orbitRadius = actual camera-to-car distance.
// All three are synced each chase-follow frame so that when drag begins the camera does
// not jump. orbitRadius in particular MUST track the real (lerp-lagged) distance rather
// than the nominal CHASE_OFFSET_LOCAL length: the follow-mode lerp trails the car under
// acceleration, so the true gap is often much larger than the design offset. Re-projecting
// the orbit at a fixed nominal radius on drag-start snapped the camera toward the car
// (BUG: freecam-drag-snap) — using the synced actual radius keeps the transition seamless.
const ORBIT_RADIUS_DEFAULT = Math.hypot(0, 2.5, 6.0)  // ≈ 6.5 m, matches CHASE_OFFSET_LOCAL length
const DRAG_SENSITIVITY      = 0.005                     // rad/px

let isDragging   = false
// FEAT-61 aim mode: hold F and the chase orbit goes live with NO mouse button held, so the view can
// be steered onto a porch. Deliberately the SAME orbit state the drag uses — one set of angles, one
// clamp, one place the camera can be. A second look system would need its own handoff, and the
// handoff is the part that goes wrong.
let aimMode      = false
let dragLastX    = 0
let dragLastY    = 0
let orbitTheta   = Math.PI              // start directly behind car (+Z world = behind -Z-facing car)
let orbitPhi     = 0.38                 // ≈ 22° elevation, matches rough chase offset angle
let orbitRadius  = ORBIT_RADIUS_DEFAULT // actual camera-to-car distance, synced each follow frame

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

// One-shot: place the camera exactly at its goal on the NEXT updateCamera instead of easing in.
// The chase camera is a spring, which is right while driving and wrong the instant the world is
// handed to the player — it starts wherever it was left and visibly slides onto the truck. main.js
// fires this when a mode goes live (FEAT-41).
let _snapNext = false
export function snapCamera () { _snapNext = true }

// ── Focus override (FEAT-45: camp) ─────────────────────────────────────────────
// A world point the camera orbits instead of the truck. Set while camp is established so the view
// is ON the pad — you made camp, you should be looking at it, not at the back of your own tailgate.
// Deliberately the SMALLEST possible seam: it reuses the drag-orbit angles the chase cam already
// maintains, so mouse-drag still steers the view at camp, and clearing it hands straight back to
// the chase follow lerp (which re-syncs orbit theta/phi/radius every frame anyway — no snap).
// Freecam still wins outright: it is the dev tool and must never be trapped by a game state.
let focusTarget    = null              // THREE.Vector3 or null
const FOCUS_RADIUS = 5                 // m — the fire fills the frame (owner, 2026-10-01: 10 → 7 → 5)
const FOCUS_PHI    = 0.45              // rad — a gentle look-down set on entry; drag from there

// ── Input listeners ────────────────────────────────────────────────────────────
document.addEventListener('mousedown', e => {
  // ONLY ON THE RENDER CANVAS. This used to exclude just .lil-gui, which was survivable while a
  // drag was free: clicking a panel started a look-drag nobody noticed. It stopped being survivable
  // once the drag took a POINTER LOCK — clicking the pause menu hid the cursor and ate the click, so
  // the menu could not be used at all (owner, 2026-08-07). An allow-list of the one element a look
  // may start on covers every overlay in the app and cannot miss the next one somebody adds.
  //
  // Identified as the FIRST canvas, which is what requestPointerLock already targets in this file —
  // #map2d and #cluster are canvases too, and a look-drag must not start on either.
  //
  // NOT while the menu stage owns the screen (body.stage-on). On a load the menu overlay is gone, so
  // the click DID land on the canvas: this took the pointer lock, which freezes clientX/Y, and the
  // stage's own drag-orbit (src/stage.js, client deltas) died for the whole load (owner, 2026-10-05).
  if (e.button === 0 && (cameraMode === 'chase' || cameraMode === 'hood')
      && e.target === document.querySelector('canvas')
      && !document.body.classList.contains('stage-on')) {
    isDragging = true
    dragLastX  = e.clientX
    dragLastY  = e.clientY
    _capturePointer()
  }
})

/**
 * Take the pointer for a look-drag or an aim (owner, 2026-08-05: running out of trackpad at the edge
 * of a laptop screen was cutting throws short).
 *
 * Locked, the cursor has no position to run out of and we read movementX/Y instead of client deltas,
 * so a look can rotate forever. Freecam already owns the lock in its own mode and is untouched here.
 * The request is fired from a real user gesture (mousedown / keydown) as the API demands, and its
 * rejection is swallowed — the browser refuses during the post-exit cooldown, which is routine when
 * a player taps F twice quickly and not something to log.
 */
function _capturePointer () {
    if (isPointerLocked) return
    document.querySelector('canvas')?.requestPointerLock()?.catch(() => {})
}

/** Give it back — but never steal it from freecam, which holds the lock as its normal state. */
function _releasePointer () {
    if (isDragging || aimMode) return          // the other one is still using it
    if (cameraMode === 'freecam') return
    if (document.pointerLockElement) document.exitPointerLock()
}

document.addEventListener('mousemove', e => {
  // Chase drag-orbit — only when dragging in chase mode (not freecam). FEAT-61: aim mode counts as
  // dragging, which is the whole seam. dragLastX/Y are seeded by setAimMode so the first mousemove
  // after F goes down cannot fling the view by the distance the cursor happened to sit from its
  // last drag.
  if ((isDragging || aimMode) && cameraMode === 'chase') {
    // Locked → movementX/Y (no cursor, no screen edge to hit). Unlocked → client deltas, which is
    // the path that still runs while the lock request is in flight or was refused.
    const dx = isPointerLocked ? e.movementX : e.clientX - dragLastX
    const dy = isPointerLocked ? e.movementY : e.clientY - dragLastY
    orbitTheta -= dx * DRAG_SENSITIVITY
    orbitPhi    = Math.max(-1.2, Math.min(1.2, orbitPhi + dy * DRAG_SENSITIVITY))
    dragLastX   = e.clientX
    dragLastY   = e.clientY
  }

  // Hood drag-look — accumulate a yaw/pitch offset around the body forward. Drag right → look
  // right, drag down → look down (signs chosen so the view follows the cursor). Clamped; eased
  // back to forward on release in updateCamera.
  if (isDragging && cameraMode === 'hood') {
    const dx = isPointerLocked ? e.movementX : e.clientX - dragLastX
    const dy = isPointerLocked ? e.movementY : e.clientY - dragLastY
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

document.addEventListener('mouseup', () => { isDragging = false; _releasePointer() })
document.addEventListener('mouseleave', () => { isDragging = false; _releasePointer() })

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
// Capture phase: key RELEASES must land even when focus sits inside the lil-gui panel (its root
// stops propagation of key events, which would otherwise leave a fly key stuck on) — see the
// matching listener in vehicle.js.
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
}, true)

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
  // absorbs the position discontinuity from freecam → chase (CAM-03 no-snap). The heading needs
  // no glide: the freecam branch keeps camYaw on the body, so chase resumes already behind it.
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
  const snap = _snapNext   // consumed here, whichever branch below runs
  _snapNext = false
  if (snap) reverseView = swinging = false   // a fresh seat starts facing forward, no swing in flight

  if (cameraMode === 'freecam') {
    // ── Freecam branch: WASD fly along look direction, Space/Ctrl vertical, Shift boost ──
    // Forward vector derived from freecamPitch + freecamYaw in YXZ Euler order (D-03).
    const forward = _fwd.set(0, 0, -1).applyEuler(_euler.set(freecamPitch, freecamYaw, 0, 'YXZ'))
    const right   = _right.set(1, 0, 0).applyEuler(_euler.set(0, freecamYaw, 0, 'YXZ'))
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
    // Track the body heading while freecam owns the view (as hood does below): WASD still drives
    // the truck, so leaving freecam must land behind it rather than orbit round at the FEAT-95
    // rate cap — and a snapCamera() consumed above still leaves the heading on the truck.
    _fwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    camYaw = Math.atan2(-_fwd.x, -_fwd.z)
    reverseView = swinging = false
    return  // Do not fall through to chase/hood branches
  }

  if (focusTarget) {
    // ── Camp focus: orbit a fixed world point ────────────────────────────────
    // Same spherical parameterisation as the drag-orbit branch below, so dragging at camp steers
    // the same theta/phi and the handoff in either direction is continuous.
    const cosP   = Math.cos(orbitPhi)
    const goalPos = _goalPos.set(
      focusTarget.x + FOCUS_RADIUS * cosP * Math.sin(orbitTheta),
      focusTarget.y + FOCUS_RADIUS * Math.sin(orbitPhi),
      focusTarget.z + FOCUS_RADIUS * cosP * Math.cos(orbitTheta)
    )
    camera.position.lerp(goalPos, snap ? 1 : 1 - Math.exp(-CHASE_STIFFNESS * dt))
    camera.lookAt(focusTarget)
    // Keep the chase heading on the camera's bearing from the TRUCK, so leaving camp swings
    // round from where the view actually is.
    camYaw = Math.atan2(camera.position.x - vehicleState.position.x, camera.position.z - vehicleState.position.z)
    return
  }

  if (cameraMode === 'chase') {
    if (isDragging || aimMode) {
      // ── Orbit mode: place camera at fixed spherical offset in world space ──────
      // Car continues moving; camera tracks car position but holds the dragged angle
      // AND the actual radius captured at drag-start (see orbitRadius comment above) —
      // using the nominal design radius here would snap the camera on entry whenever the
      // follow-mode lerp was lagging (e.g. under acceleration).
      const cosP   = Math.cos(orbitPhi)
      const offset = _offset.set(
        orbitRadius * cosP * Math.sin(orbitTheta),
        orbitRadius * Math.sin(orbitPhi),
        orbitRadius * cosP * Math.cos(orbitTheta)
      )
      camera.position.copy(vehicleState.position).add(offset)
      camera.lookAt(vehicleState.position)
      // Hand the dragged angle to the follow heading, so releasing swings back BEHIND along an arc
      // at the yaw rate cap instead of lerping a chord across the truck.
      camYaw = orbitTheta
    } else {
      // ── Follow mode: crash-calm chase (FEAT-95 — see the CHASE_YAW_* block) ──────
      // Goal position: offset rotated by the camera's OWN heading (camYaw), never the body's
      // pitch/roll — inheriting the full body quaternion displaces the goal when the car tilts.
      _fwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
      const horiz = Math.hypot(_fwd.x, _fwd.z)   // 1 level, → 0 nose-vertical (heading undefined)

      // Reverse view, with hysteresis. vFwd is velocity along the body's ground-plane heading.
      if (horiz > 1e-3) {
        const v    = vehicleState.velocity
        const vFwd = (v.x * _fwd.x + v.z * _fwd.z) / horiz
        if (!reverseView && vFwd < CHASE_REV_ENTER) reverseView = swinging = true
        else if (reverseView && vFwd > CHASE_REV_EXIT) { reverseView = false; swinging = true }
      }

      // Step camYaw toward the body heading (+π when reversing) along the shortest arc, no faster
      // than CHASE_YAW_MAX_RATE × horiz² — a near-vertical body, whose projected heading is noise,
      // barely steers.
      const bodyYaw = Math.atan2(-_fwd.x, -_fwd.z) + (reverseView ? Math.PI : 0)
      const yawErr  = Math.atan2(Math.sin(bodyYaw - camYaw), Math.cos(bodyYaw - camYaw))
      if (Math.abs(yawErr) < CHASE_SWING_DONE) swinging = false
      // Boost only a swing on a truck that is upright and not spinning — a crash that happens to
      // slide backward flips reverseView too, and must stay on the crash-calm caps.
      const q       = vehicleState.quaternion
      const upY     = 1 - 2 * (q.x * q.x + q.z * q.z)            // world-Y component of body up
      const calm    = upY > CHASE_SWING_UPRIGHT && Math.abs(vehicleState.angularVelocity?.y ?? 0) < CHASE_SWING_MAX_SPIN
      if (!calm) swinging = false   // cancelled for good, or it would resume boosted once the wreck settles
      const boost   = swinging ? CHASE_SWING_BOOST : 1
      if (snap) camYaw = bodyYaw
      else {
        const cap = CHASE_YAW_MAX_RATE * boost * horiz * horiz * dt
        camYaw   += Math.max(-cap, Math.min(cap, yawErr))
      }
      const yawQ = _yawQ.setFromAxisAngle(_AXIS_Y, camYaw)

      // Low-pass the car's raw pitch so the camera tilt has inertia and shrugs off transient
      // bumps (only sustained grade changes survive the slow exp-decay). The smoothed pitch then
      // tilts the goal offset about the yawed local-right (X) axis: nose-up drops the camera lower
      // behind the car, and the lookAt below re-aims at the body, so the view leans up the hill.
      // Negated in reverse view (the camera is in front, so the grade it looks along is mirrored),
      // and clamped so a tumbling truck's ±90° pitch cannot swing the camera under the ground.
      // The pitch low-pass has to snap too, or the camera arrives at the right PLACE with the wrong
      // TILT and then rolls into position over the next second — the same slide, just rotational.
      const pitch = Math.max(-CHASE_PITCH_CLAMP, Math.min(CHASE_PITCH_CLAMP,
        Math.asin(Math.max(-1, Math.min(1, _fwd.y))) * (reverseView ? -1 : 1)))
      if (snap) smoothedPitch = pitch
      else smoothedPitch += (pitch - smoothedPitch) * (1 - Math.exp(-CHASE_PITCH_STIFFNESS * dt))
      const tiltQ      = _tiltQ.setFromAxisAngle(_AXIS_X, smoothedPitch * CHASE_PITCH_FOLLOW)
      const goalRot    = yawQ.multiply(tiltQ)  // yaw (world Y) first, then pitch about resulting local X
      const goalOffset = _offset.copy(CHASE_OFFSET_LOCAL).applyQuaternion(goalRot)
      const goalPos    = _goalPos.copy(vehicleState.position).add(goalOffset)
      // WORLD-space lerp, deliberately. The camera trails along the path the truck actually took,
      // by ~v/CHASE_STIFFNESS metres — which is what leans the view toward the VELOCITY vector at
      // speed and in a slide. That emergent chassis/velocity blend is the feel the owner tuned to;
      // a stiff sideways spring (tried 2026-10-01) killed it and read as "too much chassis lock".
      const alpha = snap ? 1 : 1 - Math.exp(-CHASE_STIFFNESS * boost * dt)
      camera.position.lerp(goalPos, alpha)

      // Aim: lookAt gives the target orientation; the camera slerps toward it (the rotational
      // equivalent of a lerp) by at most the rate cap. Both ends are roll-free, so it stays level.
      _aimFrom.copy(camera.quaternion)
      camera.lookAt(vehicleState.position)
      if (!snap) {
        const ang = _aimFrom.angleTo(camera.quaternion)
        if (ang > 1e-5) {
          const t = Math.min(1, CHASE_AIM_MAX_RATE * boost * dt / ang)
          camera.quaternion.copy(_aimFrom.slerp(camera.quaternion, t))
        }
      }

      // Sync orbit angles + radius from current camera position so drag handoff is seamless
      // (no jump). radius uses the ACTUAL distance (not ORBIT_RADIUS_DEFAULT) since the
      // follow lerp can lag well past the nominal offset length under acceleration.
      const delta = _delta.copy(camera.position).sub(vehicleState.position)
      orbitRadius = Math.max(0.01, delta.length())
      orbitTheta  = Math.atan2(delta.x, delta.z)
      orbitPhi    = Math.asin(Math.max(-1, Math.min(1, delta.y / orbitRadius)))
    }
  } else {
    // Hood cam: fixed offset at the rear edge of the hood, just outside the windshield
    // (body space → world space). Body -Z is forward; the hood spans z∈[-2.2,-0.95] with its
    // top surface at y≈0.21, and the windshield/cab front face is at z≈-0.95. Placing the camera
    // at z=-1.0 (a hair ahead of the glass) and y=0.75 (~0.54 above the hood) gives a clean
    // forward view over the hood with no body interior clipping into frame.
    const hoodOffset = _offset.copy(HOOD_OFFSET_LOCAL).applyQuaternion(vehicleState.quaternion)
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
    const lookOffset = _lookQ.setFromEuler(_euler.set(hoodLookPitch, hoodLookYaw, 0, 'YXZ'))
    camera.quaternion.copy(vehicleState.quaternion).multiply(lookOffset)
    // Track the body heading while hood owns the view, so toggling back to chase lands behind the
    // truck instead of swinging round from wherever chase was left.
    _fwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    camYaw = Math.atan2(-_fwd.x, -_fwd.z)
    reverseView = swinging = false
  }
}

/**
 * FEAT-61 — hold-to-aim. Turns the chase orbit live without a mouse button, and seeds the drag
 * origin from the cursor's CURRENT position so the first mousemove is a delta of zero rather than
 * however far the pointer drifted since the last real drag.
 *
 * Only meaningful in chase mode; hood and freecam have their own look and are left alone. Idempotent
 * — main.js calls it on every keydown, and keydown repeats.
 */
export function setAimMode (on, cursorX = dragLastX, cursorY = dragLastY) {
    if (on === aimMode) return
    aimMode = on
    if (on) { dragLastX = cursorX; dragLastY = cursorY; _capturePointer() }
    else _releasePointer()
}

/** True while hold-to-aim is engaged. */
export function isAiming () { return aimMode }

/**
 * Point the camera at a world spot instead of the truck (FEAT-45: the camp pad), or pass null to
 * hand it back to chase/hood. No-op on the freecam path — the dev camera outranks game states.
 *
 * @param {{x:number,y:number,z:number}|null} p
 */
export function setCameraFocus (p) {
  if (!p) { focusTarget = null; return }
  if (!focusTarget) orbitPhi = FOCUS_PHI   // seat the look-down once, on entry; drag owns it after
  focusTarget = new THREE.Vector3(p.x, p.y, p.z)
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

/**
 * Returns the freecam yaw (radians, world-Y rotation). Used by the freecam "teleport here"
 * feature so the truck faces the direction the camera was looking. YXZ forward at pitch 0 is
 * (-sinψ, 0, -cosψ), which matches the truck's setFromAxisAngle(Y, heading) forward exactly —
 * so heading = freecamYaw with no conversion.
 *
 * @returns {number} freecam yaw in radians
 */
export function getFreecamYaw () {
  return freecamYaw
}

/**
 * Exit free-cam back to chase (no-op if not in free-cam). Used by the free-cam "teleport here"
 * action so the player is dropped straight behind the truck at the new spot.
 */
export function exitFreecam () {
  if (cameraMode === 'freecam') _exitFreecam()
}

// Dev handle: place the freecam programmatically (world pos + yaw/pitch, radians). Exposed on
// `window.__view` in main.js — used by the headless screenshot tool (test/screenshot.mjs) and the browser
// console to jump to a spot for visual troubleshooting. Mirrors the window.terrain / window.sky handles.
export function placeFreecam (x, y, z, yaw, pitch) {
  freecamPos.set(x, y, z); freecamYaw = yaw; freecamPitch = pitch; cameraMode = 'freecam'
}

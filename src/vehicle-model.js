/**
 * src/vehicle-model.js — Vehicle visual model (low-poly 2002 Ford Ranger).
 *
 * Owns ALL of the car's appearance and per-frame mesh sync. Extracted out of
 * main.js so the visual model can evolve without colliding with the terrain /
 * road / streaming code that also lives in main.js.
 *
 * Public surface:
 *   createVehicleModel(scene, params) -> { carGroup, bodyMesh, wheelMeshes, syncMeshesToState }
 *
 *   - carGroup            parent Object3D; position/quaternion driven each frame
 *   - bodyMesh            main hull mesh (kept for back-compat / debug references)
 *   - wheelMeshes         [FL, FR, RL, RR] cylinder meshes
 *   - syncMeshesToState(state)  call once per render frame; updates transforms + lights
 *
 * Coordinate frame (carGroup local space): origin = CG, forward = -Z, right = +X,
 * up = +Y. Ground sits at y = -params.cgHeight. Car forward is -Z (GLOSSARY.md).
 *
 * Lights are emissive panels (not real Three.js lights): the scene runs full
 * daytime sun + ambient, so beam casters would be invisible and cost frame
 * budget. Emissive panels read clearly as on/off and stay within the 60fps target.
 *   - Headlights: toggle with the 'L' key (default ON).
 *   - Taillights: dim red when lights on, bright red under brake.
 *   - Reverse lights: white, on when the truck is actually moving backward.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ── Imported model (low-poly glTF) ───────────────────────────────────────────
// When present, this GLB replaces the primitive truck. The primitives stay as an
// automatic fallback if the load fails (offline, 404, parse error).
//   PAINT_MATERIAL — the material that is the body paint (recolorable).
//                    M_0042_Sienna is the saturated-blue paint coat.
//   MODEL_YAW      — extra Y rotation if the model faces the wrong way (game forward = -Z).
const MODEL_GLB          = 'assets/models/hilux.glb'
const PAINT_MATERIAL     = 'M_0042_Sienna'
const TARGET_LENGTH      = 4.6        // m — scale so the model's longest horizontal axis = this
const BODY_SCALE         = 1.065      // extra body-only scale multiplier (wheels are sized separately)
const MODEL_YAW          = 0          // rad — flip to Math.PI if the truck faces backward
const DEFAULT_BODY_COLOR = 0x2f6da4
// Fine alignment of the body shell relative to the procedural wheels (after auto-placement).
const BODY_SHIFT_REAR    = 0.318      // m — shift body rearward (+Z)
const BODY_SHIFT_DOWN    = 0.21       // m — downward nudge to seat the body on the wheels

// ── Palette ────────────────────────────────────────────────────────────────
const COLOR_BODY    = 0x2f6da4   // body panels (medium blue)
const COLOR_TRIM    = 0x1a1a1a   // bumpers, grille, seams (near-black)
const COLOR_GLASS   = 0x0a1018   // greenhouse / windows (dark)
const COLOR_TIRE    = 0x111111

// Emissive light colors
const HEAD_ON   = 0xfff4d6
const TAIL_DIM  = 0x330000
const TAIL_OFF  = 0x110000
const TAIL_BRK  = 0xff1111
const REV_ON    = 0xffffff
const REV_OFF   = 0x222222

const _box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

/**
 * Build the vehicle model and attach it to `scene`.
 * @param {THREE.Scene} scene
 * @param {object} params  RANGER_PARAMS (read live for slider-driven geometry)
 */
export function createVehicleModel (scene, params) {
  // carGroup: parent Object3D for body + wheels — wheels inherit body pitch/roll (Bug 5 fix).
  // syncMeshesToState drives carGroup.position and carGroup.quaternion; children follow automatically.
  const carGroup = new THREE.Object3D()
  scene.add(carGroup)

  // ── Body shell ───────────────────────────────────────────────────────────
  // Low-poly pickup silhouette built from flat boxes, centered on the CG.
  // Envelope ≈ 1.66 m wide × 4.5 m long, matching the original single-box hull
  // so the physics contact model (bodyContactRadius / contact points) is unchanged.
  const bodyGroup = new THREE.Group()
  carGroup.add(bodyGroup)

  const bodyMat  = new THREE.MeshStandardMaterial({ color: COLOR_BODY, roughness: 0.6, metalness: 0.2 })
  const trimMat  = new THREE.MeshStandardMaterial({ color: COLOR_TRIM, roughness: 0.8 })
  const glassMat = new THREE.MeshStandardMaterial({ color: COLOR_GLASS, roughness: 0.2, metalness: 0.1 })

  // part(geom, mat, x, y, z) — adds a shadow-casting child to bodyGroup.
  const part = (geom, mat, x, y, z) => {
    const m = new THREE.Mesh(geom, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    bodyGroup.add(m)
    return m
  }

  // Main hull (full length lower body). Kept as `bodyMesh` for back-compat.
  // Spans y ∈ [-0.35, 0.07]; the original hull was 0.8 tall centered on CG —
  // this lower, longer hull plus cab/bed above preserves the same overall mass box.
  const bodyMesh = part(_box(1.66, 0.42, 4.40), bodyMat, 0, -0.14, 0)

  // Hood (front deck, lower than the cab).
  part(_box(1.50, 0.14, 1.25), bodyMat, 0, 0.14, -1.575)

  // Cab (passenger box, tall, narrower than the body) — front face at z≈-0.95, back at z≈0.45.
  part(_box(1.46, 0.55, 1.40), bodyMat, 0, 0.345, -0.25)
  // Greenhouse / glass band (inset, darker) — suggests windshield + side glass.
  part(_box(1.34, 0.26, 1.22), glassMat, 0, 0.46, -0.27)

  // Bed: open box behind the cab (floor is the hull top). Taller walls = deeper bed well.
  part(_box(0.12, 0.34, 1.75), bodyMat,  0.77, 0.24,  1.325)   // right bed rail
  part(_box(0.12, 0.34, 1.75), bodyMat, -0.77, 0.24,  1.325)   // left bed rail
  part(_box(1.66, 0.34, 0.08), bodyMat,  0,    0.24,  2.20)    // tailgate
  part(_box(1.50, 0.34, 0.08), bodyMat,  0,    0.24,  0.47)    // bed front wall (behind cab)

  // Bumpers (dark trim).
  part(_box(1.72, 0.18, 0.14), trimMat, 0, -0.18, -2.24)       // front bumper
  part(_box(1.72, 0.16, 0.14), trimMat, 0, -0.20,  2.27)       // rear bumper

  // Grille (front face, between headlights).
  part(_box(1.02, 0.18, 0.06), trimMat, 0, 0.02, -2.21)

  // Side door seams + beltline trim (a hint of doors, both sides).
  for (const sx of [-1, 1]) {
    part(_box(0.04, 0.34, 0.04), trimMat, sx * 0.74, 0.20, -0.55)   // door front seam (on narrower cab)
    part(_box(0.05, 0.05, 1.30), trimMat, sx * 0.745, 0.10, -0.30)  // beltline strip along cab
  }

  // ── Functional lights (emissive panels) ────────────────────────────────────
  const lightMat = (color) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1, roughness: 0.4
  })

  const headlightMats = []
  const taillightMats = []
  const reverseMats   = []

  // Headlights — flank the grille on the front face.
  for (const sx of [-1, 1]) {
    const mat = lightMat(HEAD_ON)
    headlightMats.push(mat)
    part(_box(0.30, 0.16, 0.05), mat, sx * 0.60, 0.04, -2.22)
  }
  // Taillights — outboard on the tailgate face.
  for (const sx of [-1, 1]) {
    const mat = lightMat(TAIL_DIM)
    taillightMats.push(mat)
    part(_box(0.18, 0.24, 0.05), mat, sx * 0.66, -0.02, 2.25)
  }
  // Reverse lights — inboard white panels, default off.
  for (const sx of [-1, 1]) {
    const mat = lightMat(REV_OFF)
    reverseMats.push(mat)
    part(_box(0.14, 0.12, 0.05), mat, sx * 0.40, -0.10, 2.25)
  }

  // Headlight on/off state, toggled by 'L'. Default on so it's immediately visible.
  let headlightsOn = true
  const applyHeadlights = () => {
    for (const m of headlightMats) {
      m.emissive.setHex(headlightsOn ? HEAD_ON : 0x000000)
      m.color.setHex(headlightsOn ? HEAD_ON : 0x555555)
    }
  }
  applyHeadlights()
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'l' || e.key === 'L') { headlightsOn = !headlightsOn; applyHeadlights() }
    })
  }

  // ── Wheels ─────────────────────────────────────────────────────────────────
  // Wheels: CylinderGeometry rotated 90° around Z (Pitfall 5 — must do this BEFORE
  // instantiating meshes or the spin axis will be wrong).
  // Cylinder default = height along Y. After rotateZ(PI/2), height is along X (lateral).
  // Wheels then spin around their local X axis, which is the correct lateral roll axis.
  const wheelGeom = new THREE.CylinderGeometry(
    params.wheelRadius,  // radiusTop
    params.wheelRadius,  // radiusBottom
    0.25,                // height (tire width)
    16                   // radialSegments
  )
  wheelGeom.rotateZ(Math.PI / 2)  // align spin axis — MUST happen before mesh creation

  const wheelMat = new THREE.MeshStandardMaterial({ color: COLOR_TIRE })

  // Local-frame offsets for wheel center positions relative to vehicle CG.
  // Car forward = -Z (GLOSSARY.md §Coordinate System).
  const L  = params.wheelbase
  const wF = params.weightFront
  const wR = params.weightRear
  const tF = params.trackFront / 2
  const tR = params.trackRear / 2
  const wr = params.wheelRadius

  // Wheel local offsets in carGroup local space (body-relative), indexed 0=FL, 1=FR, 2=RL, 3=RR.
  // Y offset: wheel center is wheelRadius above ground; CG is cgHeight above ground.
  // So wheel center Y relative to CG = wr - cgHeight (negative — wheels are below CG).
  const wheelLocalOffsets = [
    new THREE.Vector3(-tF, wr - params.cgHeight, -(L * wR)),  // 0: FL — left, front
    new THREE.Vector3( tF, wr - params.cgHeight, -(L * wR)),  // 1: FR — right, front
    new THREE.Vector3(-tR, wr - params.cgHeight,  (L * wF)),  // 2: RL — left, rear
    new THREE.Vector3( tR, wr - params.cgHeight,  (L * wF)),  // 3: RR — right, rear
  ]

  // NOTE (Phase 4.1): hubYRest removed. Wheel mesh position is now derived from strutComp via
  // full world-space hub position inverse-transformed into body-local space (D-07).
  // syncMeshesToState below handles this correctly for any body orientation.
  const wheelMeshes = wheelLocalOffsets.map((offset) => {
    const mesh = new THREE.Mesh(wheelGeom, wheelMat)
    // Wheels are children of carGroup — position is in carGroup local space (body-relative).
    // carGroup carries world position and orientation; wheels follow automatically (Bug 5 fix).
    mesh.position.set(offset.x, offset.y, offset.z)
    mesh.castShadow = true
    carGroup.add(mesh)
    return mesh
  })

  // Scratch vectors reused each frame (avoid per-frame allocation churn).
  const _fwd = new THREE.Vector3()

  // Imported-model state. While modelActive, the OBJ owns the look: the procedural
  // body/wheels/lights are hidden and their per-frame updates are skipped (carGroup
  // transform still drives the model). paintMaterials are the OBJ's recolorable coats.
  let modelActive = false
  const paintMaterials = []
  let pendingBodyColor = DEFAULT_BODY_COLOR

  // ── Mesh sync ──────────────────────────────────────────────────────────────
  // Called every render frame to update mesh transforms from vehicleState.
  // carGroup carries world position and quaternion — body and wheels inherit it (Bug 5 fix).
  // Do NOT use Euler rotation for body orientation (Pitfall 3 / CLAUDE.md).
  function syncMeshesToState (state) {
    // Sync carGroup transform — body and wheels inherit this automatically (Bug 5 fix).
    carGroup.position.copy(state.position)
    carGroup.quaternion.copy(state.quaternion)  // quaternion-only rotation, never Euler (GLOSSARY.md)

    // Per-wheel: spin, steer, and hub-Y visual travel in carGroup local space.
    // wheelLocalOffsets[i] provides rest position; Y is overridden each frame by hub deviation.
    for (let i = 0; i < 4; i++) {
      // Spin quaternion: wheel rolling axis is X (geometry was rotateZ(PI/2) at creation).
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.wheelAngles[i])

      if (i < 2) {
        // Front wheels: combine steer (Y) then spin (X). steerQ.multiply(spinQ) = steerQ * spinQ
        // meaning spinQ is applied first, then steerQ — spin around axle, then yaw the whole assembly.
        const steer  = state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle
        const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer)
        wheelMeshes[i].quaternion.copy(steerQ).multiply(spinQ)
      } else {
        wheelMeshes[i].quaternion.copy(spinQ)
      }

      // D-07 (Phase 4.1): Derive full hub world position from strutComp, inverse-transform to body-local.
      // Replaces the broken world-ΔY approximation with exact body-space hub position for any orientation.
      {
        const isFrontMesh = i < 2
        const L_S_mesh = isFrontMesh
          ? params.suspensionRestLengthFront
          : params.suspensionRestLengthRear
        const strutComp_i = state.strutComp?.[i] ?? 0
        const strutLen_i  = L_S_mesh - strutComp_i
        const carQ = state.quaternion
        const body_down_mesh = new THREE.Vector3(0, -1, 0).applyQuaternion(carQ)
        // Mount world position: same local offset as suspension.js, rotated into world space
        const mountLocal = wheelLocalOffsets[i].clone()
        // BUG-05: wheelLocalOffsets bakes in (wr − cgHeight) without suspensionBodyOffset. Add it live
        // (read from params so slider drags take effect) so the visual hub mount tracks the
        // physics hub (getWheelPosition, which now includes the offset). Without this, positive offset
        // renders the wheel below the physics hub — it visibly sinks into the ground; negative floats it.
        mountLocal.y += isFrontMesh
          ? (params.suspensionBodyOffsetFront || 0)
          : (params.suspensionBodyOffsetRear || 0)
        const rMount_mesh = mountLocal.clone().applyQuaternion(carQ)
        const mountWorld = new THREE.Vector3(
          state.position.x + rMount_mesh.x,
          state.position.y + rMount_mesh.y,
          state.position.z + rMount_mesh.z
        )
        const hubWorld = new THREE.Vector3(
          mountWorld.x + strutLen_i * body_down_mesh.x,
          mountWorld.y + strutLen_i * body_down_mesh.y,
          mountWorld.z + strutLen_i * body_down_mesh.z
        )
        // Inverse-transform into carGroup local space (carGroup IS the body):
        const hubLocal = hubWorld.clone()
          .sub(state.position)
          .applyQuaternion(carQ.clone().invert())
        wheelMeshes[i].position.copy(hubLocal)
      }
    }

    // ── Light response ──────────────────────────────────────────────────────
    // Skip when the imported model is active — its light faces are static (the primitive
    // emissive panels are hidden). The procedural wheels above still animate.
    if (modelActive) return

    // Longitudinal velocity along the car's forward axis (-Z local). Negative = reversing.
    _fwd.set(0, 0, -1).applyQuaternion(state.quaternion)
    const vLong = state.velocity ? state.velocity.dot(_fwd) : 0
    // Brake lights illuminate when the driver's input OPPOSES the direction of travel
    // (i.e. actual deceleration). In this control scheme S=brake/reverse, W=throttle/forward:
    //   moving forward  → S (brake) decelerates  → brake lights
    //   moving backward → W (throttle) decelerates → brake lights
    // Near standstill, pressing into a direction is acceleration, not braking, so no light.
    const throttle = state.throttle || 0
    const brake    = state.brake || 0
    const braking =
      (vLong >  0.4 && brake    > 0.1) ||
      (vLong < -0.4 && throttle > 0.1)
    const reversing = vLong < -0.4

    const tailHex = braking ? TAIL_BRK : (headlightsOn ? TAIL_DIM : TAIL_OFF)
    for (const m of taillightMats) {
      m.emissive.setHex(tailHex)
      m.color.setHex(tailHex)
    }
    const revHex = reversing ? REV_ON : REV_OFF
    for (const m of reverseMats) {
      m.emissive.setHex(reversing ? REV_ON : 0x000000)
      m.color.setHex(revHex)
    }
  }

  // Recolor the body paint. Safe to call before the model finishes loading — the
  // color is remembered and applied to the paint materials on load.
  function setBodyColor (color) {
    pendingBodyColor = color
    for (const m of paintMaterials) m.color.set(color)
  }

  // ── Load the imported GLB (replaces the primitive truck on success) ─────────
  // Async + fault-tolerant: any failure leaves the primitive truck visible.
  new GLTFLoader().load(MODEL_GLB, (gltf) => {
    const root = gltf.scene
    // Orient first (game forward = -Z), then measure for auto scale + ground plant.
    root.rotation.y = MODEL_YAW
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)   // post-rotation, pre-scale (scale=1)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    const s = (TARGET_LENGTH / Math.max(size.x, size.z)) * BODY_SCALE // longest axis = truck length, ×body scale
    root.scale.setScalar(s)
    // Center on the CG in X/Z; plant the model's bottom on the ground plane (y = -cgHeight).
    // Then apply the manual fine-alignment offsets (rearward + down) relative to the wheels.
    root.position.set(
      -center.x * s,
      -params.cgHeight - box.min.y * s - BODY_SHIFT_DOWN,
      -center.z * s + BODY_SHIFT_REAR
    )

    root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m && typeof m.name === 'string' && m.name.includes(PAINT_MATERIAL)) paintMaterials.push(m)
      }
    })
    setBodyColor(pendingBodyColor)

    carGroup.add(root)
    bodyGroup.visible = false               // hide primitive shell (body + emissive light panels)

    // Strip the model's own wheels so the procedural wheels (which spin/steer/show suspension
    // travel) show through. Wheels are separate nodes sitting low under the body (Mesh2–5).
    // Detect them as "much smaller than the body" rather than by name, so a re-export still works.
    // If the model is one merged node, keep its static wheels instead.
    const longest = (o) => { const sz = new THREE.Vector3(); new THREE.Box3().setFromObject(o).getSize(sz); return Math.max(sz.x, sz.y, sz.z) }
    const kids = root.children.filter((c) => longest(c) > 0)
    let stripped = 0
    if (kids.length > 1) {
      const dims = kids.map(longest)
      const bodyDim = Math.max(...dims)
      kids.forEach((c, i) => { if (dims[i] < 0.5 * bodyDim) { c.visible = false; stripped++ } })
    }
    for (const w of wheelMeshes) w.visible = stripped > 0   // show procedural wheels only if we removed the model's
    modelActive = true
  }, undefined, (err) => console.warn('[vehicle-model] GLB load failed; keeping primitive truck:', err))

  return { carGroup, bodyMesh, wheelMeshes, syncMeshesToState, setBodyColor }
}

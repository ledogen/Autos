/**
 * src/vehicle-model.js — Vehicle visual model (low-poly 2002 Ford Ranger).
 *
 * Owns ALL of the car's appearance and per-frame mesh sync. Extracted out of
 * main.js so the visual model can evolve without colliding with the terrain /
 * road / streaming code that also lives in main.js.
 *
 * Public surface:
 *   createVehicleModel(scene, params) -> { carGroup, bodyMesh, wheelMeshes, syncMeshesToState, applyWheelRunout }
 *
 *   - carGroup            parent Object3D; position/quaternion driven each frame
 *   - bodyMesh            main hull mesh (kept for back-compat / debug references)
 *   - wheelMeshes         [FL, FR, RL, RR] wheel Groups (tire + steelie rim children)
 *   - syncMeshesToState(state)  call once per render frame; updates transforms + lights
 *
 * Coordinate frame (carGroup local space): origin = CG, forward = -Z, right = +X,
 * up = +Y. Ground sits at y = -params.cgHeight. Car forward is -Z (GLOSSARY.md).
 *
 * Lights are BOTH emissive lens panels (the visible glow) AND real Three.js SpotLights that cast
 * into the scene (FEAT-14). The cast beams matter now that QUAL-02 added a day/night cycle — they
 * read as subtle by day, dramatic at night. Lights are children of carGroup, so the beams move and
 * turn with the vehicle. Perf budget (iGPU floor): a FIXED count of 6 spots (2 headlight + 2 brake +
 * 2 reverse, one per lens corner — not centered), no spotlight shadows by default (GUI-toggleable),
 * and lights are dimmed to intensity 0 when off rather than removed from the scene (removal
 * recompiles the shader and hitches).
 *   - Headlights: 'L' cycles off → low beam → high beam → off (default low). Low beam is a HALF cone
 *     (a projected cookie masks the top, giving a real low-beam "beltline" cutoff); high beam is a
 *     full cone. Forward beam.
 *   - Taillights: dim red rearward pool when lights on, brighter red under brake.
 *   - Reverse lights: white rearward pool, on when the truck is actually moving backward.
 *
 * Tunables for the casters (intensity/distance/angle/decay/shadows) live in HEAD_TUNE / REAR_TUNE
 * and are exposed via addLightGui() (wired in main.js).
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { camberLean, toeOffset } from './alignment.js'
import { carcassRadialOffset, wheelRunoutOf } from './suspension.js'

// The imported GLB (described by a spec from data/vehicle-models.js) replaces the primitive truck.
// The primitives stay as an automatic fallback if the load fails (offline, 404, parse error).
const DEFAULT_BODY_COLOR = 0x2f6da4

// ── Palette ────────────────────────────────────────────────────────────────
const COLOR_BODY    = 0x2f6da4   // body panels (medium blue)
const COLOR_TRIM    = 0x1a1a1a   // bumpers, grille, seams (near-black)
const COLOR_GLASS   = 0x0a1018   // greenhouse / windows (dark)
const COLOR_TIRE    = 0x111111
const COLOR_RIM     = 0x8d9297   // steelie wheel disc (plain steel grey, no chrome)

// Emissive light colors
const HEAD_ON   = 0xfff4d6   // low-beam lens / warm white
const HEAD_HI   = 0xffffff   // high-beam lens (brighter, cooler white)
const TAIL_DIM  = 0x7a0000   // running-light red — bright enough to read against daylight (was 0x330000)
const TAIL_OFF  = 0x110000
const TAIL_BRK  = 0xff1111
const REV_ON    = 0xffffff
const REV_OFF   = 0x222222

// ── Cast-light tunables (FEAT-14) ────────────────────────────────────────────
// SpotLight units are physical (candela) with distance falloff `decay`; values are authored against
// the ACES-tone-mapped scene (sun ≈ 0.7–4.8). Editable live via addLightGui(). aimY/aimZ are the
// target offsets in carGroup-local space (forward = -Z), which set the beam's pitch and length.
const HEAD_TUNE = {
  lowIntensity: 700, lowDistance: 120, lowAngle: 0.70, lowPenumbra: 0.45, lowAimY: -3.2,  lowAimZ: -28,
  highIntensity: 1130, highDistance: 200, highAngle: 0.50, highPenumbra: 0.30, highAimY: -1.3, highAimZ: -65,
  lensLow: 1.4, lensHigh: 2.2,   // emissiveIntensity of the headlight LENS (the visible glow), low vs high
  // Low beam is a HALF cone: a projected cookie masks the upper part of the cone so the beam cuts off
  // at the "beltline" (real low-beam behaviour). lowCutoff is the cone fraction (0 top..1 bottom) of
  // the cutoff line; 0.5 = lower half lit. High beam keeps the full cone (uniform white cookie).
  lowCutoff: 0.37,
  // SpotLight shadows are expensive (see addLightGui); keep the map small + frustum tight when used.
  shadowMapSize: 512, shadowFar: 50,
  decay: 1.8, shadows: false,
}
const REAR_TUNE = {
  tailRunIntensity: 18, tailBrakeIntensity: 120, tailDistance: 16, tailAngle: 0.95, tailPenumbra: 1.0,
  reverseIntensity: 90, reverseDistance: 22, reverseAngle: 1.0, reversePenumbra: 1.0,
  lensRun: 1.4, lensBrake: 3.0, lensReverse: 2.5,   // emissiveIntensity of the rear LENS panels per state
  decay: 2, aimY: -2.0, aimZ: 14,
}
const TAIL_RED = 0xff1a1a

// Day/night response for the CAST beams (not the lens emissive). The pools are dimmed toward `dayScale`
// in full daylight and ramp to full strength at night, so headlights read as subtle by day and bright
// at night. nightFactor (0=day, 1=night) is supplied from the sky system each frame (setNightFactor).
const LIGHT_ENV = { dayScale: 0.1 }

const _box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

// Split a mesh's triangles into "front" + "rear" geometry groups by triangle-centroid Z
// (model-local), each with its own cloned material. The shared white-lens material spans BOTH the
// front lenses (headlights) and the rear lens (reverse) across the truck; splitting lets each be lit
// independently. Returns { frontMat, rearMat } (frontMat = headlight lens, rearMat = reverse lens),
// or null if no rear triangles were found.
function splitRearGroup (mesh, rearZ) {
  const geom = mesh.geometry
  const pos = geom.attributes.position
  const index = geom.index
  const idxAt = (k) => (index ? index.getX(k) : k)
  const triCount = (index ? index.count : pos.count) / 3
  const front = [], rear = []
  for (let t = 0; t < triCount; t++) {
    const a = idxAt(t * 3), b = idxAt(t * 3 + 1), c = idxAt(t * 3 + 2)
    const zc = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
    ;(zc > rearZ ? rear : front).push(a, b, c)
  }
  if (rear.length === 0) return null
  geom.setIndex(front.concat(rear))
  geom.clearGroups()
  geom.addGroup(0, front.length, 0)
  geom.addGroup(front.length, rear.length, 1)
  const frontMat = mesh.material.clone()    // headlight lens — own clone so only these front faces light
  const rearMat = mesh.material.clone()
  frontMat.emissive = new THREE.Color(0x000000)
  rearMat.emissive = new THREE.Color(0x000000)
  mesh.material = [frontMat, rearMat]        // group 0 → front (headlight), group 1 → rear (reverse)
  return { frontMat, rearMat }
}

/**
 * Build the vehicle model and attach it to `scene`.
 * @param {THREE.Scene} scene
 * @param {object} params  RANGER_PARAMS (read live for slider-driven geometry)
 * @param {object} [spec]  visual spec from data/vehicle-models.js (model file, alignment, lights).
 *                         Defaults to the project default vehicle; pass another to swap models.
 */
export function createVehicleModel (scene, params, spec = DEFAULT_VEHICLE_MODEL) {
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

  // ── Headlight beam cookies (SpotLight.map) ─────────────────────────────────
  // A projected greyscale texture multiplies the spot's output, so painting the upper part of the
  // cookie black makes the low beam a HALF cone with a flat top — the "beltline cutoff" of a real
  // low beam. The cookie's vertical axis is the beam's up axis (canvas row 0 = up), so masking the
  // top rows removes the upward part of the cone. High beam uses a uniform-white cookie (= no change,
  // full cone). BOTH headlights always carry a cookie so numSpotLightMaps never changes → swapping
  // low↔high never recompiles the shader. Skipped headless (no document); spots just stay unmapped.
  function drawCookie (ctx, S, kind) {
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let y = 0; y < S; y++) {
      let v = 1
      if (kind === 'low') {
        const feather = S * 0.07
        const cut = HEAD_TUNE.lowCutoff * S          // texture row of the cutoff line
        const t = (y - (cut - feather)) / (2 * feather)
        const m = Math.min(1, Math.max(0, t))
        v = m * m * (3 - 2 * m)                       // 0 above the cutoff (top), 1 below — half cone
      }
      const c = Math.round(v * 255)
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4
        d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  function makeCookie (kind) {
    if (typeof document === 'undefined') return { tex: null, redraw: () => {} }
    const S = 128
    const cv = document.createElement('canvas'); cv.width = cv.height = S
    const ctx = cv.getContext('2d')
    drawCookie(ctx, S, kind)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    return { tex, redraw: () => { drawCookie(ctx, S, kind); tex.needsUpdate = true } }
  }
  const lowCookie = makeCookie('low')
  const highCookie = makeCookie('high')

  // ── Cast lighting (real SpotLights, parented to carGroup) ──────────────────
  // One spot per lens, at the lens corner (NOT centered) so the cast pool emanates from where the
  // lamp visibly is. Headlights aim forward (-Z) and slightly down; rear lamps aim back (+Z) for a
  // wide soft pool. Positions/targets are carGroup children so the beams track the body. All six
  // stay in the scene at intensity 0 when off (toggling intensity, not scene membership, avoids a
  // shader recompile). Shadows default off for the iGPU budget — addLightGui() can enable them.
  const headlightSpots = []
  for (const sx of [-1, 1]) {
    const s = new THREE.SpotLight(HEAD_ON, 0, HEAD_TUNE.lowDistance, HEAD_TUNE.lowAngle, HEAD_TUNE.lowPenumbra, HEAD_TUNE.decay)
    s.position.set(sx * 0.60, 0.10, -2.22)               // at the headlight lens, front face
    s.target.position.set(sx * 0.60, HEAD_TUNE.lowAimY, HEAD_TUNE.lowAimZ)
    s.map = lowCookie.tex                                 // default low beam → half-cone cookie
    s.castShadow = false
    // Shadows (opt-in) kept cheap: small map + tight frustum — see addLightGui() for the cost notes.
    s.shadow.mapSize.set(HEAD_TUNE.shadowMapSize, HEAD_TUNE.shadowMapSize)
    s.shadow.camera.near = 0.5
    s.shadow.camera.far = HEAD_TUNE.shadowFar
    s.shadow.bias = -0.0005
    carGroup.add(s, s.target)
    headlightSpots.push(s)
  }

  // Brake/running casters: one red spot at each tail-lens corner (sx*0.66, matching the tail panels).
  const tailSpots = []
  for (const sx of [-1, 1]) {
    const s = new THREE.SpotLight(TAIL_RED, 0, REAR_TUNE.tailDistance, REAR_TUNE.tailAngle, REAR_TUNE.tailPenumbra, REAR_TUNE.decay)
    s.position.set(sx * 0.66, -0.02, 2.25)
    s.target.position.set(sx * 0.66, REAR_TUNE.aimY, REAR_TUNE.aimZ)
    carGroup.add(s, s.target)
    tailSpots.push(s)
  }
  // Reverse casters: one white spot at each reverse-lens corner (sx*0.40, matching the reverse panels).
  const reverseSpots = []
  for (const sx of [-1, 1]) {
    const s = new THREE.SpotLight(0xffffff, 0, REAR_TUNE.reverseDistance, REAR_TUNE.reverseAngle, REAR_TUNE.reversePenumbra, REAR_TUNE.decay)
    s.position.set(sx * 0.40, -0.10, 2.25)
    s.target.position.set(sx * 0.40, REAR_TUNE.aimY, REAR_TUNE.aimZ)
    carGroup.add(s, s.target)
    reverseSpots.push(s)
  }

  // GLB headlight lens materials (front split of the shared white-lens material); populated on load.
  // Declared here so applyHeadlights() (called just below) can reference it without a TDZ error.
  const modelHeadMats = []

  // Day/night factor for the CAST beams: 0 = full day (pools dimmed toward LIGHT_ENV.dayScale),
  // 1 = night (full strength). Fed from the sky system each frame via setNightFactor().
  let nightFactor = 0

  // Headlight mode: 0 = off, 1 = low beam, 2 = high beam. 'L' cycles off→low→high→off.
  // Default low so the lamps read immediately. applyHeadlights() syncs the emissive LENS panels and
  // the beam SHAPE (distance/angle/aim) to the mode; the cast INTENSITY is set per-frame in
  // syncMeshesToState so it can scale with the day/night factor (and pick up GUI edits live).
  let headlightMode = 1
  const applyHeadlights = () => {
    const on = headlightMode !== 0
    const high = headlightMode === 2
    const lensHex = high ? HEAD_HI : HEAD_ON
    const lensIntensity = on ? (high ? HEAD_TUNE.lensHigh : HEAD_TUNE.lensLow) : 0
    // Primitive-truck headlight lens panels.
    for (const m of headlightMats) {
      m.emissive.setHex(on ? lensHex : 0x000000)
      m.emissiveIntensity = lensIntensity
      m.color.setHex(on ? lensHex : 0x555555)
    }
    // Imported-model headlight lens (front split of the shared white-lens material).
    for (const m of modelHeadMats) {
      m.emissive.setHex(on ? lensHex : 0x000000)
      m.emissiveIntensity = lensIntensity
    }
    // Beam shape per mode (intensity handled per-frame in syncMeshesToState). Low beam swaps in the
    // half-cone cutoff cookie; high beam the full-cone (uniform) one. Both are always non-null so the
    // swap never changes numSpotLightMaps (no shader recompile).
    for (const s of headlightSpots) {
      const sx = Math.sign(s.position.x) || 1
      s.color.setHex(lensHex)
      s.map       = high ? highCookie.tex : lowCookie.tex
      s.distance  = high ? HEAD_TUNE.highDistance : HEAD_TUNE.lowDistance
      s.angle     = high ? HEAD_TUNE.highAngle    : HEAD_TUNE.lowAngle
      s.penumbra  = high ? HEAD_TUNE.highPenumbra : HEAD_TUNE.lowPenumbra
      s.target.position.set(sx * 0.60, high ? HEAD_TUNE.highAimY : HEAD_TUNE.lowAimY, high ? HEAD_TUNE.highAimZ : HEAD_TUNE.lowAimZ)
    }
  }
  applyHeadlights()
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'l' || e.key === 'L') { headlightMode = (headlightMode + 1) % 3; applyHeadlights() }
    })
  }

  // ── Wheels (steelie) ───────────────────────────────────────────────────────
  // Two shared geometries, built ONCE and referenced by all four wheels:
  //   tireGeom — near-black 245/75R16 carcass: open tube + outboard sidewall annulus (so the rim
  //              can sit DOWN inside it) + inboard end caps that stop you seeing through the wheel
  //   rimGeom  — merged steel "steelie": barrel + dished disc with 5 lightening HOLES + hub boss
  //              + 5 lug nuts. The holes are the point: they are arc-interrupted detail, so
  //              wheel spin is legible (a smooth cylinder reads as stationary at any speed).
  // Both are built with the cylinder's default Y axis and then rotateZ(-PI/2) (Pitfall 5 — must
  // happen BEFORE mesh creation): height ends up along +X, so wheels spin about their local X
  // axis, the correct lateral roll axis, and the build-frame +Y face becomes the OUTBOARD (+X)
  // face. Left-side wheels get the whole tire+rim assembly flipped back out via rotation.y = PI on
  // an inner group (see below) — never on the wheel group itself, whose quaternion syncMeshesToState owns.
  const TIRE_W  = 0.25                 // tire section width
  const HALF_W  = TIRE_W / 2
  const RIM_R   = params.rimRadius      // 16 in rim ≈ 0.406 m diameter — one source, shared with damage.js
  const DISC_T  = 0.012                // disc face thickness
  const DISC_Y  = HALF_W - 0.042       // inboard side of the disc — the dish: face sits ~30 mm in
  const wRad    = params.wheelRadius

  const tireParts = [
    new THREE.CylinderGeometry(wRad, wRad, TIRE_W, 24, 1, true),                     // tread band
    new THREE.RingGeometry(RIM_R, wRad, 24, 1).rotateX(-Math.PI / 2).translate(0, HALF_W, 0),
    // Inboard end, closed both ways: the +Y-facing disc is what the lightening holes look through
    // (dark, not sky), the -Y-facing one keeps the wheel solid when seen from under the truck.
    new THREE.CircleGeometry(wRad, 24).rotateX(-Math.PI / 2).translate(0, -HALF_W, 0),
    new THREE.CircleGeometry(wRad, 24).rotateX(Math.PI / 2).translate(0, -HALF_W - 0.001, 0),
  ]
  const tireGeom = mergeGeometries(tireParts.map((g) => (g.index ? g.toNonIndexed() : g)))
  tireGeom.rotateZ(-Math.PI / 2)

  // Disc face: one ExtrudeGeometry from a circular Shape with 5 circular holes punched in it, so
  // the perforation is real geometry (you see into the dark wheel well — no decal, no alpha).
  const discShape = new THREE.Shape().absarc(0, 0, RIM_R - 0.006, 0, Math.PI * 2)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5
    const hole = new THREE.Path().absarc(Math.cos(a) * 0.128, Math.sin(a) * 0.128, 0.042, 0, Math.PI * 2)
    discShape.holes.push(hole)
  }
  const discGeom = new THREE.ExtrudeGeometry(discShape, { depth: DISC_T, bevelEnabled: false, curveSegments: 16 })
  discGeom.rotateX(-Math.PI / 2).translate(0, DISC_Y, 0)   // extrude axis +Z -> +Y (outboard)

  // Barrel closes the gap between the recessed disc and the tire's outboard annulus — that visible
  // step of steel wall is what reads as a dished steel wheel.
  const rimParts = [
    discGeom,
    new THREE.CylinderGeometry(RIM_R, RIM_R, TIRE_W, 24, 1, true),   // meets the sidewall annulus
    new THREE.CylinderGeometry(0.052, 0.052, 0.022, 14).translate(0, DISC_Y + DISC_T + 0.011, 0),  // hub boss
  ]
  for (let i = 0; i < 5; i++) {                                                                    // lug nuts
    const a = (i / 5) * Math.PI * 2
    rimParts.push(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 6)
      .translate(Math.cos(a) * 0.068, DISC_Y + DISC_T + 0.007, Math.sin(a) * 0.068))
  }
  // mergeGeometries needs a uniform index state; ExtrudeGeometry is non-indexed, cylinders are not.
  const rimGeom = mergeGeometries(rimParts.map((g) => (g.index ? g.toNonIndexed() : g)))
  rimGeom.rotateZ(-Math.PI / 2)

  // ── Out-of-round wheel (SM-3) ───────────────────────────────────────────────
  // params.wheelRunout is PEAK-TO-PEAK radial runout, so the amplitude about the nominal radius is
  // A = runout/2, and suspension.js's RUNOUT_HARMONIC sets how many high spots carry it (2 = OVAL,
  // the shipped model). effectiveWheelRadius() makes the CONTACT radius follow that shape; this
  // bakes the SAME shape into the mesh, so the bulge you can see is the bulge being rolled on.
  //
  // BOTH the tire and the steel rim are deformed — a bent wheel, not just a bad tire. The rim is
  // what makes it legible: rubber has no hard edges, but an oval steel barrel and a swinging ring
  // of lightening holes are unmistakable, and they stay lit and visible where a black sidewall does
  // not. The tire is stretched over that rim and follows it, so the bead stays seated.
  //
  // ONE weight ramp, shared by both geometries, so they cannot tear apart at the bead:
  //
  //   w(r) = clamp((r − HUB_R) / (RIM_R − HUB_R), 0, 1)
  //
  // Zero out to HUB_R, which covers the hub boss and the whole lug circle: those bolt to the axle
  // flange and CANNOT be out of round — the axle still runs true, which is what keeps the physics
  // model honest (the hub CENTER never moves; only the metal and rubber around it). Full by RIM_R,
  // so the barrel, the bead and everything outboard of it — the entire tire carcass, tread included
  // — carry the whole amplitude rigidly. The disc face is caught mid-ramp, so the lightening holes
  // visibly orbit off-centre while the lug nuts sit dead still. That contrast IS the read.
  //
  // Four geometries each, not one shared: every corner carries its own RUNOUT_PHASE so the wheels
  // do not hop in lockstep, and that offset is a fixed rotation of the wheel, i.e. geometry.
  //
  // Vertex normals are deliberately NOT recomputed. At the 50 mm slider maximum the radial
  // displacement is 6.7% of the radius, tilting the true surface normal by a couple of degrees at
  // worst; recomputing on these non-indexed merged geometries would flat-shade the tread band and
  // pop the tire's shading the instant the slider left zero.
  //
  // The signed offset itself is carcassRadialOffset() in suspension.js — it lives next to
  // effectiveWheelRadius() because the two ARE one model, and its docblock carries the phase
  // derivation for the build frame / mirror / spin chain used here.
  const HUB_R = 0.085                  // axle-flange radius: clears the hub boss and the lug nuts

  const tireBase  = Float32Array.from(tireGeom.attributes.position.array)
  const rimBase   = Float32Array.from(rimGeom.attributes.position.array)
  const tireGeoms = [0, 1, 2, 3].map(() => tireGeom.clone())
  const rimGeoms  = [0, 1, 2, 3].map(() => rimGeom.clone())

  function deformWheelPart (geom, base, corner, runout) {
    const out = geom.attributes.position.array
    for (let v = 0; v < out.length; v += 3) {
      const y = base[v + 1]
      const z = base[v + 2]
      const r = Math.hypot(y, z)
      let s = 1
      if (runout && r > 1e-6) {
        const d = carcassRadialOffset(corner, Math.atan2(z, y), runout)
        const w = Math.min(1, Math.max(0, (r - HUB_R) / (RIM_R - HUB_R)))
        s = (r + w * d) / r
      }
      out[v + 1] = y * s
      out[v + 2] = z * s
    }
    geom.attributes.position.needsUpdate = true
    geom.computeBoundingSphere()
  }

  function applyWheelRunout (runout) {
    for (let c = 0; c < 4; c++) applyWheelRunoutAt(c, runout)
  }

  function applyWheelRunoutAt (corner, runout) {
    deformWheelPart(tireGeoms[corner], tireBase, corner, runout)
    deformWheelPart(rimGeoms[corner],  rimBase,  corner, runout)
    _bakedRunout[corner] = runout
  }

  // Last runout actually baked into each corner's geometry. Re-deforming rewrites every tread and
  // rim vertex, so it must not happen per frame — but SM-3 makes runout a function of WHEEL
  // CONDITION, which creeps as the truck is driven and cannot be baked once at build time either.
  // Re-bake only when a corner has actually moved, by enough to see.
  const _bakedRunout = [0, 0, 0, 0]
  const RUNOUT_REBAKE_M = 5e-4   // 0.5 mm — below this the change is invisible at any camera distance

  /** Re-bake any corner whose effective runout has drifted from what its mesh is currently showing. */
  function refreshWheelRunout (params) {
    for (let c = 0; c < 4; c++) {
      const want = wheelRunoutOf(c, params)
      if (Math.abs(want - _bakedRunout[c]) >= RUNOUT_REBAKE_M) applyWheelRunoutAt(c, want)
    }
  }

  const tireMat = new THREE.MeshStandardMaterial({ color: COLOR_TIRE, roughness: 0.95, metalness: 0 })
  // DoubleSide on the rim only: the dish recess shows the INSIDE of the barrel, which would
  // otherwise be culled away into a see-through slot. ~1k tris, so the backfaces cost nothing.
  const rimMat  = new THREE.MeshStandardMaterial({ color: COLOR_RIM, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide })

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
  // Each wheel is ONE Group (tire + rim children, shared geometry): syncMeshesToState writes the
  // group's position/quaternion exactly as it did the old single mesh, and the GLB import path
  // still hides a whole wheel with a single `.visible` toggle.
  applyWheelRunout(params.wheelRunout)

  const wheelMeshes = wheelLocalOffsets.map((offset, corner) => {
    const wheel = new THREE.Group()
    // Wheels are children of carGroup — position is in carGroup local space (body-relative).
    // carGroup carries world position and orientation; wheels follow automatically (Bug 5 fix).
    wheel.position.set(offset.x, offset.y, offset.z)
    const tire = new THREE.Mesh(tireGeoms[corner], tireMat)
    const rim  = new THREE.Mesh(rimGeoms[corner], rimMat)
    // Both geometries face outboard = +X, correct for the right-hand wheels. Mirror the WHOLE
    // assembly (tire is asymmetric too: open outboard annulus vs closed inboard caps) for the left
    // (negative X) side via an inner group, keeping the outer group's quaternion free for steer∘spin.
    const assembly = new THREE.Group()
    if (offset.x < 0) assembly.rotation.y = Math.PI
    tire.castShadow = true
    rim.castShadow = true
    assembly.add(tire, rim)
    wheel.add(assembly)
    carGroup.add(wheel)
    return wheel
  })

  // Scratch vectors reused each frame (avoid per-frame allocation churn).
  const _fwd = new THREE.Vector3()

  // Imported-model state. While modelActive, the OBJ owns the look: the procedural
  // body/wheels/lights are hidden and their per-frame updates are skipped (carGroup
  // transform still drives the model). paintMaterials are the OBJ's recolorable coats.
  let modelActive = false
  const paintMaterials = []
  const modelTailMats = []          // GLB rear-lamp materials, driven as tail/brake lights
  const modelReverseMats = []       // split-out rear white-lens materials, driven on reverse
  // (modelHeadMats declared earlier — front split of the white-lens material, driven as headlights)
  let pendingBodyColor = DEFAULT_BODY_COLOR

  // ── Mesh sync ──────────────────────────────────────────────────────────────
  // Called every render frame to update mesh transforms from vehicleState.
  // carGroup carries world position and quaternion — body and wheels inherit it (Bug 5 fix).
  // Do NOT use Euler rotation for body orientation (Pitfall 3 / CLAUDE.md).
  function syncMeshesToState (state) {
    // SM-3: a wheel bent by damage is visibly out of round, and its condition creeps while driving.
    // This is a no-op on all but the rare frame where a corner has actually changed (see the
    // 0.5 mm threshold), so the per-frame cost is four subtractions.
    refreshWheelRunout(params)

    // Sync carGroup transform — body and wheels inherit this automatically (Bug 5 fix).
    carGroup.position.copy(state.position)
    carGroup.quaternion.copy(state.quaternion)  // quaternion-only rotation, never Euler (GLOSSARY.md)

    // Per-wheel: spin, steer, and hub-Y visual travel in carGroup local space.
    // wheelLocalOffsets[i] provides rest position; Y is overridden each frame by hub deviation.
    for (let i = 0; i < 4; i++) {
      // Spin quaternion: wheel rolling axis is X (geometry was rotateZ(PI/2) at creation).
      // wheelPhase accumulates positive for forward roll (omega·r ≈ forward speed), but forward
      // roll is a NEGATIVE rotation about +X: positive X-rotation carries the tire top toward +Z,
      // which is rearward (forward = −Z). Negate here — visual only, physics owns the sign upstream.
      // The angle comes from wheelPhase (physics fixed step), NOT a render-rate accumulator: the
      // out-of-round high spot is baked into this tire's geometry, so the mesh has to sit at the
      // exact angle effectiveWheelRadius() was evaluated at. Wrapping to [0, 2π) is invisible here.
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(state.wheelPhase?.[i] ?? 0))

      // Steer (Y) carries static toe on every corner — rear wheels are only ever toed, never steered.
      const steerInput = i < 2
        ? (state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle)
        : 0
      const steer  = steerInput + toeOffset(i, params)
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer)
      // Camber leans the whole assembly about its forward axis (−Z), applied OUTSIDE steer+spin so
      // it reads as suspension geometry rather than something the wheel does as it turns. Same
      // signed lean physics.js uses, so what you see is what the tire model is actually doing.
      const lean = camberLean(i, params)
      const camberQ = lean !== 0
        ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), lean)
        : null
      wheelMeshes[i].quaternion.copy(steerQ).multiply(spinQ)
      if (camberQ) wheelMeshes[i].quaternion.premultiply(camberQ)

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
    const lightsRunning = headlightMode !== 0

    // Cast intensities (FEAT-14): scaled by the day/night factor so the pools are subtle by day and
    // bright at night. Driven here (not in applyHeadlights) so headlights pick up the live factor too.
    // Runs for both the primitive and GLB paths (the spots are carGroup children, model-independent).
    const castScale = LIGHT_ENV.dayScale + (1 - LIGHT_ENV.dayScale) * nightFactor
    const headCast = headlightMode === 0 ? 0 : (headlightMode === 2 ? HEAD_TUNE.highIntensity : HEAD_TUNE.lowIntensity)
    for (const s of headlightSpots) s.intensity = headCast * castScale
    const tailCast = braking ? REAR_TUNE.tailBrakeIntensity : (lightsRunning ? REAR_TUNE.tailRunIntensity : 0)
    for (const s of tailSpots) s.intensity = tailCast * castScale
    for (const s of reverseSpots) s.intensity = (reversing ? REAR_TUNE.reverseIntensity : 0) * castScale
    // PERF-21: a spotlight at intensity 0 still occupies the per-fragment spotlight loop of EVERY
    // lit material in the scene (terrain, all prop meshes, road, water) — 6 spots + 2 cookie samples
    // paid on every pixel with the lamps dark. visible=false removes them from the light state, so
    // the common lamps-off program has zero spotlights. The light-count program variants this
    // toggling switches between are precompiled at boot (prewarmLightPrograms) — after that a
    // toggle is just a cached-program bind, not the shader recompile the old design avoided.
    for (const s of headlightSpots) s.visible = s.intensity > 1e-4
    for (const s of tailSpots) s.visible = s.intensity > 1e-4
    for (const s of reverseSpots) s.visible = s.intensity > 1e-4

    if (modelActive) {
      // Imported model: drive the GLB rear-lamp material's emissive. Bright red on brake,
      // a dim glow as a running light when headlights are on, otherwise dark (the lens base
      // color stays red, so it still reads as a taillight when unlit).
      const tailEmis = braking ? TAIL_BRK : (lightsRunning ? TAIL_DIM : 0x000000)
      for (const m of modelTailMats) {
        m.emissive.setHex(tailEmis)
        m.emissiveIntensity = braking ? REAR_TUNE.lensBrake : (lightsRunning ? REAR_TUNE.lensRun : 0)
      }
      // Reverse lights: white lens glows when actually moving backward.
      for (const m of modelReverseMats) {
        m.emissive.setHex(reversing ? REV_ON : 0x000000)
        m.emissiveIntensity = reversing ? REAR_TUNE.lensReverse : 0
      }
      return
    }

    // Primitive-truck fallback: emissive panels reflect state through BOTH colour and brightness —
    // off (near-black, faint) → running (dim red) → brake (bright red). Reverse: off → bright white.
    const tailHex = braking ? TAIL_BRK : (lightsRunning ? TAIL_DIM : TAIL_OFF)
    const tailLensIntensity = braking ? REAR_TUNE.lensBrake : (lightsRunning ? REAR_TUNE.lensRun : 0.25)
    for (const m of taillightMats) {
      m.emissive.setHex(tailHex)
      m.color.setHex(tailHex)
      m.emissiveIntensity = tailLensIntensity
    }
    const revHex = reversing ? REV_ON : REV_OFF
    for (const m of reverseMats) {
      m.emissive.setHex(reversing ? REV_ON : 0x000000)
      m.color.setHex(revHex)
      m.emissiveIntensity = reversing ? REAR_TUNE.lensReverse : 0.25
    }
  }

  // ── Light tuning GUI (FEAT-14) ──────────────────────────────────────────────
  // Self-contained lil-gui folder (mirrors sky.js addGui). Rear intensities are read live each frame
  // in syncMeshesToState, so editing them needs no re-apply; headlight params do (applyHeadlights).
  function addLightGui (gui) {
    const f = gui.addFolder('Vehicle Lights (FEAT-14)')
    f.close()
    f.add({ cycle: () => { headlightMode = (headlightMode + 1) % 3; applyHeadlights() } }, 'cycle')
      .name('cycle headlights (L)')

    const reapply = () => applyHeadlights()
    // Day/night: how dim the CAST pools are in full daylight (0 = invisible, 1 = same as night).
    f.add(LIGHT_ENV, 'dayScale', 0, 1, 0.01).name('day cast scale')

    const h = f.addFolder('Headlights'); h.close()
    h.add(HEAD_TUNE, 'lensLow', 0, 4, 0.1).name('lens low').onChange(reapply)
    h.add(HEAD_TUNE, 'lensHigh', 0, 4, 0.1).name('lens high').onChange(reapply)
    h.add(HEAD_TUNE, 'lowIntensity', 0, 2000, 10).onChange(reapply)
    h.add(HEAD_TUNE, 'highIntensity', 0, 3000, 10).onChange(reapply)
    h.add(HEAD_TUNE, 'lowCutoff', 0.1, 0.9, 0.01).name('low beltline cutoff').onChange(() => lowCookie.redraw())
    // distance = hard range cap. NOTE: 0 (three's "infinite") collapses the spot-map projection frustum
    // and breaks the cookie mask, so keep it > 0. Sliders centred on 120.
    h.add(HEAD_TUNE, 'lowDistance', 20, 220, 1).name('low distance').onChange(reapply)
    h.add(HEAD_TUNE, 'highDistance', 20, 220, 1).name('high distance').onChange(reapply)
    h.add(HEAD_TUNE, 'lowAngle', 0.1, 1.4, 0.01).onChange(reapply)
    h.add(HEAD_TUNE, 'highAngle', 0.1, 1.4, 0.01).onChange(reapply)
    h.add(HEAD_TUNE, 'lowAimY', -8, 2, 0.1).onChange(reapply)
    h.add(HEAD_TUNE, 'highAimY', -8, 2, 0.1).onChange(reapply)
    h.add(HEAD_TUNE, 'decay', 0, 3, 0.1).onChange(() => {
      for (const s of headlightSpots) s.decay = HEAD_TUNE.decay
    })
    // Shadows are COSTLY: enabling them adds a full shadow-map render pass over every castShadow object
    // (the car + all instanced props) for EACH headlight, every frame, plus a one-time material
    // recompile when the shadow-light count changes. Off by default; use sparingly on weak GPUs.
    h.add(HEAD_TUNE, 'shadows').name('cast shadows (costly)').onChange((v) => {
      for (const s of headlightSpots) s.castShadow = v
    })

    const r = f.addFolder('Rear lamps'); r.close()
    r.add(REAR_TUNE, 'lensRun', 0, 5, 0.1).name('lens run')
    r.add(REAR_TUNE, 'lensBrake', 0, 6, 0.1).name('lens brake')
    r.add(REAR_TUNE, 'lensReverse', 0, 6, 0.1).name('lens reverse')
    r.add(REAR_TUNE, 'tailRunIntensity', 0, 300, 1)
    r.add(REAR_TUNE, 'tailBrakeIntensity', 0, 500, 1)
    r.add(REAR_TUNE, 'reverseIntensity', 0, 400, 1)
    r.add(REAR_TUNE, 'tailDistance', 2, 60, 1).onChange(() => { for (const s of tailSpots) s.distance = REAR_TUNE.tailDistance })
    r.add(REAR_TUNE, 'reverseDistance', 2, 60, 1).onChange(() => { for (const s of reverseSpots) s.distance = REAR_TUNE.reverseDistance })
    r.add(REAR_TUNE, 'decay', 0, 3, 0.1).onChange(() => {
      for (const s of tailSpots) s.decay = REAR_TUNE.decay
      for (const s of reverseSpots) s.decay = REAR_TUNE.decay
    })
    return f
  }

  // Set the day/night factor (0 = day, 1 = night) that scales the cast beams. Called each frame from
  // main.js with the sky system's nightFactor() so the pools dim by day and brighten at night.
  function setNightFactor (f) {
    nightFactor = f < 0 ? 0 : (f > 1 ? 1 : f)
  }

  // Recolor the body paint. Safe to call before the model finishes loading — the
  // color is remembered and applied to the paint materials on load.
  function setBodyColor (color) {
    pendingBodyColor = color
    for (const m of paintMaterials) m.color.set(color)
  }

  // ── Load the imported GLB (replaces the primitive truck on success) ─────────
  // Async + fault-tolerant: any failure leaves the primitive truck visible.
  new GLTFLoader().load(spec.url, (gltf) => {
    const root = gltf.scene
    // Orient first (game forward = -Z), then measure for auto scale + ground plant.
    root.rotation.y = spec.yaw || 0
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)   // post-rotation, pre-scale (scale=1)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    const s = (spec.targetLength / Math.max(size.x, size.z)) * (spec.bodyScale || 1) // longest axis = truck length, ×body scale
    root.scale.setScalar(s)
    // Center on the CG in X/Z; plant the model's bottom on the ground plane (y = -cgHeight).
    // Then apply the spec's fine-alignment offsets (rearward + down) relative to the wheels.
    root.position.set(
      -center.x * s,
      -params.cgHeight - box.min.y * s - (spec.shiftDown || 0),
      -center.z * s + (spec.shiftRear || 0)
    )

    const lensMeshes = []
    root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || typeof m.name !== 'string') continue
        if (spec.paint && m.name.includes(spec.paint)) paintMaterials.push(m)
        if (spec.tail && m.name.includes(spec.tail) && !modelTailMats.includes(m)) modelTailMats.push(m)
        if (spec.reverse && m.name.includes(spec.reverse.material)) lensMeshes.push(o)
      }
    })
    setBodyColor(pendingBodyColor)

    // Split the shared white-lens mesh into front (headlights) + rear (reverse) so each lights
    // independently — the rest of that material stays plain white. Then push current state in
    // (the lens mats didn't exist when applyHeadlights() first ran at construction).
    for (const m of lensMeshes) {
      const split = splitRearGroup(m, spec.reverse.rearZ)
      if (split) { modelReverseMats.push(split.rearMat); modelHeadMats.push(split.frontMat) }
    }
    applyHeadlights()

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

  /**
   * PERF-21: precompile the shader-program variants that light-visibility toggling switches
   * between (lamps off / brake tails / head+tail / all six). Spot visibility changes the light
   * count in every lit material's program — compiling those lazily would hitch the first brake
   * or headlight toggle of a session. Call once at boot, after the scene is populated; async
   * (KHR_parallel_shader_compile) so it never blocks a frame.
   */
  async function prewarmLightPrograms (renderer, scene, camera) {
    const all = [...headlightSpots, ...tailSpots, ...reverseSpots]
    const states = [
      tailSpots,                                          // braking, lamps off (daytime brake)
      [...headlightSpots, ...tailSpots],                  // lamps on (night driving)
      all,                                                // lamps on + reversing
      [],                                                 // everything off (daytime coasting)
    ]
    for (const on of states) {
      for (const s of all) s.visible = on.includes(s)
      try { await renderer.compileAsync(scene, camera) } catch (_) { /* prewarm is best-effort */ }
    }
    // syncMeshesToState re-asserts real visibility from intensities on the next frame.
  }

  return { carGroup, bodyMesh, wheelMeshes, syncMeshesToState, setBodyColor, applyWheelRunout, addLightGui, setNightFactor, prewarmLightPrograms }
}

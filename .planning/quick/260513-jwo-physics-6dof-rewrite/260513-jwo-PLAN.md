---
quick_task: 260513-jwo
slug: physics-6dof-rewrite
type: execute
wave: 1
depends_on: []
files_modified:
  - data/ranger.js
  - src/tire.js
  - src/physics.js
  - src/vehicle.js
  - src/main.js
autonomous: true
requirements: [physics-6dof-correctness]

must_haves:
  truths:
    - "Car does not sink through the ground (gravity balanced by Fn)"
    - "Car pitches and rolls correctly under weight transfer (Fn torque applied)"
    - "Ground impulse corrects both linear and angular velocity (no tumbling through floor)"
    - "Reverse speed matches forward speed (symmetric torque caps)"
    - "Wheel meshes follow body pitch and roll (scene-graph parenting)"
    - "Lateral force is slip-angle-based, not raw-velocity-damping (scales correctly at rest)"
  artifacts:
    - path: "data/ranger.js"
      provides: "maxReverseTorque and corneringStiffness fields"
      contains: "maxReverseTorque"
    - path: "src/tire.js"
      provides: "slip-angle lateral force"
      contains: "slipAngle"
    - path: "src/physics.js"
      provides: "corrected stepPhysics: Fn to totalForce.y, Fn torque, angular impulse, reverse torque"
      contains: "totalForce.y += Fn"
    - path: "src/vehicle.js"
      provides: "reverse uses maxReverseTorque not maxBrakeTorque"
      contains: "maxReverseTorque"
    - path: "src/main.js"
      provides: "carGroup scene-graph; wheels are children of carGroup"
      contains: "carGroup"
  key_links:
    - from: "src/physics.js getDriveTorque"
      to: "data/ranger.js maxReverseTorque"
      via: "params.maxReverseTorque"
    - from: "src/tire.js computeLateralForce"
      to: "src/physics.js latVel / longVel"
      via: "params._lateralVelocity, params._longitudinalVelocity"
    - from: "src/main.js carGroup"
      to: "vehicleState.position / quaternion"
      via: "carGroup.position.copy / carGroup.quaternion.copy in syncMeshesToState"
---

<objective>
Fix six diagnosed bugs in the RangerSim physics engine that collectively break 6DOF rigid body
simulation: gravity not balanced, no restoring torque, angular impulse missing from ground
contact, reverse 7.5x too fast, wheel meshes ignoring body tilt, and lateral force computed
from raw velocity instead of slip angle.

Purpose: Each bug compounds the others. Without Fn in totalForce.y the car sinks through the
ground permanently. Without the angular impulse fix the car tumbles through the floor on
contact. Without the slip-angle fix lateral forces are wrong at rest and do not scale with load.

Output: Corrected data/ranger.js, src/tire.js, src/physics.js, src/vehicle.js, src/main.js.
Same module exports, same call signatures, no new dependencies.
</objective>

<execution_context>
@/Users/ledogen/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/Users/ledogen/CodeShit/CarGame/CLAUDE.md
@/Users/ledogen/CodeShit/CarGame/data/ranger.js
@/Users/ledogen/CodeShit/CarGame/src/tire.js
@/Users/ledogen/CodeShit/CarGame/src/physics.js
@/Users/ledogen/CodeShit/CarGame/src/vehicle.js
@/Users/ledogen/CodeShit/CarGame/src/main.js

<interfaces>
<!-- Locked exports — signatures must not change (D-05, D-06). -->

From src/tire.js:
  computeLateralForce(slipAngle, Fz, params)  → number [N]
  computeLongitudinalForce(slipRatio, Fz, params) → number [N]

From src/suspension.js (unchanged):
  computeNormalForce(corner, vehicleState, params) → number [N]
  getWheelPosition(corner, vehicleState, params) → {x, y, z}

From src/physics.js:
  stepPhysics(vehicleState, params, dt) → void
  getDriveTorque(wheelIndex, vehicleState, params) → number [N·m]

From src/vehicle.js:
  updateVehicle(vehicleState, params, dt) → boolean
  SPAWN_STATE (const object)

params fields added by this task (ranger.js):
  params.corneringStiffness  [N/rad]
  params.maxReverseTorque    [N·m]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add maxReverseTorque and corneringStiffness to data/ranger.js</name>
  <files>data/ranger.js</files>
  <action>
    In RANGER_PARAMS, add two fields to the Drivetrain section:

      maxReverseTorque: 400,   // N·m — matches maxDriveTorque; used by getDriveTorque for reverse
      corneringStiffness: 50000,  // N/rad — linear tire lateral stiffness; used by computeLateralForce

    Place maxReverseTorque immediately after maxBrakeTorque with a comment that it replaces the
    erroneous maxBrakeTorque-for-reverse pattern (Bug 4).

    Place corneringStiffness in the Phase 1 Friction Placeholders section alongside
    lateralDampingCoeff. Update the section comment to note that lateralDampingCoeff is now
    unused but kept in the object so existing debug sliders do not break.

    Do NOT remove any existing fields. Do NOT freeze the object.
  </action>
  <verify>
    <automated>node -e "import('/Users/ledogen/CodeShit/CarGame/data/ranger.js').then(m => { const p = m.RANGER_PARAMS; console.assert(p.maxReverseTorque === 400, 'maxReverseTorque missing'); console.assert(p.corneringStiffness === 50000, 'corneringStiffness missing'); console.log('OK') })"</automated>
  </verify>
  <done>
    RANGER_PARAMS contains maxReverseTorque: 400 and corneringStiffness: 50000.
    Node import resolves without error.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix computeLateralForce in src/tire.js (Bug 6 — slip angle)</name>
  <files>src/tire.js</files>
  <action>
    Replace the body of computeLateralForce with a slip-angle-based linear tire model:

      const latVel  = params._lateralVelocity  || 0
      const longVel = params._longitudinalVelocity || 0
      const slipAngle = Math.atan2(-latVel, Math.abs(longVel) + 0.01)
      return -params.corneringStiffness * slipAngle

    The 0.01 denominator guard prevents division by zero at rest — this is intentional.
    The negation on latVel inside atan2 follows GLOSSARY.md §Slip Angle sign convention:
    positive slip angle when contact patch moves to wheel's left (negative lateral velocity),
    force then points right (positive) to resist the slip.

    Update the JSDoc @param block for slipAngle to say "Used in Phase 1 via atan2 from contact
    patch velocities" (it is now used, not ignored). Update the @returns to say the force is
    proportional to slip angle times corneringStiffness.

    Do NOT change the function signature. Do NOT import anything. Do NOT touch computeLongitudinalForce.
  </action>
  <verify>
    <automated>node -e "
import('/Users/ledogen/CodeShit/CarGame/src/tire.js').then(m => {
  // At rest: latVel=0, longVel=0 → slipAngle=0 → force=0
  const p0 = { corneringStiffness: 50000, _lateralVelocity: 0, _longitudinalVelocity: 0 }
  const f0 = m.computeLateralForce(0, 1000, p0)
  console.assert(Math.abs(f0) < 1e-6, 'zero at rest failed: ' + f0)

  // Moving forward with 1 m/s lateral slip → slipAngle ≈ atan2(-1, 10+0.01) ≈ -0.0995 rad
  // force ≈ 50000 * 0.0995 ≈ 4975 N (positive, pushes back against leftward slip)
  const p1 = { corneringStiffness: 50000, _lateralVelocity: 1, _longitudinalVelocity: 10 }
  const f1 = m.computeLateralForce(0, 1000, p1)
  console.assert(f1 > 4000 && f1 < 6000, 'expected ~4975 N, got: ' + f1)

  console.log('OK')
})"</automated>
  </verify>
  <done>
    computeLateralForce returns 0 when both velocity components are 0.
    Returns ~4975 N for latVel=1, longVel=10 (within 20% of theoretical).
    Assertion checks pass without error.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix stepPhysics in src/physics.js (Bugs 1, 2, 3) and getDriveTorque (Bug 4)</name>
  <files>src/physics.js</files>
  <action>
    Apply four targeted changes to physics.js. Make only these changes; do not restructure code
    that is not listed here.

    CHANGE A — Bug 4: Fix getDriveTorque reverse speed (lines 37-42 area).
    Replace:
      const brakeTorque = -vehicleState.brake * params.maxBrakeTorque
    With:
      // S key: reverse uses maxReverseTorque (symmetric to forward), not maxBrakeTorque (Bug 4 fix)
      const isReversing = !isRear || vehicleState.throttle === 0
      const brakeTorque = vehicleState.brake
        ? -(isRear ? params.maxReverseTorque : params.maxBrakeTorque / 4)
        : 0

    Wait — the simpler and correct interpretation per the task description is:
    When brake is held (S key), rear wheels drive backward at maxReverseTorque.
    Front wheels brake at maxBrakeTorque (they are not driven).
    The correct fix:

      const driveTorque = isRear ? vehicleState.throttle * params.maxDriveTorque : 0
      const brakeTorque = isRear
        ? -vehicleState.brake * params.maxReverseTorque
        : -vehicleState.brake * params.maxBrakeTorque

    This uses maxReverseTorque (400 N·m) for rear wheels in reverse, matching the forward
    drive torque, and keeps maxBrakeTorque (3000 N·m) for front-axle braking only.

    CHANGE B — Bug 1: Add Fn to totalForce.y inside the per-wheel loop.
    After the line that sets Fn (inside the `if (penetrationDepth > 0)` block), and AFTER
    the position correction and velocity clamp, add:
      totalForce.y += Fn   // Bug 1 fix: ground normal force balances gravity

    Place this immediately after `Fn = params.mass * 9.81 / 4` — still inside the if-block.

    CHANGE C — Bug 2: Add Fn restoring torque around body pitch/roll axes.
    After CHANGE B (still inside the Fn if-block), add:
      // Bug 2 fix: Fn torque produces restoring pitch and roll moments
      totalTorque.x -= rVec.z * Fn   // roll restoring: x-torque from z-offset * upward Fn
      totalTorque.z += rVec.x * Fn   // pitch restoring: z-torque from x-offset * upward Fn

    Note: rVec is not yet computed when Fn is set in the current code — Fn is computed before
    the rVec line. You must move the rVec computation to BEFORE the Fn block, or compute a
    provisional rVec for torque only. The simplest fix: move the rVec computation up to
    immediately after `const contactVec = new THREE.Vector3(...)`. Then the torque lines
    can reference rVec inside the Fn block.

    CHANGE D — Bug 3: Angular impulse in ground constraint (post-integration contact response).
    The current ground constraint only zeros velocity.y. Replace the block:
      if (vehicleState.velocity.y < 0) {
        vehicleState.velocity.y = 0
      }
      vehicleState.position.y += penetrationDepth
    With:
      vehicleState.position.y += penetrationDepth
      // Compute contact velocity in world Y at the contact point
      const vContactY = vehicleState.velocity.y +
        (vehicleState.angularVelocity.x * rVec.z - vehicleState.angularVelocity.z * rVec.x)
      if (vContactY < 0) {
        // Effective mass accounts for rotational inertia at contact point (Bug 3 fix)
        const mEff = 1 / (1 / params.mass +
          (rVec.z * rVec.z) / params.inertiaRoll +
          (rVec.x * rVec.x) / params.inertiaPitch)
        const Jy = -vContactY * mEff   // impulse magnitude [N·s]
        vehicleState.velocity.y        += Jy / params.mass
        vehicleState.angularVelocity.x += -rVec.z * Jy / params.inertiaRoll
        vehicleState.angularVelocity.z +=  rVec.x * Jy / params.inertiaPitch
      }

    Again, this block references rVec — ensure rVec is computed before the Fn/penetration block
    (as required by CHANGE C above).

    Correct final ordering in the per-wheel loop:
      a. contactPt = getWheelPosition(...)
      b. contactVec = new THREE.Vector3(contactPt.x, contactPt.y, contactPt.z)
      c. rVec = contactVec.clone().sub(vehicleState.position)   ← MOVED UP
      d. penetrationDepth = max(0, -contactPt.y)
      e. if penetrationDepth > 0:
           vehicleState.position.y += penetrationDepth
           vContactY = velocity.y + (angVel.x * rVec.z - angVel.z * rVec.x)
           if vContactY < 0:
             mEff, Jy, apply impulse to velocity.y and angularVelocity.x / .z
           Fn = mass * g / 4
           totalForce.y += Fn
           totalTorque.x -= rVec.z * Fn
           totalTorque.z += rVec.x * Fn
      f. contactVel = velocity + (angularVelocity × rVec)
      ... rest of loop unchanged

    Do NOT change the function signature of stepPhysics or getDriveTorque.
    Do NOT change quaternion integration logic.
    Do NOT add any new imports.
    Do NOT touch the _lateralVelocity / _longitudinalVelocity / _driveForce augmentation pattern.
  </action>
  <verify>
    <automated>node -e "
// Smoke test: verify physics.js and ranger.js import without error
Promise.all([
  import('/Users/ledogen/CodeShit/CarGame/src/physics.js'),
  import('/Users/ledogen/CodeShit/CarGame/data/ranger.js')
]).then(([phys, data]) => {
  console.assert(typeof phys.stepPhysics === 'function', 'stepPhysics missing')
  console.assert(typeof phys.getDriveTorque === 'function', 'getDriveTorque missing')
  const p = data.RANGER_PARAMS
  // Bug 4: reverse torque for rear wheel should use maxReverseTorque = 400
  const state = { throttle: 0, brake: 1, velocity: { x:0,y:0,z:0 }, angularVelocity: { x:0,y:0,z:0 }, steerAngle: 0, wheelAngles:[0,0,0,0], wheelSteerAngles:[0,0,0,0], position:{x:0,y:p.cgHeight,z:0}, quaternion:{x:0,y:0,z:0,w:1} }
  const rearTorque = phys.getDriveTorque(2, state, p)
  const fwdState = { throttle: 1, brake: 0, velocity: { x:0,y:0,z:0 }, angularVelocity: { x:0,y:0,z:0 }, steerAngle: 0, wheelAngles:[0,0,0,0], wheelSteerAngles:[0,0,0,0], position:{x:0,y:p.cgHeight,z:0}, quaternion:{x:0,y:0,z:0,w:1} }
  const fwdTorque = phys.getDriveTorque(2, fwdState, p)
  console.assert(Math.abs(rearTorque) === Math.abs(fwdTorque), 'Bug4: reverse != forward torque, rev=' + rearTorque + ' fwd=' + fwdTorque)
  console.log('OK — getDriveTorque symmetric: fwd=' + fwdTorque + ' rev=' + rearTorque)
})"</automated>
  </verify>
  <done>
    Import resolves without error.
    getDriveTorque returns equal magnitude for full throttle forward and full brake reverse on rear wheel.
    totalForce.y += Fn is present inside the per-wheel penetration block (grep confirms).
    totalTorque.x and totalTorque.z carry Fn contributions (grep confirms).
    Angular impulse block references mEff and Jy (grep confirms).
  </done>
</task>

<task type="auto">
  <name>Task 4: Fix reverse torque in src/vehicle.js — no change needed (confirm)</name>
  <files>src/vehicle.js</files>
  <action>
    Read vehicle.js. Confirm that updateVehicle does NOT call getDriveTorque directly —
    it only sets vehicleState.throttle and vehicleState.brake (lines 49-50). The torque
    routing fix is entirely inside getDriveTorque in physics.js (Task 3, CHANGE A).

    vehicle.js itself does not need modification for Bug 4. However, update the JSDoc
    comment for the brake line (line ~50) to note:
      // S key: sets brake=1; getDriveTorque uses maxReverseTorque for rear wheels (Bug 4 fix in physics.js)

    This documents that the asymmetry was fixed at the torque level, not the input level.
    No functional change to vehicle.js.
  </action>
  <verify>
    <automated>grep -n "maxReverseTorque\|maxBrakeTorque\|getDriveTorque" /Users/ledogen/CodeShit/CarGame/src/vehicle.js</automated>
  </verify>
  <done>
    vehicle.js does not call getDriveTorque or reference maxBrakeTorque/maxReverseTorque in
    functional code. JSDoc comment updated on the brake assignment line.
  </done>
</task>

<task type="auto">
  <name>Task 5: Fix syncMeshesToState in src/main.js (Bug 5 — carGroup scene-graph)</name>
  <files>src/main.js</files>
  <action>
    Replace the individual mesh scene management with a carGroup parent Object3D so that
    wheel meshes inherit the car body's position and quaternion automatically.

    STEP A — Create carGroup after the scene setup block (after `scene.add(grid)`):
      const carGroup = new THREE.Object3D()
      scene.add(carGroup)

    STEP B — Change bodyMesh from `scene.add(bodyMesh)` to `carGroup.add(bodyMesh)`.
    bodyMesh position should be set to local (0, 0, 0) — the body center IS the CG.
    In carGroup local space the body sits at the origin.

    STEP C — Change each wheelMesh from `scene.add(mesh)` to `carGroup.add(mesh)`.
    Wheel positions set in the wheelLocalOffsets map call must be in carGroup local space
    (body-relative), not world space. Update the initial mesh.position.set call:

      mesh.position.set(
        offset.x,
        wr - RANGER_PARAMS.cgHeight,   // wheel center is wr above ground; CG is cgHeight above ground
        offset.z
      )

    The Y offset wr - cgHeight places the wheel hub at the correct height relative to the CG
    origin of carGroup. wheelRadius = 0.368, cgHeight = 0.55, so offset Y = 0.368 - 0.55 = -0.182 m.

    STEP D — Rewrite syncMeshesToState to use carGroup for position and orientation:
      function syncMeshesToState (state) {
        // Sync group transform — body and wheels inherit this automatically (Bug 5 fix)
        carGroup.position.copy(state.position)
        carGroup.quaternion.copy(state.quaternion)

        // Per-wheel: spin and steer in local carGroup space
        for (let i = 0; i < 4; i++) {
          // wheelLocalOffsets[i] is already in carGroup local space; no re-apply needed
          // Spin: set rotation.x (the rolling axis after the rotateZ(PI/2) in geometry setup)
          wheelMeshes[i].rotation.x = state.wheelAngles[i]

          // Steer: front wheels only, rotate around local Y (body up in carGroup space = Y)
          if (i < 2) {
            const steer = state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle
            const steerQ = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),   // local Y — body up in carGroup space
              steer
            )
            // Reset to identity first, then apply steer; do not accumulate body rotation
            wheelMeshes[i].quaternion.copy(steerQ)
          } else {
            wheelMeshes[i].quaternion.identity()
          }
        }
      }

    Note: In carGroup local space, the steer axis is always local (0,1,0) — no need to
    transform the body up vector via state.quaternion because carGroup already carries that
    rotation. This simplifies the steer quaternion computation and is correct.

    STEP E — Ensure wheelLocalOffsets uses the corrected Y offset (wheel center in local space):
      The existing wheelLocalOffsets array uses Y=0 for all wheels. Update to use the body-relative
      wheel center height: new THREE.Vector3(x, wr - RANGER_PARAMS.cgHeight, z) for all four entries.
      The wheelRadius (wr) constant and cgHeight are already computed before the array.

    Do NOT change the game loop. Do NOT change updateCamera or initDebug.
    Do NOT add imports — THREE.Object3D is already available via `import * as THREE from 'three'`.
  </action>
  <verify>
    <automated>grep -n "carGroup\|Object3D" /Users/ledogen/CodeShit/CarGame/src/main.js</automated>
  </verify>
  <done>
    main.js contains `const carGroup = new THREE.Object3D()`.
    carGroup.add(bodyMesh) and carGroup.add(mesh) present for all five meshes.
    syncMeshesToState sets carGroup.position and carGroup.quaternion (not bodyMesh directly).
    wheelMeshes[i].quaternion uses local (0,1,0) steer axis, not a world-space up computation.
    grep shows at least 6 references to carGroup.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user input → vehicleState | Keyboard events set throttle/brake [0,1] and steerAngle [rad]; values clamped in vehicle.js |
| physics integrator → mesh sync | vehicleState.position/quaternion written by stepPhysics; read by syncMeshesToState |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jwo-01 | Denial of Service | stepPhysics fixed-timestep loop | accept | MAX_FRAME_TIME = 0.25s clamp already present; no new DoS surface introduced by this rewrite |
| T-jwo-02 | Tampering | params object mutation via debug sliders | accept | Single-threaded JS; params mutations are intentional for debug tuning; no auth or state integrity concern in a local simulator |
| T-jwo-03 | Elevation of Privilege | N/A | accept | Browser-only, no server, no credentials, no privilege model |
</threat_model>

<verification>
After all tasks complete, open the sim in a browser and verify:

1. Car spawns at ground level and holds position — does not sink or float (Bug 1+2 fixed).
2. Pressing W accelerates forward; pressing S accelerates backward at the same rate (Bug 4 fixed).
3. Pressing A or D at speed produces visible yaw and visible wheel steering; car corners (Bug 6).
4. Tilting the car (e.g., driving over an edge or spawning at an angle) — body rolls and wheels
   follow the tilt, not hardcoded to ground plane Y (Bug 5 fixed).
5. Resetting with R restores the car to a stable upright spawn position.
</verification>

<success_criteria>
- data/ranger.js exports maxReverseTorque: 400 and corneringStiffness: 50000
- src/tire.js computeLateralForce uses atan2 slip angle, returns 0 at rest, non-zero under lateral velocity
- src/physics.js: totalForce.y accumulates Fn each grounded wheel; totalTorque accumulates r×Fn components; angular impulse applied via mEff on ground contact; rear-wheel reverse uses maxReverseTorque
- src/main.js: carGroup Object3D is parent of bodyMesh and all wheelMeshes; syncMeshesToState drives carGroup.position and carGroup.quaternion
- No module export signatures changed
- Browser console shows no import errors on load
</success_criteria>

<output>
After completion, create `.planning/quick/260513-jwo-physics-6dof-rewrite/260513-jwo-SUMMARY.md`
with what was done, files changed, and any deviations from this plan.
</output>

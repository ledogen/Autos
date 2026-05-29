---
phase: quick
plan: 260528-wtt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/physics.js
  - src/tire.js
  - src/logger.js
autonomous: true
requirements: [CR-01, CR-02, CR-03, CR-04]

must_haves:
  truths:
    - "Angular velocity integration divides by the correct inertia for each axis (X→roll, Y→yaw, Z→pitch)"
    - "computeLateralForce uses its slipAngle parameter; caller passes a real computed slip angle"
    - "Reverse throttle braking applies only to rear wheels (isRear guard present in both throttle paths)"
    - "URL.revokeObjectURL always executes after createObjectURL regardless of whether a.click() throws"
  artifacts:
    - path: "src/physics.js"
      provides: "Corrected inertia axis mapping and isRear guard in getDriveTorque"
      contains: "inertiaRoll"
    - path: "src/tire.js"
      provides: "computeLateralForce body that uses its slipAngle parameter"
    - path: "src/logger.js"
      provides: "_downloadLog with try/finally around blob URL lifecycle"
---

<objective>
Fix four code-review criticals in RangerSim physics and infrastructure.

Purpose: CR-01 and CR-03 are physics correctness bugs that produce wrong forces on every frame. CR-02 makes the slip-angle lateral model inert (parameter always ignored, caller always passes 0). CR-04 is a resource leak in the frame logger download path.
Output: Patched src/physics.js, src/tire.js, and src/logger.js with no behavioural regressions in logger or drivetrain logic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/GLOSSARY.md
@data/ranger.js
</context>

<interfaces>
<!-- Key facts extracted from source files. No codebase exploration needed. -->

From data/ranger.js (inertia naming, ranger.js lines 29-31):
  inertiaRoll  = Ixx — rotation about X axis  (~800 kg·m²)
  inertiaPitch = Iyy — rotation about Y axis  (~3300 kg·m²)  ← GLOSSARY says Y = yaw; see CR-01 note
  inertiaYaw   = Izz — rotation about Z axis  (~3700 kg·m²)

CR-01 clarification — the CR description says:
  X → inertiaRoll, Y → inertiaYaw, Z → inertiaPitch
This matches Three.js Y-up where roll (tilting about the longitudinal axis) is X, yaw is Y, pitch is Z.
The ranger.js comment "inertiaPitch (Iyy)" uses an SAE-style Iyy label that does NOT match the Three.js
axis assignments in this project. The CR's explicit axis-to-field mapping is authoritative.

Current physics.js line 193-195 (wrong):
  angularVelocity.x += totalTorque.x / params.inertiaPitch * dt
  angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  angularVelocity.z += totalTorque.z / params.inertiaRoll  * dt

Fixed (per CR-01):
  angularVelocity.x += totalTorque.x / params.inertiaRoll  * dt
  angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  angularVelocity.z += totalTorque.z / params.inertiaPitch * dt

Current physics.js getDriveTorque (CR-03 bug, line 43):
  if (longVel < -DRIVE_DEAD_ZONE) return vehicleState.throttle * params.maxBrakeTorque
  // missing isRear guard — all four wheels get brake torque in reverse-throttle path

Fixed:
  if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxBrakeTorque : 0

Current tire.js computeLateralForce (CR-02 bug, lines 40-49):
  - slipAngle parameter is ignored
  - slipAngleCalc computed internally from params._lateralVelocity / params._longitudinalVelocity
  - caller in physics.js always passes 0 as slipAngle

Fixed tire.js: remove internal atan2 recomputation; use slipAngle parameter directly.
Fixed caller (physics.js line 148): compute slip angle and pass it:
  const slipAngle = Math.atan2(params._lateralVelocity || 0, Math.abs(params._longitudinalVelocity || 0) + 0.01)
  const Flat = computeLateralForce(slipAngle, Fn, params)
Keep the dead-zone speed gate (|v| < 0.2 m/s → return 0) in computeLateralForce; it guards against
atan2 singularity at rest and should remain inside the function.

Current logger.js _downloadLog (CR-04 bug, lines 45-52):
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '...'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)   // ← skipped if a.click() throws

Fixed: wrap click + removeChild + revokeObjectURL in try/finally so revokeObjectURL always runs.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: CR-01 and CR-03 — Fix physics.js inertia axes and isRear guard</name>
  <files>src/physics.js</files>
  <action>
    Two targeted edits in physics.js — do not alter any other lines.

    CR-01 (line 193-195): Swap inertia fields so each axis divides by its correct moment:
      angularVelocity.x uses params.inertiaRoll  (X-axis = roll)
      angularVelocity.y uses params.inertiaYaw   (Y-axis = yaw, unchanged)
      angularVelocity.z uses params.inertiaPitch (Z-axis = pitch)

    CR-03 (getDriveTorque, line 43): Add isRear guard to the reverse-throttle path.
    Current: `if (longVel < -DRIVE_DEAD_ZONE) return vehicleState.throttle * params.maxBrakeTorque`
    Fixed:   `if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxBrakeTorque : 0`

    The forward-braking path (longVel > DRIVE_DEAD_ZONE) already has no isRear guard and is not part
    of this CR — do not change it. Only the reverse-throttle line changes.
  </action>
  <verify>
    <automated>
      grep -n "inertiaRoll\|inertiaPitch\|inertiaYaw" /Users/ledogen/CodeShit/CarGame/src/physics.js
      # Expected output shows:
      #   angularVelocity.x line contains inertiaRoll
      #   angularVelocity.y line contains inertiaYaw
      #   angularVelocity.z line contains inertiaPitch
      grep -n "DRIVE_DEAD_ZONE" /Users/ledogen/CodeShit/CarGame/src/physics.js
      # Expected: the longVel < -DRIVE_DEAD_ZONE line includes isRear ? ... : 0
    </automated>
  </verify>
  <done>
    physics.js Step 5 inertia lines use inertiaRoll/inertiaYaw/inertiaPitch on X/Y/Z respectively.
    getDriveTorque reverse-throttle path returns 0 for front wheels.
  </done>
</task>

<task type="auto">
  <name>Task 2: CR-02 — Remove internal slip-angle recomputation in tire.js; fix caller in physics.js</name>
  <files>src/tire.js, src/physics.js</files>
  <action>
    Two edits, one in each file.

    src/tire.js — computeLateralForce body:
    Remove lines 40-45 (the internal latVel/longVel extraction and slipAngleCalc atan2). Replace with:
      1. Dead-zone guard: read params._lateralVelocity and params._longitudinalVelocity to compute speed
         magnitude; if below 0.2 m/s return 0 (atan2 singularity guard stays here).
      2. Use the slipAngle parameter directly: `const raw = -params.corneringStiffness * slipAngle`
      3. Keep the friction cap (maxFlat = frictionCoeff * Fz, clamp raw to ±maxFlat).
    Update the JSDoc @param note for slipAngle to remove the "Phase 1 uses atan2 internally" text
    since that is no longer true.

    src/physics.js — caller at line 148:
    Before calling computeLateralForce, compute the slip angle from the already-set params fields:
      const latVel  = params._lateralVelocity  || 0
      const longVel = params._longitudinalVelocity || 0
      const slipAngle = Math.atan2(latVel, Math.abs(longVel) + 0.01)
    Then call: computeLateralForce(slipAngle, Fn, params)

    The sign convention (positive latVel → positive slipAngle → negative Flat via the minus sign in
    corneringStiffness multiplication) is unchanged from the pre-CR code; we are only moving the
    computation to the correct call site.
  </action>
  <verify>
    <automated>
      grep -n "slipAngleCalc\|atan2.*latVel" /Users/ledogen/CodeShit/CarGame/src/tire.js
      # Expected: no matches (internal recomputation removed)
      grep -n "slipAngle" /Users/ledogen/CodeShit/CarGame/src/tire.js
      # Expected: only the parameter name and its use in the raw = line
      grep -n "computeLateralForce" /Users/ledogen/CodeShit/CarGame/src/physics.js
      # Expected: call site now passes a computed slipAngle variable, not literal 0
    </automated>
  </verify>
  <done>
    computeLateralForce uses its slipAngle parameter for the force calculation.
    The caller in physics.js computes and passes the correct slip angle.
    Dead-zone guard and friction cap remain functional.
  </done>
</task>

<task type="auto">
  <name>Task 3: CR-04 — Wrap blob URL lifecycle in try/finally in logger.js</name>
  <files>src/logger.js</files>
  <action>
    Edit _downloadLog to guarantee URL.revokeObjectURL runs even if a.click() throws.

    Restructure the function body after `const url = URL.createObjectURL(blob)` as:
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = 'rangersim-log-' + Date.now() + '.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } finally {
        URL.revokeObjectURL(url)
      }

    The blob construction and URL creation remain outside the try block (if blob creation fails,
    there is no URL to revoke). Do not alter any other part of logger.js.
  </action>
  <verify>
    <automated>
      grep -n "revokeObjectURL\|try\|finally" /Users/ledogen/CodeShit/CarGame/src/logger.js
      # Expected: revokeObjectURL appears inside a finally block, not after a.click()
    </automated>
  </verify>
  <done>
    _downloadLog has a try/finally block.
    URL.revokeObjectURL is called in the finally branch.
    All other logger.js behaviour is unchanged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| logger.js → browser Blob API | createObjectURL output is a temporary browser resource that must be released |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wtt-01 | Denial of Service | _downloadLog blob URL leak | mitigate | try/finally ensures revokeObjectURL always runs (CR-04) |
</threat_model>

<verification>
After all tasks complete:
1. Open index.html in a local HTTP server (npx serve .) and drive the car forward then release throttle — car should decelerate smoothly.
2. Apply throttle while reversing — only rear wheels should receive braking force (no front-wheel torque spike); yaw response should be stable.
3. Steer at speed — lateral force should build proportional to slip angle (identical behaviour to pre-CR since computation is equivalent, just relocated).
4. Press \ to start recording, drive briefly, press \ again — log JSON downloads; no revokeObjectURL skips (check browser DevTools for blob URL warnings).
</verification>

<success_criteria>
- physics.js inertia axes: X line references inertiaRoll, Z line references inertiaPitch.
- getDriveTorque: reverse-throttle branch has isRear guard, front wheels return 0.
- computeLateralForce: slipAngle parameter is used; no internal atan2 recomputation present.
- logger.js _downloadLog: revokeObjectURL is inside a finally block.
</success_criteria>

<output>
After completion, create `.planning/quick/260528-wtt-fix-physics-cr-bugs/260528-wtt-SUMMARY.md`
</output>

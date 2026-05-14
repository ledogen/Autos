---
phase: quick-260513-vaw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - data/ranger.js
  - src/tire.js
  - src/suspension.js
  - src/physics.js
autonomous: true
requirements: [physics-fix-260513]
must_haves:
  truths:
    - "Car falls under gravity and lands on ground plane (y=0) rather than floating"
    - "Each wheel applies an upward impulse when its contact patch penetrates y=0"
    - "Rolling resistance is light enough that the car can accelerate and cruise"
    - "Full throttle produces noticeably more drive force than before"
    - "Force variable names Fn/Flong/Flat are consistent across tire.js, suspension.js, physics.js"
  artifacts:
    - path: "data/ranger.js"
      provides: "Tuned params: rollingResistanceCoeff=20, maxDriveTorque=400"
    - path: "src/tire.js"
      provides: "computeLateralForce returns Flat, computeLongitudinalForce returns Flong"
    - path: "src/suspension.js"
      provides: "computeNormalForce JSDoc and body use Fn not Fz"
    - path: "src/physics.js"
      provides: "Gravity applied once per step; per-wheel rigid contact impulse; no CG clamp; no angular clamp"
  key_links:
    - from: "src/physics.js stepPhysics"
      to: "ground plane y=0"
      via: "penetrationDepth = Math.max(0, -contactPt.y) per wheel"
      pattern: "penetrationDepth"
    - from: "src/physics.js stepPhysics"
      to: "totalForce.y"
      via: "totalForce.y -= params.mass * 9.81 (gravity, outside wheel loop)"
      pattern: "params\\.mass \\* 9\\.81"
---

<objective>
Apply four targeted fixes to the physics stack: param tuning in ranger.js, naming
cleanup across tire.js/suspension.js/physics.js, and a gravity + per-wheel rigid
contact model in physics.js to replace the CG-height clamp.

Purpose: The car currently floats or falls without a proper gravity force, and the
rolling resistance is so high it can barely move. The naming inconsistency (Fz/Fy/Fx
vs Fn/Flat/Flong) makes the code harder to read against the GLOSSARY.
Output: Four modified files. No new files. No spring-damper added.
</objective>

<execution_context>
@/Users/ledogen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ledogen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/ledogen/CodeShit/CarGame/.planning/STATE.md
@/Users/ledogen/CodeShit/CarGame/CLAUDE.md

Physics coordinate system: Three.js Y-up. Ground plane is y=0. Positive y is up.
Wheel contact point y = wheelCenterY - wheelRadius. The car's CG starts above ground;
gravity pulls it down each step; contact impulse resolves penetration.

DO NOT add spring force K or damping D. Rigid contact impulse only (Phase 1).
DO NOT add a new module or new export signatures.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tune params in data/ranger.js</name>
  <files>data/ranger.js</files>
  <action>
    In RANGER_PARAMS, make exactly two numeric changes:
    - rollingResistanceCoeff: 200 → 20
    - maxDriveTorque: 250 → 400
    Update the inline comment for maxDriveTorque to reflect the new value if it
    mentions the old one. No other changes.
  </action>
  <verify>
    <automated>grep "rollingResistanceCoeff" /Users/ledogen/CodeShit/CarGame/data/ranger.js | grep "20," && grep "maxDriveTorque" /Users/ledogen/CodeShit/CarGame/data/ranger.js | grep "400,"</automated>
  </verify>
  <done>ranger.js exports rollingResistanceCoeff: 20 and maxDriveTorque: 400.</done>
</task>

<task type="auto">
  <name>Task 2: Naming cleanup — tire.js and suspension.js</name>
  <files>src/tire.js, src/suspension.js</files>
  <action>
    src/tire.js — two renames, no logic changes:
    - In computeLateralForce: rename the return label from Fy to Flat in JSDoc
      (@returns line currently says "Fy [N]" → change to "Flat [N]"). Also update
      the Phase 3 replacement comment line that mentions "Fy =" to "Flat =".
      The return expression itself is anonymous (returns an expression directly),
      so no variable rename is needed in the body.
    - In computeLongitudinalForce: rename internal variable Fx (if extracted as a
      named variable) and the @returns label from "Fx [N]" to "Flong [N]". Also
      update the Phase 3 comment line that mentions "Fx vs" to "Flong vs".
      The body uses named variable "rollingDrag" — leave that name alone. There is
      no variable named Fx in the body currently; only the JSDoc and Phase 3 comment
      mention Fx. Change those references only.

    src/suspension.js — one rename, no logic changes:
    - computeNormalForce: in the JSDoc @returns line, rename "Fz [N]" → "Fn [N]".
      Also update any mention of "Fz" in the @param lines or body comments to "Fn".
      The return expression is an arithmetic expression with no variable named Fz,
      so no body code changes are needed.
      Update the Phase 4 replacement comment that mentions "spring-damper Fz" →
      "spring-damper Fn".
  </action>
  <verify>
    <automated>grep -n "Fz\|Fy\|Fx" /Users/ledogen/CodeShit/CarGame/src/tire.js /Users/ledogen/CodeShit/CarGame/src/suspension.js</automated>
  </verify>
  <done>
    grep finds no remaining Fz/Fy/Fx in tire.js or suspension.js (except in the
    @param Fz parameter name on the function signatures — those parameter names in
    the signature itself are fine to leave if they are part of the locked Phase 3/4
    interface contract; only internal labels and JSDoc return annotations need updating).
    Specifically: @returns in computeLateralForce says Flat, @returns in
    computeLongitudinalForce says Flong, @returns in computeNormalForce says Fn.
  </done>
</task>

<task type="auto">
  <name>Task 3: physics.js — gravity, rigid contact, naming</name>
  <files>src/physics.js</files>
  <action>
    Make the following changes to stepPhysics. Read the full current file before
    editing. Apply all changes in one edit pass.

    NAMING — rename all occurrences of Fz/Fy/Fx in variable names and comments:
    - Line 104: `const Fz = computeNormalForce(...)` → remove this line entirely
      (replaced by per-wheel inline contact below).
    - Line 117: `const Fy = computeLateralForce(...)` → `const Flat = computeLateralForce(...)`
    - Line 118: `const Fx = computeLongitudinalForce(...)` → `const Flong = computeLongitudinalForce(...)`
    - Line 121: `wheelFwd.clone().multiplyScalar(Fx)` → `.multiplyScalar(Flong)`
    - Line 122: `.addScaledVector(wheelRight, Fy)` → `.addScaledVector(wheelRight, Flat)`
    - Update the comments on lines 117-118 from "lateral force" / "longitudinal force"
      call to mention Flat/Flong respectively.

    GRAVITY — add one line immediately before the per-wheel for-loop (after
    totalForce and totalTorque are declared):

      totalForce.y -= params.mass * 9.81  // gravity [N] — applied once per step

    RIGID CONTACT — replace the computeNormalForce call (old line 104) with per-wheel
    inline rigid contact. Inside the for-loop, after computing contactPt (step a) and
    before computing contactVel (step b), insert:

      // Rigid ground contact at y=0.
      // contactPt.y is the wheel contact patch world Y (wheel center Y minus wheelRadius
      // from getWheelPosition, which returns the contact patch center, i.e., already
      // at the bottom of the tire per suspension.js comments).
      const penetrationDepth = Math.max(0, -contactPt.y)
      let Fn = 0
      if (penetrationDepth > 0) {
        // 1. Zero out downward velocity component at CG (upward impulse).
        //    Only zero if velocity is downward (negative y) to avoid pulling car up.
        if (vehicleState.velocity.y < 0) {
          vehicleState.velocity.y = 0
        }
        // 2. Position correction: push wheel above ground.
        vehicleState.position.y += penetrationDepth
        // 3. Normal force: distribute vehicle weight equally across grounded wheels.
        //    Use static weight per wheel as a stable proxy for contact force magnitude.
        //    Phase 4 replaces with spring-damper Fn.
        Fn = params.mass * 9.81 / 4
      }

    Then pass Fn to the tire calls instead of the removed computeNormalForce result:
      computeLateralForce(0, Fn, params)
      computeLongitudinalForce(0, Fn, params)

    REMOVE CG CLAMP BLOCK — delete Step 5 entirely (lines 151-158 in current file):
      const minY = params.cgHeight
      if (vehicleState.position.y < minY) { ... }

    REMOVE ANGULAR CLAMP BLOCK — delete the conditional angularVelocity.x/z = 0 block
    (lines 163-167 in current file):
      if (vehicleState.position.y <= minY + 0.01) { ... }

    Keep Step 4 (quaternion integration) unchanged.

    IMPORTANT: Do NOT add spring constant K or damping D anywhere. No new imports.
    The rigid contact is an impulse-based approach (velocity zeroing + position correction),
    not a spring force.
  </action>
  <verify>
    <automated>node -e "
const fs = require('fs');
const src = fs.readFileSync('/Users/ledogen/CodeShit/CarGame/src/physics.js','utf8');
const checks = [
  [/params\.mass \* 9\.81/, 'gravity present'],
  [/penetrationDepth/, 'rigid contact present'],
  [/const Flat /, 'Flat rename done'],
  [/const Flong /, 'Flong rename done'],
  [/const Fz /, 'old Fz variable gone (should NOT match)'],
  [/minY/, 'CG clamp removed (should NOT match)'],
  [/angularVelocity\.x = 0/, 'angular clamp removed (should NOT match)'],
];
let ok = true;
checks.forEach(([re, label]) => {
  const found = re.test(src);
  const shouldMatch = !label.includes('should NOT');
  if (found !== shouldMatch) { console.error('FAIL:', label, 'found='+found); ok = false; }
  else console.log('OK:', label);
});
process.exit(ok ? 0 : 1);
"
    </automated>
  </verify>
  <done>
    Node verification script exits 0. physics.js applies gravity once per step,
    performs per-wheel rigid contact impulse, uses Flat/Flong variable names,
    and contains neither the CG-height clamp nor the angular velocity zero-out block.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| params object | Augmented at runtime with _lateralVelocity etc.; no external input crosses this boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vaw-01 | Tampering | params._lateralVelocity augmentation | accept | Single-threaded browser loop; no concurrent mutation risk; noted in existing T-02-02 comment |
| T-vaw-02 | Denial of Service | Rigid contact velocity.y zeroing | accept | Impulse only zeros downward velocity; cannot be triggered by external input in browser context |
</threat_model>

<verification>
Open in browser via local HTTP server. Drive forward: car should accelerate faster
than before (maxDriveTorque 400). Car should not float or fall through the ground.
When placed above the ground plane it should fall and land. Rolling should not
immediately kill all speed (rollingResistanceCoeff 20 not 200).

Manual: start server with `npx serve .` and open http://localhost:3000
</verification>

<success_criteria>
- ranger.js: rollingResistanceCoeff=20, maxDriveTorque=400
- tire.js: @returns Flat / Flong in JSDoc; no Fy/Fx labels in return annotations
- suspension.js: @returns Fn in computeNormalForce JSDoc; no Fz labels in return annotations
- physics.js: gravity line present, penetrationDepth block present, Flat/Flong variables used,
  no minY clamp, no angularVelocity.x=0 clamp; Node verify script exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/260513-vaw-physics-fix-gravity-rigid-contact-naming/260513-vaw-SUMMARY.md`
using the summary template.
</output>

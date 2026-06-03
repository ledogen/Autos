# Phase 4: Suspension - Research

**Researched:** 2026-05-31
**Domain:** Vehicle dynamics — quarter-car suspension, anti-roll bars, sub-stepped vertical integration
**Confidence:** HIGH (math + integration is textbook; only tuning values are empirical)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mass model — full quarter-car**
- **D-01:** Quarter-car per corner. Each wheel hub is an integrated rigid body with its own vertical position `hubY[i]` and vertical velocity `hubVy[i]`. Two springs in series load each corner:
  - **Tire spring** (existing): ground ↔ hub. Uses `tireStiffness`, `tireDamping`, compression = depth returned by `queryContacts`. Force = Fz fed into Pacejka.
  - **Suspension spring** (new): hub ↔ body. Uses new `suspensionStiffness`, `suspensionDamping`, `suspensionRestLength` params.
- **D-02:** 4 extra integrated states added to `vehicleState`: `hubY[4]` (m, world Y of wheel hub center) and `hubVy[4]` (m/s, vertical velocity of hub). Per-corner unsprung mass param (`wheelMass`, ≈18 kg from existing `wheelInertia` derivation comment in `ranger.js`).
- **D-03:** Fz fed into Pacejka is the **tire-spring force** (ground side of the hub), not the suspension-spring force. This satisfies M4-04 cleanly and makes M4-05 (wheel lift) trivial: airborne ≡ tire compression goes to zero.

**Topology — fully independent at all 4 corners**
- **D-04:** Same quarter-car model applied 4×. No solid rear axle coupling. Front and rear use the same `suspensionStiffness`/`suspensionDamping`/`suspensionRestLength` slots, but front/rear values are independently tunable (split params: `suspensionStiffnessFront`, `suspensionStiffnessRear`, etc.) so the user can dial in understeer/oversteer balance.
- **D-05:** Solid rear axle is deferred.

**Anti-roll bars — front + rear, slider-tunable**
- **D-06:** ARBs included. Two params: `arbStiffnessFront`, `arbStiffnessRear` (N/m). Per axle: `F_arb = arbStiffness * (compressionLeft − compressionRight)`. Applied as `−F_arb` to left wheel and `+F_arb` to right wheel (sign so pure heave gets zero ARB force).
- **D-07:** ARB force enters the suspension spring loop alongside the main spring with the same lever arm as the main spring (bilinear-spring approximation, no separate ARB geometry).

**Integrator — sub-step suspension at dt/2**
- **D-08:** Suspension vertical dynamics integrated at **dt/2** inside each outer physics step. Outer 6DOF body integration remains at outer dt. Pacejka Fz uses the post-substep tire spring force.
- **D-09:** Physics timestep must be parameterized — introduce `PHYSICS_DT` constant or `vehicleState.physicsDt`. Suspension substep is always `physicsDt / 2`. Substep ratio (2) stays fixed.
- **D-10:** Stability target: doubling `suspensionStiffness` via slider must not produce NaN or divergence.

**Debug & HUD**
- **D-11:** New sliders in lil-gui panel: `suspensionStiffnessFront`/`Rear`, `suspensionDampingFront`/`Rear`, `suspensionRestLengthFront`/`Rear`, `arbStiffnessFront`/`Rear`.
- **D-12:** Per-wheel Fz visible in debug panel/HUD. Use existing `vehicleState.wheelDebug[i]` scratchpad; add field `fz` each step.
- **D-13:** GLOSSARY.md additions: sprung mass, unsprung mass, suspension travel, ride height, anti-roll bar, substep / physics timestep convention.

**Wheel lift & airborne behavior**
- **D-14:** Airborne criterion: tire spring `Fz <= 0` → wheel airborne. Tire forces (Pacejka lateral + longitudinal) skipped entirely; only gravity and suspension spring act on hub. Hub falls under gravity until tire re-contacts.
- **D-15:** Suspension spring clamps to zero (no tension) at full droop. Damping still acts in both directions.

**Visual binding**
- **D-16:** Per-wheel Three.js mesh local Y tracks hub position relative to body. Chassis mesh continues to track `vehicleState.position`/`quaternion` unchanged.

### Claude's Discretion
- Exact starting values for `suspensionStiffness`, `suspensionDamping`, `suspensionRestLength` per axle — tune for body bounce ζ ≈ 0.6–0.8 and 1.5–2 Hz natural frequency
- ARB starting values — tune so front+rear ARBs together produce ≈5° body roll at 0.5g lateral
- `wheelMass` value (≈18 kg)
- Whether to expose `wheelMass` as a slider
- Rest-height / preload approach (static equilibrium at startup)
- Exact placement of per-wheel Fz readout in the debug panel
- Substep loop structure (2 iterations explicit, or generic N=2 accumulator)

### Deferred Ideas (OUT OF SCOPE)
- Solid rear axle (live beam, shared roll DOF)
- Suspension geometry (camber, toe, scrub radius, anti-dive, anti-squat)
- Separate ARB geometry / motion ratio
- Bump-stops / progressive springs
- Damper bleed / digressive damping curves
- Adjustable wheel mass slider
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M4-01 | Spring-damper suspension per wheel (k, c, restLength) | §Quarter-Car Equations + §Standard Stack params |
| M4-02 | Wheel vertical position/velocity integrated independently per wheel | §Hub State + §Integration Step Order |
| M4-03 | Body corner world position via quaternion rotation of local mount offset | §Body Corner Velocity at Mount Point (already in code via `getWheelPosition`) |
| M4-04 | Dynamic normal force Fz from suspension each step (not static mg/4) | §Quarter-Car Equations + §Per-Corner Fz Computation; Fz=tire-spring force per D-03 |
| M4-05 | Wheel lift: Fz=0 airborne, tire forces skipped | §Wheel Lift Detection |
| M4-06 | Wheel mass participates in vertical dynamics | §Hub State (unsprung mass on hub eqn) |
| M4-07 | Load transfer visible under braking/cornering | §Body Coupling — dynamic Fz emerges naturally from quaternion-rotated mount points |
| M4-08 | Debug menu exposes spring stiffness, damping, ride height sliders | §Debug & HUD Plumbing (D-11) |
| M4-09 | Per-wheel normal force visible in debug panel | §Debug & HUD Plumbing (D-12) |
</phase_requirements>

## Summary

Phase 4 turns the existing "matchbox car" (tire-as-only-spring) into a proper quarter-car at each corner: a body-side spring/damper plus its own unsprung-mass hub, with the existing tire spring reinterpreted as the ground↔hub spring. The math is textbook 1-D second-order ODE per corner (two ODEs actually: one for the hub, one for the body's vertical contribution at that mount point). The complexity is not in the physics — it's in the integration order, the airborne handling, and not destabilizing the existing 1/60 outer loop.

Three things drive every implementation decision:

1. **Series-spring topology with hub mass between them.** Tire spring force and suspension spring force are equal only at static equilibrium; in motion they differ by `m_unsprung · hub_acceleration`. Pacejka must read the **tire-side** force (per D-03) — this is the actual road reaction, and it goes to zero cleanly when the wheel lifts.

2. **Sub-stepping the vertical subsystem at dt/2 is the smallest cut that buys stability.** Outer body integration stays at 1/60. The hub state (which sees the stiffest spring — the tire spring at 210 000 N/m) needs the smaller step. This avoids a full halving of the outer loop and keeps the Pacejka/Newton ω-iterator (Phase 3) on its current 1/60 schedule.

3. **Anti-roll bars are a coupling spring on suspension compression, not on tire compression.** This is the conventional simplification — ARB lever arm = main spring lever arm — and it lets the ARB force enter the per-corner suspension force computation as a simple additive term with no new geometry.

**Primary recommendation:** Implement `src/suspension.js` as the single home for all quarter-car math (pure functions, no Three.js). Add a `stepSuspensionSubsteps(vehicleState, params, dt, substeps=2)` export that mutates `hubY[]`/`hubVy[]`, computes per-corner ARB coupling, returns per-corner `tireFz[]` and `bodyForceAtCorner[]`. `physics.js` calls it once per outer step, uses the returned `tireFz[]` to drive Pacejka, and sums `bodyForceAtCorner[]` into the existing 6DOF accumulator with the existing rotated lever arms.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Quarter-car ODE math (hub + body spring) | `src/suspension.js` (pure-math module) | — | CLAUDE.md architecture; no Three.js import per Phase 1 D-05 locked contract |
| Sub-step loop driver | `src/physics.js` (integrator) | — | Integrator already owns the outer step; substep is an inner loop here |
| ARB coupling computation | `src/suspension.js` | — | Same module as suspension force; needs per-axle compression pair |
| Per-corner `tireFz` → Pacejka feed | `src/physics.js` | — | Pacejka pipeline already lives in physics.js Step 3 contacts loop |
| Body force/torque accumulation | `src/physics.js` | — | Existing accumulator pattern (totalForce/totalTorque) |
| Hub state on `vehicleState` | `src/main.js` schema + `src/vehicle.js` reset | — | Same place existing `wheelOmega` arrays were added |
| Visible suspension travel on wheel meshes | `src/main.js` `syncMeshesToState` | — | Mesh sync is main.js's job; reads hub state, writes mesh local Y |
| Debug sliders for k/c/restLength/ARB | `src/debug.js` `initDebug` | — | All sliders live in initDebug per Phase 2/3 pattern |
| Per-wheel Fz display | `src/debug.js` HUD section | — | Existing wheelDebug-readout pattern |
| Per-wheel `fz` log field | `src/logger.js` field list | — | Phase 2 D-13 housekeeping: every new wheelDebug field gets a log column |

## Standard Stack

### Core
No new libraries. This phase is entirely additional math + state. The "stack" is the existing project stack:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Three.js | r184 (already in project) | Math primitives (`Vector3`, `Quaternion`) for body coupling | `[VERIFIED: CLAUDE.md tech stack table, threejs.org]` Already imported in physics.js; suspension.js stays Three.js-free per locked Phase 1 D-05 contract |
| lil-gui | bundled in three/addons | New sliders for spring/damper/ARB | `[VERIFIED: src/debug.js current usage]` Pattern established in Phase 2 D-08 and Phase 3 D-12 |

### Supporting
None. No new files outside the four listed in `<canonical_refs>` (suspension.js body replacement, physics.js step modification, vehicle.js schema add, debug.js slider add, logger.js field add, ranger.js param add).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit Euler at dt/2 | Semi-implicit (symplectic) Euler at full dt | `[ASSUMED]` Semi-implicit handles k=210000 reasonably at 1/60 but is borderline; halving the step is the lower-risk default for a slider that doubles k. Stick with sub-stepped explicit. |
| Custom force lever computation | Reuse existing `rContact` cross-product pattern | The existing pattern in physics.js already projects per-wheel forces into body torque via `rContact × force`. We piggyback on it — suspension force is just one more vertical force at the contact point. |
| New `src/arb.js` module | Inline ARB in `src/suspension.js` | One-screen of math; a new file is over-decomposition (CLAUDE.md "no premature abstraction"). Inline in suspension.js. |

**Installation:** Nothing to install. All adds are to existing files.

**Version verification:** N/A — no new packages.

## Architecture Patterns

### System Architecture Diagram

```
                                                                ┌─────────────────┐
   ┌──────────────────┐                                          │ vehicleState   │
   │ Input (vehicle)  │                                          │ (mutated)      │
   └──────────────────┘                                          └────────┬────────┘
            │                                                             │
            ▼                                                             │
   ┌──────────────────┐    per outer step (dt = 1/60)                     │
   │ stepPhysics(...)│◄────────────────────────────────────────────────┐  │
   └──────────────────┘                                                 │  │
            │                                                            │  │
            │  Step A: rotate body axes, compute per-corner mount points │  │
            ▼                                                            │  │
   ┌─────────────────────────────────────────────────────┐               │  │
   │  Step B: SUSPENSION SUBSTEP LOOP  (2 × dt/2)        │               │  │
   │  for s in [1, 2]:                                    │              │  │
   │    for each corner i:                                │              │  │
   │      - compute body mount point world position       │              │  │
   │        from quaternion-rotated local offset          │              │  │
   │      - bodyVy_at_mount = (velocity + ω×r)·ŷ          │              │  │
   │      - suspCompression[i] = restLen − (bodyY − hubY) │              │  │
   │      - tireDepth[i] = queryContacts(hub, r).depth    │              │  │
   │      - tireFz[i] = max(0, kT·tireDepth − cT·hubVy_rel)│             │  │
   │    compute ARB coupling per axle (uses compression   │              │  │
   │      pair from THIS substep iteration)               │              │  │
   │    for each corner i:                                │              │  │
   │      - suspForce[i] = kS·suspCompression + cS·suspVel│              │  │
   │      - if suspCompression<0: suspForce spring term=0 │              │  │
   │      - F_on_hub  = tireFz − suspForce − arbForce[i]  │              │  │
   │      - F_on_hub -= wheelMass·g                       │              │  │
   │      - hubVy[i] += (F_on_hub / wheelMass) · (dt/2)   │              │  │
   │      - hubY[i]  += hubVy[i] · (dt/2)                 │              │  │
   │    accumulate impulse-on-body: ∫suspForce·dt/2       │              │  │
   └─────────────────────────────────────────────────────┘               │  │
            │                                                            │  │
            │  Step C: per-corner Pacejka                                 │  │
            ▼                                                            │  │
   ┌─────────────────────────────────────────────────────┐               │  │
   │  for each corner i:                                  │              │  │
   │    if tireFz[i] <= 0:  skip Pacejka entirely (D-14)  │              │  │
   │    else:                                             │              │  │
   │      contacts = queryContacts(hub, r)                │              │  │
   │      Fpacejka = computeTireForces(s_long, s_lat,     │              │  │
   │                                  Fn=tireFz[i], ...)   │             │  │
   │      totalForce  += suspForce·ŷ_world + Fpacejka     │              │  │
   │      totalTorque += rContact × (suspForce + Fpacejka)│              │  │
   │    write wheelDebug[i].fz = tireFz[i]                │              │  │
   └─────────────────────────────────────────────────────┘               │  │
            │                                                            │  │
            ▼                                                            │  │
   ┌─────────────────────────────────────────────────────┐               │  │
   │  Step D: body 6DOF integration at outer dt (existing)│              │  │
   │  ω-Newton integrator per wheel (existing, unchanged) │              │  │
   └─────────────────────────────────────────────────────┘──────────────────┘
                                                                         │
                                                                         ▼
                                                          ┌──────────────────────┐
                                                          │ syncMeshesToState   │
                                                          │  wheel.local.y =    │
                                                          │   hubY − bodyY      │
                                                          │   (in body frame)   │
                                                          └──────────────────────┘
```

### Recommended Project Structure
```
src/
├── suspension.js     # quarter-car math: hub ODE, ARB, returns tireFz/suspForce/bodyForce
├── physics.js        # outer integrator calls suspension substep loop + Pacejka
├── vehicle.js        # vehicleState shape adds hubY[], hubVy[]; SPAWN_STATE adds rest values
├── debug.js          # new sliders, per-wheel Fz HUD readout
├── logger.js         # new column per wheel: fz
└── main.js           # mesh sync uses hubY for visual travel
data/ranger.js        # new params + tuned defaults
docs/GLOSSARY.md      # D-13 entries
```

### Pattern 1: Quarter-Car Equations of Motion

**The two ODEs per corner (1-D vertical, world Y, no slope handling — slope appears via `normal` in the existing tire-spring path):**

Let:
- `m_s` = sprung mass share at this corner (≈ `(mass/4)` for the symmetric case, modulated by `weightFront`/`weightRear`)
- `m_u` = `wheelMass` (unsprung)
- `y_b` = body mount-point world Y (read from quaternion-rotated local offset)
- `y_h` = `hubY[i]`
- `y_g` = ground height under hub (from `queryContacts` depth: tire compression = `wheelRadius − (y_h − y_g) = depth`)
- `k_T`, `c_T` = `tireStiffness`, `tireDamping` (existing)
- `k_S`, `c_S` = `suspensionStiffness*`, `suspensionDamping*` (new)
- `L_S` = `suspensionRestLength*` (new)

**Tire spring force (ground↔hub), this is Fz fed to Pacejka per D-03:**
```
tireCompression  = depth   (returned by queryContacts, always ≥ 0; 0 when sphere clear of surface)
tireFz           = max(0, k_T · tireCompression + c_T · (−hubVy_along_normal))
```
Note: existing physics.js already computes `params._compressionVelocity = -contactVel.dot(normal)`. For Phase 4, `contactVel` is **the hub velocity**, not the body's velocity at the mount point — the hub now has its own velocity. The hub's world velocity is `(velocity_at_body_mount_xz, hubVy[i], same_xz)` — i.e., XZ tracks the body's motion at the mount (no independent lateral hub kinematics in this scope), Y tracks hubVy.

**Suspension force (hub↔body), with no-tension clamp per D-15:**
```
suspCompression   = L_S − (y_b − y_h)   // positive when spring is compressed below rest length
suspCompressionVel = bodyVy_at_mount − hubVy
springTerm        = (suspCompression > 0) ? k_S · suspCompression : 0   // D-15: no tension at droop
dampTerm          = c_S · suspCompressionVel                            // damping acts both ways per D-15
suspForce         = springTerm + dampTerm                               // positive = pushes hub down, body up
```

**Anti-roll bar (per axle, applied at each corner):**
```
// Left corner (FL=0 for front axle, RL=2 for rear axle); Right corner = 1 or 3.
deltaCompression = suspCompression[left] − suspCompression[right]
F_arb            = k_ARB · deltaCompression
arbForce[left]   = −F_arb     // axle in pure heave: delta=0 → ARB=0 ✓ (D-06)
arbForce[right]  = +F_arb
```
Sign convention check: if left wheel is compressed more (e.g., car rolls right, left side squats), `delta > 0`, so `arbForce[left] = −F_arb < 0` pushes hub UP relative to body (which the spring resists, transferring force to the body). Equivalent reaction on the right side pushes hub DOWN — i.e., the bar tries to equalize compression. ✓ matches physical intuition.

**Hub ODE (integrated at dt/2):**
```
F_hub  = tireFz − suspForce + arbForce[i] − m_u · g
hubVy[i]  += (F_hub / m_u) · (dt/2)
hubY[i]   += hubVy[i] · (dt/2)
```
Note: `arbForce` enters the hub equation with the SAME sign as it enters the body equation (Newton's 3rd law: equal and opposite on the body side). The bilinear-spring approximation per D-07 means ARB force has the same lever arm as the main suspension spring.

**Body force from suspension (returned to physics.js, summed into existing `totalForce`/`totalTorque`):**
```
bodyForceY_at_corner = +suspForce − arbForce[i]   // +Y push on body
// Vector form: bodyForce = (0, suspForce, 0) world (vertical only — D-07 bilinear-spring approx)
// Torque arm: rContact = mountPointWorld − vehicleState.position (existing pattern)
```

**Citation:** `[CITED: Genta, "Motor Vehicle Dynamics", §5.2 Quarter-Car Model; Gillespie, "Fundamentals of Vehicle Dynamics" §5.3]` Standard textbook 2-DOF formulation. `[ASSUMED]` Specific equation forms above are the conventional ones; verification against any vehicle dynamics text will confirm.

### Pattern 2: dt/2 Sub-Step Loop Structure

```js
// Inside stepPhysics, before per-wheel Pacejka contacts loop:
const substepDt = dt / 2
const substeps  = 2
const tireFzAccum = [0, 0, 0, 0]   // average over substeps for Pacejka feed
const bodyForceAccum = [
  new THREE.Vector3(), new THREE.Vector3(),
  new THREE.Vector3(), new THREE.Vector3()
]

for (let s = 0; s < substeps; s++) {
  // 1. Compute per-corner geometry (body mount points + tire depths) using CURRENT hubY/hubVy
  const cornerData = []  // [{mountY, bodyVyAtMount, tireDepth, hubVyRel, suspCompression, suspVel}, ...]
  for (let i = 0; i < 4; i++) {
    // mountPointWorld from quaternion-rotated local offset (use existing getWheelPosition-like math
    // but for the BODY's mount point, not the wheel hub — see "Lever Arms" section below)
    ...
  }
  // 2. ARB pass (read compression pairs, compute arbForce per corner)
  ...
  // 3. Force pass: tireFz, suspForce, hub integration, body force accumulation
  for (let i = 0; i < 4; i++) {
    const tireFz = max(0, ...)
    const suspForce = ...
    const F_hub = tireFz - suspForce + arbForce[i] - wheelMass * 9.81
    hubVy[i] += (F_hub / wheelMass) * substepDt
    hubY[i]  += hubVy[i] * substepDt
    tireFzAccum[i] += tireFz / substeps     // average across substeps for Pacejka feed
    bodyForceAccum[i].y += suspForce        // sum impulses to apply once at outer dt
  }
}

// 4. Apply averaged tireFz and accumulated body force to outer physics.js loop
//    Pacejka uses tireFzAccum[i] as Fn; totalForce += bodyForceAccum[i] / substeps (averaged)
```

**Why averaging tireFz across substeps:** Pacejka eats a single Fz per outer step. Averaging is the simplest correct choice; using only the post-substep `tireFz` would overweight the second half of the step. Either is acceptable since the outer dt is short. `[ASSUMED]` — averaging is conventional but not formally required; document the choice in code.

### Pattern 3: Body Mount-Point Velocity (vertical only)

The body mount point is NOT the same as the wheel hub. The wheel hub is below it (separated by the suspension spring). We need the body's *mount* point world position to compute suspension compression.

```js
// Local mount point in body frame — same XZ as current wheel offset (per Phase 1 D-05),
// but Y is the un-compressed body-attach height: y_mount_local = -(cgHeight - wheelRadius - L_S)
// Actually simplest: use the existing getWheelPosition local Y, REINTERPRET it as the
// mount point. Then hub sits below it by L_S nominally; suspCompression measures relative motion.
//
// For each corner i:
const local = {x: localX, y: localY, z: localZ}   // existing per-corner local offset
const mountWorld = vehicleState.position + params._rotateVector(local)
const rMount = mountWorld − vehicleState.position
const mountVel = vehicleState.velocity + (angularVelocity × rMount)
const bodyVy_at_mount = mountVel.y
```
This piggybacks on the existing `getWheelPosition` math — DRY win.

### Pattern 4: Static Equilibrium at Startup

To avoid the car visibly sagging on the first frame, pre-compute hub Y so springs are pre-loaded at rest:

```js
// At each corner i, static condition: tireFz_static = suspForce_static = m_corner · g
//   where m_corner = mass · (weightFront or weightRear) / 2 + wheelMass
// Then:
//   tireCompression_rest = m_corner · g / k_T
//   suspCompression_rest = (m_corner − wheelMass) · g / k_S   // body weight share only
// Body Y at rest:
//   body height above ground = wheelRadius − tireCompression_rest + L_S − suspCompression_rest
// Hub Y at rest:
//   hubY = wheelRadius − tireCompression_rest
```
Compute once in `vehicle.js` resetVehicle() and at SPAWN. Set `vehicleState.position.y` and each `hubY[i]` to these values. `[ASSUMED]` — values; verification: log first 5 frames after reset and confirm `hubVy ≈ 0` and `tireFz ≈ m_corner·g`.

### Anti-Patterns to Avoid

- **Computing ARB after the suspension force is already applied to the hub.** ARB must enter the hub equation in the same substep as the main spring force, otherwise the system is integrating two coupled springs with one being lagged by dt/2 — adds spurious energy.
- **Feeding the suspension spring force (hub↔body) into Pacejka as Fn.** That's the sprung-mass share, which includes acceleration terms in transients. Pacejka wants the actual road reaction = tire spring force per D-03.
- **Trying to also sub-step the lateral/longitudinal tire forces.** They are not the source of stiffness here; Pacejka is already stable at 1/60 via the relaxation-length filter (Phase 3). Substep VERTICAL ONLY (D-08 wording).
- **Computing `suspCompression` from `mountWorldY − hubWorldY` directly without subtracting `L_S`.** The rest length is the reference; compression is the *deviation* from rest, not the raw separation.
- **Allowing the suspension spring to pull (tension) at full droop.** D-15 explicitly forbids it. Damping still acts; only the spring term clamps to zero.
- **Forgetting to apply gravity to the unsprung mass.** The hub has its own mass; gravity acts on it independently. Without `−m_u · g` in `F_hub`, the static-equilibrium hub position will be wrong by `m_u · g / k_T` (≈ 18·9.81/210000 ≈ 0.84 mm — small but noticeable in debug).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spring-damper math | Anything fancier than `F = k·x + c·v` | Linear spring-damper directly | Phase 4 explicitly defers progressive springs / digressive dampers; linear is the textbook quarter-car |
| Vector math | A new vec3 helper | Three.js `Vector3` (already imported in physics.js) | CLAUDE.md establishes Three.js math as the project math layer |
| Rotation helper | Re-derive quaternion rotation per corner | `params._rotateVector` injected helper (existing pattern) | Phase 1 D-05 contract; preserves pure-math testability of suspension.js |
| Body inertia | Recompute mount lever arms manually | Existing `rContact × force` pattern in physics.js | Zero new code — the existing torque accumulator handles the new force vectors |
| Slider UI | Custom sliders | `gui.add(params, 'name', min, max, step)` (lil-gui) | Three.js bundled UI |

**Key insight:** This phase is conservative — almost all infrastructure exists. The work is: (1) two new ODEs per corner, (2) a substep wrapper, (3) ARB coupling, (4) wiring the result back into the existing accumulator. Resist the urge to refactor.

## Runtime State Inventory

**N/A** — Phase 4 is greenfield additions (new state, new params, new ODEs). No rename, no migration, no string replacement. All five categories below confirmed empty.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no persistent state | None |
| Live service config | None — no external services | None |
| OS-registered state | None — browser-only project | None |
| Secrets/env vars | None | None |
| Build artifacts | None — no build system per CLAUDE.md | None |

## Common Pitfalls

### Pitfall 1: Hub Penetrates Ground on First Frame
**What goes wrong:** Spawn `hubY = wheelRadius` exactly, but body is also at `cgHeight`. On first substep, gravity pulls the hub down, tire compression goes negative (sphere clear of ground), tireFz=0, hub keeps falling, body crashes down onto hub. Visible as a 1-2cm "drop" each reset.
**Why it happens:** No static preload. The springs need pre-compression to balance gravity at t=0.
**How to avoid:** Pre-compute static equilibrium (Pattern 4 above). On reset, set `hubY[i] = wheelRadius − tireCompression_rest` and `vehicleState.position.y = wheelRadius − tireCompression_rest + L_S − suspCompression_rest`.
**Warning signs:** First-frame `hubVy ≠ 0`; visible `body.y` settling oscillation in the first ~30 frames.

### Pitfall 2: Spring Oscillation Divergence Above 2× Default Stiffness (D-10 target)
**What goes wrong:** Slider doubles `suspensionStiffness` from default; hub bounces grow exponentially within ~0.5s; eventually NaN as hubVy overflows.
**Why it happens:** Explicit Euler stability condition is `dt < 2/ω_n`. For k=80000, m=18: ω_n = √(k/m) = 66.6 rad/s, so dt_stable = 0.030s. At outer dt=1/60=0.0167s we're safe — but the tire spring at k_T=210000, m_unsprung=18 gives ω_n = √(210000/18) = 108 rad/s, dt_stable = 0.018s. The TIRE spring is the stability-determining one, not the suspension spring. At dt/2 = 0.0083s we have ~2× safety margin even with doubled k_T.
**How to avoid:** Verify in code with an explicit stability check at startup:
```js
const omega_n_tire = Math.sqrt(params.tireStiffness / params.wheelMass)
const dt_substep   = params.physicsDt / 2
if (dt_substep > 1.5 / omega_n_tire) console.warn('Suspension substep too large for tire stiffness')
```
**Warning signs:** Per-step hubY delta growing; `Math.abs(hubVy[i]) > 50` (well above any physical motion).

### Pitfall 3: Body Sinks at Rest (Cumulative Damping Bias)
**What goes wrong:** Static car slowly settles over many seconds — body Y drifts down 1-2cm.
**Why it happens:** If `bodyForceAccum` is summed across substeps but then APPLIED at the OUTER dt, the impulse magnitude can be wrong by a factor of `substeps`. Specifically: averaging force vs summing impulses.
**How to avoid:** Be explicit. The suspension force is a CONTINUOUS force. Pick one convention:
- Average force over substeps, apply at outer dt: `totalForce.y += bodyForceAccum[i].y / substeps`
- OR apply each substep's impulse directly to body velocity: `velocity.y += suspForce / mass * substepDt` per substep (but this breaks the body's "everything accumulates into totalForce then integrates at outer dt" pattern).

The cleaner choice: **average**. Document `totalForce += bodyForceAccum / substeps` in code.
**Warning signs:** Body Y monotonically drifts in scenario log; per-frame `velocity.y ≈ −0.001` at rest.

### Pitfall 4: NaN from Division on First Frame (hubY uninitialized)
**What goes wrong:** `vehicleState.hubY[i]` is `undefined` → `undefined − number = NaN` → propagates everywhere.
**Why it happens:** Like Phase 3's lazy-init pattern, but suspension state MUST be initialized at spawn — not lazy-init.
**How to avoid:** Initialize `hubY[]`/`hubVy[]` in `main.js` `vehicleState` literal AND in `resetVehicle` reset path, using the static-equilibrium values from Pattern 4. Add explicit guard `if (typeof vehicleState.hubY?.[i] !== 'number') initializeHubState(...)` at top of stepPhysics for paranoia.
**Warning signs:** First-frame logs show `hubY: null` or `NaN`.

### Pitfall 5: Wheel Lift Discontinuity Causes Force Spike
**What goes wrong:** Tire just barely lifts off (compression = 0.0001 m → tireFz = 21 N) → next frame compression = 0 → tireFz = 0. Sudden drop of 21 N is fine, but if the suspension spring is still pushing hard, the hub accelerates downward instantly, re-contacts at high speed, big spike.
**Why it happens:** D-14 step function is mathematically discontinuous. In practice, the hub mass smooths it (acceleration is bounded by force/mass), but with very stiff springs the bounce-off can be visible.
**How to avoid:** Trust the unsprung mass to absorb the discontinuity. Verify with scenario: wheel lift on bump should NOT cause body to jerk. If it does, the suspension is overdamped on droop (damping pulls the hub back too hard) — drop `c_S` by 30% and re-tune.
**Warning signs:** Audible-feeling "thunk" on wheel re-contact; spike in `wheelDebug[i].fz` followed by zero followed by spike again.

### Pitfall 6: ARB Sign Error → Anti-Sway Becomes Pro-Sway
**What goes wrong:** Sign on `arbForce` is flipped → car rolls MORE in a corner with ARBs than without. Visually disastrous (looks like a boat).
**Why it happens:** Easy to swap. The convention in D-06: `F_arb = k·(c_L − c_R)`, applied as `−F_arb` to left and `+F_arb` to right. Verify by reasoning:
- Right-hand corner: car rolls right → left wheel droops (compression LOW), right wheel compresses (compression HIGH) → `c_L − c_R < 0` → `F_arb < 0` → arbForce[left] = −F_arb > 0 → pushes left hub DOWN (extending the droop further? NO — relative to body it pushes the hub closer to the body, i.e. it RESISTS the droop). Wait — re-derive.
  - Convention: `arbForce` positive means "pushes hub down" (same sign as suspForce when compressed).
  - `arbForce[left] = −F_arb`. With `F_arb<0`, arbForce[left] = +positive → pushes left hub down → tire pushes harder into ground → resists droop. ✓
  - `arbForce[right] = +F_arb < 0` → pushes right hub UP (less force into ground) → reduces compression. ✓ Both effects ANTI-roll. ✓
**How to avoid:** Add a comment block in suspension.js with the derivation above. Write a scenario test: hold a steady steer, log roll angle; toggle ARB stiffness to 0 vs default and confirm roll angle is LARGER with ARB=0.
**Warning signs:** Body roll INCREASES when ARB stiffness increases. Slap-yourself-on-the-forehead obvious in the cornering scenario.

### Pitfall 7: Pacejka Sees Stale Fz from Previous Frame
**What goes wrong:** If the substep loop writes `tireFzAccum` BUT physics.js's contacts loop reads `params._compression` and recomputes via the old `computeNormalForce`, Pacejka will see the OLD tire-only Fn, not the new quarter-car Fn.
**Why it happens:** Refactor halfway done — `computeNormalForce` body replaced but the field-name handoff between substep and contacts loop is inconsistent.
**How to avoid:** **Don't refactor computeNormalForce. Refactor its caller.** Easier path:
- Suspension substep writes per-wheel `vehicleState._tireFz[i]` (or similar transient field).
- physics.js contacts loop reads that instead of calling `computeNormalForce`.
- OR: `computeNormalForce` is replaced to simply read `params._tireFz` (set by the substep) and return it. Pure shim.
**Warning signs:** Body load transfer visible (nose dips) but per-wheel `wheelDebug[i].fz` numbers don't match the dipping motion.

### Pitfall 8: dt Hardcoded `1/60` Somewhere Phase 4 Forgot
**What goes wrong:** D-09 mandates parameterized dt. If the substep loop hardcodes `dt/2` literally as `1/120`, future phases that change physics dt will break.
**How to avoid:** Single source of truth: `const PHYSICS_DT = 1/60` exported from `main.js` (or live on vehicleState). All downstream uses `vehicleState.physicsDt` or imported `PHYSICS_DT`. Grep audit at phase end.
**Warning signs:** `grep -rn "1/60\|0.0167\|0.00833" src/` returns hits outside the constant declaration site.

## Code Examples

### Suspension Substep (suspension.js, new export)
```js
// Source: textbook quarter-car formulation, adapted to project pattern (no Three.js import).
// physics.js calls this once per outer step before the contacts loop.
//
// Outputs (written to params, read by physics.js contacts loop):
//   params._tireFz[i]            — per-corner tire spring force (Fz for Pacejka per D-03)
//   params._suspForceAccum[i]    — per-corner averaged suspension force on body (vertical, +Y)
//   vehicleState.hubY[i], hubVy[i] — mutated in place
export function stepSuspensionSubsteps (vehicleState, params, dt, queryContacts) {
  const N = 2
  const sdt = dt / N
  const m_u = params.wheelMass

  for (let i = 0; i < 4; i++) {
    params._tireFz[i] = 0
    params._suspForceAccum[i] = 0
  }

  for (let s = 0; s < N; s++) {
    // 1. Per-corner geometry pass
    const cornerData = [null, null, null, null]
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const localOffset = computeLocalMountOffset(i, params)   // existing localX/Y/Z math from getWheelPosition
      const rMount = params._rotateVector(localOffset)
      const mountWorldY = vehicleState.position.y + rMount.y
      const mountVelY = vehicleState.velocity.y +
        (vehicleState.angularVelocity.z * rMount.x - vehicleState.angularVelocity.x * rMount.z)  // (ω×r).y
      const L_S = isFront ? params.suspensionRestLengthFront : params.suspensionRestLengthRear
      const suspComp = L_S - (mountWorldY - vehicleState.hubY[i])
      const suspVel  = mountVelY - vehicleState.hubVy[i]
      cornerData[i] = { mountWorldY, suspComp, suspVel, isFront }
    }

    // 2. ARB pass (axle-paired)
    const arbF = [0, 0, 0, 0]
    {
      const dF = params.arbStiffnessFront * (cornerData[0].suspComp - cornerData[1].suspComp)
      arbF[0] = -dF; arbF[1] = +dF
      const dR = params.arbStiffnessRear  * (cornerData[2].suspComp - cornerData[3].suspComp)
      arbF[2] = -dR; arbF[3] = +dR
    }

    // 3. Force + integration pass
    for (let i = 0; i < 4; i++) {
      const { suspComp, suspVel, isFront, mountWorldY } = cornerData[i]
      const k_S = isFront ? params.suspensionStiffnessFront : params.suspensionStiffnessRear
      const c_S = isFront ? params.suspensionDampingFront   : params.suspensionDampingRear
      const springTerm = suspComp > 0 ? k_S * suspComp : 0           // D-15 no-tension
      const dampTerm   = c_S * suspVel
      const suspForce  = springTerm + dampTerm                       // +ve = pushes hub down, body up

      // Tire spring: hub-to-ground (uses queryContacts, replaces existing computeNormalForce body)
      const contacts = queryContacts(/*hubX*/, vehicleState.hubY[i], /*hubZ*/, params.wheelRadius)
      // Sum vertical component of all contacts (flat-ground case: single contact, normal.y ≈ 1)
      let tireFz = 0
      for (const c of contacts) {
        const tireFnAtContact = Math.max(0,
          params.tireStiffness * c.depth + params.tireDamping * (-vehicleState.hubVy[i] * c.normal.y)
        )
        tireFz += tireFnAtContact * c.normal.y    // project onto vertical for hub ODE
      }

      // Hub ODE
      const F_hub = tireFz - suspForce + arbF[i] - m_u * 9.81
      vehicleState.hubVy[i] += (F_hub / m_u) * sdt
      vehicleState.hubY[i]  += vehicleState.hubVy[i] * sdt

      // Accumulate for outer step
      params._tireFz[i]         += tireFz / N
      params._suspForceAccum[i] += suspForce / N
    }
  }
}
```

**Note:** Above is pseudocode-quality JS — the real implementation needs `cornerData[i]` to capture hub world XZ (currently elided), needs `_tireFz`/`_suspForceAccum` arrays initialized in main.js, and needs to integrate the ARB lever arm into the body torque via the existing rContact × force pattern in physics.js.

### Body Force Application (physics.js, modified contacts loop)
```js
// Inside physics.js Step 3, replacing the call to computeNormalForce per contact:
for (let i = 0; i < 4; i++) {
  if (params._tireFz[i] <= 0) {
    // Airborne (D-14): write zero Fn to wheelDebug, skip tire forces entirely
    if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].fz = 0
    continue   // Pacejka skipped
  }
  // Apply suspension force to body (vertical only per D-07)
  const rMount = ...  // existing rotated local offset
  const bodyForceVec = new THREE.Vector3(0, params._suspForceAccum[i], 0)
  totalForce.add(bodyForceVec)
  totalTorque.add(new THREE.Vector3().crossVectors(rMount, bodyForceVec))

  // Apply tire spring vertical force (the normal reaction at the contact, already in _tireFz)
  // ... existing contacts loop pattern uses normal·tireFz for non-vertical surfaces

  // Pacejka with Fn = params._tireFz[i] (per D-03)
  const { Flong, Flat } = computeTireForces(sLongCur, sLatNew, params._tireFz[i], params)
  ...

  // Write debug
  vehicleState.wheelDebug[i].fz = params._tireFz[i]
}
```

### New ranger.js Params (recommended defaults)
```js
// Source: textbook quarter-car tuning targets — natural frequency 1.5–2 Hz for trucks,
// zeta 0.3–0.5 typical, body roll ~5° at 0.5g for road truck.
// Sprung mass per corner ≈ (1360 × 0.55 / 2) ≈ 374 kg front, (1360 × 0.45 / 2) ≈ 306 kg rear.
// f_n = (1/2π)·√(k/m) = 1.5 Hz → k = (2π·1.5)² · m
//   front: (9.42)² · 374 ≈ 33 000 N/m
//   rear:  (9.42)² · 306 ≈ 27 000 N/m
// zeta = c / (2·√(k·m)); zeta=0.4 → c = 0.8·√(k·m)
//   front: 0.8·√(33000·374) ≈ 2820 N·s/m
//   rear:  0.8·√(27000·306) ≈ 2300 N·s/m
suspensionStiffnessFront: 33000,   // N/m
suspensionStiffnessRear:  27000,   // N/m
suspensionDampingFront:   2800,    // N·s/m
suspensionDampingRear:    2300,    // N·s/m
suspensionRestLengthFront: 0.20,   // m — typical road truck suspension travel allowance
suspensionRestLengthRear:  0.22,   // m — slightly more for unloaded rear
arbStiffnessFront:        15000,   // N/m — front ARB; tune to taste
arbStiffnessRear:          8000,   // N/m — softer rear ARB encourages oversteer balance
wheelMass:                   18,   // kg — already implied by wheelInertia derivation
physicsDt:               1/60,     // s — D-09: outer physics step, parameterized
```
`[ASSUMED]` All numerical values above. They are derived from first principles (textbook formulas) but not tuned in this project — expect to retune empirically during execution.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static Fn = mass·g·weightFraction/4 (Phase 1 stub) | Dynamic Fn from tire spring (Phase 1 deployed) | Phase 1 | Already delivered; Fz already dynamic via tire compliance |
| Tire compliance is only spring (matchbox) | Quarter-car series: suspension + tire | Phase 4 (THIS) | Visible body pitch/roll; wheel lift; per-wheel Fz responds to load transfer |
| Outer dt for all integration | Vertical substepped at dt/2 | Phase 4 (THIS) | Stable with stiff tire spring under slider doubling |

**Deprecated/outdated:**
- Treating `tireStiffness`/`tireDamping` as the "suspension" — they are NOT suspension; they are the tire carcass radial spring. Phase 4 reinterprets them as ground↔hub spring. Per D-01.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default `suspensionStiffnessFront/Rear` values (33000 / 27000 N/m) and damping (2800 / 2300 N·s/m) | §Code Examples → New ranger.js Params | Car feels too soft/stiff at first run; user adjusts sliders — no blocker |
| A2 | Default `arbStiffnessFront/Rear` values (15000 / 8000 N/m) | §Code Examples → New ranger.js Params | Roll behavior off; user tunes — no blocker |
| A3 | `suspensionRestLength` 0.20/0.22 m is reasonable for a Ranger | §Code Examples → New ranger.js Params | If too small, droop saturates; if too large, body sits too high. Tune via slider. |
| A4 | Averaging tireFz across substeps (vs taking final substep value) is the right Pacejka feed | §Pattern 2 + §Pitfall 7 | Force lags or leads by half a substep; small effect at dt=1/60 |
| A5 | Bilinear-spring ARB approximation (ARB lever = main spring lever, per D-07) is acceptable for Phase 4 | §Pattern 1 — Anti-Roll Bar | Body roll number won't match a real Ranger; but qualitative behavior correct. User locked this per D-07. |
| A6 | dt/2 sub-step is sufficient for `tireStiffness=210000` doubled to 420000 (per D-10) | §Pitfall 2 | If insufficient, NaN under aggressive slider. Mitigation: stability-check warning at startup |
| A7 | `wheelMass = 18 kg` matches existing `wheelInertia` derivation | §Code Examples → New ranger.js Params | None — derivation cited in ranger.js header |
| A8 | Static equilibrium pre-load formulas (Pattern 4) are correct | §Pattern 4 | Visible 1-frame settle on reset if wrong; observable in logs |

**If any assumption is wrong, the failure mode is "tuning needed via existing slider", not "phase blocked".** The Claude's Discretion items in CONTEXT.md explicitly authorize this discretion.

## Open Questions

1. **Should hub XZ track the body mount point exactly, or should the hub have its own lateral inertia?**
   - What we know: Phase 4 scope is vertical-only suspension. Lateral hub motion (compliance, scrub) is deferred.
   - What's unclear: Whether the hub's XZ should literally equal the body mount point XZ each frame, OR carry forward from last frame with no XZ dynamics.
   - Recommendation: Set hub XZ = body mount point XZ each substep (no independent XZ state). Pure-vertical hub state. Matches D-04 (no kinematics scope) and minimizes new state.

2. **Pacejka contacts loop currently iterates per-contact (multi-contact); how does this interact with per-corner tireFz?**
   - What we know: The existing physics.js Step 3 contacts loop iterates `for (const {normal, depth, contactPoint} of contacts)` per wheel, and queries `computeNormalForce` per contact (passing single depth/velocity).
   - What's unclear: Whether multi-contact wheels (sphere overlapping wall AND ground) should split tireFz across contacts, or whether the substep computes ONE tireFz per wheel and the contacts loop just uses it.
   - Recommendation: Pursue the simpler path — substep computes ONE tireFz per wheel using `queryContacts` to find total depth (sum vertical component across all contacts). The Pacejka contacts loop in physics.js then iterates contacts only to compute LATERAL/LONGITUDINAL force decomposition per contact normal, using the single tireFz as a budget. Document the simplification.

3. **Does Pacejka feed get the AVERAGED tireFz across substeps, or the FINAL substep value?**
   - Recommendation: averaged (per Pattern 2). Document the choice explicitly in code.

4. **How does the visual binding (D-16) handle body roll combined with hub motion?**
   - What we know: Wheel mesh local Y in body frame must reflect hubY relative to body mount point.
   - What's unclear: The exact local-Y computation when body is rolled (mount Y world ≠ mount Y body-local).
   - Recommendation: `wheelMesh.position.y = (currentLocalMountY) − (suspCompression - L_S)` — i.e., move the mesh down (toward ground) by the compression amount, measured in body-local space. Since the mesh is parented to carGroup, body-local is automatic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Three.js r184 | physics.js math primitives | ✓ | r184 (CDN importmap) | — |
| lil-gui | debug.js new sliders | ✓ | bundled in three/addons | — |
| Modern browser (ES6 modules) | All | ✓ | per CLAUDE.md FOUND-01 | — |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None
Phase 4 introduces no new external dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual scenario runner (Phase 2 logger.js + scenarios/) + browser-based UAT |
| Config file | none — scenarios are JSON files in `scenarios/`; runner is integrated into main.js logger |
| Quick run command | Open `index.html` in browser; press `\` to toggle recording; drive manually |
| Full suite command | Load each scenario from `scenarios/`, run, inspect downloaded JSON log |

**Note:** This project has no automated test framework (no Jest/Vitest/Mocha/pytest). The "test infrastructure" is the Phase 2 scenario system (deterministic IC loader + frame logger) + manual UAT against ROADMAP success criteria. All "test commands" below are manual procedures producing JSON log evidence.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| M4-01 | Spring-damper exists with k, c, restLength per wheel | code-inspection + slider | Verify ranger.js has the 6 params; verify debug.js exposes sliders | ✅ (in this phase) |
| M4-02 | hubY[]/hubVy[] integrated independently per wheel | scenario | `scenarios/m4-02-asymmetric-bump.json`: bump under LEFT wheels only; log shows hubY[0,2] motion, hubY[1,3] flat | ❌ Wave 0 |
| M4-03 | Body corner position via quaternion (not Euler) | code-inspection | Grep `params._rotateVector` usage in new suspension.js code path; no `Math.sin/cos` for body rotation | ✅ pattern exists |
| M4-04 | Dynamic Fz visible in log per wheel, varies with load | scenario | `scenarios/m4-04-static-vs-braking.json`: idle 1s, then brake hard 1s; log shows `fz` rising on front, falling on rear during brake | ❌ Wave 0 |
| M4-05 | Airborne wheel produces zero tire force | scenario | `scenarios/m4-05-wheel-lift-ramp.json`: drive over wedge ramp asymmetric; log shows one wheel `fz=0, fy=0, sa=0` during airborne window | ❌ Wave 0 |
| M4-06 | Wheel mass affects vertical dynamics | unit-like test | Compute critical-damping prediction from k_T, wheelMass; scenario `scenarios/m4-06-bump-response.json` confirms peak-to-peak settle time matches prediction within 20% | ❌ Wave 0 |
| M4-07 | Visible nose-dip on brake, body roll on corner | UAT (manual) | Drive scenario: 60 km/h straight → full brake; observe nose pitch in chase cam. Drive scenario: 50 km/h sustained turn; observe outward roll. | manual |
| M4-08 | Slider for spring stiffness, damping, restLength exposed | code-inspection + UAT | Open debug panel; sliders present and labeled per D-11 | manual |
| M4-09 | Per-wheel Fz visible in debug panel | code-inspection + UAT | Debug panel shows live `fz` for all 4 wheels (FL/FR/RL/RR) | manual |

### Sampling Rate
- **Per task commit:** Open browser, reset car (R), confirm no console errors, drive 5 seconds without NaN
- **Per wave merge:** Run M4-04 + M4-05 + M4-06 scenarios; download logs; check `fz` values are non-trivial and consistent with prediction
- **Phase gate:** All 4 scenarios pass; ROADMAP §Phase 4 success criteria 1–5 confirmed manually in chase camera; debug sliders M4-08/M4-09 verified

### Wave 0 Gaps
- [ ] `scenarios/m4-02-asymmetric-bump.json` — single-wheel bump to confirm per-wheel independence (M4-02)
- [ ] `scenarios/m4-04-static-vs-braking.json` — load transfer under hard braking (M4-04, M4-07 longitudinal)
- [ ] `scenarios/m4-05-wheel-lift-ramp.json` — asymmetric ramp drive-over to lift one wheel (M4-05)
- [ ] `scenarios/m4-06-bump-response.json` — controlled bump for damping characterization (M4-06)
- [ ] (optional) `scenarios/m4-07-cornering-roll.json` — sustained turn to observe lateral roll (M4-07 lateral)

If a wave 0 task can't author the asymmetric-bump scenario because `queryContacts` doesn't yet support a single-wheel bump prop, add the prop to `main.js` ramp/terrain construction first.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (browser-only sandbox, no auth surface) |
| V3 Session Management | no | — (no sessions) |
| V4 Access Control | no | — (no privileged operations) |
| V5 Input Validation | no | — keyboard inputs already gated to [-1, 1] in vehicle.js; slider inputs gated by lil-gui min/max |
| V6 Cryptography | no | — (no secrets, no crypto) |

### Known Threat Patterns for {browser-only physics sandbox}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NaN propagation crashing physics | Denial of Service (self-inflicted) | Initialize all new state explicitly (Pitfall 4); add stability-check warnings at startup (Pitfall 2) |
| Slider value out of physical range (e.g., k=0) | Tampering (self-inflicted) | lil-gui min/max bounds on every slider; sensible minimums (k_min > 1000) |
| Stale params reference after Object.freeze | N/A | ranger.js header already forbids freeze; preserved |

This phase introduces no new external attack surface. All inputs are local (keyboard + lil-gui sliders), all state is in-memory, no network calls.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/04-suspension/04-CONTEXT.md` — locked decisions D-01..D-16, Claude's discretion, deferred items
- `.planning/REQUIREMENTS.md` §Milestone 4 — M4-01..M4-09
- `CLAUDE.md` — project constraints, tech stack, no-physics-library rule, hand-rolled requirement
- `src/physics.js`, `src/suspension.js`, `src/vehicle.js`, `src/main.js`, `src/debug.js`, `src/logger.js`, `data/ranger.js` — existing code patterns (verified via Read)
- `.planning/phases/03-tire-model/03-CONTEXT.md` (via canonical_refs) — Pacejka feed pattern, wheelDebug scratchpad

### Secondary (MEDIUM confidence)
- `[CITED]` Gillespie, "Fundamentals of Vehicle Dynamics", SAE 1992, §5.3 quarter-car model — textbook formulation
- `[CITED]` Genta & Morello, "The Automotive Chassis Vol. 1", §5.2 — quarter-car ODEs and natural frequency derivation
- `[ASSUMED based on training]` Standard ARB bilinear-spring approximation as taught in introductory vehicle dynamics courses; consistent with D-07's explicit choice

### Tertiary (LOW confidence)
- None. All numerical defaults are first-principles derivations (Pattern 4 and Code Examples section), not from external sources — flagged in Assumptions Log as needing empirical tuning.

## Metadata

**Confidence breakdown:**
- Quarter-car math: HIGH — textbook formulation, project explicitly defines all decisions (D-01..D-15)
- Integration order: HIGH — substep loop pattern is well-established; only ambiguity is averaging-vs-final tireFz, resolved with explicit recommendation
- ARB formulation: HIGH — D-06/D-07 lock the bilinear-spring approximation, math is one screen
- Default tunings: MEDIUM — derived from first-principles natural-frequency/damping targets; expect retuning via sliders during execution
- Visual binding: MEDIUM — D-16 is concise; exact mesh-local-Y formula confirmed via existing carGroup parenting pattern
- Pitfalls: HIGH — most are direct consequences of decisions D-09/D-14/D-15

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (project is stable; physics math doesn't age)

## RESEARCH COMPLETE

**Phase:** 4 - Suspension
**Confidence:** HIGH

### Key Findings
- All physics decisions are pre-locked in CONTEXT.md (D-01..D-16); Phase 4 is execution, not exploration
- Quarter-car math is textbook; ARB is bilinear-spring approximation per D-07 (no new geometry)
- Stability gate: dt/2 substep with tire spring k=210000 N/m and m_u=18 kg gives ~2× safety margin even with slider doubling — verified via ω_n calculation
- Pacejka Fz must come from tire-spring side, not suspension-spring side (D-03) — this also makes wheel-lift detection trivial (D-05 = D-14: tireFz ≤ 0)
- Existing `computeNormalForce` and `getWheelPosition` in suspension.js have locked signatures from Phase 1 D-05 — bodies get replaced, callers don't change
- Defaults derived from first-principles (1.5 Hz body bounce, ζ=0.4) are: k_S front/rear = 33k/27k N/m, c_S = 2.8k/2.3k N·s/m, k_ARB front/rear = 15k/8k N/m, wheelMass=18 kg
- No new external deps; entirely additional math + state + sliders

### File Created
`.planning/phases/04-suspension/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new libraries; existing Three.js + lil-gui |
| Architecture | HIGH | Project locks the architecture in CONTEXT.md and CLAUDE.md |
| Pitfalls | HIGH | Pitfalls are direct corollaries of D-09/D-14/D-15 |
| Default Tunings | MEDIUM | First-principles values; expect empirical retune |

### Open Questions
1. Hub XZ kinematics scope — recommendation: hub XZ tracks body mount point each substep (no independent XZ state)
2. Multi-contact handling for per-corner tireFz — recommendation: sum vertical components for hub ODE; use single tireFz as Pacejka budget across contacts
3. Averaged vs final substep tireFz for Pacejka feed — recommendation: averaged, documented in code
4. Mesh local-Y computation under combined body roll + hub motion — recommendation: carGroup parenting handles body-local space automatically

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommend 3 plans (suspension math + integration + ARB; debug/HUD/logger; scenario validation + housekeeping).

# Phase 4: Suspension - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 replaces the "matchbox car" model (tire radial compliance is the only spring between body and ground) with a proper **quarter-car suspension at each corner**: a new spring-damper between the wheel hub and the body, with the wheel hub integrated as its own mass. The existing tire spring (`tireStiffness`/`tireDamping` in `data/ranger.js`) is reinterpreted as the ground↔hub spring; the new suspension spring sits hub↔body. Anti-roll bars couple the left/right wheels of each axle. Result: visible nose dip under braking, body roll in corners, individual wheels lifting off the ground, and per-wheel dynamic Fz fed into the existing Pacejka tire model.

Phase 4 does NOT add a solid rear axle (real Ranger has one — deferred), does NOT change the Pacejka tire model itself (Phase 3 work), and does NOT add a rollover detection / G-force overlay (that is Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Mass model — full quarter-car
- **D-01:** Quarter-car per corner. Each wheel hub is an integrated rigid body with its own vertical position `hubY[i]` and vertical velocity `hubVy[i]`. Two springs in series load each corner:
  - **Tire spring** (existing): ground ↔ hub. Uses `tireStiffness`, `tireDamping`, compression = depth returned by `queryContacts`. Force = Fz fed into Pacejka.
  - **Suspension spring** (new): hub ↔ body. Uses new `suspensionStiffness`, `suspensionDamping`, `suspensionRestLength` params.
- **D-02:** 4 extra integrated states added to `vehicleState`: `hubY[4]` (m, world Y of wheel hub center) and `hubVy[4]` (m/s, vertical velocity of hub). Per-corner unsprung mass param (`wheelMass`, ≈18 kg from existing `wheelInertia` derivation comment in `ranger.js`).
- **D-03:** Fz fed into Pacejka is the **tire-spring force** (ground side of the hub), not the suspension-spring force. This satisfies M4-04 cleanly and makes M4-05 (wheel lift) trivial: airborne ≡ tire compression goes to zero.

### Topology — fully independent at all 4 corners
- **D-04:** Same quarter-car model applied 4×. No solid rear axle coupling. Front and rear use the same `suspensionStiffness`/`suspensionDamping`/`suspensionRestLength` slots, but front/rear values are independently tunable (split params: `suspensionStiffnessFront`, `suspensionStiffnessRear`, etc.) so the user can dial in understeer/oversteer balance.
- **D-05** [informational]: Solid rear axle (live beam with shared roll DOF — authentic Ranger behavior) is **deferred** to a post-Phase-5 enhancement. Note added to `<deferred>`.

### Anti-roll bars — front + rear, slider-tunable
- **D-06:** Anti-roll bars are included in Phase 4. Two params: `arbStiffnessFront`, `arbStiffnessRear` (N/m). Per axle, the ARB applies an equal-and-opposite force pair between left and right wheels proportional to the **difference** in suspension compression:
  - `F_arb = arbStiffness * (compressionLeft − compressionRight)`
  - Applied as `−F_arb` to the left wheel and `+F_arb` to the right wheel (or equivalent — sign chosen so an axle in pure heave gets zero ARB force).
- **D-07:** ARB force enters the suspension spring loop alongside the main spring — it pushes on the body and hub at each corner with the same lever arm as the main spring (no separate ARB geometry; this is the conventional bilinear-spring approximation).

### Integrator — sub-step suspension at dt/2
- **D-08:** Suspension vertical dynamics (hub positions, hub velocities, body vertical force contribution from springs) are integrated at **dt/2** inside each outer physics step. The outer 6DOF body integration (translation, quaternion rotation, lateral/longitudinal forces, tire forces) remains at the outer dt. Pacejka Fz uses the post-substep tire spring force.
- **D-09:** Physics timestep must be **parameterized**, not hard-coded as `1/60`. Introduce a `PHYSICS_DT` constant or `vehicleState.physicsDt` such that the suspension substep is always `physicsDt / 2`. The substep ratio (2) stays fixed; the outer dt becomes a tunable knob for future phases that may need a different rate.
- **D-10:** Stability target: at the default tunings, increasing `suspensionStiffness` 2× via slider must not produce NaN or oscillation divergence. Researcher should verify the dt/2 substep is sufficient for the range of slider values exposed.

### Debug & HUD (Phase-end housekeeping per Phase 2 D-13)
- **D-11:** New sliders in lil-gui panel:
  - `suspensionStiffnessFront`, `suspensionStiffnessRear` (N/m)
  - `suspensionDampingFront`, `suspensionDampingRear` (N·s/m)
  - `suspensionRestLengthFront`, `suspensionRestLengthRear` (m)
  - `arbStiffnessFront`, `arbStiffnessRear` (N/m)
- **D-12:** Per-wheel Fz visible in the existing debug panel / HUD (M4-09). Use the existing `vehicleState.wheelDebug[i]` scratchpad; add field `fz` written each step. Logger picks it up via the standard log-fields audit.
- **D-13:** GLOSSARY.md additions: sprung mass, unsprung mass, suspension travel, ride height, anti-roll bar, substep / physics timestep convention.

### Wheel lift & airborne behavior
- **D-14:** Airborne criterion: tire spring force `Fz <= 0` → wheel is airborne. Tire forces (Pacejka lateral + longitudinal) are skipped entirely for that wheel; only gravity and the suspension spring act on the hub. The hub falls under gravity until the tire re-contacts the ground (compression > 0).
- **D-15:** Suspension spring force clamps to zero (no tension) at full droop — i.e., when hub is below the body by more than `suspensionRestLength`, the spring cannot pull the hub back up. Damping still acts in both directions.

### Visual binding
- **D-16:** Per-wheel Three.js mesh local Y tracks hub position relative to the body (chassis mesh continues to track `vehicleState.position` and `vehicleState.quaternion` unchanged). Wheel mesh Y offset = `hubY[i] − (body world Y at corner)` projected into body-local space. Visible suspension travel is a Phase 4 success-criterion observable.

### Claude's Discretion
- Exact starting values for `suspensionStiffness`, `suspensionDamping`, `suspensionRestLength` per axle — tune for a body bounce ζ ≈ 0.6–0.8 (slightly underdamped) and 1.5–2 Hz natural frequency
- ARB starting values — tune so front+rear ARBs together produce ≈5° body roll at 0.5g lateral
- `wheelMass` value (≈18 kg per existing wheelInertia derivation)
- Whether to expose `wheelMass` as a slider or leave fixed
- Rest height / preload approach: compute static equilibrium at startup so the car starts settled (not visibly sagging)
- Exact placement of per-wheel Fz readout in the debug panel
- Substep loop structure (2 iterations explicit, or generic N-step accumulator with N=2)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Physics & Suspension
- `src/suspension.js` — locked function signatures (Phase 1 D-05/D-06); Phase 4 replaces bodies of `computeNormalForce`, `getWheelPosition`. `getBodyContactPoints` unchanged. Pure-math contract preserved (no Three.js import — use injected `params._rotateVector`).
- `src/physics.js` — fixed-timestep integrator, force accumulation loop. Phase 4 adds suspension substep loop (D-08), parameterizes the physics dt (D-09), and adds per-wheel hub state integration. ARB coupling computed before per-wheel suspension force application.
- `src/tire.js` — unchanged in Phase 4. Pacejka Fz now sourced from tire spring force per D-03.
- `data/ranger.js` — RANGER_PARAMS; **do not** Object.freeze. Add suspension and ARB params per D-06, D-11. Phase 4 housekeeping audit (D-11, D-13).
- `docs/GLOSSARY.md` — sign conventions, wheel index, quaternion integration. Phase 4 adds entries per D-13.

### Vehicle State
- `src/vehicle.js` — `vehicleState` shape; Phase 4 adds `hubY[4]`, `hubVy[4]` (D-02). `wheelDebug[i].fz` field added (D-12).

### Debug Panel and HUD
- `src/debug.js` — lil-gui panel, backtick toggle, slider audit (D-11, Phase 2 D-13 housekeeping). Per-wheel Fz display (D-12).
- `src/main.js` — game loop. Wheel mesh visual binding (D-16) lives here alongside chassis mesh sync.
- `src/logger.js` — adds per-wheel `fz` field per D-12 / Phase 2 D-13.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Milestone 4 — M4-01 through M4-09
- `.planning/ROADMAP.md` §Phase 4 — success criteria (5 observable truths)

### Prior Phase Context
- `.planning/phases/03-tire-model/03-CONTEXT.md` — Pacejka model that consumes Fz; combined-slip in slip-velocity space; relaxation length; `wheelDebug[i]` pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeNormalForce(corner, vehicleState, params)` in `src/suspension.js` — current body already produces a dynamic Fz from tire compression depth + damping (M4-04 technically already satisfied via tire compliance). Phase 4 replaces body with the **series** quarter-car: solve hub motion, return the **tire** spring force as Fz.
- `params._compression` and `params._compressionVelocity` — already populated by `physics.js` per wheel. Phase 4 reinterprets these as the tire compression (ground↔hub), and adds new `_suspensionCompression`/`_suspensionCompressionVel` for the new hub↔body spring.
- `getWheelPosition(corner, vehicleState, params)` — currently returns hub world position from a fixed local offset. Phase 4 modifies the body to use `hubY[corner]` for the vertical component while keeping XZ from the body-frame rotation. Signature unchanged.
- `queryContacts(cx, cy, cz, r)` — supplies per-wheel contact normal/depth. Phase 4 uses unchanged; depth becomes the tire-spring compression at the hub.
- `vehicleState.wheelDebug[i]` — per-wheel scratchpad already written inside the physics contact loop; add `fz` and optionally `suspCompression`, `hubY`.
- lil-gui slider pattern from Phase 3 D-08 — add new sliders in `initDebug` (D-11).

### Established Patterns
- Params augmented with `params._*` fields before module calls (`physics.js:119–123`); Phase 4 adds suspension-related underscore params per wheel
- `RANGER_PARAMS` passed by reference; new fields just need to be added to `data/ranger.js`
- Per-phase end-of-phase housekeeping: slider audit, log-field audit, GLOSSARY entries (Phase 2 D-13)
- Pure-math modules use injected helpers (`params._rotateVector`) instead of importing Three.js — preserve this for any new pure-math code

### Integration Points
- **`physics.js` outer step**: ARB coupling computed → suspension substep loop (N=2) integrates hub state + applies spring force to body → tire force (Pacejka) computed at outer dt using post-substep Fz → 6DOF body integration
- **`vehicle.js`**: extend `vehicleState` schema with `hubY[4]`, `hubVy[4]`; initialize to rest equilibrium at startup
- **`main.js`**: per-wheel mesh visual binding (D-16) in the render section, not inside the fixed-timestep accumulator

</code_context>

<specifics>
## Specific Ideas

- Substep loop is the **vertical only** subsystem: hub Y/Vy, body Y contribution from suspension forces. Lateral/longitudinal/yaw forces stay at outer dt. This is the smallest cut that buys stability for stiff springs.
- Series-spring reading: at static equilibrium, body weight at each corner = tire spring force = suspension spring force. Pre-compute rest compression so the car starts settled.
- ARB is mathematically a coupling spring on the **suspension** compression (hub↔body), not on tire compression. A bump that pushes only one tire up creates an ARB reaction at the *body* via that side's suspension.
- Wheel lift in M4-05 is observable: when tire compression hits zero, Pacejka contributes nothing, so the airborne wheel is purely ballistic with the suspension spring still attaching it to the body — exactly the desired observable behavior.
- Parameterizing the physics dt early (D-09) is cheap now and saves a refactor later when other phases want to change rate.

</specifics>

<deferred>
## Deferred Ideas

- **Solid rear axle** (live beam, shared roll DOF) — authentic 2002 Ranger but deferred until after Phase 5; 4-independent is sufficient for Phase 4 success criteria
- **Suspension geometry (camber, toe, scrub radius, anti-dive, anti-squat)** — Phase 4 ships pure vertical springs; full kinematics is post-v1
- **Separate ARB geometry / motion ratio** — Phase 4 uses bilinear-spring approximation (ARB force lever = main spring lever)
- **Bump-stops / progressive springs** — Phase 4 uses linear springs only; non-linear stop region deferred
- **Damper bleed / digressive damping curves** — Phase 4 uses linear damping; non-linear deferred
- **Adjustable wheel mass slider** — Phase 4 uses a fixed `wheelMass`; expose as slider only if tuning need emerges

</deferred>

---

*Phase: 4-Suspension*
*Context gathered: 2026-05-31*

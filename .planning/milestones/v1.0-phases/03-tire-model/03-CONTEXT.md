# Phase 3: Tire Model - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers physics-honest lateral grip, wheelspin, and drift by replacing the Phase 1 linear cornering-stiffness placeholder with the Pacejka Magic Formula. Both lateral and longitudinal forces use Pacejka with a friction circle coupling. Real per-wheel angular velocity (`wheelOmega[4]`) is added to `vehicleState` and integrated each step. A handbrake (Space) locks rear slip. A live Pacejka curve overlay with per-front-wheel operating-point dot ships in the debug panel.

Phase 3 does NOT add spring-damper suspension or dynamic Fz — that is Phase 4. Normal force remains the flat tire stiffness model from Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Longitudinal Slip Model — Full Pacejka for Both Axes
- **D-01:** Phase 3 replaces BOTH `computeLateralForce` and `computeLongitudinalForce` bodies with Pacejka Magic Formula. The ROADMAP explicitly requires "a friction circle that couples lateral and longitudinal forces correctly" and "real wheel angular velocity" — this requires true slip ratio math.
- **D-02:** `vehicleState` gains `wheelOmega[4]` (rad/s) — per-wheel angular velocity. Integrated each physics step: `omega += (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt`. `vehicleState.wheelAngles[4]` (visual accumulation) continues unchanged for rendering.
- **D-03:** `getDriveTorque` in `physics.js` continues to return the torque value; the caller uses it to compute `driveTorque` in the omega integrator. The signature does not change.
- **D-04:** Slip ratio definition: `κ = (ω·r − v_x) / max(|ω·r|, |v_x|, ε)` where `ε` is a small epsilon (e.g. 0.1 m/s) to prevent divide-by-zero at rest. Sign convention in GLOSSARY.md — add entry.
- **D-05:** Friction circle coupling: `F_total = sqrt(Flat² + Flong²)`; if `F_total > μ·Fz`, scale both components down proportionally. Applied inside `physics.js` after both tire functions return, before force accumulation.

### Pacejka Parameters
- **D-06:** Single set of Pacejka B/C/D/E for all 4 wheels (Ranger runs same tire all around). Separate front/rear tuning deferred to Phase 4+ when dynamic Fz makes it meaningful.
- **D-07:** Lateral Pacejka coefficients added to `data/ranger.js`: `pacejkaB`, `pacejkaC`, `pacejkaD`, `pacejkaE`. Longitudinal coefficients: `pacejkaBx`, `pacejkaCx`, `pacejkaDx`, `pacejkaEx`. Starting values from published Pacejka curve-fitting for street truck tires (B≈10, C≈1.9, D≈1.0, E≈0.97 for lateral; Bx≈12, Cx≈1.65, Dx≈1.0, Ex≈0.5 for longitudinal). Exact values are tuning targets — exposed as sliders (D-08).
- **D-08:** `corneringStiffness` slider removed from debug panel (D-12 from Phase 2 said Phase 3 replaces it). Replaced with sliders for `pacejkaB`, `pacejkaC`, `pacejkaD`, `pacejkaE` (lateral). Longitudinal B/C/D/E sliders added in a separate "Longitudinal Tire" folder. `lateralDampingCoeff` slider removed (it was already labeled "(unused)").

### Handbrake
- **D-09:** Space key is the handbrake. Applies maximum brake torque to rear wheels only (wheelIndex 2 and 3). Does NOT hard-lock omega to zero — slip develops naturally via the Pacejka model, which produces the saturation/oversteer that makes drift possible.
- **D-10:** `vehicleState.handbrake` (boolean) added; set by `vehicle.js` input handler. `getDriveTorque` (or a new `getBrakeTorque` helper) respects this: when `handbrake` is true, rear brake torque = `maxHandbrakeTorque` (new param in `data/ranger.js`), front torque unchanged.

### Pacejka Curve Plot
- **D-11:** Rendered as a standalone `<canvas>` element (separate from the lil-gui panel) appended to `document.body`. Shown/hidden with the debug panel (same backtick toggle). Positioned top-left via CSS absolute positioning. Drawn each animation frame when visible.
- **D-12:** Plot shows the Pacejka lateral force curve (Flat vs slip angle) with a colored dot for each front wheel's current operating point. Y-axis: normalized to peak force (D coefficient). X-axis: ±0.3 rad slip angle range. Color: green < 50% peak, orange 50–80%, red > 80%.
- **D-13:** Curve plot lives in `src/debug.js` — a new `updatePacejkaCurve(vehicleState, params)` function exported alongside `initDebug`. Called from the game loop alongside other HUD updates.

### HUD — Front Slip Angle Indicator
- **D-14:** Front slip angle indicator added to the existing HUD. Displays current front slip angle in degrees with color coding: green (<5°), orange (5–10°), red (>10°). Uses the FL wheel slip angle from `vehicleState.wheelDebug[0].sa`.

### End-of-Phase Housekeeping (D-13 from Phase 2)
- **D-15:** Log fields audit: add `{fl/fr/rl/rr}_omega` (wheel angular velocity in rad/s) to the logger. GLOSSARY.md gains entries for: longitudinal slip ratio (κ), Pacejka B/C/D/E coefficients, wheelOmega, handbrake.
- **D-16:** Debug sliders audit: remove `corneringStiffness` and `lateralDampingCoeff` (both unused after Phase 3). Add Pacejka sliders (D-08). Add `maxHandbrakeTorque` slider.

### Claude's Discretion
- Exact Pacejka starting values — tune for feel within published street-tire ranges
- Wheel inertia value for omega integrator — estimate from wheel mass and radius
- Canvas plot pixel dimensions and visual style
- Exact HUD layout for slip angle indicator (placement relative to existing speed readout)
- Epsilon value in slip ratio denominator

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Physics Module — Signatures and Conventions
- `src/tire.js` — locked function signatures (D-05, D-06 from Phase 1); Phase 3 replaces bodies only, call sites in `physics.js` do not change
- `src/physics.js` — force accumulation loop, where friction circle coupling is applied (Step 3), omega integrator added here
- `data/ranger.js` — RANGER_PARAMS; Pacejka params and `maxHandbrakeTorque` added here; do NOT Object.freeze()
- `docs/GLOSSARY.md` — sign conventions for slip angle, contact patch velocity; Phase 3 adds entries for κ, wheelOmega, Pacejka terms

### Vehicle Input
- `src/vehicle.js` — input handler; handbrake Space key added here; `vehicleState.handbrake` field added

### Debug Panel and HUD
- `src/debug.js` — existing lil-gui panel and backtick toggle; Pacejka curve canvas added here; slider audit (D-08, D-16)

### Requirements
- `.planning/REQUIREMENTS.md` §Milestone 3 — M3-01 through M3-10
- `.planning/ROADMAP.md` §Phase 3 — success criteria (5 observable truths)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeLateralForce(slipAngle, Fz, params)` in `src/tire.js` — replace body only; caller in `physics.js:151` passes `slipAngle = atan2(latVel, |longVel| + 0.01)` and `Fn`
- `computeLongitudinalForce(slipRatio, Fz, params)` in `src/tire.js` — replace body; currently called with `slipRatio = 0` (`physics.js:152`) — Phase 3 computes real slip ratio from `wheelOmega[i]` and passes it
- `vehicleState.wheelAngles[4]` — visual spin; keep as-is for rendering; `wheelOmega[4]` is new and separate
- `initDebug(params)` in `src/debug.js` — add Pacejka sliders and canvas plot here; backtick toggle already controls `gui.domElement.style.display`

### Established Patterns
- Params augmented with `params._*` fields before tire calls (lines 119–123 of `physics.js`); Phase 3 augments with `params._slipRatio` per wheel
- `vehicleState.wheelDebug[i]` written inside the contact loop — add `omega` field here for logger
- `RANGER_PARAMS` passed by reference everywhere; new Pacejka fields just need to be added to `data/ranger.js`

### Integration Points
- `physics.js` Step 3 contact loop: omega integrator runs after drive torque lookup; friction circle coupling applied after both `computeLateralForce` and `computeLongitudinalForce` return
- `vehicle.js` input handler: `vehicleState.handbrake` set here alongside `throttle` and `brake`
- `main.js` game loop: `updatePacejkaCurve(vehicleState, params)` called in the render/HUD update section (not inside the fixed timestep accumulator)

</code_context>

<specifics>
## Specific Ideas

- The friction circle coupling (D-05) is applied in `physics.js`, not in `tire.js` — tire functions return independent forces, physics.js scales them. This keeps `tire.js` pure math.
- Pacejka curve plot uses normalized axes (not absolute N) so the shape is readable regardless of mass/Fz tuning
- Handbrake should make the rear break away, not instantly lock — this means the physics model needs to allow slip ratio to grow, which the Pacejka model handles naturally once drive/brake torque exceeds road reaction

</specifics>

<deferred>
## Deferred Ideas

- Separate front/rear Pacejka coefficients — meaningful once Phase 4 adds dynamic Fz; single set is sufficient for Phase 3
- Longitudinal Pacejka curve plot (rear slip ratio operating point) — only lateral is required per ROADMAP SC#4; can add rear in Phase 4/5
- Engine rev simulation / gear ratios — drivetrain model is flat torque through Phase 3; full drivetrain is a post-v1 concern
- Tire temperature model — deferred post-v1

</deferred>

---

*Phase: 3-Tire-Model*
*Context gathered: 2026-05-29*

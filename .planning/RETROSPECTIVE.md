# Retrospective: RangerSim

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-03
**Phases:** 7 (1, 2, 3, 4, 4.1 INSERTED, 5 SKIPPED, 6) | **Plans:** 22

### What Was Built

- 6DOF rigid body with quaternion rotation; fixed 1/60s deterministic timestep
- Pacejka Magic Formula tire model — lateral + longitudinal, friction circle, real wheelspin and drift
- Spring-damper suspension with strut-axis ODE (strutComp state), bump/droop stops, dynamic Fz, ARB
- 14-probe sphere contact impulse solver (bumpers, undercarriage, sill, roof) with Coulomb friction
- Infinite simplex noise procedural terrain via Web Worker; bilinear height/normal query
- Scenario system (JSON IC → 45-field frame log), lil-gui debug panel (35+ sliders), Pacejka live plot, suspension travel bars, HUD

### What Worked

- **Quaternion-only rotation from day one** — decision made in Phase 1 paid off every subsequent phase; zero gimbal lock issues through rollovers
- **Locked function signatures (D-06)** — commitments to `computeLateralForce(slipAngle, Fz, params)` etc. meant Phase 3/4 replaced implementations without any call-site churn
- **Surface normals in physics from day one (M1-13)** — terrain integration in Phase 6 required no changes to main.js contact architecture; the terrain stub was already wired
- **Per-phase SUMMARY.md discipline** — each plan produced a detailed summary; retrospective data extraction was trivial
- **GSD quick tasks for physics corrections** — several mid-phase CR bugs were cleanest to fix as quick tasks (CR-02, CR-03, WR-02) without forcing a replanning cycle

### What Was Inefficient

- **REQUIREMENTS.md traceability table never updated** — all 58 entries remained "Pending" throughout v1.0; the validation work happened in PROJECT.md instead. Next milestone: update the traceability table atomically after each phase.
- **Phase 4 → 4.1 insertion was predictable** — the hub float, ARB mismatch, and ramp-rest bug were all variants of the same root cause (world-Y hub state broke at non-zero body angles). A deeper Phase 4 research phase on strut-axis ODE might have prevented the insertion.
- **Phase 5 skip with no formal closure** — skipping was the right call, but M5-03 through M5-07 were left without verification records. The skip should have written a brief SKIP.md with evidence that each requirement was satisfied organically.
- **01-04-SUMMARY.md never written** — Phase 1 Plan 04 (camera + debug) was the only plan in the milestone without a summary. Low impact but a loose end.

### Patterns Established

- `params._rotateVector` injection: physics.js injects a rotation closure into params before calling suspension.js; keeps suspension.js pure-math and Three.js-free
- Append-only FIELDS convention: logger FIELDS array is never reordered; new fields appended at end with comment
- `??` nullish-coalesce defaults in captureFrame row: missing wheelDebug fields degrade to 0 not NaN
- lil-gui addFolder pattern: each subsystem owns a folder; all params in the folder are live-mutable via RANGER_PARAMS reference
- Verification override entry: VERIFICATION.md `overrides` section accepts deviations with rationale rather than forcing code churn

### Key Lessons

- **Commit to coordinate system decisions early and never revisit** — Y-up everywhere + named vectors (forward, right, up) instead of axis literals was never a source of confusion across any session
- **Stub signatures are contracts** — the 6 locked D-06 function signatures provided a stable interface through 4 rewrites of the underlying bodies; contract-first stubs were worth the upfront cost
- **Physics correctness bugs surface at the boundary, not the center** — most Phase 3/4 bugs were at the contact patch (sign errors in slip angle, cross product handedness, damper sign) not in the integrator. The integrator is small; the force pipeline is where physics gets subtle.
- **Web Worker terrain is the right architecture** — Phase 6's Blob Worker approach kept main thread clean; no jank during chunk generation. Worth doing from the start of any terrain system.

### Cost Observations

- Sessions: multiple over 24 days
- Notable: Phase 4.1 insertion was the most expensive unforeseen cost (~3 plans, ~1 week); root cause was world-Y hub assumption that broke on non-horizontal body. Predictable in hindsight.

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 7 |
| Plans | 22 |
| LOC (src/) | ~3,300 |
| Timeline | 24 days |
| Insertions | 1 (Phase 4.1) |
| Skips | 1 (Phase 5) |
| Key pivots | World-Y → strut-axis hub ODE |

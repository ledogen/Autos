# Phase 2: Scenario System + Debug Menu - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Adds two tools for physics debugging: (1) an initial condition loader that sets car state from a JSON file, and (2) a key-triggered frame logger that records physics state to a downloadable JSON log. Also completes the lil-gui debug panel with all tunable physics constants. No headless replay, no deterministic verification.

</domain>

<decisions>
## Implementation Decisions

### Scenario System — Reframed as Debugging Tools
- **D-01:** No headless deterministic replay. The scenario system is two simpler tools: initial condition loader + frame logger.
- **D-02:** Initial condition loader reads a JSON file (via file picker) and sets vehicle state — position, orientation, velocity, angular velocity. Lets the user reproduce a known buggy starting state.
- **D-03:** Frame logger is key-triggered (`\` backslash key, toggled on/off). On stop, automatically downloads the JSON log. No separate download button needed.
- **D-04:** Debug menu shows a hint for the `\` key (e.g. a read-only label "\ to record").
- **D-05:** Log purpose is bug reporting — user reproduces a bug, captures a log, shares it with Claude alongside a description of what's happening in game space.

### Log Format
- **D-06:** Columnar JSON format — one `fields` header array with short names, then `frames` as an array of arrays (one row per physics tick). Cuts size ~5x vs per-frame named-key objects.
- **D-07:** Fields to capture per frame: `t` (sim time), `px/py/pz` (position), `vx/vy/vz` (velocity), `qx/qy/qz/qw` (quaternion), `wx/wy/wz` (angular velocity), `steer` (steering angle), `thr`/`brk` (throttle/brake inputs), and per-wheel `{fl/fr/rl/rr}_fn` (normal force), `_fy` (lateral force), `_sa` (slip angle), `_c` (compression).

### Debug Menu — Slider Scope
- **D-08:** Expose as sliders: `mass`, `tireStiffness`, `tireDamping`, `corneringStiffness`, `frictionCoeff`, `maxDriveTorque`, `maxBrakeTorque`, `bodyContactStiffness`, `bodyContactDamping`.
- **D-09:** Fixed (no sliders): `rollingResistanceCoeff`, `steerRate`, `steerDecayRate`, geometry fields (wheelbase, trackFront/Rear, cgHeight, wheelRadius, bodyLength/Width/Height), weight distribution.
- **D-10:** Inertia fields (`inertiaRoll`, `inertiaPitch`, `inertiaYaw`) are not sliders — they're now derived from mass and geometry (box model). Exposing them as independent sliders would break that invariant.
- **D-11:** `lateralDampingCoeff` slider stays for compat but can be labeled "(unused)" — it was replaced by corneringStiffness but removing it would break existing slider wiring.
- **D-12:** `corneringStiffness` is a Phase 2 placeholder. Phase 3 (Tire Model) replaces it with Pacejka B/C/D/E coefficients. The slider should be labeled to make this clear.

### End-of-Phase Housekeeping
- **D-13:** At the end of every phase, audit and update: debug sliders (expose new tunable params), HUD/debug variable displays, and log fields (add any new physics state worth capturing). Do this before closing out the phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Physics Parameters
- `data/ranger.js` — RANGER_PARAMS object; source of truth for all tunable fields. Inertia now derived from mass + body geometry (box model). Do NOT Object.freeze().

### Debug Panel
- `src/debug.js` — existing lil-gui panel; backtick toggle, 4 sliders already wired. Phase 2 adds more sliders and the `\` key hint label.

### Requirements
- `.planning/REQUIREMENTS.md` §Milestone 2 — M2-01 through M2-06 (note: M2-01/02/03 are reframed per D-01 through D-05 above)
- `.planning/ROADMAP.md` §Phase 2 — success criteria

### Glossary
- `docs/GLOSSARY.md` — physics terms and sign conventions; log field names should match glossary where possible

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/debug.js` `initDebug(params)` — returns the GUI instance; Phase 2 adds controllers to it and a read-only label for the `\` hint
- `src/main.js` `stepPhysics` call in the game loop — frame logger hooks here to capture state each tick when recording is active
- `RANGER_PARAMS` in `data/ranger.js` — passed by reference to `initDebug`; slider mutations write directly to the live object

### Established Patterns
- lil-gui sliders write directly to `RANGER_PARAMS` fields — changes take effect immediately because physics reads the same object each step (M2-06 already working for existing sliders)
- Backtick (`\`` ) toggles debug panel visibility via `gui.domElement.style.display`

### Integration Points
- Frame logger needs access to `vehicleState` and per-wheel contact data each physics step — likely a module-level flag + array in `src/main.js` or a new `src/logger.js`
- Initial condition loader sets `vehicleState` fields before the physics loop resumes — needs reset-style access to vehicle state

</code_context>

<specifics>
## Specific Ideas

- `\` (backslash) chosen as logger toggle because it won't conflict with driving controls or future controls (headlights → L, etc.)
- Log is intended to be pasted to Claude alongside a plain-English description of the bug — compact columnar format prioritizes token efficiency for that use case
- "\ to record" label in debug menu hints the key without requiring the panel to be open while driving

</specifics>

<deferred>
## Deferred Ideas

- Headless deterministic replay (run scenario without rendering, verify identical output) — explicitly out of scope per user; may revisit in a later phase if needed for regression testing
- Auto-inertia update when mass slider changes at runtime — currently inertia is computed at load time only; deferred to Phase 4 or later when suspension model makes this more important

</deferred>

---

*Phase: 2-Scenario-System-Debug-Menu*
*Context gathered: 2026-05-28*

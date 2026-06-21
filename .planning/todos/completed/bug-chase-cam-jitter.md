---
id: BUG-06
type: bug
severity: minor
status: closed
opened: 2026-06-03
closed: 2026-06-21
resolution: "Closed on user UAT (no headless gate — render-time/subjective). Symptom gone in current build. Most likely resolved INDIRECTLY by Phase 4.1 suspension stabilization (less CG micro-bounce to amplify); the suspected mechanism (unsmoothed lookAt, camera.js:239) is still present, so a one-line _smoothLookAt lerp remains the fix if it ever resurfaces."
---

# BUG-06: Intermittent jitter in chase cam (not orbit, not cockpit)

## Symptom

The chase camera intermittently shifts 1–2° or drifts slightly for a frame or two. Not a big snap or flip — a small positional or angular wobble. Only in chase follow mode; orbit (drag) and cockpit are both clean.

## Root cause analysis

Two suspects, both specific to the chase lerp path.

### Suspect A — Unsmoothed `lookAt` target (most likely)

`src/camera.js` line 89–90:

```js
camera.position.lerp(goalPos, alpha)   // ← position is smoothed
camera.lookAt(vehicleState.position)   // ← lookAt target is RAW, no smoothing
```

The camera *position* is lerp'd with stiffness 5 s⁻¹ (slow follow). The *look-at target* is the car's exact CG position, updated every render frame with no lag. When the car's CG bounces vertically — even slightly from suspension oscillation or terrain — the view direction changes instantly while the camera position does not. The angular error is `atan(Δy / distance)`: a 5 cm CG bounce at 6.5 m camera distance is ~0.4°; a 15 cm bounce (terrain) is ~1.3°. This matches the reported magnitude.

**Why orbit is immune:** In orbit/drag mode, `camera.position` is computed directly from `vehicleState.position` with no lag — both camera position and lookAt target track the car simultaneously, so relative bounce cancels out.

**Why cockpit is immune:** Camera position is also computed directly from `vehicleState.position` + offset, same simultaneous tracking.

Only the lerp'd chase path creates a mismatch between smoothed camera position and unsmoothed view target.

### Suspect B — Physics step granularity at high refresh rates

`updateCamera` is called with `frameTime` (render dt). The `goalPos` it lerps toward is derived from `vehicleState.position`, which only updates at physics steps (60 Hz). On a 120 Hz display, goalPos is *frozen* for two render frames, then jumps to the next physics-step position. The lerp chases a position that steps rather than moves smoothly. This produces a subtle periodic micro-stutter visible as camera wobble. Orbit and cockpit both read `vehicleState.position` directly each frame so the same step is visible but doesn't produce a view-direction discrepancy.

## Candidate fixes

**For Suspect A (recommended first):**
Smooth the lookAt target with a separate lerp'd position. Add a module-level `_smoothLookAt = new THREE.Vector3()` and lerp it toward `vehicleState.position` at a higher stiffness (e.g. 12–15 s⁻¹) so it follows quickly but still damps micro-bounces:

```js
// At module scope:
const _smoothLookAt = new THREE.Vector3()

// In updateCamera follow branch:
const lookAlpha = 1 - Math.exp(-12 * dt)
_smoothLookAt.lerp(vehicleState.position, lookAlpha)
camera.position.lerp(goalPos, alpha)
camera.lookAt(_smoothLookAt)
```

**For Suspect B:**
Store the previous and current physics position and interpolate by `accumulator / PHYSICS_DT` in the render loop (standard fix-your-timestep interpolation). More invasive — requires threading the interpolation fraction through to camera.js.

## File

`src/camera.js` — line 90 (`camera.lookAt`), inside the `else` (non-dragging) branch of `updateCamera`.

## Notes

- The Euler extraction on lines 84–85 is still slightly inelegant (allocates `THREE.Euler` each frame, gimbal-adjacent at extreme pitch) but is **not** the cause of the reported symptom. The forward-vector/atan2 replacement is still a valid improvement if a refactor is done here.
- Reset `_smoothLookAt` to `vehicleState.position` on R-reset so it doesn't lerp in from the old position after reset.

## Resolution (2026-06-21)

Closed on user verification — user reports the chase cam is smooth in the current build and is happy
with it. No headless gate: the camera is render-time / rAF + DOM coupled and the symptom is subjective
(a 1-2deg intermittent wobble), so there is nothing deterministic to assert in the zero-install harness.

Honest note for the record: the prime suspect from the root-cause analysis — the UNSMOOTHED `lookAt`
target — is still in the code (`src/camera.js:239`, `camera.lookAt(vehicleState.position)`, raw, no
lerp; no `_smoothLookAt` was ever added). So the jitter was not fixed in the camera. It was most likely
resolved INDIRECTLY: the wobble magnitude is `atan(dY / distance)` driven by CG micro-bounce from
suspension oscillation, and the Phase 4.1 strut/damper stabilization removed that bounce, leaving the
unsmoothed look-at nothing to amplify.

Latent mechanism therefore remains: a violent CG bounce (e.g. the BUG-15 slam, or rough terrain) could
still produce a frame or two of look-at wobble. If it resurfaces, apply the `_smoothLookAt` lerp from
the Candidate Fixes section above (and reset it to vehicleState.position on R-reset).

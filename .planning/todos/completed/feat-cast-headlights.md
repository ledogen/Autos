---
id: FEAT-14
type: feature
status: done
severity: minor
opened: 2026-06-28
closed: 2026-06-28
source: user-request
relates: QUAL-02
---

# FEAT-14: Real cast lighting — 3-state headlights + diffuse rear lamp pools

## Request

Make the vehicle lamps cast real light into the scene (not just glow as emissive panels):

- **Headlights** toggle with `L`, cycling **off → headlights (low beam) → high beams → off**.
  They cast a forward beam that illuminates the terrain/road ahead of the car.
- **Taillights** and **reverse lights** cast a more **diffuse, unidirectional** rearward
  illumination too (red pool for running/brake, white pool on reverse).

Context: until now the lamps were emissive panels only, deliberately, because the scene ran full
daytime sun (a documented perf decision in `vehicle-model.js`). QUAL-02 added a day/night cycle, so
real beam casters now actually matter at night — this feature reverses that decision intentionally.

## Acceptance

- `L` cycles headlights through 3 states: off → low → high → off. Both the emissive lens panels and
  the cast beam respond (low = warm pool; high = brighter, longer, flatter).
- Headlights are real `THREE.SpotLight`s parented to the car; the beam moves/turns with the vehicle
  and lights up the ground ahead (clearly visible at night, naturally subtle by day).
- Rear lamps cast a diffuse rearward pool: dim red when running lights are on, brighter red on brake,
  white when actually reversing. Reuses the existing brake/reverse detection in `syncMeshesToState`.
- Works for both the primitive-truck fallback and the imported GLB (lights parent to `carGroup`, not
  to either mesh tree).
- **Perf:** stays within the 60fps / iGPU-floor budget. Fixed light count (2 headlight + 2 rear
  spots), **no spotlight shadows by default** (toggleable in the debug GUI). Lights stay in the scene
  graph and are dimmed to intensity 0 when off (avoids a shader recompile hitch on toggle).
- New tunables (intensity/distance/angle/decay/shadow toggle) exposed in the debug panel per the
  phase-housekeeping convention.

## Implementation notes

- All lights live in `src/vehicle-model.js` (it owns the car's appearance). Spotlights + their
  `.target`s are children of `carGroup`.
- Headlight mode is `0=off / 1=low / 2=high`; `applyHeadlights()` sets both the lens panels and the
  spot params. Rear spot intensities are driven per-frame in `syncMeshesToState` alongside the
  existing tail/brake/reverse logic.
- `addLightGui(gui)` returned from `createVehicleModel`, wired in `main.js` next to `skySystem.addGui`.

## Notes / tradeoffs

- The cast rear illumination is a single red caster + single white caster (centered, wide, soft) for
  perf; the two visible lens panels per function are unchanged. Splitting into 2+2 rear casters is a
  possible future quality bump if the budget allows.

## Resolution (2026-06-28)

Delivered in `src/vehicle-model.js` (+ `src/sky.js` nightFactor, `src/main.js` wiring). All visual,
tuned in-browser; values live in `HEAD_TUNE` / `REAR_TUNE` / `LIGHT_ENV`, exposed in the
**Vehicle Lights (FEAT-14)** debug folder.

- **Headlights**: real SpotLights, `L` cycles off → low → high → off. Low beam is a HALF cone via a
  projected `SpotLight.map` cookie (beltline cutoff, `lowCutoff`); high beam full cone. Both always
  carry a cookie so low↔high never recompiles the shader.
- **Rear lamps**: 2 red brake/running casters + 2 white reverse casters at the lens corners (not
  centered). Emissive lens panels reflect state via colour + `emissiveIntensity` (primitive + GLB).
- **GLB lens**: front split of the shared `FrontColor` white-lens material driven as headlights;
  rear split as reverse (`splitRearGroup` returns `{frontMat, rearMat}`).
- **Day/night**: cast-beam intensity scales by `SkySystem.nightFactor()` (subtle by day, full at
  night); lens emissive stays constant so lamps still read lit in daylight.
- **Perf**: fixed 6 spotlights, no spotlight shadows by default (root-caused as a per-headlight
  shadow-map pass over car + instanced props each frame; mitigated to 512 map / 50 m far when used).

Tuned final values (panel): lowInt 700, highInt 1130, low/high distance 120/200, decay 1.8,
lowCutoff 0.37, lowAngle 0.70.

Note: `distance = 0` collapses the spot-map frustum and breaks the cookie — sliders floored at 20.

Follow-up (separate ticket if pursued): the **scatter pass** for night side-fill was discussed but
not implemented.

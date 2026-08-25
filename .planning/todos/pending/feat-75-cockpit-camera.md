---
id: FEAT-75
type: feature
status: open
severity: minor
opened: 2026-08-25
updated: 2026-08-25
relates: ASSET-34, FEAT-49, FEAT-33
---

# FEAT-75: Cockpit camera

`ranger.glb` (ASSET-34) ships a modelled interior — dash with binnacle and centre stack, console and
shifter, two seats, door cards, headliner, visors, mirror, and a steering wheel on its own node.
**Nothing looks at it yet.** `src/camera.js` has three modes (chase / hood / freecam) and the hood cam
sits at body-space `(0, 0.75, -1.0)` — *outside* the cab, on the bonnet. The interior was built
because the owner asked for the cockpit camera to have a reason to exist (2026-08-25); this is the
other half of that.

## Request

A fourth camera mode: the driver's eye point, looking forward through the windscreen.

The model is already dimensioned for it — driver seat centre at model-local x −0.355, cushion top
z 0.855, headliner 1.526. A driver's eye lands around **model-local (−0.355, +0.05, 1.44)**, which
is car-local `(−0.355, 1.44 − 0.651, −0.05)` ≈ `(−0.355, 0.79, −0.05)` given the ASSET-34 plant
(model z = 0 sits at car-local y = −(cgHeight + static sag) = −0.651). Treat those as a starting
point, not a spec — seating position is a feel question.

## Open questions (owner's, not the model's)

- Does it replace the hood cam in the `C` cycle, or become a third stop (chase → hood → cockpit)?
- Does the cockpit cam get the hood cam's body-locked look-around, and with what clamps?
- Does the FEAT-49 gauge-cluster HUD stay on screen in cockpit view, or yield to the modelled dash?
  (The modelled cluster is geometry only — no needles, no numbers.)

## Acceptance

- [ ] A camera mode that puts the eye inside the cab, with the dash, wheel and A-pillars in frame
- [ ] Body-locked (it rides pitch and roll — that is the whole point of an interior view)
- [ ] Near plane close enough that the dash does not clip
- [ ] No mode-switch snap (CAM-03)

## Related, and cheap once this exists

The steering wheel is `root.getObjectByName('SteeringWheel')`, parented to the body with its origin
on the column axis. Animate it with **`.rotation.y`** — node-local Y, *not* z: the exporter's +Y-up
conversion maps the Blender local Z it was built about onto glTF local Y. Drive it from
`vehicleState.steerAngle` times the lock-to-lock ratio.

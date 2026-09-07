---
id: BUG-60
type: bug
status: pending
severity: medium
opened: 2026-09-06
source: >
  owner, seeing the menu stage's front-left tire visibly sink into the rock it lands on (FEAT-41).
  Owner's framing, and the reason this ticket exists rather than a cosmetic patch in stage.js:
  "the true elephant in the room, which is our box3d to internal physics schema conversion layer
  misbehaving."
relates_to: >
  src/physics-engine.js (THE adapter seam), src/physics.js (stepPhysics / qcPlus / contact
  assembly), src/suspension.js (tire spring, WHEEL_SOFT_BAND, effectiveWheelRadius),
  src/vehicle-model.js (the rigid wheel mesh), FEAT-48 (the Box3D cutover),
  FEAT-41 (where it became visible), QUAL-25 (wheel hard cores)
---

# BUG-60: a loaded wheel is drawn rigid while the tire model penetrates the surface

## Symptom

On the FEAT-41 menu stage the truck is dropped so its front-left wheel lands on a rock. The tire
**visibly sinks into the rock** — a quarter of it disappears — twice, as the suspension oscillates,
before settling into a pose that looks fine. Against terrain the same thing happens and nobody has
ever seen it, because a road surface hides the intersection at the contact patch. A discrete convex
solid is the first thing in this project to show it.

## Measured (FEAT-41 stage, seed-independent — it is the vehicle, not the world)

Instrumented every physics step of the drop:

- **Zero missed contacts** — 88 consecutive frames in contact, no dropouts.
- **Exactly one physics step per rendered frame**, median frame 17 ms, max 31 ms. No pacing artefact,
  no catch-up, no jump in body height between frames.
- **Penetration of the wheel sphere into the solid: 55 mm at rest, 92 mm at the landing peak.**
  Tire radius is 368 mm, so the peak is a quarter of the wheel.
- `rimForceRoad` stays 0 throughout, so this is entirely inside the modelled soft band — the carcass
  never bottoms out onto the rim.

So the contact chain is behaving. The penetration is not an error term; it is what the model
currently *means* by tire deflection.

## Why it is not simply "the model is right, the picture is wrong"

`fz = tireStiffness × depth` by construction: the query hands the solver a sphere of `wheelRadius` at
the hub, and the sphere's overlap IS the deflection. `computeStaticEquilibrium` agrees and seats the
hub at `wheelRadius − tireComp` deliberately. Internally consistent.

What is NOT settled, and is what this ticket is for, is whether that convention still holds its shape
across the adapter seam after FEAT-48. The wheel is analytic on one side of the seam and an engine
body on the other, and the two describe the same wheel differently:

- the **soft path** treats the wheel as a sphere of `wheelRadius` whose overlap is rubber;
- the **engine path** carries a hard core at `wheelRadius − WHEEL_SOFT_BAND` (QUAL-25) that collides
  with debris only;
- `contactSphere` returns depth along the contact NORMAL, while the analytic terrain probe returns a
  vertical height difference. Those are the same number on flat ground and diverge on a slope — and
  the whole stack consumes them through one `{normal, depth, contactPoint}` shape as if they were
  interchangeable.

92 mm of penetration on a tire whose entire soft band is 150 mm is worth checking against that.
Owner's read is that the conversion layer is misbehaving; the measurements above neither prove nor
refute it — they establish that whatever is happening is deterministic, contact-complete, and inside
the soft band, which rules out the cheap explanations.

## Do NOT fix it in the stage

A cosmetic fix was built and **reverted on owner review** (`7200ccc`, reverted `22dde4a`): the stage's
tire meshes were squashed by their own re-queried overlap, which cancelled the intrusion exactly
(55 mm → ~0) and measured correct per corner. It looks wrong — the tire deforms while the steelie
inside it stays rigid, and the eye reads that immediately. Recorded so nobody rebuilds it: if the
tire is ever drawn deforming, **the rim has to deform with it or be re-seated**, and that is a
vehicle-renderer change, not a stage one.

The stage keeps the glitch on purpose until this is addressed.

## Acceptance

- A statement of what the wheel's contact geometry MEANS on each side of the seam, and whether the
  two agree — in particular whether `contactSphere`'s along-normal depth and the analytic probe's
  vertical depth are being conflated where they meet in `stepPhysics`.
- Either the penetration is confirmed correct (and the ticket closes with the finding recorded, the
  visual being a known consequence), or the seam is corrected and the measured 55 mm / 92 mm move.
- Whatever the outcome, re-run the FEAT-41 stage drop: the front-left tire on the rock is the
  cheapest visual assay this project has for wheel-contact truth, and it costs nothing to look at.

## Reproduce

`npm run dev`, land on the main menu, watch the front-left wheel meet the rock. To measure rather
than watch, wrap `window.__stage._queryContacts` and sample `depth` per step — the stage exposes
itself as `window.__stage` for exactly this.

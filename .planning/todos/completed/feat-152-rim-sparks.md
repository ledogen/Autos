---
id: FEAT-152
type: feature
status: done
closed: 2026-10-28
severity: minor
opened: 2026-10-27
source: owner, 2026-10-27 — "we should add a sparking effect to the wheel implying its right on the
  asphalt. can be a ticket for now"
relates: FEAT-94 (driving on a flat: tire, then rim + side panel), FEAT-120 Rim grind (the sound)
---

# FEAT-152: Sparks off a rim running on the asphalt

## Request

When a flat tire has been run down to 0 the steel rim is on the road (FEAT-94). It already grinds
(audio) and wears fast. Add **sparks at that wheel's contact patch** so the player can SEE it is
metal on asphalt.

## Notes

- The state already exists: `vehicleState.rimOnRoad[i]`, set every physics step by
  `DamageModel.step()`. Nothing new is needed from the damage model.
- Asphalt only. On dirt and grass a rim throws dirt, not sparks; `looseSurfaceFactor` (the helper
  tire-audio and dust use) splits the two.
- Rate and length scale with road speed; none below a crawl.
- Likely home: the existing particle systems (`src/dust.js` / `src/smoke.js` pattern), not a new one.
  Flat colour, no textures (ART-STYLE.md): short bright-yellow/orange streaks thrown backwards.
- Contact patch: the wheel's ground point, the same per-wheel local offsets tire-audio uses.

## Acceptance

- [ ] A rim on asphalt throws sparks from its contact patch while moving, scaling with speed.
- [ ] No sparks from a flat that still has tire left, on loose ground, or parked.
- [ ] No measurable frame cost when nothing is grinding (the pool idles).

## Resolution (2026-10-28, feature/machine)

Built straight after the ticket (owner: "lets just do the sparks now"). Owner's spec: floor 15 mph,
faint and infrequent there; ceiling 50 mph; two emitters per wheel at the rim lips (inside and
outside); reuse the dirt-throwing code; small orange-white particles with a trail.

- `src/dirt-spray.js` gains a third kind, SPARK, in the same pool and draw call as the clods. It reuses
  the wheel-contact geometry and the ballistic integrator. Emitted only where `vehicleState.rimOnRoad[i]`
  is set and the ground is asphalt (looseSurfaceFactor under the spray's own floor, so sparks and
  dirt spray are mutually exclusive). Rate ∝ u² (u = 0 at 15 mph, 1 at 50 mph), brightness 0.35→1.
- The trail is a streak: a new `aVel` attribute on the sheet, and the vertex shader stretches the quad
  from the spark back along 45 ms of its own travel. The head is white-hot, the trail orange. Colour
  gain is above 1 so ACES tone mapping keeps it hot instead of beige. Night does not dim them.
- Checked in the real app (headless Chrome, two dead rear rims at ~37 mph on asphalt); cdp-smoke 15/15.
- Not built: sparks on dirt (a rim throws dirt there). Tune `SPARK_*` by feel.

**Follow-ups (owner, 2026-10-28/29):** spark spacing is Poisson (random gaps); life 0.08–0.25 s,
full for 40% then a fast fade; more orange. Sparks are born at sub-frame times (spawned where the
wheel was, pre-aged) so the stream no longer strobes into rows one frame's travel apart.
**Spark light: tried and REMOVED (owner, 2026-10-29: "I don't like the way that the glow looks").**
One orange PointLight at the grinding wheels, flickering with the live spark count, was built and
shown at night, then taken out. Do not re-add a point source for the sparks. Proving its prewarm
found BUG-98 (lamp shader compiles mid-drive), whose fix stays.

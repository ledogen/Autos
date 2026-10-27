---
id: FEAT-152
type: feature
status: open
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

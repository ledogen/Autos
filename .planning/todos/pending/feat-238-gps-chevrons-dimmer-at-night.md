---
id: FEAT-238
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "Let's make the GPS chevrons a little dimmer at night. It actually takes a little bit of the challenge of driving on the dark road away because it reveals where the road goes. It can still have a little tiny bit of glow so you can see the distant chevrons but we should rely mostly on the trucks headlights to illuminate. them"
relates: FEAT-215, src/gps.js
---
lane: unplaced (small)

# FEAT-238: GPS chevrons dimmer at night

## Next steps
Built on `land/visual-batch`; owner looks at night with low beams, then lands. Owner call: the start arrow, junction board, objective marker and ring follow the same rule (one material set); say if any should stay bright.

## Summary
At night the chevrons reveal where the road goes and take the challenge out of a dark road. Dim them: a tiny glow so distant ones can be seen, mostly lit by the truck's headlights.

## Tracker
- [x] At night the chevrons glow only faintly by themselves and are lit mainly by the headlights (`GPS_NIGHT_FLOOR` 0.12)
- [x] Day look unchanged (diffuse term is 0 by day: emissive only, as the old Basic material)
- [x] Night pictures before and after (wip/visual-batch/chev-*.png)
- [ ] Owner has looked

## Decisions
DEC-329 (the owner's words).

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16: built (land/visual-batch). Chevrons and the other GPS meshes are MeshLambert: emissive scaled to GPS_NIGHT_FLOOR by the night factor, a diffuse term (x2.5) rises so the headlight spots light them. Unverified: a truly curving road shot, a dusk ramp, a first-compile hitch from the new light-using program.

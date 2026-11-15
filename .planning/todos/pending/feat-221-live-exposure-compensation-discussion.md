---
id: FEAT-221
type: feature
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "I'd like to open a discussion about using the automatic exposure compensation model from the new lighting system that I don't think we've pu…"
relates: FEAT-180, FEAT-219
---
lane: Spare

# FEAT-221: Live exposure compensation (DISCUSSION + test-branch prototype, owner approves before it enters the game)

## Next steps
Wait for FEAT-180 (the lighting rebuild) to land. Then a test-branch prototype and a discussion with the owner. Nothing enters the game without the owner's approval.

## Summary
The camera would adjust its exposure live: it brightens when you drive into a mountain's shadow, overexposes for a moment on the way out, then settles. The service center at night could meter to its lit interior and leave the outside near black. This ticket is a discussion first; the stated concerns are how the shot is metered and the performance cost.

## Description
Inbox zm44:
> I'd like to open a discussion about using the automatic exposure compensation model from the new lighting system that I don't think we've pushed yet to do live exposure compensation for example if you drive into the shadow of a mountain the image could pop up a little bit and then when you drive out it'll be overexposed for a moment before it drops back down I see a lot of modern games doing this and it looks very nice I also think for example point source lights in the service station at night in the tutorial might also be improved i.e. the camera will compensate to the bright interior of the service center and it'll be almost pitch black outside. I'm particularly concerned about how we meter the shot and if there's any performance overhead for doing this sort of live compensation Could be fun to spool up on a test branch and get my approval before putting it in the game

## Tracker
- [ ] Depends on FEAT-180 landing first (the new lighting system's automatic exposure model)
- [ ] Test-branch prototype of live exposure adaptation
- [ ] Report: metering method options (centre-weighted, whole frame, sky-excluded) and the measured performance overhead
- [ ] Owner approves before it merges to the game

## Open questions
- Metering method: which area of the picture sets the exposure? The prototype should offer options.

## Files
`src/lighting.js` · `src/main.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.

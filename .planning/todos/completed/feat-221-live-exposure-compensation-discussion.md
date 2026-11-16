---
id: FEAT-221
type: feature
status: closed
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "I'd like to open a discussion about using the automatic exposure compensation model from the new lighting system that I don't think we've pu…"
relates: FEAT-180, FEAT-219
---
lane: Spare

# FEAT-221: Live exposure compensation (DISCUSSION + test-branch prototype, owner approves before it enters the game)

## Next steps
Owner: drive the landing build (`proto/feat-221-exposure`, :3885): a tunnel in and out, by day. `?ae=0` is the off switch for A/B. Then close.

## Summary
The camera would adjust its exposure live: it brightens when you drive into a mountain's shadow, overexposes for a moment on the way out, then settles. The service center at night could meter to its lit interior and leave the outside near black. This ticket is a discussion first; the stated concerns are how the shot is metered and the performance cost.

## Description
Inbox zm44:
> I'd like to open a discussion about using the automatic exposure compensation model from the new lighting system that I don't think we've pushed yet to do live exposure compensation for example if you drive into the shadow of a mountain the image could pop up a little bit and then when you drive out it'll be overexposed for a moment before it drops back down I see a lot of modern games doing this and it looks very nice I also think for example point source lights in the service station at night in the tutorial might also be improved i.e. the camera will compensate to the bright interior of the service center and it'll be almost pitch black outside. I'm particularly concerned about how we meter the shot and if there's any performance overhead for doing this sort of live compensation Could be fun to spool up on a test branch and get my approval before putting it in the game

## Tracker
- [x] Depends on FEAT-180 landing first (the new lighting system's automatic exposure model) — merged 0a515b0a
- [x] Test-branch prototype of live exposure adaptation — `proto/feat-221-exposure`, `?ae=avg|centre|low`
- [x] Report: metering method options (centre-weighted, whole frame, sky-excluded) and the measured performance overhead
- [x] Owner approves before it merges to the game — 2026-11-15, card feat221-look "Good, but tune" (DEC-262)
- [x] Landing-ready, on by default: centre meter, 0.3-stop band, 6 s open-up, 0.6 s stop-down; other meters + URL knobs deleted
- [ ] Owner has driven the shipped defaults

## Decisions
DEC-262 (owner, 2026-11-15): ships on, centre-weighted, deadband 0.3, opening up 3× slower, stop-down kept, night stop-down only. DEC-198 and DEC-199 stand (not superseded): k scales the whole frame by one number, and the camera never opens up a night scene.
Governing records: DEC-196 (the rebuild is the line), DEC-198 (twilight evenness, brightness only), DEC-199 (the moonlit
night's exposure stays). Conflicts with the ask, left to the owner: (1) DEC-199 and the round-3 night ("how hard it is to see
at night" is the legacy's) vs a camera that opens up dark views — any metering brightens a dark night scene; the prototype
by default only stops down after dark (`aeNight=0`), the `aeNight=1` variant shows the other choice. (2) DEC-198 keeps the
twilight's sun-side / far-side contrast; a whole-frame meter at dusk shifts with the yaw (toward or away from the sun),
which is ~0.2–0.3 stop here and inside the 1-stop deadband, so no change at the defaults.

## Open questions
- Metering method: which area of the picture sets the exposure? The prototype should offer options.

## Links
FEAT-180 (rounds 4–5: the eye, `moonAdapt`), FEAT-219 (the bay light), FEAT-214 (POI night lights).

## Files
`src/exposure.js` (new) · `src/sky.js` (`skyAE` in the grade, `setLiveExposure`, `openGrey`) · `src/main.js` (3 lines round the world render)

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-14 (Spare): prototype on `proto/feat-221-exposure`. Signal: the drawn frame, metered by a full-res copy → 64×36
  log-luminance cells → async read-back (fence + pixel buffer, no stall; a synchronous read waited 28 ms on a full queue).
  Cost ≤ 0.16 ms GPU per pass (headless Metal, 1600×813; noisy, 0.003–0.37), every 2nd frame. Defaults centre-weighted,
  strength 0.75, deadband ±1 stop, −2…+2.5 stops, 2 s opening / 0.6 s closing. sky-ephemeris green. Shots `wip/feat-221/`.
- 2026-11-15 (Spare): 16d40a44 landing-ready per DEC-262. `?ae=0` = off. No gate covers it (no headless render); owner look owed.
- 2026-11-15: CLOSED. On main since 3393c6ad. The owner's answer on card lighting-bundle-look raised only the bay light (now FEAT-226); orchestrator read that as no objection here.

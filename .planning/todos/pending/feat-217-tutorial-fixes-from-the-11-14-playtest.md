---
id: FEAT-217
type: feature
status: open
severity: major
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "When we automatically reset the player for driving off the road in the tutorial We should show a visible countdown timer You can reuse the s…"
relates: FEAT-184, FEAT-151, DEC-151, DEC-146, BUG-76 (reset), src/main.js, src/tutorial.js
---
lane: A (tutorial)

# FEAT-217: Tutorial fixes from the 11-14 playtest

## Next steps
Card tutorial-gates answered 11-16 and built on land/tutorial-1116 (lane S): the grace around places is 20 m (DEC-281, supersedes DEC-219), the reset otherwise as it was; both anti-dodge gates (DEC-282). Left: land it; the owner's playtest (FEAT-184's test-drives card).

## Summary
Eight problems found in one tutorial playtest: the automatic reset is too eager and silent, giving up leaves stale state, the flat tyre can be driven on forever, the dialogue order is off, the cart can leave the player $5 short, pad focus is invisible on the opening buttons, and free cam survives into a new game.

## Description
Inbox bfs1:
> When we automatically reset the player for driving off the road in the tutorial We should show a visible countdown timer You can reuse the style that reminds you to start the truck That size and location would be good. We need to disable the automatic reset within 50 or 100 meters of the destinations in the tutorial. For example, when I pull onto the shoulder early so I can line up with the gas station pump, it resets me if I linger too long.

Inbox of3s:
> Pulling off the road to fix the flat triggers the Automatic Reset on the vehicle. Let's just disable automatic reset from 10 meters off the sides of the road. You can still manually reset if you're on the shoulder, but the countdown timer and automatic reset shouldn't engage until you're 10 meters off. That way you can park on the shoulder comfortably and not be reset.

Inbox qjbj:
> Started a new game, entered the tutorial, got to the gas pump and started pumping Then I gave up the run with the gas pump open. When I reopened the tutorial, the gas pump interface was still there
> It looks like my mission progress was also saved because now it doesn't even say to go to the gas station. Make sure we fully reset the tutorial if somebody gives up out of it. I wouldn't mind if we always saved the tutorial progress so you don't have to play it in one shot but that's not a priority right now either

Inbox 8l9k:
> Nothing prevents the player from driving on the flat tire forever in the tutorial Mom's card even triggers when they get close to her house with the flat tire Meaning they could just skip a portion of the tutorial Though I didn't actually try to engage that

Inbox xbnc:
> The tutorial dialogue seems a little bit stale. You get the flat mom tells you to pull over and look in your inventory. Then you select the spare and press use and she says, oh, the spare is flat too. Let's call it toe. Then she says, okay, go ahead and click on the corner to install the spare tire. Let's instead have the player select the spare and use it and then get through using it on the flat corner before mom realizes, oh, the spare is flat too. Okay, then let's call it toe. That way everything's in order.

Inbox 526f:
> Got stuck in the tutorial again mom says Go ahead and patch the tire. This one's on me, but The cart system says I'm five dollars short so I can't check out. Also Some element inside the maintenance tab and shop tab are slightly too wide so i get a system horizontal scroll bar that translates like 5 total pixels. It doesn't appear on the jobs tab

Inbox y2x7:
> Pad buttons dont highlight the "Play the tutorial" and "Skip" buttons' so its hard to know what you're selecting

Inbox wggu:
> Another weird thing, I exited to the main menu from the tutorial and I left my camera in free cam. When I started a new game, my camera was still in free cam. Make sure we're resetting all these things on every entry and/or exit.

## Tracker
- [x] bfs1: a visible countdown before the automatic reset in the tutorial, styled like the start-the-truck reminder (same size and place)
- [x] bfs1: no automatic reset within 50-100 m of a tutorial destination (gas station pump etc.), so lining up on the shoulder is safe
- [x] of3s: the automatic reset and its countdown engage only 10 m off the sides of the road; manual reset still works on the shoulder
- [x] qjbj: giving up the tutorial fully resets it: pump UI closed and mission progress cleared (saving tutorial progress is "not a priority", not part of this)
- [x] 8l9k: nothing lets the player drive on the flat forever; mom's card cannot trigger near her house with the flat and skip part of the tutorial
- [x] xbnc: dialogue order: mom says the spare is flat too only AFTER the player has used the spare on the flat corner ("okay, then let's call it toe")
- [x] 526f (first half): when mom says to patch the tire, the player can always afford it ($5 short at checkout soft-locked the tutorial); DEC-151 says a soft lock is "on mom"
- [x] y2x7: pad focus highlights "Play the tutorial" and "Skip"
- [x] feat217-try B: every tutorial leg's top distance reads along the GPS line, as a job does (DEC-270)
- [x] feat217-try C: after the flat the line reads "pull over and check your tire" and the accelerator is cut until the tire is fixed, tutorial only (DEC-271, DEC-272)
- [x] feat217-try A: the reset line "a lot bigger than 10 m" — measured exactly 10 m past the paved side; the owner's answer (tutorial-gates): the 75 m grace around places was what read as broken, now 20 m (DEC-281); the 4 s stays
- [x] tutorial-gates 2: mom's door stays shut while the evening's pump is due; in the evening only mom's offers sleep (DEC-282)
- [x] wggu: free cam (and similar state: camera, UI, modes) is reset on every entry and exit, so a new game never starts in the last run's free cam

## Open questions
- ANSWERED (owner, tutorial-gates 2026-11-16): 20 m around places (DEC-281, superseding DEC-219's 75 m default).
- DEC-151 ("drive off the road > reset") stands; of3s narrows where it engages. Treated as an amendment, not a conflict; confirm if wanted.

## Files
`src/main.js` · `src/tutorial.js` · `src/service.js` · `src/hud.js`

## Log
- 2026-11-16 (lane S, land/tutorial-1116): `TUT_PARAMS.safeNearPoiM` 75 → 20; `_atMomsHouse` false while `_evePump` is due; `_campPromptState` null on the evening leg. Smoke comment only (its spot pick keeps 90 m from places, still valid). Gates: see FEAT-184's log.
- 2026-11-15 (lane A, card feat217-try): A measured in the running game, seed 822480141 evening: the countdown starts at 15.0–15.5 m from the centreline (10 m past the paved side) on a straight, a bend and a junction leg, both sides. Driven off at 10.8 m/s it starts at 15.7 m, and in its 4 s the truck reaches ~52 m before the reset — that is the "much bigger". Unchanged. B: `routeLeftM` (mission.js) on the tutorial line. C: `setThrottleCut(_flatOwed())` (vehicle.js); park-brake gate §7, smoke checks after the flat.
- 2026-11-14 (lane A): built. Teardown: ONE `_resetRunLocals` (main.js) called from onRegionExit and run entry (pump, tutorial vars, waypoint, free cam, screens). Reset: 10 m past the road + 75 m from any POI + countdown (DEC-219). Spare flat is found out after the corner try. Flat gate: mom's card and door wait while the evening's flat is on (`_flatOwed`). $5: the first patch is on mom (`_momOwes.patch`). Pad focus CSS for #tut-card. Horizontal scroll in shop/maintenance tabs (526f second half) NOT done, not in the tracker. Smoke extended (countdown, shoulder, give-up cam/pump).
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.

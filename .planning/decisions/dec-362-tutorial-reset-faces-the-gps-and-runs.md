---
id: DEC-362
status: standing
decided: 2026-11-17
area: story
governs: FEAT-184, DEC-219, DEC-321, DEC-151, src/main.js, src/gamepad.js, reset, gamepad, tutorial
supersedes: 
---

# DEC-362: The tutorial's reset faces the GPS and leaves the engine running; holding View no longer resets

**Ruling.** Owner, 2026-11-17, verbatim: "When the player is reset in the tutorial they should always be facing the direction of the GPS". Inbox: "When the truck is reset in the tutorial it should be running. The player shouldn't have to start it again." And: "Holding B you shouldn't reset you. Keep dpedray and R. We'll keep these for the tutorial because it is possible to get stuck without triggering the auto reset." As built: the tutorial's reset (R, D-pad right held, the off-road return) seats the truck on the nearest road point facing along the GPS line, engine RUNNING. The pad's hold-View reset is removed (the owner wrote "B"; B-hold opens the side menu and never reset, so this is read as the View hold, flagged on the owed card). R and the D-pad right hold stay, in the tutorial too.

**Why.** A reset that points backwards or leaves a dead truck is a second lesson nobody asked for.

**Replaces.** DEC-321's note that the pad's holds still work ("a separate owner call"): this is that call for View. DEC-219 (10 m off the road) is untouched.

**Source.** ledorepo `answered/tutorial-test-drives.answer-2026-11-17.json` (round 3 play-test) and `answered/tut-dialogue-look.answer.json`.

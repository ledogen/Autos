---
id: DEC-356
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, DEC-353, DEC-346, DEC-306, src/main.js, src/service-screen.js, tutorial, peanuts, gas station, shop, McGill ranch, waypoint, tut-ranch, tut-campmade, _snackLock, _tutRanchPin
supersedes: DEC-346
---

# DEC-356: The snack stop's shop sells one bag of peanuts; the ranch is arrived at in its own camp zone, and a camp made short of it clears the waypoint

**Ruling.** DEC-346's, unchanged: DEC-304's order (fired at the joint; to mom's; Larry's old pack to Larry's; the station
for a snack and the fill-up; a camping area to eat it; the flat, the tow and the shop on the way home; sleep at mom's; next
morning back to the joint for the last paycheck; free will there), and DEC-345's "once you fill up with gas and mom sends
you on your way, you already have a waypoint to the nearest camping area. The guiding text can read "drive out to the old
McGil ranch". When you arrive at the waypoint, Katie calls you ... And she can guide you through the camping menu and the
Terrain-based vibe enhancers." Then the owner, card tutorial-test-drives, 2026-11-16 (DEC-353): "we need to control the
menu so the player doesn't spend all their money." And: "We either need to wait until the player arrives at the McGill
Ranch pin to show the camping instructions, or we need to clear the waypoint as soon as the player makes camp. I never
actually got to the pin, I was able to pitch camp, and now it still shows the waypoint." As built, both: arrival is inside
the ranch's OWN camp zone (no longer any camping area on the way) or within the waypoint's 28 m of its door, and only then
does Katie's call (`tut-ranch`) give the camp instructions; while a camp is made at that stop the map's pin, the GPS line
and the HUD line are gone, and the snack's card (`tut-campmade`) comes in any camp, heard her arrival call or not, so no
order of arrival and camp strands the day. At a gas station while the snack or the pump is due the shelf sells one bag of
peanuts: every other row shows "Katie asked for the peanuts", a second bag "one bag will do", their buttons off
[the agent's words]; the rest of mom's money is left for the tank (DEC-306).

**Why.** Pitching camp short of the pin left its waypoint up, and the shop could spend the gas money (or, before the
peanuts, buy anything on mom's endless top-up).

**Replaces.** DEC-346 (its arrival "inside a camp zone" and its pin "gone on arrival" only).

**Source.** DEC-353 (ledorepo `answered/tutorial-test-drives.answer-2026-11-16b.json`); DEC-346; DEC-345.

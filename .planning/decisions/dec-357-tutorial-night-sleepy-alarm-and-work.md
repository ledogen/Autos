---
id: DEC-357
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, DEC-353, DEC-299, DEC-153, DEC-315, DEC-325, src/main.js, src/day.js, data/dialogue.js, tutorial, energy, sleepy, blinks, alarm clock, sleep, tut-moms, TUT_STAMPS, TUT_PARAMS, Sally's Deli, the burger joint, work
supersedes:
---

# DEC-357: After the tire the driver is sleepy; mom has you set the alarm for 06:30; the tutorial calls the joint "work"

**Ruling.** Owner, card tutorial-test-drives, 2026-11-16 (DEC-353): "I think after fixing the tire we should set the
player's energy to sleepy so that they get the eye blinks but none of the more exaggerated effects then mom's card about
energy will make sense when you arrive there." "Mom should use the terminology "set your alarm clock" when talking about
sleep and we should force the player to set a specific wake time like 6.30. Otherwise, the sleep menu can reject the
button press and say "Set this time instead" Because we set the time after the player wakes up anyway". "I think the
simplest way out is to just not display the name of the business in the tutorial. Just call it work or something."
As built: the tire fixed, before her door, energy is set to 3 h, mid SLEEPY (day.js: tired at 2, sleepy at 4; the
eyelids and the slower hands of sleepy, never a doze) [3 h the agent's DEFAULT]; the tutorial's held clock now runs the
blinks alone while the truck drives in the sleepy band (`DaySystem.blinkOnly`): before, no blink could fire in the
tutorial at all, whatever the energy. Her door's 21:30 stamp drains on from there. Mom's third sleep card: "Set your alarm
clock for 06:30"; the night is not preset, and a wake time other than 06:30 is refused with "Set this time instead: wake
06:30"; the night runs to 06:30 exactly. The morning: breakfast, Katie's call and the drive at 06:30 (the clock held),
and parked at the joint the clock is stamped 07:00, so the paycheck is 24 h after the firing (DEC-153) and a player and
a skipper enter free will at 07:00 on day 0 (DEC-299). While the tutorial drives, the joint is "work" on the HUD line
("… to work · park there for your last check"), the map's list and its shop screen; free play names it.

**Why.** The owner's drive: no sleepy effects on the way home, mom's energy card made no sense, the sleep had no lesson,
and the joint's name is rolled per seed.

**Replaces.** Nothing by supersession. The wake was 07:00 on FEAT-170's preset timer (no record).

**Source.** DEC-353 (ledorepo `answered/tutorial-test-drives.answer-2026-11-16b.json`).

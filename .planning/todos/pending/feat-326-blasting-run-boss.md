---
id: FEAT-326
type: feature
status: open
severity: major
opened: 2026-11-23
source: owner, 2026-11-23 — "Then we'll have to come up with a better boss fight."
---

# FEAT-326: The blasting run — one boss mission for the arc trial

## Next steps
- DESIGN ONLY. Nothing is built. The owner and the orchestrator are still in question rounds.
- Before building rock slides: research the rigid-body ceiling (owner's request, below).

## Summary
One pass-or-fail mission replaces the 5-mission expedition camp ending in the arc trial (FEAT-325). The player
drives a fixed-par stretch of road closed by five rock slides, throws charges to break each slide, and threads the
truck through the gap before nightfall.

## Description
The owner's goal is a run in three parts: maintenance days, upgrade days, boss. The boss must make the upgrades
feel necessary, "otherwise players might just hoard the cash", yet "always feel possible to win".

Design as agreed so far (owner's answers, 2026-11-23):
- **Goal.** Reach a party of the expedition that is cut off past the slides. "Reach the cutoff party is a compelling
  goal. I do like that it justifies only a truck wide passage is necessary."
- **Premise.** The slope is still moving. What is cleared by day is buried overnight, so the run goes end to end in
  one day. Owner: "yes".
- **Clock.** Nightfall, the existing day clock.
- **Why the player.** "you earned your reputation as a driver and nobody in the camp is confident enough to drive
  this mission themselves." The gate stays 6 good deeds (DEC-120).
- **Retry.** Failing does not end the run. "this mission is pass or fail. it cant cost you anything but the mission
  attempt." The truck keeps the damage it took; the charges are issued again. A crash can still end the run.
- **Ends on arrival.** No return leg. "we can sell the idea that the crew helped clear the rest of the rubble."
  All rubble is deleted on completion.
- **Slides.** Five. "The more consistency we can find across runs, the better." Par is held constant: "a steeper
  mission is allowed to be shorter than a flatter one."
- **Length.** "2x-3x a normal mission / all day."
- **Charges.** "more like 12 and slides requiring more than one charge to clear." Out of charges, the player may ram
  through: "as long as you can drive through you get the point."
- **Rocks.** "model larger rocks and have ~7 different sizes. The explosive could also split large rocks into smaller
  rocks. Then if it hits a small rock directly it just deletes it."
- **The loop.** "you throw the charges ahead of you and it breaks the rocks apart in a way that leaves a narrow gap
  … aim, throw, identify the opening, and maneuver the truck through it really quickly."
- **No fragile, no shock limit on the load.** "drop shock limit in favor of driving over rubble." The rubble tests
  the suspension and gives the lift kit a use.
- **Heavy load.** The standard suspension must manage it but struggle, so heavy-duty parts are the implicit
  recommendation.
- **Preparation card.** Before the mission, a card compares the truck's parts and condition, and the player's food
  and rest, against a recommended list. The player may go regardless. Wording is the owner's.
- **Explosions that push rigid bodies** are wanted beyond this mission.
- **The bypass guard.** More than 25 m from the road's edge for 5 s and the attempt is called off, after a warning.
  No teleport. Owner: "yes", "good". A reset to the road during the mission fails the attempt: "fail". Fixed rocks
  beside a slide are dressing only. The 25 m and 5 s are starting values to tune from the owner's first drive.
- Dropped: liquid cargo ("kill liquid"), the relief run, the gauntlet.

## Tracker
- [ ] Rigid-body ceiling researched and measured.
- [ ] Census: how much the route's bends and grade still vary at constant par, over random seeds.
- [ ] Seven rock sizes (asset tickets).
- [ ] Charges: throw, blast impulse, split and delete rules.
- [ ] Route pick, slide placement, clock, retry, rubble removal.
- [ ] Preparation card.

## Decisions
- DEC-425 limits story rock slides to three expedition missions. Owner, 2026-11-23: "we can change or remove
  dec-425". The change that builds the boss writes the record that supersedes it.
- No decision record is written yet. These are trial-design answers; records follow if the owner adopts the trial.

## Open questions
- **Rigid-body ceiling.** Owner: "I know there are a lot of optimizations that could bring our max rigid body count
  up. For example, in the slide area we can grid it off into sections and rocks only have to check collisions with
  rigid bodies that are in neighboring cells. When the agent that is responsible for building rock slides looks
  into it, they should do research on this topic to determine what the right max number of entities is."
- Instant heal items in the boss: already instant everywhere in FEAT-325.

## Links
FEAT-325 (the arc trial build) · FEAT-103 (the 5-mission expedition camp, kept on main) · DEC-120 · DEC-425 ·
`src/debris.js` (rock slides today)

## Log
- 2026-11-23: design rounds with the owner; this ticket holds the state so far.

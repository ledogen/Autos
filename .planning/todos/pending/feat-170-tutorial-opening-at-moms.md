---
id: FEAT-170
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05, driving FEAT-147 on :3731 — "opening is good for now. will definitely want a rewrite before alpha release… my proposal (ticket dont attempt to one shot)" (quoted in full below)
relates: FEAT-147 (the opening it rewrites; its firing scene stays), FEAT-169 (hunger: the breakfast beat needs it), FEAT-164 (camp), opening.md, mom's house POI (poi.js nearSpawn slot)
---
lane: A

# FEAT-170: The opening becomes a skippable tutorial evening at mom's

**Stage it. Do not one-shot it** (owner). Plan the stages in this ticket, get sign-off, then build one stage
per landing.

## The owner's proposal, verbatim

> you get fired at 6pm. same mom text. mission is already active to go to moms. here we give the controls
> tutorial, how to park, check the vehicle diagnostics, etc. clock is frozen. no damage. free reset to road
> (prompt appears when offroad). upon arrival you get no pay. you use the camp menu to sleep at moms. there is
> some dialogue then you sleep. it says something along the lines of "you can always rest at moms. its better
> than sleeping in the truck." brief overview of camping. and we can give context on the sleep mechanic here.
> in the morning she feeds you giving us a chance to talk about the food mechanic. then you have a job to
> deliver the casserole to larry.
>
> optionally the player can skip straight from the cutscene to leaving moms by holding the map button or pause
> or something. that way the tutorial is optional every playthrough but not obstructive. every playthrough
> starts the first paid job as a delivery to larry's.

## The shape, as read from that

1. **The firing at 6 pm.** FEAT-147's scene stays. The clock starts at 18:00, and mom's text follows as today.
2. **The drive to mom's is the tutorial.** It is an active, unpaid mission. On the way the game teaches the
   controls, parking, and the vehicle diagnostics.
   - The clock is frozen and there is no damage.
   - A free reset to the road is offered whenever you're off it (a prompt).
3. **Evening at mom's.** You arrive with no pay and sleep through the camp menu. Before you sleep: some
   dialogue, a brief overview of camping, and the sleep mechanic. "You can always rest at mom's. It's better
   than sleeping in the truck." Mom's house is a place you can always sleep.
4. **Morning.** Mom feeds you, which is the food / hunger beat (needs FEAT-169).
5. **The first paid job:** deliver the casserole to Larry. Every run starts its paid work here.
6. **Skippable every run.** A hold on one button skips from the end of the firing scene to leaving mom's in
   the morning, already fed, with the casserole job active. Use the map or pause button, the owner's
   suggestion; the hold must show a visible prompt, since hidden gestures are ruled out. The tutorial is
   optional but never in the way.

## Found on the same drive (a FEAT-147 bug, fixed before Lane A lands)

"i didnt have a job after the opening (no gps top bar not populated). mom did have a mission i could
optionally accept." FEAT-147's opening should hand you the courier run TO Larry as an active job. It
didn't. This is fixed in FEAT-147 now, not here.

## Acceptance

- [ ] A staged plan in this ticket (stages, what each lands, what the owner checks at each), signed off.
- [ ] Each stage lands on its own, behind cdp-smoke's opening step, with the skip path smoked too.
- [ ] Every run's first PAID job is the casserole to Larry, with or without the tutorial.
- [ ] The owner plays it through once with the tutorial and once skipping it.

## Staged plan — 2026-11-05 (Lane A; FOR SIGN-OFF, nothing built)

Four stages. Each one lands on its own, behind cdp-smoke's `opening` step plus a skip-path step. Every word on
a card is a PLACEHOLDER the owner rewrites (FEAT-148). FEAT-169 hunger is built (feature/run-shape 44badad6),
so the breakfast beat can feed you.

**Stage 1 — the evening's skeleton.** The opening run starts at 18:00, and the firing and mom's text play as
today. Her call then gives you an unpaid, guided "head home" leg to her house: the HUD line and the GPS, as
FEAT-147's first job has now. It is not a board offer, so there is no pay, rank or result card. Parked at
hers, her existing sleep card opens, its timer preset to wake at 07:00. You wake with the casserole job in
hand, taken at her house, so it starts from her start zone like any job from a pad. **The skip path lands in
the same place:** opening off means you start at mom's at 07:00 with the casserole in hand. So every run's
first paid job is the casserole from stage 1 on.
*Owner checks:* one drive with the opening on, and one start with it off.

**Stage 2 — hold to skip.** Through the firing and the evening, a visible prompt says "hold M to skip the
tutorial" (button TBD, Q2). Holding it for 1 s `[DEFAULT]` lands you where stage 1's skip does: at mom's, at
07:00, fed, casserole in hand. It is not a hidden gesture: the prompt is on screen the whole time.
*Owner checks:* skip at the firing, mid-drive, and at mom's door.

**Stage 3 — the safe drive.** While the "head home" leg is active:
- The clock is frozen, and so are energy and hunger.
- There is no damage and no wear.
- Whenever you are off the road, a prompt offers a free reset to it, using the existing reset to the nearest
  road with its cost waived.

These all end at mom's door.
*Owner checks:* crash it, drive off the road, reset.

**Stage 4 — the lessons.** Cards go on the existing `_tut` queue, which holds the sim while a card is up:
- **On the drive:** the controls, how to park (the brake latch), and the vehicle diagnostics (Tab / the damage
  screen).
- **At mom's in the evening:** you can always rest at mom's ("better than sleeping in the truck"), a brief
  overview of camping, and the sleep mechanic.
- **In the morning:** mom feeds you, which is `eat()` plus the food card. Then she hands over the casserole.

FEAT-147's later first-use cards stay as they are: the offer, the rank bar, the first pump, the first service
screen, the sleepy stage and the requisition. So does Larry's welcome after the casserole.
*Owner checks:* one full play-through with the tutorial, one skipping it (the ticket's acceptance).

**Questions for the owner, before stage 1:**
1. **Day 0 or day 1?** Does the evening count as day 1 of the run, so the morning job is on day 2 and the
   tutorial costs a run-day? Or is it a "day 0" before the run's day 1, which matches the skip path and
   today's runs? Recommended: **day 0**. Technical cost: the board's clock runs negative for the evening.
   It has no offers to time then, but it needs a check.
2. **Skip button:** map (M / pad's map button) or pause? Recommended: **M**, as you suggested. Pause already
   opens a menu.
3. **The setup page's opening toggle:** keep it (skip = no firing at all), or retire it once stage 2's hold
   exists, so the firing always plays? Recommended: **keep it until stage 2 lands, then retire it**, because
   it is two cards and Enter steps them.
4. **The evening drive's length:** the joint is sited anywhere, so joint → mom's can be 2–3 km on a wide seed.
   This is the open "joint→Mom's distance" call: re-site the joint near spawn (it reshuffles every seed's
   POI layout), or accept it as the tutorial's length?

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

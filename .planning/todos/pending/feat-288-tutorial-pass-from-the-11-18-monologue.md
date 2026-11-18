---
id: FEAT-288
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (the "tutorial monologue")
relates: FEAT-184, FEAT-217, FEAT-229, DEC-353, DEC-357, BUG-203, data/tutorial.js, data/dialogue.js, src/main.js
---
lane: SM (tutorial)

# FEAT-288: Tutorial pass from the owner's 2026-11-18 monologue

## Next steps
An itemised plan (work packages, conflicts with standing records, open questions) is written into this ticket before any code. Then one build agent per package, serially.

## Summary
A complete, simple tutorial: full dialogue and storytelling, a brief but complete explanation of every system, every control / menu / bar the player must use highlighted and everything else locked out, plus the specific fixes below.

## Description
The owner's words, verbatim (2026-11-18, in chat):

> Tutorial monologue. I'm going to give you all of the game experience, user experience, player test context that I can and I'd like for you to build a simple tutorial with all of the elements including the completeness of dialogue and storytelling as well as a brief but complete explanation of every system in the game. Anywhere there is an interface between the player and a system that requires a control, looking in a certain place, understanding a menu or a bar, I would like for you to make an attempt to breeze over it. I would estimate that the current tutorial takes about 15 to 20 minutes depending on the player I like the slow rotation in the opening sequence, but you should also be able to rotate with the right stick freely, and if you stop then it will start slowly rotating again. We should add sound effects for the phone. I think a ringer can play over the ringer ring card and then a click or flipping a flip phone shut can play over the ending. I'd like to work in a portion of the tutorial that explains how to interact with the map I'd like it to explain the list on the side As well as controls for setting a waypoint to direct the player to the legend, but don't explain it. The drive to Larry's house is magnificent, exactly how I've always wanted it to be. You get the great landscape, you get to see the huge mountain. The tunnel is maybe a little bit early in the expose, but that's fine. We have to get rid of the "and that's how anything gets done around here" prompt. I find that incredibly cheesy. Mom should say something along the lines of "pull over and park out front with rb" The parking area should also be marked at mom's house. I noticed this bug is also in regular story mode. Mom's house should have a marked parking spot just like everyone else. When mom tosses the backpack out of the house it needs to do that thing where it flashes white or maybe it can get a bright aura but as it stands it's impossible to see in the shade of her house. I think having a quest item indicator will come in handy in the future too. Remove the word placeholder from all the text in the tutorial. I'll just do a script review later. When two characters speak back to back we have the ring ring card dividing them. Maybe there's a better technique or maybe an industry standard on how to separate dialogue from different characters. Katie's third card when you're outside Larry's should say anyway comma instead of hey comma. Tutorial missions should show their destination on the map and the route should be plotted on the map. Katie needs to guide you through the shopping process, how to select an item, how to check out. Right now it says fill up at a pump after you buy the food, but there's no text until you take off your parking brake about filling up. You shouldn't be able to break camp early when doing the camping lesson. I think press any key should override holding B for the B menu. Katie doesn't have to mention your last paycheck. I think your mom can do that. Move the flat to be a little bit earlier in the sequence before you go into the tunnel. It would be nice if we started highlighting the controls or the menu UI related to the tasks in the tutorial. For example, "Home" says... Was that a bang? "Press B to look at it." But really, the player needs to hold B. So we should highlight the "Hold B" region. And then they need to navigate. So once they're holding B, then it should highlight the specific option that they're trying to click on, which is "Vehicle Diagnostics." And the other two shouldn't be accessible during that time. Right, like lock the player out of every action that doesn't teach them a lesson. Then we should force them out of the diagnostics menu and into the inventory, force them to select the correct item etc. Otherwise they could like eat all their food in the tutorial by accident. Mom should give you your packed lunches when you leave on day one. They shouldn't be in your inventory until then. When you're in the auto shop it should be mom talking to you not uncle Larry. On the way out of the garage mom's car doesn't trigger until you shift into gear it should trigger as soon as you buy the tire. I thought I gave some notes that said "mom needs to force you to select exactly the right amount of sleep" we shouldn't let the player decide how much they're gonna sleep and then force set the time afterwards anyway. Did that message get lost in the ether? The player should leave the menu with the food vendor and then the tutorial should end. As it is right now, it's like you're talking to your boss and then you don't press anything and then you're talking to Larry.

## Tracker
- [ ] Itemised plan + conflicts + questions written here (no code)
- [ ] Packages built (list filled in by the plan)
- [ ] Owner has played it

## Decisions

## Open questions

## Links
FEAT-184, FEAT-217, FEAT-229, DEC-353, DEC-357.

## Files
data/tutorial.js, data/dialogue.js, src/main.js

## Log
- 2026-11-18 minted by the orchestrator; the monologue is quoted in full above.
- 2026-11-18 the sleep note was not lost: it is DEC-357 ("a wake time other than 06:30 is refused with 'Set this time instead: wake 06:30'"). The plan must check in the browser whether that still works on main.

---
id: DEC-359
status: standing
decided: 2026-11-17
area: story
governs: FEAT-184, DEC-151, DEC-345, DEC-354, DEC-355, src/dialogue.js, src/main.js, data/dialogue.js, tutorial, cards, guardrails
supersedes: 
---

# DEC-359: A card that tells the player to do something waits for it, and the game runs under it

**Ruling.** Owner, card tutorial-test-drives, 2026-11-17, verbatim: "It shouldn't freeze the game during dialogues. We tell the player what to press but the game is frozen so they need to click through and then they're supposed to remember what they were supposed to press. I think we should gate any card that tells the player what to do should require them to do that action to clear the card." And: "It's possible for the player to change their tire before checking it, which breaks the tutorial flow. Remember we have to lock players into all lessons with guardrails." And: "Katie's advice about camping and how the vibe is composed is not very useful when the camping menu isn't open." As built: a card with `until` neither freezes the sim nor eats keys or clicks, and clears only when the action is done (key caught, pack loaded, V opened, spare tried, X pressed, lights on, handbrake set, camp menu open, snack or lunch eaten). The V lesson comes before any tire work (spare or plug refused until the damage card has played). Katie's vibe-bar cards wait until the bar is on screen.

**Why.** A click-through let the player dismiss the instruction without doing it, and a frozen game hid what the card was about.

**Replaces.** The `_cardHold` freeze and press-any-key for these cards only; every other card still holds the sim (DEC-147 era behaviour stands for them).

**Source.** ledorepo `answered/tutorial-test-drives.answer-2026-11-17.json` (round 3 play-test) and `answered/tut-dialogue-look.answer.json`.

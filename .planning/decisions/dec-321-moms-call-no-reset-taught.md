---
id: DEC-321
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, FEAT-217, data/dialogue.js, src/main.js, MOM_CALL, mom, reset, the tutorial HUD line
supersedes:
---

# DEC-321: Mom's call reacts to the firing; the tutorial teaches no reset

**Ruling.** "Then you call mom. She says, "Hey, how's everything going?" Then her next card is "he what?... I cant believe
it. Just like that after all the time you've been there" in reaction to the firing. You can keep the lessons from before
The only resets in the game are the one that's specific to the tutorial mission and a developer mode reset to the road.
Otherwise, for the alpha version there is no reset control in story mode Drop it from the dialogue". As built: MOM_CALL
is those two cards, then "Come on by the house, honey. I've got something for you." and the map card; the HUD's
"off the road · R puts you back on it" line is gone. The tutorial's automatic return (DEC-151, DEC-219, DEC-281) and
its countdown stay. R and the pad's holds still work in story mode: removing them is a separate owner call.

**Why.** Only resets the alpha keeps should be taught, and the tutorial's own needs no teaching.

**Replaces.** The placeholder MOM_CALL line and the HUD's taught reset (FEAT-170 stage 3, not a record).

**Source.** The owner's dialogue pass over the rebuilt tutorial, numbered against DEC-304's beats (chat, 2026-11-16): "Use your best judgment if it doesn't make sense. im generally paraphrasing take my intent and stretch it as necessary". The lines themselves are the agent's, written from his paraphrases (data/dialogue.js).

---
id: DEC-320
status: superseded
decided: 2026-11-16
area: story
governs: FEAT-229, FEAT-148, DEC-146, data/dialogue.js, FIRING, Katie, the best friend, the firing, the tutorial
supersedes: DEC-146
---

# DEC-320: Katie, the best friend, is a voice in the tutorial; the firing opens on her call

**Ruling.** "I'd like to add a new best friend character that is also present in the tutorial flow. You're running late to
work and you're on the phone with your friend. As you arrive, you wrap up the call and your friend wishes you luck in
dealing with your boss who is no doubt very upset with you. Boss says something along the lines of "I've had it, this is
the last time you'll be coming to work late because you're fired. I don't want to see you in my kitchen anymore."" Then:
"best friend named Katie". As built: Katie is a phone voice only (no model, no POI), speaker label `KATIE` in
data/dialogue.js; FIRING is her wrap-up card, then the manager's line. She, not mom, first tells the player about the
expedition camp and good deeds (DEC-324); mom stays the tutorial's main voice, and Larry reminds you after the paycheck
(DEC-326).

**Why.** A friend on the phone explains the lateness and gives the firing a second voice; it also frees the camp
briefing from Larry's call.

**Replaces.** DEC-146's "she [mom] tells you about the camp and good deeds first" (the rest of it, "mom is the true
tutorial", and Larry's reminder, stand). The placeholder FIRING lines.

**Source.** The owner's dialogue pass over the rebuilt tutorial, numbered against DEC-304's beats (chat, 2026-11-16): "Use your best judgment if it doesn't make sense. im generally paraphrasing take my intent and stretch it as necessary". The lines themselves are the agent's, written from his paraphrases (data/dialogue.js).

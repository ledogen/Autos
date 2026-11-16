---
id: DEC-348
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, DEC-320, DEC-345, data/dialogue.js, Katie, the firing, the picnic
supersedes: DEC-320
---

# DEC-348: Katie, the best friend, is a voice with no model: the firing opens on her call, and she meets you at the picnic

**Ruling.** DEC-320's: "I'd like to add a new best friend character that is also present in the tutorial flow. You're
running late to work and you're on the phone with your friend. As you arrive, you wrap up the call and your friend wishes
you luck in dealing with your boss who is no doubt very upset with you. Boss says something along the lines of "I've had
it, this is the last time you'll be coming to work late because you're fired. I don't want to see you in my kitchen
anymore."" Then: "best friend named Katie". And DEC-345's: "let's have Katie call you and invite you out to a picnic ...
I'll just pull over where I see your truck." As built: Katie has no model and no POI (speaker label `KATIE` in
data/dialogue.js). She is on the phone at the firing, after Larry's (the picnic, `tut-picnic`), on arrival at the ranch
(`tut-ranch`) and next morning; at the camp she is there in person (DEC-347), with nothing drawn. She, not mom, first
tells the player about the expedition camp and good deeds; mom stays the tutorial's main voice, and Larry reminds you
after the paycheck (DEC-326).

**Why.** DEC-345 has her come to the camp; no model was asked for.

**Replaces.** DEC-320's "Katie is a phone voice only". The rest of DEC-320 (and its replacing DEC-146's camp-first-from-mom)
stands.

**Source.** DEC-345; DEC-320 (ledorepo cards of 2026-11-16).

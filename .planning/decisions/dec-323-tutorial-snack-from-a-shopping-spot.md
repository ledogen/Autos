---
id: DEC-323
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, FEAT-50, DEC-308, src/main.js, the gas station, pump zones, pump halos, the snack, tut-gas
supersedes:
---

# DEC-323: At the tutorial's station the snack is bought from a shopping spot; the pumps wait

**Ruling.** "Make sure the player parks in the shopping spots and not out front of the pump. It might be a good idea to
hide the pump halos for this. Then when they're pulling away, we redirect them to park at the pump." As built: on the
firing day's snack stop every pump is shut and its halo hidden (`_pumpsShut`); with the peanuts bought they come back,
and mom's pump card (`tut-gas`) plays once the truck is unparked and the shop closed. DEC-308's gates stand as worded.

**Why.** Parked at a pump, the tutorial's fill-until-broke hold would catch the snack errand.

**Replaces.** Nothing recorded (the pump card used to play the moment the peanuts were bought).

**Source.** The owner's dialogue pass over the rebuilt tutorial, numbered against DEC-304's beats (chat, 2026-11-16): "Use your best judgment if it doesn't make sense. im generally paraphrasing take my intent and stretch it as necessary". The lines themselves are the agent's, written from his paraphrases (data/dialogue.js).

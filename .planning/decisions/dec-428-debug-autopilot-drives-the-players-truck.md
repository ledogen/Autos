---
id: DEC-428
status: standing
decided: 2026-11-18
area: process
governs: FEAT-293, DEC-084, test/lib/autopilot.mjs, src/autopilot.js, autopilot, driving AI, AI cars, debug panel
supersedes:
---

# DEC-428: The test autopilot becomes a driving AI: a debug option that drives the player's truck until the player gives an input

**Ruling.** Owner, in chat, 2026-11-18: "Also to add to tonight's pile, I'd like for you to build our testing autopilot into a full-on driving AI. The goal is an option in debug that takes control of my vehicle until I give an input. It should attempt to drive forward down the road and take a random turn at every intersection and just drive forever. I suggest testing on less steep roads at first, because the steep roads in this world are truly challenging. I will mention that I think small ML models are becoming very good. Borderline industry standard for racing games, however I leave the architectural decisions up to you for a V1 proof of concept."

**Why.** The first in-game consumer of the autopilot (DEC-084: it grows into in-game AI cars); a proof of concept the owner can watch.

**Replaces.** Nothing. It is the consumer DEC-084 and the autopilot's own header said would promote the file into `src/`. As a debug option it is an owner-requested exception to "no diagnostics in src/": it ships as a driver, not as instrumentation.

**Source.** Owner, in chat, 2026-11-18.

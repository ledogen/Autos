---
id: DEC-260
status: standing
decided: 2026-11-15
area: roads
governs: BUG-171, BUG-179, src/road.js, _projectLegNearNode, _limbWeight, junction gore carve, physics ground
supersedes:
---

# DEC-260: BUG-171 keeps option 2; the rest is fixed by construction, never averaged away

**Ruling.** Choice: "keep option 2 and build option 3 next (recommended)". Note: "tbh even with the visualization
before/after looks really similar. it seems like the visual terrain mesh (by nature of coarse resolution) papers over
the underlying chaos super well. this is a smoothbrain take but i wish the physics just matched the visual here since
it looks good enough. i dont think it makes sense to just average away a really noisy broken baseline though. we
should seek to fix it by construction so no repair is necessary. "

**Why.** The physics ground must be continuous where it is defined because of how it is built, not because a blend,
smoothing or repair pass is laid over a discontinuous function. "I wish the physics just matched the visual" is a
wish, not a ruling: physics does not sample the coarse visual mesh (MESH == PHYSICS, DEC-069).

**Replaces.** Nothing (follows DEC-231).

**Source.** Owner, dive `.planning/dives/BUG-171-option2-gore-steps.html`, submitted 2026-11-15. Owner's words.

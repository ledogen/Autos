---
id: DEC-495
status: standing
decided: 2026-11-24
area: roads
governs: BUG-262, BUG-259, BUG-234, src/road.js, roadCrossAngleMin, shallow crossing, X junction, underground junction, tunnel junction, portal
supersedes: 
---

# DEC-495: A very shallow crossing merges into one road, underground as above ground; an underground junction sits at least 10 m from a portal

**Ruling.** Asked what a crossing under the 12° near-parallel limit should become, underground: "match above ground behavior - merge into one road". Asked the minimum distance from a portal to an underground junction: "10m".

**Why.** BUG-234 made crossing roads meet at an X junction. On seed 2280440363 near (19, −42) two roads cross at about 3° inside a tunnel and became a full X, although the crossing detector classes anything under `roadCrossAngleMin` (12°) as near parallel. At that angle the legs' mouths overlap, the pad falls to the convex-hull fallback and cannot weld to its legs (DEC-068). The portal distance keeps a merged or moved junction from landing on a portal, where the portal's earthwork would return over the junction (DEC-494).

**Replaces.** Nothing.

**Source.** Owner, 2026-11-24, in chat with the orchestrator, answering those two questions. The owner's words.

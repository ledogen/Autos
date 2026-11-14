---
id: DEC-066
status: standing
decided: 2026-06-16
area: roads
governs: QUAL-03, BUG-12, src/road.js, centerline
supersedes:
---

# DEC-066: Road min-radius is enforced as the centerline is drawn; grade yields first

**Ruling.** Enforce the road's minimum radius during centerline generation (valid by construction), never as a post-hoc pass; when min-radius and max-grade conflict, violate grade before radius.

**Why.** "A too-steep road is still kinda driveable; a sub-min-radius folded corner is not."

**Replaces.** Post-hoc fillet passes.

**Source.** memory project centerline mandate (BUG-12 root, 2026-06-16). Date from the memory note. Owner's words.

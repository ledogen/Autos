---
id: DEC-072
status: standing
decided: 2026-09-20
area: perf
governs: BUG-68, src/road-network-client.js, story map
supersedes:
---

# DEC-072: Never freeze the network adopt path for the map

**Ruling.** Opening the map must never freeze the adoption of finished road networks.

**Why.** Freezing adoption while the map is open stalls the world behind it (BUG-68).

**Replaces.** Nothing.

**Source.** memory project_bug68_story_map_freeze. Date from the memory note. Agent wording.

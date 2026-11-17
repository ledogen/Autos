---
id: DEC-261
status: standing
decided: 2026-11-16
area: roads
governs: BUG-171, BUG-179, src/road.js, _projectLegNearNode, junction, leg foot, road-to-road seam
supersedes:
---

# DEC-261: BUG-171 — the continuous leg foot lands after a cost check; the road-to-road seam is next

**Ruling.** On the dive "option 3 replaced by the continuous foot", question "next": "chase the road-to-road seam next
(recommended)", with the note "check the change that is the subject of this deep dive does not have any significant
performance cost (% of terrain load/gen)" (owner, deep dive, submitted 2026-11-16 07:48 UTC).

**Why.** The continuous foot fixes the foot-hop class by construction (DEC-260): nine-seed census, step sites 909 to
88. The 16 worst sites left are one class, the seam where two roads' decks overlap and the winner flips, which is also
BUG-179's root.

**Replaces.** Nothing. The orchestrator missed this answer for a day (it sat in ledorepo `dives/`, not `owed/`).

**Source.** ledorepo `dives/BUG-171-option3-continuous-foot.answers.json`.

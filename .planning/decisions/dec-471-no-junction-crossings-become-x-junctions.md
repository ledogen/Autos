---
id: DEC-471
status: standing
decided: 2026-11-20
area: roads
governs: BUG-234, src/road.js, junction promotion, road crossing, overlap join, _v2JoinOverlaps
supersedes: 
---

# DEC-471: A crossing with no junction becomes an X junction; side-by-side roads join over a wider span

**Ruling.** Where two roads cross with no junction, build a four-way (X) junction at the crossing. Delete no road to remove a crossing. Also widen the overlap join, so two roads that run side by side with overlapping pavement become one road. Owner on the pick card: "follow recommendation" (the recommendation was the X junction plus the wider overlap join).

**Why.** The census found 30 no-junction crossings on 21 of 300 default-world seeds, 8 of them shipping a deck step steeper than 45 %. The X junction fixes 30 of 30 and removes nothing. Deleting the losing road fixes 17 of 30 and removes 14 roads, which lowers connectivity. The owner's capture (seed 2711103901) was 164 m of doubled pavement, which the wider overlap join covers.

**Replaces.** The unrecorded 2026-08-25 code comment that T/X promotion was retired, for this case only: an X junction is built as an assembly backstop where a crossing would otherwise ship. Other junction promotion is unchanged.

**Source.** Owner, chat 2026-11-20, answering owed card bug234-crossing-fix-pick. Wording by the orchestrator from the card's options 1 and 3; the owner approved the recommendation.

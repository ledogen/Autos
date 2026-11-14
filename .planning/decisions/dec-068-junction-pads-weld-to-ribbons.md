---
id: DEC-068
status: standing
decided: 2026-10-12
area: roads
governs: BUG-82, src/road.js, junction pads
supersedes:
---

# DEC-068: Junction pads weld to their ribbons

**Ruling.** Junction pads weld to ribbons (shared mouth vertices, the pad on each leg's own deck); never re-add a round or flared pad rung or a node-centred back-arc bulb.

**Why.** A bulb can't weld; the open back walks the ribbon edges.

**Replaces.** The round/flared pad rung and the back-arc bulb (BUG-82 72e72e6; last bulb retired 4bd7ad4).

**Source.** memory MEMORY.md standing do-nots (BUG-82). Date from the memory note. Agent wording, owner approved 2026-11-13.

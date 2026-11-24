---
id: DEC-494
status: standing
decided: 2026-11-24
area: roads
governs: BUG-259, BUG-234, src/road.js, src/terrain.js, underground junction, tunnel junction, bore notch, mouth funnel, junction pad carve, earthwork
supersedes: 
---

# DEC-494: No earthwork at an underground junction; earthwork only near the portals

**Ruling.** "There should be no earthwork at the intersection. There should only be earthwork near the portals."

**Why.** BUG-234's X junctions put four legs' bores on one node inside the hill. The mouth-funnel notch treated each leg's span end at the node as a portal and climbed out of it, and the junction pad carve cut the skin down to the pad: on seed 1960791808 a pit 61 m deep in the mountain over the X, its floor carrying a leg's camber up through the other road's ribbon.

**Replaces.** Nothing. It narrows the BUG-67 note that the funnel "still measures from" a span end inside a sibling's tube: at a junction where every leg leaves in a bore, it does not.

**Source.** Owner, 2026-11-24, answering card bug234-built-drive (BUG-259's `source:` line). The owner's words.

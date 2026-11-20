---
id: DEC-461
status: standing
decided: 2026-11-20
area: roads
governs: BUG-236, BUG-90, BUG-230, src/road.js, connector bend, degree-2 node, vertical curve
supersedes: 
---

# DEC-461: Connector bends are built as one road: one vertical curve through the node, a smooth connector deck, the connector's own crown

**Ruling.** "Build the proposed design" (card choice, bug236-bumps-kink). The option text: "Proposed design: treat the two runs through a connector bend as one road. Profile: one parabolic vertical curve centred on the node joins the two runs' grades. It is as long as the open-road limit needs (sag radius at least 80 m, crest at least 160 m, the same limit the rest of the road meets), capped at 45 % of either run. The node's height moves onto the curve: median 0.28 m, more than 1 m at 27 of 203 nodes, at most 2.5 m. A sag node is filled; a crest node is cut. Through the connector: the height is a smooth curve along the connector, matching each run's height and grade where the connector meets it. Cross-section: the normal crown about the connector's own centre line. The bank runs evenly from one run's bank to the other's. Bank at the node: option 1 (the node decides) stays."

**Why.** 82 of 203 connector bends had a wheel-track bump over 15 cm against an 8 m straightedge (plain road: worst 9 cm). Four causes: different banks at the node, an unsmoothed sag or crest, run heights frozen past a run's end, and the crown extended sideways. Census with the design: over 15 cm goes 82 to 4, over 10 cm 132 to 35, median 13.0 to 6.7 cm, no bend worse.

**Replaces.** Nothing replaces it. Not yet checked when chosen: the regression gates on the design, the node height change against streams, causeways and POIs, and a drive. Related: DEC-069 (causeways, MESH == PHYSICS).

**Source.** Owner, card bug236-bumps-kink, answered 2026-11-20. Owner's choice of the option text above.

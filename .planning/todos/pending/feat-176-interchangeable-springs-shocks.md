---
id: FEAT-176
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: data/parts.js (spring/shock families), FEAT-168 (shelf slots), FEAT-165
---
lane: B

# FEAT-176: Front and rear springs and shocks are interchangeable

> I think we can make front and rear springs and shocks interchangeable. Having only one part type fitting in more
> slots gives the player more opportunities to get the part that they need and fix up their truck.

One spring part and one shock part, each fitting any corner. Where front and rear values differ today, decide what
the single part carries (the corner's stock rate stays per-axle, the part scales it), and flag any rating change.

## Acceptance
- [ ] A spring (shock) off the shelf or out of the inventory fits any of the four corners.
- [ ] The truck's stock front/rear behaviour is unchanged (physics fingerprint identical with stock parts).
- [ ] Shelves and rewards stop offering front/rear variants; existing saves with old ids still load.

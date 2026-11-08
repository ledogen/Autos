---
id: BUG-147
type: bug
status: open
severity: major
opened: 2026-11-08
source: Spare, found while shooting BUG-67's miter before/after (pre-existing on main)
relates: BUG-67 (shared bore), BUG-138 (a solid in a bore before its portal)
---
lane: B

# BUG-147: a terrain rock wedge stands inside the tunnel bore at an underground Y

Seed 4076238903: the terrain surface (not the lining) pokes into the bore at the underground Y near (1734, −1393).
Seen from run g:1734063,-1393102,-1:2,-3,0 looking back at the node. It is the last before/after pair on Spare's
BUG-67 review page (https://claude.ai/artifact/7jCXeEf38d7wUpJzvwuECW); present on main before the miter too.
Possibly BUG-138's family (something solid standing in a sibling's bore).

## Acceptance

- [ ] Cause found: why the terrain under/around the shared bore is not carved clear at that spot.
- [ ] No terrain surface inside any bore at that site; a headless check (rays down the bore, or the carve vs the
      tube) pins it, and a census over random seeds says how common it was.
- [ ] Mesh == physics: whatever is drawn inside the bore is what the truck hits.

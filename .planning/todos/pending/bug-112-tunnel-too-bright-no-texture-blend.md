---
id: BUG-112
type: bug
status: open
severity: minor
opened: 2026-11-05
source: owner, 2026-11-05, driving BUG-81's shoulder fix on Spare's branch (:3885) — "the tunnel shoulder drive felt was smooth as butter - close. but the lighting was off - too bright in the tunnel. and texture blending nonexistant"
relates: BUG-81 (the shoulder fix the owner accepted), BUG-67 (the shared bore)
---
lane: Spare

# BUG-112: inside a tunnel it's too bright, and the textures don't blend

The drive itself is accepted (BUG-81 closes). Two looks are wrong inside the bore:

1. **Too bright.** The tube is lit like open air. It should read as an enclosed bore: darker inside, with
   the portals bright.
2. **No texture blending.** Surfaces meet with hard seams inside the tunnel (owner: "nonexistant"). Find
   which ones (lining vs road deck vs shoulder vs the terrain at the portal) before choosing a fix.

## Acceptance

- [ ] Before/after screenshots inside a bore and at a portal, at noon and at dusk, for the owner.
- [ ] Each seam the owner meant is named, and blends or is ruled a hard edge.
- [ ] The owner's look.

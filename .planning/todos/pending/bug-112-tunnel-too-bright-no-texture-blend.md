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

## Built (Spare, 2026-11-05, feature/spare 92639ee6 + e3ef09e8) — the lighting; the seams wait on the owner

**Why it was bright.** Inside a bore only the lining's colour carried the darkness ramp (FEAT-40: full at the
portals, 25 % from 25 m in). The near sun had no casters but the truck, so the deck, the dirt shoulder, the paint
and the truck were lit as on open road (the truck threw a crisp sun shadow 60 m under the hill), and the sky
light was untouched. At 17:30 the low sun lit the walls orange deep inside.

**The fix.**
- The lining casts shadows, so neither sun reaches the deck or the truck inside the tube.
- ONE ramp for everything in the tube, `RoadSystem.boreShade(runKey, arc)` (and `boreShadeAt(x, y, z)` for what has
  no arc of its own): the lining, the ribbon and its skirts, the paint (the shader reads the shade back off the
  asphalt), junction pads and connector strips, and the truck (its diffuse colour × one shared uniform, set each
  frame; the lamps are untouched).
- By day the headlight beams come up as the truck goes in (full at the bore's deepest), because the beams are
  hidden by day only for being outshone.

**Sheet** (sent to the owner): `CarGame-spare/wip/bug-112/shots/sheet-bug112.png` — seed 6's 256 m bore, truck
seated in it, low beam on, noon and 17:30, main vs fix, plus the three seam candidates numbered:
1. the bore floor: textured ground stops dead at the lip, and a flat tan apron starts;
2. two tans side by side along the bore: the road's dirt shoulder and the lining's apron;
3. the lining's smooth concrete against the masonry ring.
**Owed:** the owner's look at the lighting, and which seam(s) were meant (then blend them or rule them hard edges).

## Owner's call page (Spare, 2026-11-06)

The 11-05 sheet was never queued as an owed call (the orchestrator confirmed). It is now one phone-width page,
https://claude.ai/artifact/WvJkABRWGG5rZ35BimnXvk, generated into `wip/bug-112/page/` from the 11-05 frames.
- **The light:** noon and 17:30, 60 m in and at the mouth.
- **The seams:** the portal at noon and dusk, with the three candidates numbered.
- **The calls:**
  - A, the light inside: keep / darker / lighter;
  - B, which seam (1 bore floor, 2 two tans, 3 lining vs ring), each one blended or ruled a hard edge.
Queued by the orchestrator as an owed call. The build waits on the answer.

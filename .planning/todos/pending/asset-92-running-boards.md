---
id: ASSET-92
type: asset
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "Another visual mod idea: running boards that are purely aesthetic."
relates: FEAT-204, DEC-340, DEC-341, DEC-372, src/vehicle-model.js
---
lane: unplaced (scribe: lane C for the model; the fitting is one more bolt-on row, as in FEAT-204)

# ASSET-92: Running boards (purely aesthetic visual mod)

## Next steps
Owner or Lane C: say whether this is wanted before the alpha (FEAT-204 is the alpha set) or after. Then model it per `.planning/research/ASSETS.md` (one `.glb`, flat colours, faceted).

## Summary
Another visual mod for the truck: running boards (the side step under each door). Purely aesthetic: no mass, no stat, no gameplay effect.

Owner's words:
> Another visual mod idea: running boards that are purely aesthetic.

## Description
Read FEAT-204 (the visual-mod set) and DEC-340 / DEC-341 (rounds 2 and 3 of the visual mods) before modelling: the other mods are fitted as bolt-on parts and only show when fitted. DEC-373 gave the real bolt-ons a mass; the owner says this one is cosmetic, so it should carry none.

Asset spec (to fill in by the model lane): real-world size on a 2002 Ranger (about 1.7 m long, 0.15 to 0.2 m deep, under the door sills), origin + forward convention per ASSETS.md, tri budget, collision: none (or sill-skirt only; must not touch the wheel).

## Tracker
- [ ] The owner says if it ships before or after the alpha
- [ ] Model: `assets/models/running-boards.glb`, one per side or a mirrored pair, art style per ART-STYLE.md
- [ ] A bolt-on row in `data/parts.js` that shows it when fitted (aesthetic: no mass, no stat)
- [ ] Owner has looked

## Open questions
- Is it a bolt-on the player buys at the auto shop (price?) or a found part? No conflict found with a standing record: DEC-340/341/372/373 govern the other mods and none mentions running boards.
- Alpha or post-alpha? DEC-123 (before the alpha means alpha) holds the line on scope.

## Links
FEAT-204 (note added there).

## Files
`assets/models/` · `data/parts.js` · `src/vehicle-model.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.

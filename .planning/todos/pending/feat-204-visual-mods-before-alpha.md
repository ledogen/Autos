---
id: FEAT-204
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "we should add some visual mods before alpha. doesnt have to be a ton. id like to see a light bar (older style 4 reflector incandescent), an in-bed toolbox right behind the cab that gives you 4x more inventory slots, a roof rack that gives you 4x more and a bull bar that adds impact resistance to the front end."
relates: FEAT-115 (bed upgrades as parts: roof rack and light bar are named there), FEAT-121, src/inventory.js (slotCap), src/damage.js (armorFront), DESIGN.md § bed upgrades, SM-INV-15
---
lane: B

# FEAT-204: Visual mods for the alpha — light bar, bed toolbox, roof rack, bull bar

## Next steps
Four models built in wip/ of CarGame-run-shape, nothing promoted to assets/ (ticket log merged e3291a66). Owner: look card
`feat204-models-look`. After approval: promote the four .glb files, then Lane B wires them (Tracker boxes all open).

## Summary
Four bolt-on parts the player can see on the truck, wanted before the alpha: a light bar, an in-bed toolbox, a roof rack and a bull bar. Each one does something. It does not have to be a large set.

## Description
| Part | Look | Effect |
|---|---|---|
| Light bar | older style, four round incandescent reflectors | more light at night |
| Bed toolbox | across the bed, right behind the cab | more inventory slots |
| Roof rack | on the cab roof | more inventory slots |
| Bull bar | on the front bumper | impact resistance for the front end (the `armorFront` track) |

- These are **parts on the truck configuration**, lost on death, found or bought mid-run (FEAT-115's rules, SM-INV-8 and SM-INV-15). FEAT-115 keeps the flatbed, stake bed and extended bed, which are not asked for here; its roof rack and light bar are built by this ticket.
- Each part needs a hand-modelled `.glb` (one ASSET ticket each, minted when the content lane starts) that mounts on the Ranger model.
- The toolbox takes bed floor: check it against cargo placement and the bed colliders (FEAT-88).

## Tracker
- [ ] Four models on the truck, each shown only when the part is fitted
- [ ] Light bar adds light; toolbox and roof rack raise the slot cap; bull bar hardens the front end
- [ ] The parts are found or bought in a run and are lost on death
- [ ] The toolbox and bed cargo do not overlap

## Decisions
- 2026-11-13, owner: "4x more inventory slots means +4 slots" — the toolbox and the roof rack each add 4 slots.
- 2026-11-13, owner: before alpha; light bar is the older 4-reflector incandescent style; toolbox sits right behind the cab.

## Open questions
- Does the bull bar cost anything (mass on the front axle is real already; anything else)?

## Files
`data/parts.js` · `src/inventory.js` · `src/damage.js` · `data/vehicle-models.js` · `assets/models/`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-16: content lane modelled all four in `wip/` of CarGame-run-shape (git-invisible, owner review before promotion): light-bar 2808 tris · bed-toolbox 1484 · roof-rack 1628 (plain utility basket; role open, FEAT-240) · bull-bar 1028. All in ranger.glb's frame (child of the ranger root, identity transform), 0 inverted faces, no overlap when all four are fitted. Renders in `wip/<part>/renders/`, refs in `wip/feat-204-refs/refs.md`. Not promoted, not wired; ASSET tickets not minted.

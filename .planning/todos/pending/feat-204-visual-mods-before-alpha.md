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
Three bolt-ons on main. On `land/machine-1117` (awaiting landing): the light bar on high beams only, real masses on the chassis,
no bed toolbox (DEC-372/373). Owner: DEC-342's remaining [DEFAULT]s (prices, armour, light gain) and three thumbnails.

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
- [x] Three models on the truck, each shown only when the part is fitted (no toolbox before the alpha, DEC-372)
- [x] Light bar adds light (high beam only, DEC-373); the roof rack raises the slot cap; bull bar hardens the front end
- [x] Each bolt-on's real mass loads the chassis while fitted (DEC-373)
- [x] The parts are found or bought in a run and are lost on death (auto-shop shelf; not rewards yet)
- [x] ~~The toolbox and bed cargo do not overlap~~ — no toolbox before the alpha; post-alpha plan FEAT-253

## Decisions
- 2026-11-17, owner (card feat204-toolbox-freight, DEC-372): "Bail: no bed toolbox; its slots go elsewhere" — "Post alpha, we
  build a system that allows the Player to position loads in the bed of the truck. … Pre-alpha, remove the toolbox".
- 2026-11-17, owner (card feat204-wire-look, DEC-373): "Low beams should not turn on the light bar, only high beams should turn
  it on. Anyway, we can add part masses to these since they are Explicitly modeled that shouldn't be that tricky."
- 2026-11-16, agent (DEC-342, draft): rack $40 +4 slots, bull bar $35 armorFront ×1.5 durability, light bar $25 head beams ×2
  intensity ×1.47 reach and the no-cutoff pattern, all three "Rarely" on the auto-shop shelf. No new real-time light (DEC-229).
- 2026-11-13, owner: "4x more inventory slots means +4 slots" — the toolbox and the roof rack each add 4 slots.
- 2026-11-13, owner: before alpha; light bar is the older 4-reflector incandescent style; toolbox sits right behind the cab.

## Open questions
- Does the bull bar cost anything beyond its 16 kg (now on the chassis, at the CG)?

## Files
`data/parts.js` · `src/inventory.js` · `src/damage.js` · `data/vehicle-models.js` · `assets/models/`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-16: content lane modelled all four in `wip/` of CarGame-run-shape (git-invisible, owner review before promotion): light-bar 2808 tris · bed-toolbox 1484 · roof-rack 1628 (plain utility basket; role open, FEAT-240) · bull-bar 1028. All in ranger.glb's frame (child of the ranger root, identity transform), 0 inverted faces, no overlap when all four are fitted. Renders in `wip/<part>/renders/`, refs in `wip/feat-204-refs/refs.md`. Not promoted, not wired; ASSET tickets not minted.
- 2026-11-16: owner looked at round 1 ("good first attempt"). Round 2 per DEC-340: bent one-tube bull bar with one welded crossbar; roof rack to the cab roof footprint (first); lights mount to the rack when both are fitted, own bridge member when alone. Toolbox stands.
- 2026-11-16: round 2 built in `wip/` (round 1 kept in `wip/<part>/r1/` + its renders): roof-rack 1588 tris, 1.15 x 0.56 m basket centred on the 1.32 x 0.58 m roof panel, 15 mm inside the cab back · bull-bar 1360 (one 68 mm tube, 10 deg forward lean, 60 mm welded crossbar; top = headlamp centre) + bull-bar-skid 1492 variant · light-bar-rack 2940 (tabs on the rack's front rail) and light-bar-solo 2808 (round-1 bridge bar), same pods + material names. 0 part-vs-part overlap in all three fitted sets; sheets `wip/feat-204-common/renders/r2-*.png`. Not promoted.
- 2026-11-16: owner on round 2 (DEC-341): plain bull bar, keep the lean, pods in FRONT of the rack rail, lower bend fine, roof clamp hardware black. Round 3 then promote and wire.
- 2026-11-16: owner raised the toolbox vs freight conflict (pallets slide back, CG; lumber may not fit; wants a way to bail). Numbers: bed 1.84 x 1.40 x 0.41 m; box takes 0.51 m, 0.115 m slot under it; 1.32 m floor left. Pallets and the job box fit; lumber bundle (0.38 tall), plywood, ties, drum stack do not. Card feat204-toolbox-freight. Toolbox wiring waits on it.
- 2026-11-16: round 3 + promotion (08eae7d8): pods hung in front of the rack rail on welded L-brackets (lamp centre z 1.752, rail 1.740), roof clamps black, plain bull bar only. `assets/models/mod-{roof-rack 1588, bull-bar 1360, bed-toolbox 1484, light-bar-rack 2780, light-bar-solo 2808}.glb`, generators `assets/models/src/mod-*.py`. 0 overlap in both fitted sets; sheets `wip/feat-204-common/renders/r3-*.png`. ASSET-85..89 closed. Not wired.
- 2026-11-16: wired (land/feat-204-wire): three bolt-on sockets + parts in data/parts.js, `modModels` / `extraSlots` / `guards` in
  src/parts.js, `setMods` in src/vehicle-model.js, Bolt-ons node in the service screen. Gate `bolt-ons.mjs`; smoke step `boltons`
  + newRun clears them. Pictures `wip/feat-204-wire/{day-front,day-rear,night-bar,night-nobar}.png`. Stage truck shows stock (it
  always did). A fitted part's mass is still not modelled (parts.js header).
- 2026-11-17: land/machine-1117 81a50061: light bar lit and gain/reach applied on high beam only, low beam keeps its cutoff.
  Masses (sourced, data/parts.js): rack 16 → 13, bull bar 22 → 16, light bar 8 → 10 kg; `boltOnKg` → params.fittedKg → chassis
  mass, suspension, hi-lift, tire load cap and the job load check (at the CG: the ~2 cm CG shift is not modelled, physics.js).
  Toolbox: no part existed; its notes removed, the .glb stays. bolt-ons gate §7 green. Night look not re-shot.
- 2026-11-19: owner's inbox note: "Another visual mod idea: running boards that are purely aesthetic." Ticketed as ASSET-92 (model) beside this set; not part of the alpha set unless the owner says so.

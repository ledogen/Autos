---
id: FEAT-251
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Did I ever make a ticket about being able to crash into lawn furniture and it goes flying? The only thing I want players to actually collide with is the fire pit. Otherwise at a bare minimum we need to make them pass through everything else, but I'd rather it use the demolition system and spawn in a rigid body physics object when the player bumps into the lawn ornament. So it can have mass and hit the truck and tumble."
relates: FEAT-65, FEAT-71, src/demolition.js, src/debris.js
---
lane: Spare (s2, land/feat-251-lawn)

# FEAT-251: Lawn furniture gets knocked flying; only the fire pit is solid

## Next steps
Owner: drive it (owed card feat251-lawn-drive). Then land `land/feat-251-lawn`.

## Summary
Lawn furniture should tumble when hit, with real mass, instead of stopping the truck. Only the fire pit stays solid.
Built on FEAT-149's model↔body swap (the demolition mechanism): every lawn item but the fire pit is knockable.

## Description
No earlier ticket covered this (searched 2026-11-17). Minimum bar from the owner: pass through everything except the fire pit.

### Built (s2, 2026-11-17)
- FEAT-149 already did this for the gnome, beach ball and flamingos: near the truck (60 m) each is a debris body at its
  standing pose, put to sleep at once, and the truck's contact wakes it. Promotion is the engine waking a body that
  already exists — never a spawn into the truck — so there is no overlap and no impulse spike.
- data/prop-models.js: `knockable` added to bbqGrill 15 kg, propaneTank 16.8 kg, campChair 3.5 kg, pottedPlant 14 kg;
  gnome 4 → 10 kg (0.8 m since the x2 rescale), beach ball 0.15 → 0.35 kg. Each row carries its reasoning. firePit
  is the only lawn item left with a fixed collider (poi.js satSolid). The farm's yard clutter (drums, crates, pallets)
  is untouched; the propane tank is knockable in both pools.
- main.js `_updateOrnaments`: the ornaments are no longer `noDamage`. Like a demolition target, a hit costs what the
  wear model says. Measured: nothing, up to a 30 kg grill at 30 m/s (the truck loses 0.93 m/s, under the 2 mph trigger).
- Pinned outside DEBRIS_CAP, like demolition targets: a cap reclaim would make a standing ornament vanish. The 60 m
  radius bounds the count. Knocked stays knocked for the session; nothing is saved (world dressing is cold).

### Measured (test/lawn-knock.mjs)
| strike | truck Δv | worst step / bound | launch (× v) | body peak (step mean) | armor |
|---|---|---|---|---|---|
| chair 3.5 kg, 5 / 15 / 30 m/s | 0.017 / 0.052 / 0.095 m/s | 0.42 / 0.42 / 0.45 | 1.45 / 1.31 / 1.13 | 28 / 77 / 165 g | 0 |
| grill 15 kg, 5 / 15 / 30 m/s | 0.080 / 0.249 / 0.468 m/s | 0.60 / 0.60 / 0.58 | 1.36 / 1.19 / 1.16 | 37 / 109 / 214 g | 0 |
| grill 30 kg, 30 m/s | 0.927 m/s | 0.57 | 1.15 | 211 g | 0 |
Bound = 2·m·v/M. The truck's vertical speed moves < 0.03 m/s (no kick). Step cost, report only, loaded machine:
0 / 10 / 30 awake ornaments 119 / 181 / 195 µs per 16.7 ms step (median).

## Tracker
- [x] Fire pit is the only fixed lawn collider
- [x] A bumped ornament spawns as a rigid body and tumbles
- [x] Mass per ornament is realistic
- [x] Body count and cost measured
- [ ] Owner has driven it

## Decisions
- 2026-11-17, owner: DEC-394 (the ticket's source quote).

## Open questions
- FEAT-149's acceptance said a knocked ornament never damages the truck; FEAT-251 hands that to the wear model (it
  prices every tested hit at zero). The owner's call if a heavier knockable is ever added.

## Files
data/prop-models.js, src/main.js (`_updateOrnaments`), src/poi.js (`satSolid` comment), test/lawn-knock.mjs, test/gates.mjs.

## Log
- 2026-11-17 (s2): built on land/feat-251-lawn. Gate lawn-knock green; affected gates and fingerprints: see the report.

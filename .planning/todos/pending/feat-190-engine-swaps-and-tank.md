---
id: FEAT-190
type: feature
status: open
severity: minor
opened: 2026-11-08
source: owner, tracker inbox 2026-11-08 19:52Z + item setup page `powermods` notes 19:27Z
relates: FEAT-189 (power mods), FEAT-191 (per-engine turbo), FEAT-192 (rarity tiers), FEAT-50 (fuel map), FEAT-69 (par / economy)
---
lane: B (build) · C (item page cards)

# FEAT-190: I4 is the default engine; V6 and V8 swaps and a bigger fuel tank as mods

## Owner, verbatim

Inbox, 2026-11-08 19:52Z: "add bigger fuel tank and v6 and v8 engine options as mods on the item page. i4 should
be default engine from now on. v6 is A-S and epic. V8 is S only and legendary"

Item page `powermods` notes, 19:27Z: "we should have a 4 banger option (i think already built) a v6 (current
default) and v8 (based off the ford 5.0 explorer motor) weight needs to change with engines."

## What

- **I4 default.** `data/ranger.js` `engine: 'vulcan30'` → `'duratec23'` (the 2.3 L Duratec is already in
  `data/engines.js`: 143 hp @ 5250, 209 N·m @ 3750, redline 6250).
- **V6 swap:** rank gate A–S, rarity epic. (Which V6 is open: FEAT-189 § Open.)
- **V8 swap:** rank gate S only, rarity legendary. A new `ENGINES` entry from the Ford 5.0 L OHV V8 as fitted to the
  1996–2001 Explorer: published 215 hp @ 4200, 288 lb·ft @ 3300. Source the curve and fuel inputs the way
  `vulcan30` / `duratec23` were (fueleconomy.gov anchors, a gate band in `test/fuel-map.mjs`).
- **Engine mass per engine.** "weight needs to change with engines": the swap changes the sprung mass and the
  front axle load. `engineStock` in `data/parts.js` is a 180 kg crate today.
- **Bigger fuel tank:** a mod. No figures yet (stock is 16.5 gal); the item page gets a card for it.

## Watch

- The default swap moves every par and drive time: the I4 makes ~16 % less torque than the V6. The par bands and
  `test/fuel-map.mjs` are pinned to the V6. Re-measure the par before landing and state it. Don't retune the
  economy without the owner (FEAT-69).
- The gearbox is the V6's 4R44E unless the 5R55E is picked (`data/transmissions.js`).
- Engine audio reads `cylinders`, so the I4 and V8 already sound different. Check the starter and idle.

## Acceptance

- [ ] New runs and free roam start on the I4. Saves keep the engine they have (no save-version bump unless needed).
- [ ] V6 and V8 as shop/reward parts with their gates and rarities; each swap carries its own mass.
- [ ] The V8 entry with a fuel-map gate band.
- [ ] The bigger tank as a part, figures from the item page.
- [ ] Par change on the I4 measured and stated.

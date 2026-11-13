---
id: FEAT-182
type: feature
status: open
severity: minor
opened: 2026-11-07
source: FEAT-66's "Still owed" (closed 2026-11-07 in Lane A's sweep): "The starter Pack has one free slot, so today a player can bring the tent OR a shade OR the kit. The bigger packs (items.md §2c) are unbuilt."
relates: items.md §2c (backpacks: slots and reach), FEAT-66 (camp gear slots, closed), FEAT-171 (the bed's three layers), FEAT-168 (reward categories; where camp gear comes from), FEAT-137 (the shop shelf)
---

# FEAT-182: the bigger backpacks

## What

A backpack decides which camp gear comes to camp (its **slots**) and how far past the road edge camp can be (its
**reach**, the night's `campRoadEdgeM` tether). Only the starting **Pack** exists (`data/items.js pack`: 2 slots,
40 m). The bedroll fills one slot, so a player can bring only one more item: the tent, a shade or the cooking kit.

items.md §2c's roster has four more packs, trading slots against reach:

| Pack | Slots | Reach | Cost | Status |
|---|---|---|---|---|
| Daypack | few | far (up to the 120 m cap) | cheap, light | IDEA (owner, 2026-10-16) |
| Duffel | many | barely past the shoulder | cheap, bulky | IDEA (owner, 2026-10-16) |
| Rucksack | fewer than the Duffel | less than the Frame pack | mid-priced | RULED: between the Duffel and the Frame pack |
| Frame pack | many | far (up to the 120 m cap) | expensive | IDEA: the "good at both" pack |

## Owed by the owner

The figures: slots, reach, mass and price for each pack (all placeholders in §2c, except the Rucksack's place), and
where each one comes from (shop shelf, rewards).

## Acceptance

- [ ] The four packs are items (`data/items.js`, kind `pack`), each with `packSlots` and `reachM` as the owner rules
      them, with thumbnails. **Built with placeholder figures** (below); the owner's figures are still owed.
- [x] An equipped pack sets the night's tether to its reach, capped at 120 m.
- [ ] Each comes from where the owner rules (shelf and/or reward categories).
- [x] Gates: the inventory gate covers packing up to the slots and the tether following the equipped pack.

## Built (2026-11-07, Lane C, for the owner's test)

The owner (feat66-look, 2026-11-07): "i would love to get the alternate backpacks in game to test so i can see the rest
of the items all at once instead of loading up one at a time."

- **The four packs are items** in `data/items.js`, kind `pack`. Every figure is a placeholder **[DEFAULT]** until the
  owner rules it:

  | Pack | Slots | Reach | Mass |
  |---|---|---|---|
  | Pack (ruled) | 2 | 40 m | 1.5 kg |
  | Daypack | 2 | 100 m | 0.8 kg |
  | Rucksack | 4 | 60 m | 2 kg |
  | Duffel | 6 | 15 m | 3 kg |
  | Frame pack | 6 | 120 m | 3.5 kg |

  Six slots hold a whole camp: one item per bed layer (ground, bedding, blanket), plus the shelter, the shade and the
  cooking kit. The Rucksack sits between the Duffel and the Frame pack, as ruled.
- **No source yet.** They are not on any shelf and in no reward category until the owner rules where they come from.
  For the test, grant them from the debug menu: Story · Inventory (FEAT-122) → item → grant item. Then use the
  inventory screen to equip the pack (the bedroll moves across) and pack the camp gear into it.
- **Reach is wired.** `CampSystem.reachM()` returns the equipped pack's `reachM`, through `InventorySystem.reachM()`
  and main.js's `getReachM` dependency. It is capped at 120 m (`CAMP_REACH_CAP_M`).
  - The siting ladder and the tether both read it.
  - The camp grade's memo re-grades when the reach changes, so equipping another pack takes effect on the spot.
  - `CAMP_PARAMS.campRoadEdgeM` (40) remains only as the reach with no pack to ask (headless). Its "road tether"
    debug slider is gone, because in a run the pack decides.
- **Thumbnails** (`assets/items/<id>.png`), from `assets/models/src/items.py`, rendered headless:
  - `build_daypack`: a red nylon teardrop;
  - `build_duffel`: a canvas barrel on its side with leather bands and handles;
  - `build_framePack`: an orange bag high on an aluminium frame;
  - the rucksack: its builder already existed.
- **Dropped models** (FEAT-143) are `item-daypack/duffel/rucksack/frame-pack.glb`, with their `PROP_MODELS` rows. The
  Frame pack lies on its back.
- **Gate:** `test/inventory.mjs` § 6c:
  - five packs, each with slots and a reach;
  - equipping the Frame pack brings the bedroll across;
  - it takes a whole camp and refuses a seventh item;
  - the tether follows the equipped pack, never past 120 m, and falls back to the param headless.

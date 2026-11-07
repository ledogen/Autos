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
      them, with thumbnails.
- [ ] An equipped pack sets the night's tether to its reach, capped at 120 m.
- [ ] Each comes from where the owner rules (shelf and/or reward categories).
- [ ] Gates: the inventory gate covers packing up to the slots and the tether following the equipped pack.

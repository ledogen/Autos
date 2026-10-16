---
id: FEAT-122
type: feature
status: open
severity: major
opened: 2026-10-16
source: owner, 2026-10-16 — "we'll have to build the inventory system and storefronts"
relates: FEAT-121 (every item, by category), FEAT-104 (storefronts), FEAT-67 (reward grants are
  stubbed — this is where they land), FEAT-66 (camp gear render), FEAT-42 (run save), FEAT-41 (menus),
  items.md (Gaps #3, §1c quick slots)
---

# FEAT-122: Inventory — what the player owns this run

**No item system exists.** Rewards settle with a recorded award and nothing takes effect
(`data/offers.js` REWARDS, FEAT-67); shops don't exist (FEAT-104). Every row in FEAT-121 needs this
first, which is why FEAT-121 never lists it under `needs:`.

## What it has to hold (all ruled)

- **Owned items, per run.** Items die with the run; nothing persists (SM-INV-8/9, items.md rule 3).
  It rides in the single-slot run save (FEAT-42), never in `metaState`.
- **Real mass.** Every stowed item adds its mass to the truck (items.md rule 2). Bed items are
  bodies in the bed; everything else is a point mass on the chassis.
- **Uses.** Consumables carry a count (cargo protection pads: 3, bubble wrap: 1).
- **Fitted parts are a truck configuration**, not a bag: owning an LSD means `rearDiffMode` changes.
  The inventory records the fit; the physics reads `data/ranger.js` values through it.
- **No numbers on items in the UI** (SM-INV-10). Described, never scored.
- **One grant path** for shop purchases, rewards (FEAT-67's stub) and finds.

## Open — the owner's (items.md Gaps #3)

1. **Slots or mass?** Is the limit a slot count, a mass/volume budget, or nothing but the mass itself?
2. **Quick slots (§1c).** Keys 1–4 for instant-use items while driving: how many, and is it
   consumable-only or also cooldown items?
3. **Where is the inventory screen?** The campsite is the inventory screen for camp gear (visible-kit
   rule); the rest needs a menu (FEAT-41). Pause the clock while open, like the shop?
4. **Is stowed mass legible?** 23 kg on a 1360 kg truck is ~1.7% and won't be felt (items.md §2b).

## Acceptance

- A REWARDS grant puts the item in the inventory and its effect, if built, applies.
- Inventory survives save/load inside a run and is empty at run start.
- Stowed mass shows up in the truck's total mass.

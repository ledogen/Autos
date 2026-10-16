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
  It will ride in the single-slot run save (FEAT-42, SM-4), never in `metaState`.
- **Real mass.** Every stowed item adds its mass to the truck (items.md rule 2). Bed items are
  bodies in the bed; everything else is a point mass on the chassis.
- **Uses.** Consumables carry a count (cargo protection pads: 3, bubble wrap: 1).
- **Fitted parts are a truck configuration**, not a bag: owning an LSD means `rearDiffMode` changes.
  The inventory records the fit; the physics reads `data/ranger.js` values through it.
- **No numbers on items in the UI** (SM-INV-10). Described, never scored.
- **One grant path** for shop purchases, rewards (FEAT-67's stub) and finds.

## Ruled — owner, 2026-10-16 (items.md Gaps #3)

1. **Mass + slots.** Both limits apply. Stowed mass counts toward the truck's payload, the same
   570 / 820 kg verdict cargo uses (FEAT-112). On top of that, a **slot count**:
   - **Tools and camp gear take one slot each.**
   - **Consumables of one kind stack into one slot** (3 cargo pads = 1 slot).
   - **Fitted parts take no slot** (they are truck configuration). **An unfitted part takes a slot**
     (a mission can reward a part you haven't fitted yet). **Mission cargo takes no slot** (it is
     payload and bed space).
   - **The stock truck has 8 slots.** Bed parts add more (FEAT-115 rack, toolbox, …), the same way
     §3f's parts move the weight limits. Each bed part's figure is set when that part is defined.
2. **Quick slots: 4 (keys 1–4), consumable and cooldown items both.** A quick slot is a **shortcut**:
   a key bound to an item you already own. It is not extra storage, and the item still takes its
   inventory slot.
3. **Inventory screen: hotkey `I`, plus an icon in the right-edge HUD icon column** (with the damage
   and camp icons) for opening it on the go. **The clock runs while it is open on the road. At camp it pauses**, like the other
   planning screens.
4. **Stowed mass is physics only.** No exaggeration, no extra cost. Light kit is in effect priced in
   cash and a slot; heavy kit (spare tire, freight) is felt, and it all counts toward the payload
   verdict.


## Acceptance

- A REWARDS grant puts the item in the inventory and its effect, if built, applies.
- Inventory is empty at run start.
- Stowed mass shows up in the truck's total mass.

**Not here — SM-4:** the inventory surviving save/load inside a run rides on the run save (FEAT-42).
This ticket keeps it in memory.

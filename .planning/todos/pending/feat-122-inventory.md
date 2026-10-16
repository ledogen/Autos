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
- **Camp gear is owned OR packed** (items.md §2c, owner 2026-10-16). Owned camp gear is truck mass;
  the equipped backpack holds the subset that comes to camp — one item per slot; the bedroll takes
  one, the fire none. Several packs can be owned (spares ride in the truck); one is equipped at a
  time, used automatically at camp, and its reach sets `campRoadEdgeM` for the night. The equipped
  pack must always hold a sleeping item: packing can swap the bedroll for an upgrade, never empty
  that slot. The inventory screen is where you pack and choose the equipped pack.

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
3. **Inventory screen: hotkey `Tab` (`I` is the ignition), plus an icon in the right-edge HUD
   icon column.** **It works only while parked** (round 2, below), like the damage screen. The clock
   runs while it is open on the road; at camp it pauses, like the other planning screens.
4. **Stowed mass is physics only.** No exaggeration, no extra cost. Light kit is in effect priced in
   cash and a slot; heavy kit (spare tire, freight) is felt, and it all counts toward the payload
   verdict.

## Ruled — owner, 2026-10-16, round 2 (after playing v1)

5. **The screen draws every slot** — a grid of the truck's slots, empty ones included.
6. **Backpacks** (items.md §2c). A pack takes **one truck slot** and holds its own slots; gear packed
   inside it **frees its truck slot** (still truck mass). Several packs may be owned, never fewer
   than one; one is **equipped**. The starter Pack has 2 slots with the bedroll in one. Hover a
   pack to see its slots; click it to open it and pack or unpack.
7. **The park zone.** The parking-gated icons — damage (V) and inventory (Tab) — sit together in a
   shaded box in the HUD column, owned by the P sign. Not parked (or the brake belongs to a POI
   here): the zone is locked and a press pulses the P sign. Camp stays outside the zone. Quick keys
   1–4 still work while driving (items.md §1c).
8. **Every item has a rendered thumbnail** — modelled and rendered in Blender
   (`assets/models/src/items.py` → `assets/items/<id>.png`), one fixed rig for the whole set.

## Acceptance

- A REWARDS grant puts the item in the inventory and its effect, if built, applies.
- Inventory holds only the starting kit at run start: the Pack with the bedroll packed (items.md §2c).
- Stowed mass shows up in the truck's total mass.

## Status — rounds 1+2 merged to main 2026-10-16 (f0c5034)

Kept open for the deferred list below. Don't start any of these without the owner.

- Fitting parts (waits for the FEAT-104 shop).
- Cooldown items.
- Quick-slot rebinding, and a HUD strip for keys 1–4.
- Pack reach → `campRoadEdgeM`.
- Bed restfulness → `DaySystem.recoveryRate`.
- Effects for the chili dog, spare tire and emergency gas.
- Stowed mass in free roam.
- A second pending grant overwrites the first.

**Not here — SM-4:** the inventory surviving save/load inside a run rides on the run save (FEAT-42).
This ticket keeps it in memory.

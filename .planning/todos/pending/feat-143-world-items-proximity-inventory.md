---
id: FEAT-143
type: feature
status: open
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 — "I plan on taking a lot of the in game items and placing them in the world in 3d. We already did the modeling work and it should be simple enough to build colliders for them. I actually think we could have an area-based inventory system so if you drop an item it goes onto the ground and you can also pick up items from the ground. This would allow us to spawn collectible items randomly in the world or allow them to drop from certain events"
relates: FEAT-122 (inventory), FEAT-121 (item tracker), items.md "New idea, not ruled" (proximity inventory, 2026-10-21), feature/stranded-spare (the first item model in the world)
---

# FEAT-143: World items — drop to the ground, pick up from it

## Why

Every inventory item already has a real-size Blender model: the thumbnail builders in
`assets/models/src/items.py`. feature/stranded-spare proved the path from thumbnail to world object
with the spare tire. `items.py export_glb()` lays a builder in its rest pose and writes
`assets/models/<file>.glb`. `src/debris.js` then hulls the render mesh, thinned by `thinHull` to the
engine's limit, so no hand-built collider is needed. The owner wants to use that for an
**area-based (proximity) inventory**: drop an item and it lands on the ground as a physics body, and
pick up items lying near the truck. That opens the way to random collectibles in the world and to
items dropped by events.

## Open design questions (owner's to answer — none ruled)

- Pick-up gesture and reach: park near it, or drive over it? What radius?
- Does a dropped item persist: across a sleep, across leaving the area, in the save? (SM-INV and
  cold-generation rules: world spawns must come from the seed, while a player's drop is player state.)
- Random world spawns: which items, how often, and where (roadside, POI yards)?
- Event drops: which events?
- CLAUDE.md and items.md say most items are 2D art only, with no world presence. This ticket
  reverses that, so both docs need a line once it is ruled.

## Acceptance

- To be written once the questions above are ruled.

## Scope measured (Spare, 2026-11-01) — nothing built; plan for the owner

**Models.**
- 56 inventory items need **34 distinct models**, because parts share one per kind (tire, wheel,
  springs, dampers, pads, shoes, arb, diff, lift, engine, radiator, airFilter, headlight).
- **All 34 already have a Blender builder** in `assets/models/src/items.py` (the thumbnail builders).
- **Only the spare tire has a world export** so far (`WORLD` table + `export_glb`), giving
  `spare-tire.glb`, 152 KB.
- So the asset work is **33 exports**, each needing a rest pose (the way it lies on the ground). That is
  one GUI Blender session (headless `blender -b` never exports — standing note). Estimate 1–4 MB in
  total, loaded lazily by `src/model-service.js`.

**Colliders.**
- None to hand-build. `src/debris.js` `load()` hulls the render mesh, and `thinHull` cuts it to the
  engine's 40-point limit (proven on the spare tire).
- Each world item is one `DEBRIS_TYPES` row: model, `massKg` from `data/items.js`, friction,
  restitution. The rows can be generated from ITEMS in one loop rather than written as 33 rows.

**Runtime.**
- A body is needed only near the truck. FEAT-149's ornament swap is the proven pattern: a plain model
  far off; within 60 m a sleeping, pinned debris body at its pose; past 120 m a model again where the
  body came to rest.
- The same swap avoids the known failure where a far body falls through ground that has streamed out.
- Cost is tens of meshes and a handful of sleeping bodies.

**Today.**
- `inventory.js drop()` deletes the entry outright.
- The save carries `runInventory`.
- Under the cold-generation rule, a player's drops are **player state** and can be saved. World
  spawns must come from the seed, so only their taken-set would be saved.

## Plan (phases; what each one waits on)

**Phase 1 — drop and pick up: the area-based inventory itself.** Waits on rulings: reach, and
persistence.
1. **Assets.** Export the 33 models (one Blender session). `DEBRIS_TYPES` rows are generated from
   ITEMS.
2. **`src/world-items.js`** (pure).
   - `runWorldItems` = `[{ entry, x, y, z, q }]`, where `entry` is the FULL inventory entry, so
     condition, fuel in a jerry can and pack contents survive the round trip.
   - `place(entry, pose)` / `take(i)` / `near(p, R)`.
3. **main.js wiring.**
   - Inventory **drop** puts the item on the ground behind the tailgate as a debris body, instead of
     deleting it.
   - The model↔body swap uses the ornaments pattern.
4. **Pick-up binding, proposed — not bound until ruled.** Zero new buttons. The inventory screen,
   already Tab / the B-hold side menu and already parked-only, gains a **"Nearby on the ground"**
   strip: every world item within **R = 8 m [DEFAULT]** of the truck. Select one and press **take**,
   and it moves into a free slot. This is the owner's "area-based inventory" taken literally, and it
   keeps to the button budget (D-pad free, nothing new on the pad).
5. **Save.** `runWorldItems` rides the save (player state). A sleep keeps it, as items lie where
   they lie.
6. **Gate:**
   - drop → a body on flat ground → the pose is recorded;
   - take within R restores the identical entry;
   - outside R is refused;
   - a save round-trip keeps it;
   - the swap leaves a far item as a model and brings it back as a body near the truck.

**Phase 2 — FEAT-144 reload lost bed cargo through the same strip.** Its loose pieces (haul
bundles, the motorist's tire) list there with **"load into the bed"**. Waits on FEAT-144's six
answers (owed list; answer 4 reverses the 10-22 lost-tire ruling).

**Phase 3 — random world spawns.** Seeded per chunk from the world seed (cold generation), with
the taken-set in the save. Waits on rulings: which items, where (roadside, POI yards), how often.

**Phase 4 — event drops.** Waits on rulings: which events.

**Docs once ruled:** CLAUDE.md ("Most of items.md is 2D art, not models") and items.md each need a
line saying items now have a world presence.

**Owner answers needed to start Phase 1:**
- reach (8 m proposed);
- parked only, as the inventory already is;
- does a drop persist across leaving the area and in the save (proposed: yes, player state);
- the "Nearby on the ground" strip as the pick-up (no new button).

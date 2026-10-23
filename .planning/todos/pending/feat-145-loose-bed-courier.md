---
id: FEAT-145
type: feature
status: idea
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 — "Create a ticket to add loose bed items to courier. I think a lot of courier missions can use this model, and it automatically works with the eventual car players as long as the cargo always fits in the bed." Then: "I think we might change this idea as things develop. It's mostly just I'm inspired by the type of mission, and like the physics objects bouncing around. How about we just reclassify the ticket as spitballing, not on the roadmap, just a potential idea."
relates: feature/stranded-spare (the motorist's tire — the first courier-shaped job carried loose in the bed), FEAT-88 (haul — loose pieces), FEAT-89 (courier), FEAT-143 (item → world model path), FEAT-144 (reload lost bed cargo)
---

# FEAT-145: Courier things that ride loose in the bed

**SPITBALLING — not on the roadmap.** A potential idea the owner expects to change as things develop.
What draws it is the type of mission and physics objects bouncing around in the bed. The answers
below are the owner's current thinking, recorded here only. They are **not** folded into
missions.md or cargo.md, which still say "Courier | in the cab". Do not build from this ticket until
it is promoted to `open`.

## The idea

A courier thing can ride in the bed as **one loose physics body** instead of as text in the cab. The
stranded motorist's spare tire already works this way: `data/offers.js` `loose: '<debris kind>'` on
the thing's row, and `main.js` `_loadLoose` drops it into the bed at accept.

Adding a thing would be data-only once its model exists:
1. A `.glb` built through the FEAT-143 path (`items.py` builder → `export_glb`).
2. A `data/prop-models.js` entry with `hull-from-mesh`, which `thinHull` makes buildable.
3. A `src/debris.js` `DEBRIS_TYPES` entry.
4. `loose:` on the row.

Candidates are courier rows big enough for the bed: groceries, propane tanks, a jerry can, golf
clubs, a camping chair, homemade beer, a chainsaw, an axe, a shovel, a tackle box, a muffler, a drive
shaft, a body panel and a tailgate. Small things stay in the cab.

## Owner's answers so far (2026-10-22, not ratified)

- **Courier = cab or bed, scored on time against par.** Courier stays a pure speed job. The offer
  card states **cab** or **bed**, so the player sees where it rides before accepting. Haul is
  different: it is graded on how many of its many small pieces are still in the bed.
- **Losing a courier item is not a fail.** You go back and pick it up (FEAT-144), and the lost time
  costs you rank. The motorist's tire on feature/stranded-spare fails the job when lost; this idea
  would change that.
- **Vehicles.** Every car added to the game will fit all courier cargo, and for courier, cab and bed
  count as the same space. Think of a wagon with the rear seats folded, or a hatchback. There will be
  no true sports car that can't fit a lawn mower.
- **No conflict with "parts never go in the bed"** (items.md, 2026-10-21). That rule is about the
  player's own inventory parts. A courier muffler is a customer's cargo.

## Cost to remember

Every candidate needs a model at the quality floor (~1000 tris, ART-STYLE.md), one ASSET ticket
each. Only the spare tire exists today.

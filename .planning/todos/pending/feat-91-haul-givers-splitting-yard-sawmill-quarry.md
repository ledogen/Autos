---
id: FEAT-91
type: feature
status: open
severity: major
opened: 2026-09-30
source: owner, 2026-09-30 — "mission giver quarry, it provides haul missions: you drive up to the
  loading zone, rocks spawn and roll off a ramp and drop into the bed … for Region 1, another one
  should be a firewood haul mission — a little bit lighter, a little easier on the truck … These will
  get their own unique POI and will represent the haul mission career path."
  Follow-ups the same day, answering the ticket's questions (see "Rulings" — the current shape).
relates: FEAT-88 (Haul — the bed-cargo mission these givers post; HARD prerequisite), FEAT-89
  (Courier — the other family every yard also posts and receives), FEAT-110 (ratchet straps, parked),
  FEAT-67 (offer board — sources/families/slots), FEAT-46 (POI lay-by pads), FEAT-74 (POI pools),
  FEAT-36 (debris), FEAT-43 (region confinement), ASSET-36 splitting yard · ASSET-11 sawmill ·
  ASSET-35 quarry · ASSET-37 firewood armload · ASSET-38 lumber bundle · ASSET-12 lumber-yard kit
invariants: SM-INV-4 (payout continuous, floor at zero — via the 2026-08-17 non-margin exception),
  SM-INV-10 (a load, never a stat), SM-INV-12 (worldgen meta-free — the roster may key on region
  index, never on run state), SM-INV-8 / SM-INV-14 (no cross-run progress)
design: missions.md §3 (AMENDED 2026-09-29: Courier / Haul) + §3c freight (mass does the work);
  missions.md "POI identity telegraphs the family"; items.md §4 cargo; the parts-shop build matrix
requires: FEAT-88 shipped (world-truck bed well ✅ on main f47d4a9, cargo spawn, aboard/roughness read,
  `haul` family on the board)
---

# FEAT-91: Haul givers — a splitting yard, a sawmill and a quarry, one per region

## The shape (owner, 2026-09-30)

Three **yard POIs**, one per region, each with its own model and a **loading bay**. Each posts
**haul** jobs for its own load (FEAT-88) **and also gives and takes courier jobs** (FEAT-89) — a yard
is a working business, so small items leave from it and arrive at it like anywhere else.

| Region | Yard | Haul load | Loading beat |
|---|---|---|---|
| **1** | **Splitting yard** (ASSET-36) | firewood — the lightest, easiest on the truck | splits come off a processor **conveyor** into the bed |
| **2** | **Sawmill** (ASSET-11) | a banded bundle of **6 ft boards** | the bundle tips off a raised rack into the bed |
| **3** | **Quarry** (ASSET-35) | **rock** — heavy, hard on the truck | rocks **roll off a ramp** and drop into the bed |

The loads step up in weight as you go deeper: the same "mass does the work" lesson (missions.md §3c),
taught gently in region 1 and at a load the truck really struggles under by region 3.

## Rulings (owner, 2026-09-30)

1. **The "career path" is car specialisation, not a progress track.** A light truck on softer
   suspension runs courier jobs faster; heavy-duty parts make it haul better. The haul line gives the
   heavy-duty build something to be *for* (the parts-shop "packages, not a ladder" goal). **No
   reputation for now** — Larry is the one exception that already exists, and this ticket adds no
   second one.
   - *Parked, not ruled:* repeat jobs at the same yard raising load size and pay. The owner "doesn't
     want to cross that bridge yet". It would be run-layer state, so it must clear SM-INV-8 /
     SM-INV-14 before anyone builds it.
2. **One yard per region, in that region only.** The splitting yard is not repeated in regions 2+;
   the player can always drive back to region 1 for it.
3. **Destinations are mostly houses.** Firewood, boards and rock all go to houses: *"rock or fill dirt
   can go to houses too, people need a truckload sometimes."* Plus the ordinary in-region POIs.
   - **Fill dirt** is noted, not built. Loose dirt is a bulk material, not a set of rigid bodies, and
     the cargo system only carries bodies. It would need its own idea (bagged fill, or a very coarse
     "clod" body) — a separate ticket if wanted.
4. **Lumber is 6 ft boards at the sawmill in region 2** (owner's leaning, "not sure about lumber —
   maybe"). 6 ft stock rides with the tailgate shut: the bed is 1.835 m inside and a 6 ft board is
   1.829 m, so model the bundle at ~1.80 m to drop in without wedging. The 8 ft / tailgate-down
   variant is dropped.
5. **Supersedes the earlier combined "lumber yard + firewood yard" ruling from the same day.** Firewood
   now has its own splitting yard; ASSET-12 (lumber-yard kit) goes back to dressing — its stacks and
   racks dress the sawmill premises.

## Why it fits what already exists

- **The cargo physics is done.** The world truck has the open-bed well and rocks ride in it at 60+ mph
  (f47d4a9, `test/cargo-bed.mjs`). The title screen already stages the quarry beat — ten rocks into
  the bed, a hard squat — so the look is proven.
- **POI identity telegraphs the family** (missions.md: *"a sawmill means freight"*). A quarry on the
  map says "heavy haul" before you drive there.
- **The mass continuum is ratified** (missions.md §3, 2026-09-29): firewood, boards and rock are three
  points on it, not three mission types. No new scoring axis — FEAT-88's aboard × roughness × mass is
  the score.

## The loading bay (recommendation — one mechanism, three skins)

**One physical loader for every yard:** a marked bay on the premises, and a release point above it
that lets the load go once the truck is stopped in the bay. The splitting yard's is the end of a
**processor conveyor** (real processors load trucks exactly this way, and it needs no animated
person — there is no humanoid NPC in the game); the sawmill's is a **tilting rack**; the quarry's is a
**steel ramp** off the stockpile.

- **Positioning is the skill.** Pieces are released and physics does the rest. Park badly and some
  miss the bed. **You are paid on what is aboard at arrival** — the misses are mass you are not
  carrying, and they stay on the ground as debris. No extra rule. *(Recommendation — the owner did
  not rule on misses; the alternative is a loader that keeps releasing until the bed holds the full
  load, which removes positioning as a skill.)*
- **Release is deterministic** — spawn points and spin from `(seed, offerId, piece)` via `hash32`,
  never `Math.random()` (FEAT-88 §2) — so the same offer loads the same way.
- **Trigger:** truck speed ≈ 0 inside the bay with the job accepted. Pieces release on a stagger (the
  title screen uses 0.2 s) so impacts don't stack.

## Load sizes — stepping up through the regions

A 2002 Ranger regular cab is rated around **570 kg payload** (~1,260 lb). Starting loads, to be tuned
on a drive, not from one run:

| Region | Load | Pieces | Total | Share of payload |
|---|---|---|---|---|
| 1 | Firewood | ~8 armloads, ~20 kg each (4–6 splits fused into one piece) | ~150 kg | ~25 % — light, loose, easy |
| 2 | 6 ft boards | 1 banded bundle, ~70 boards | ~250 kg | ~45 % — one long rigid piece that slides |
| 3 | Rock | 8–10 rocks, ~50 kg each | 400–500 kg | 70–90 % — the truck squats and works on the grade |

**Piece count is the physics budget.** `DEBRIS_CAP` is 12 today and FEAT-88 already requires mission
cargo to be exempt from cap reclaim. Firewood at real split size (~3–4 kg) would be dozens of bodies,
so it rides as armloads. Measure the frame cost of the largest load before settling the counts.

## Region gating — this is a new mechanism

`POI_ROSTER` in `src/poi.js` is **one list, the same in every region** (14 POIs). Nothing today makes
a POI type region-specific. This ticket adds it:

- A roster entry gains a region window: `{ type: 'splittingYard', count: 1, regions: [1] }`,
  `{ type: 'sawmill', count: 1, regions: [2] }`, `{ type: 'quarry', count: 1, regions: [3] }`. The
  region index is worldgen, not run state, so this is meta-free (SM-INV-12). `POI_COUNT` becomes
  per-region.
- **Siting:** a yard needs a pad big enough for its model plus a truck-sized bay — larger than a
  mission-giver marker's lay-by. Check the FEAT-46 pad solver can seat a quarry-sized footprint before
  promising one per region.

## What has to be built

1. **Region-windowed roster entries** in `src/poi.js`.
2. **Three sources** in `data/offers.js` — `splittingYard`, `sawmill`, `quarry` — each posting
   `haul` (its own load) **and** `courier`, and accepted as courier destinations. Three `THINGS`
   entries (`firewood`, `boards`, `rock`) with `massKg` from the table, pooled to their yard, plus
   courier items that fit a working yard.
3. **Houses as haul destinations** for all three loads (ruling 3).
4. **The loader** — bay trigger + staggered deterministic release — built once, parameterised by piece
   type, release pose and count. The debris lifecycle (despawn on settle / cancel / run end, cap
   exemption) is FEAT-88's and is reused, not rebuilt.
5. **Cargo** — `DEBRIS_TYPES` entries for the firewood armload (ASSET-37), the board bundle (ASSET-38)
   and the rock (the existing `test-rock.glb` works as-is).
6. **POI models** — ASSET-36 splitting yard, ASSET-11 sawmill (amended), ASSET-35 quarry, each with its
   loader in the model and named empties for the bay and the release point.

## Open questions — the owner's

- **Misses at the bay** — recommendation above (paid on what you carry; misses stay on the ground).
- **One job at a time?** FEAT-67 allows one active mission. A courier job and a haul job at once, or
  two hauls, is FEAT-110's multi-load question — out of scope here.
- **Fill dirt** (ruling 3) — wanted as a load at all? If yes, it needs its own ticket (bulk material).

## Not in scope

- The log drag (main mission, missions.md). The sawmill is also its terminus; nothing here changes it.
- Unloading at the destination — the load despawns on settle, per FEAT-88.
- Reputation or repeat-job escalation (ruling 1: parked).
- Any HUD readout of load mass or condition (SM-INV-10). The squat and the engine note are the readout.
- Ratchet straps (FEAT-110, parked).

## Acceptance

- [ ] A splitting yard appears in region 1 only, a sawmill in region 2 only, a quarry in region 3
      only; same seed → same sites.
- [ ] Each yard posts haul offers for its own load and courier offers, and receives courier
      deliveries; the load is named on the haul card.
- [ ] Haul destinations include houses for all three loads.
- [ ] Stopping in the bay with the job accepted releases the load deterministically: same seed and
      offer → identical piece poses after settle (headless gate, `debris-stack.mjs` shape).
- [ ] A truck parked squarely catches ≥ 90 % of the load by mass; one parked a metre off catches
      measurably less (headless gate).
- [ ] The full quarry load rides at road speed without escaping on a flat straight (extend
      `test/cargo-bed.mjs`), and visibly squats the rear.
- [ ] Settling pays on mass aboard × roughness, continuous, floored at zero (FEAT-88's curve).
- [ ] Frame cost of the largest load measured and within the 60 fps budget (PERF-08 harness).

## Progress — region-1 slice (2026-10-04, `feature/haul-firewood`)

The **firewood yard** (roster type `firewoodYard`, ASSET-36 re-scoped to a firewood *vendor*) is in.
It posts haul only, for now. The loading beat is FEAT-88's (see that ticket's "As built").

**Deferred, noted on the owner's instruction:**

- **Region window.** Story mode has one region, so the yard is just a roster slot. The `regions: [n]`
  field from "Region gating" lands with region 2.
- **A bigger yard pad.** The owner ruled the firewood yard fits the standard 14 × 8 m lay-by pad.
  **The sawmill and quarry will need a larger pad**, lumber-yard / quarry sized, and the FEAT-46 pad
  solver has to be checked for that footprint before promising one per region.
- **The loader is "over the truck's own bed", not a release point on the model.** The owner asked
  for the title-screen rock drop. A sawmill rack or quarry ramp that drops from a fixed point is a
  later choice.
- **Courier at the yard** waits for FEAT-89.

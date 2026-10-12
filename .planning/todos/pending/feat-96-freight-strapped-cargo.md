---
id: FEAT-96
type: feature
status: open
severity: major
opened: 2026-10-06
source: owner, 2026-10-06 — "freight is non-shock-sensitive cargo that is strapped to the bed. also
  physics locked, but durable. you are tipped on delivery speed and given a flat reward for delivery
  … they start from normal POIs." Follow-ups the same day: mass scales both the pay and the par;
  "abandon job is replaced with cleanup cargo which costs the player an hour".
relates: FEAT-97 (Fragile — builds on this ticket's strapped-cargo layer), FEAT-88 (Haul — the loose
  bed cargo; its debris lifecycle is reused here), FEAT-89 (Courier), FEAT-110 (ratchet straps — parked;
  its weld-joint design is the mechanism here), FEAT-67 (offer board), FEAT-53 (payout), ASSET-27
  pallet · ASSET-28 crate · ASSET-29 barrel · ASSET-30 drums (the first freight models) ·
  ASSET-46..48 (soft-drink pallet, potting-soil pallet, drum stack — the named freight loads)
invariants: SM-INV-4 (continuous pay — freight is a margin job), SM-INV-10 (a load, never a stat),
  SM-INV-12 (determinism)
design: missions.md §3 (amendment 2026-10-06) and §3c; items.md §4 cargo; DESIGN.md "non-margin
  mission types price themselves" (amendment 2026-10-06)
---

# FEAT-96: Freight — durable cargo strapped to the bed

> **Keys renamed 2026-10-07 (FEAT-98):** `burgerJoint` → `foodVendor`, `serviceShop` → `autoShop`.
> `missionGiver` is retired: its five slots became the additional classes (pois.md § Places and
> Missions) and its model pool is now `residence`. A farm also carries the `residence` tag.

## Ruling (owner, 2026-10-06): fragile and freight come back as their own types

This reverses part of the 2026-09-29 two-class ruling. That ruling folded fragile and freight into
Haul. Delivery is now **four types**, told apart by where the load rides and whether it is loose:

| Type | Rides | Moves? | Scored on | Ticket |
|---|---|---|---|---|
| **Courier** | in the cab | — | time vs par | FEAT-89 |
| **Haul** | in the bed, loose | yes, it can bounce out | time vs par × share still aboard | FEAT-88 |
| **Freight** | in the bed, **strapped** | no | time vs par | **this ticket** |
| **Fragile** | in the bed, **strapped** | no | time vs par × cargo health | FEAT-97 |

Freight and fragile both **start from normal POIs** (the general store, service shop and mission
givers), not from the haul yards.

## Request

A delivery whose load is a **heavy, durable object strapped to the bed**. The load cannot move
relative to the truck, and nothing can damage it. What makes it a different job from courier is
**its mass**: a 400 kg pallet loads the rear springs, raises the centre of gravity, lengthens the
braking distance and overheats the engine on a long climb. This is missions.md §3c's "mass does the
work": the load is the reason you drive carefully, and nothing is injected to make it so.

**Pay is the ordinary margin line: Base pay + a tip for the clock.** Heavier freight pays more and
gets a longer par, so the tip stays reachable with the truck loaded.

## This ticket also builds the strapped-cargo layer

Freight is the simpler of the two strapped types (it has no health), so it goes first. It builds
everything FEAT-97 fragile reuses.

1. **Weld joint through the adapter.** Add `createWeldJoint(handleA, handleB, worldAnchor)` to
   `src/physics-engine.js` beside `createDistanceJoint`. It is rigid: the linear and angular hertz
   are 0. It also gets `jointForce(joint, out)`, which reads `b3Joint_GetConstraintForce` (FEAT-97
   needs it). Both are in the vendored bindings (`vendor/box3d/dist/box3d.d.ts`). This is FEAT-110's
   option A: the cargo stays its own body, so its mass and inertia couple to the chassis exactly as
   a loose body does, and nothing in `physics.js` that caches chassis mass changes. Joined bodies do
   not collide with each other in Box3D by default, so the cargo cannot fight the bed floor.
2. **Spawn at accept, already strapped.** There is no drop zone and no loading beat: a normal POI
   hands the load over. On accept the cargo body is placed on the bed floor at a fixed bed-local
   pose (centred, against the front bedside), and the weld is made at once. The pose comes from the
   cargo's size and the `RANGER_BED` spec in `data/vehicle-models.js`, never from `Math.random()`.
   The body is pinned debris (outside `DEBRIS_CAP`) and `noDamage`, as FEAT-88's bundles are.
3. **Clean up cargo replaces abandon job.** While a strapped job is live, the HUD's "abandon job"
   button reads **"clean up cargo"**. It keeps the same two-click confirm. Pressing it destroys the
   weld, removes the body, **costs one hour on the day clock** (a time skip through `src/day.js`,
   the same path camping uses), and then cancels the job as abandon does. FEAT-97 uses the same
   action when a fragile load reaches zero health.
4. **Lifecycle.** The weld is destroyed before the body on settle, clean-up and run end. Afterwards
   the body count and joint count return to their baseline.

## Freight itself

- **Things.** A `freight` thing list in `data/offers.js`, each entry with a real mass. For the
  first slice, use models that exist or are already ticketed: drums (ASSET-30, shipped), the
  plastic barrel (ASSET-29, shipped), the pallet (ASSET-27) and the crate (ASSET-28). Suggested
  range is **80–450 kg**. *(Superseded 2026-10-11: every modelled load is one as-built mass —
  cargo.md § Freight.)* The 2002 Ranger's payload is roughly 500–570 kg, so the top of the range
  should make the truck feel loaded without overloading it. **Deliberate exceptions:** a bed of topsoil
  (ASSET-51, 500–700 kg, tuned by feel once modelled; owner, 2026-10-06), and as built the concrete
  pallet (670 kg) and cinder blocks (785 kg), which roll anyway (owner, 2026-10-10). Suspension and
  tyre upgrades are what carry them, as in items.md §1a's load budget.
- **The full freight list, with its region tiers, is `.planning/story-mode/cargo.md`.** Region gates
  which tier of cargo rolls (owner, 2026-10-06).
- **Par grows with mass.** Use `par × FREIGHT_PAR_SLACK(m)`, linear in mass. Start from haul's
  precedent: `HAUL_PAR_SLACK` is 1.1 for a load of about 140 kg, which is about **+0.07 per 100 kg**.
  At that rate a 400 kg load gets 1.28. Then check the number against a headless drive of one
  reference route, empty and loaded. **Do not divide the slack back out of the pay** as haul does.
  Pay rides par, so a heavier load pays more by the same factor. That one knob delivers the owner's
  "mass scales both". Add a separate mass-pay term only if the pull is too weak.
- **Offer board.** Add `freight` to `BUILT_FAMILIES`. **Givers (owner, 2026-10-06):** `autoShop`,
  `generalStore` and `residence` all list `freight`. **Produce is a freight flow: farms ship it,
  and the general store and mission givers receive it.** The card says "Base pay" only, as on every
  job.
- **Points and letter.** It is a margin job, so `pointsFor(letter)` applies unchanged.
- **No durability axis.** A rollover can't hurt the load. The truck takes the damage, through mass
  that is already real.

## Not in scope

- The mass menu at the giver (items.md §1a: pick a heavier item for more pay, gated by suspension
  and tyre upgrades). It still needs its own ratification and is the natural follow-up.
- Specific freight models beyond the four above.
- Straps as an item (FEAT-110, parked). Here the strap is part of the job, not something you own.

## Rulings (owner, 2026-10-06)

- **Givers:** `autoShop`, `generalStore` and `residence` post freight. Produce runs from the
  `farm` POI to a general store or a mission giver (see "The farm" below).
- **Clean-up locks the giver's slot** for the offer's full expiry, as abandon does. It is still a
  cancel, and the hour is its extra cost.

## The farm — its own POI type (owner, 2026-10-06)

The farm is a **distinct POI type**, not a mission giver with a farm-like name. It is the source of
produce freight. Its destinations are the general store and mission givers.

- **Roster:** a `farm` row in `POI_ROSTER` (`src/poi.js`), count 1, sited `any`, on the standard
  14 × 8 m lay-by pad. Put it above the mission givers, as the firewood yard is, so a short pad pool
  takes its shortfall from them.
- **Placeholder model: the produce stall** (`produce-stall.glb`, ASSET-15, the trailer-mounted farm
  stand). It has no `data/prop-models.js` entry yet. Register it with its collision box restated
  for the as-built size (4.35 × 2.25 × 2.4 m, deck only, per ASSET-15's resolution and FEAT-74).
- **Offers:** a `farm` row in `SOURCES` (`data/offers.js`) posting `freight` and courier (today's
  `delivery` key), since nearly every POI posts courier (owner, 2026-10-06). Produce things
  (crated vegetables, sacks of feed, a pallet of hay bales; real masses) are rolled only at the farm,
  and their destination is restricted to a `generalStore` or a `residence`.
- **The real farm** replaces the placeholder once ASSET-65 farmhouse, ASSET-66 barn and ASSET-67
  tractor ship. They are composited into one farm-yard model, with the produce stall at the road
  edge, as the splitting yard composites the awning. A farmhouse and a barn will not fit the
  standard 14 × 8 m pad, so the real farm needs a bigger pad, the same deferral the sawmill and
  quarry have (FEAT-91).

## Rulings (owner, 2026-10-10)

- **`cargo.md` decides who posts.** A place posts freight when a Freight row names it as the
  source; "any" is `ANY_GIVER` (minus a class that is the thing's only destination). This
  supersedes the giver list above.
- **A blank "from" posts nowhere** until the owner rules a shipper (drum, barrel, crate, pallet,
  railway ties — "I don't want them to appear in the game until I figure out what we're doing with
  them").
- **Everything is R1** for now — there is one region.
- **The overloads roll** (concrete 670 kg, cinder blocks 785 kg, both fixed as built).
- **A job-type badge on every card:** a placeholder letter in a box (C courier · Fe fetch ·
  Fr freight · Fg fragile · H haul) until the map / card iconography pass.

## Rulings (owner, 2026-10-12)

- **Shippers named:** the drum, the barrel, both crates and the railway ties go to and from the
  general store, the gas station and the farms. The bare pallet is no longer a load.
- **The four drums stay full (804 kg) and are a later-region load** — weight ramps with the region.
  They have no THINGS row for now; the debug menu still straps them.
- **More freight on the board.** Each source now picks a FAMILY first, then a thing in it (own
  `family` stream, so the other spec draws keep their order). Over 400 seeds × 12 board times:
  freight ~13 % → ~31 % of offers, 2.3 → 5.4 a board, boards with none 7 % → 0 %; courier ~52 %.
- **First full run, driven by the owner:** an empty propane pack, hauled fast, S rank, "pay was
  mediocre compared to courier. perfect."

## Progress (2026-10-10)

Built: `createWeldJoint` and a joint count in `counters()`; `strapPose` (pure, `src/debris.js`);
the strap loader in `main.js` (also the debug menu's "Load Cargo"); 12 freight things in
`data/offers.js` with a `load` key into `data/freight.js`; `FREIGHT_PAR_SLACK_PER_KG` 0.0007 on par,
pay riding it; the load strapped at accept and removed when the job ends; "clean up cargo";
`test/freight-strap.mjs`. Booted in the browser with no errors and the debug loader spawning a load;
a full accept → deliver run in story mode has NOT been driven yet.

## Acceptance

- [~] `physics-engine.js` gains `createWeldJoint` — done. `jointForce` moves to FEAT-97, its first
      user (no dead code). No engine type leaks past the seam.
- [x] Accepting a freight offer puts the load in the bed, already welded. `freight-strap.mjs`: 400 kg
      drifts 2.5 mm over a rough road at 15 m/s (< 5).
- [x] Mass is real: welded 400 kg squats the rear struts within 0.2 mm of the same body loose.
- [~] Par and pay scale with mass through `FREIGHT_PAR_SLACK_PER_KG` — done. The empty-versus-loaded
      drive time is NOT recorded yet; the constant is still haul's extrapolation.
- [x] "Clean up cargo" replaces "abandon job" on a strapped job: +1 h on the day clock, then the
      ordinary cancel (slot lock included).
- [x] Givers — superseded by the 2026-10-10 ruling (`cargo.md` decides). The farm POI exists (FEAT-105).
- [x] After settle, clean-up or run end the load is removed with its weld; the gate pins the body and
      joint counts back to baseline.
- [x] Same seed and same offer give the same spawn pose: the offer spec is seeded and `strapPose` is pure.
- [x] No number describing the cargo on the HUD (SM-INV-10). The card's terms show the weight, as on
      every job.

## Related code

- `src/physics-engine.js` — `createDistanceJoint` / `destroyJoint` are the pattern to copy.
- `src/debris.js` — pinned, `noDamage` bodies (FEAT-88).
- `data/vehicle-models.js` — `RANGER_BED`.
- `data/offers.js`, `src/offer-board.js` — the `freight` family, `BUILT_FAMILIES`, `HAUL_PAR_SLACK`.
- `src/main.js` — the job-cancel button (`_syncJobCancel`, the `#job-cancel` click handler).
- `src/day.js` — time skips (`_advanceHours`).
- `src/mission.js` — settle and cancel.

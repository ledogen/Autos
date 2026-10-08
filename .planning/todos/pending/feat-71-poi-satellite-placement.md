---
id: FEAT-71
type: feature
status: open
severity: minor
opened: 2026-08-23
updated: 2026-09-30
relates: FEAT-46, FEAT-59, ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07, ASSET-08, ASSET-27, ASSET-28, ASSET-29, ASSET-30, FEAT-36
---

## ⚑ OWNER RULING 2026-09-22 — no rigid bodies in this ticket

> **Rigid bodies don't belong in the lawn furniture ticket at all.**

Satellites are **static dressing**, full stop. The Scope line below saying so stands and is no
longer in question. This ticket places meshes, not bodies: no use of the `physics-engine.js`
adapter, no dynamic props, no settling, no `causesDamage`. `drumClosed`'s separate life as a thrown
physics prop (`src/debris.js`) stays separate — the two paths are not to be conflated, which is
what the Scope line always said.

**Supersedes the earlier ruling recorded here the same day** ("Close FEAT-36 once lawn furniture is
built and settles in world"). That reading turned satellites into dynamic bodies so they could
discharge FEAT-36's gaps; the owner has since ruled the opposite way. **FEAT-71 therefore does not
close FEAT-36** — placing meshes discharges neither the deterministic world-fixture *body* spawn
(gap 2) nor object↔object settling (gap 3). Do not close FEAT-36 from this ticket.

# FEAT-71: POI-satellite placement — lawn furniture and yard clutter

> **Keys renamed 2026-10-07 (FEAT-98):** `burgerJoint` → `foodVendor`, `serviceShop` → `autoShop`.
> `missionGiver` is retired: its five slots became the additional classes (pois.md § Places and
> Missions) and its model pool is now `residence`. A farm also carries the `residence` tag.

The consumer for every "small thing that stands near a POI". It does not exist, and its absence is
what blocked every lawn-furniture and clutter asset from being placeable the day it shipped.

> **Merged 2026-08-25.** This opened as lawn-furniture scatter only, and FEAT-73 was minted
> separately for yard clutter. They are the same thing — one zone solver, different pools — and the
> owner merged them rather than let two zone solvers get built. FEAT-73 is withdrawn.

## The gap

`src/poi.js` resolves exactly one pool, `residence` — the homes a residence draws from — via
`modelPool` on a roster slot. A flamingo is not a home and neither is a drum,
so there is no path from a built `.glb` to a thing standing in a yard.

| Asset | Model | Registry | Placed |
|---|---|---|---|
| ASSET-01 flamingo ×2 | `flamingo-a/b.glb` | `flamingoUp` / `flamingoDown` | no |
| ASSET-02 gnome | `gnome.glb` | `gnome` | no |
| ASSET-03 beach ball | `beach-ball.glb` | `beachBall` | no |
| ASSET-04 bbq grill | `bbq-grill.glb` | `bbqGrill` (`lawnFurniture`) | no |
| ASSET-29 plastic barrel | `barrel-plastic.glb` | **missing** | no |
| ASSET-30 drum, open + crushed | `drum-open.glb`, `drum-crushed.glb` | **missing** | no |
| ASSET-30 drum, closed head | `drum-closed.glb` | `drumClosed` | as a **thrown physics prop** (`src/debris.js`) — not as clutter |
| ASSET-05/06/07/08, ASSET-27/28 | not modelled | — | — |

Three shipped `.glb` files have no registry entry at all, so nothing can name them.

Consequence, and the reason this ticket exists once instead of eight times: every one of those
asset tickets shipped its model and then recorded "still not consumable in-world" in its
resolution. That note should exist here, and be discharged here.

## What it must do

**Place satellites around an already-placed POI, inside a defined zone, with nothing clashing.**
That is the whole design and both halves matter.

**Anchored, never free-standing.** An awning and a fire pit beside a log cabin read as *that
cabin's*. The same objects on empty dirt read as litter, not habitation. So the anchor is a POI
record, and the budget, radius and count come from that POI — this is not a world-wide density.

**A defined zone, and nothing in it clashes.** The zone is derived from the POI's pad and the
placed model's own collision extent, so satellites sit *around* the building rather than inside it.
Every candidate is tested against the POI model's authored `collision` box, the pad, the road, and
against satellites already placed. The authored collision records exist precisely so this test is
cheap and never needs the mesh.

**Deterministic in the seed**, the way `src/poi.js` derives `modelKey` — `hash32(...)`, never
`Math.random()`. That includes the **palette variant index**: `spawnModel(key, { variant: n })`
takes any integer modulo the pool length, and DESIGN's determinism rules make the caller own it.

**Yaw is per-asset, from the registry, not from a hard-coded list of keys.** Random yaw is right
for a barrel or a gnome; a grill or an awning facing the building is better; a pallet has a grain.

## Pools

At least two, because provenance is the whole point of anchoring:

| Pool | Reads as | Members |
|---|---|---|
| `lawnFurniture` | habitation | flamingo, gnome, beach ball, bbq grill, propane tank, awning, fire pit, potted plant |
| yard clutter (name TBD) | industry | steel drums, plastic barrels, pallets, crates |

One flat pool would put a flamingo in a lumber yard and a stack of drums outside a trailer home.
Which pool a POI draws from comes from that POI's role.

## Open questions for the owner

- **Density.** How many satellites per POI, and does it scale with the POI's role — a log cabin
  dressing heavier than a lone mailbox, a sawmill strewn where a trailer home is tidy?
- **Does `lawnFurniture` split further?** The camp-dressing cluster (grill, propane tank, awning,
  fire pit) is already named as a cluster in ASSET-04/05/06/08, which argues for `campDressing` vs
  `yardOrnament` (flamingo, gnome, beach ball).
- **Cluster or spread?** Real yards stack drums against a wall in twos and threes rather than
  spacing them evenly, and a clash-free solver will happily produce the even version unless told
  otherwise.
- **Draw-call budget.** These are one-material-per-colour models placed a handful of times each,
  not scatter density — but a POI dressed with six satellites is six model loads and six draws.
  Where is the cap?

## Scope

- Registry entries for `barrel-plastic`, `drum-open`, `drum-crushed`, each with its authored
  collision metadata restated from its ticket. The drums are `hull-from-mesh`; note the field in
  `data/prop-models.js` is **`size`**, not the `dims` the ASSET tickets write — a `dims` here reads
  as no box at all and the marker silently falls back to the 1.6 m cube.
- The pool tags, the zone solver, and the roster wiring that consumes them.
- Satellites are **static dressing**. Whether any of it is knockable is a later question and not
  this ticket's — `drumClosed` already has a separate life as a physics prop and the two paths
  should not be conflated. **Re-affirmed by owner ruling 2026-09-22** (top of ticket).

## Acceptance

- A POI placed in-world is dressed with satellites drawn from its role's pool, deterministic in the
  seed, reproducible across a re-stream of the same region.
- Nothing spawns on bare ground with no anchor.
- **No overlap** — not with the POI model, not with the pad, not with the road, not with another
  satellite. Asserted in a headless gate against the authored collision boxes, not judged by eye.
- A gate asserts the determinism (same seed + centre ⇒ identical satellite set), in the shape of
  the existing `story-poi` / `world-determinism` gates.

## Notes

- `assets/models/gas-pump.glb` carries an unconsumed `gasStation` tag for the same class of
  reason, but that one wants a *POI*, not a satellite scatter — do not fold it into this ticket.
  It belongs to FEAT-50 refuelling; the POI side is FEAT-74.
- Camp gear (ASSET-23..26) is a different placement path: it renders at the player's own campsite
  under items.md's visible-kit rule, on a 6 m pad. Not this — FEAT-66.
- **The rural mailbox (ASSET-22) is in this pool too** [owner, 2026-09-30]. Placed as lawn
  furniture it is scenery only. It must **not** carry `newsCustomer`, so it never becomes its own
  paper drop point. A mailbox that *is* a drop point is the tagged kind (missions.md §2).

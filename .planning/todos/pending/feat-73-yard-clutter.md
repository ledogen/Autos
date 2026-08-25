---
id: FEAT-73
type: feature
status: open
severity: minor
opened: 2026-08-24
updated: 2026-08-24
relates: ASSET-27, ASSET-28, ASSET-29, ASSET-30, FEAT-46, FEAT-59, FEAT-71
---

# FEAT-73: Yard clutter — barrels and drums around a POI, in a defined zone

Drums, barrels, pallets and crates standing around industrial and rural POIs. **Scope is yard
clutter and nothing else.**

## The gap

| Asset | Model | Registry | Placed |
|---|---|---|---|
| ASSET-30 steel drum, closed head | `drum-closed.glb` | `drumClosed` | as a **thrown physics prop** — `src/debris.js` hulls it. Not as clutter |
| ASSET-30 steel drum, open + crushed | `drum-open.glb`, `drum-crushed.glb` | **missing** | no |
| ASSET-29 plastic barrel | `barrel-plastic.glb` | **missing** | no |
| ASSET-27 pallet | not modelled | — | — |
| ASSET-28 crate | not modelled | — | — |

Three shipped `.glb` files have no `data/prop-models.js` entry at all, so there is no path from the
file on disk to anything in the world. The one drum that does appear got there through the debris
system, which knows nothing about POIs.

## What this ticket is

**Clutter is spawned alongside a POI model, inside a defined zone, and nothing in that zone may
clash.** That is the whole requirement and the reason it is not a world scatter:

- **The zone is defined per POI**, from the POI's pad and the placed model's own collision extent.
  Clutter goes *around* the building, never inside it and never on the road.
- **Nothing clashes.** Every candidate is tested against the POI model's authored collision box,
  against the pad, and against clutter already placed. An authored `collision` record exists on
  every registry entry precisely so this test is cheap and does not need the mesh.
- **Deterministic in the seed**, the way `src/poi.js` derives `modelKey` — `hash32(...)`, never
  `Math.random()`. That includes the palette variant index. Re-streaming a region must reproduce
  the same yard.
- **Its own pool, not `lawnFurniture`.** Drums beside a mill are industry; a gnome beside a cabin
  is habitation. One pool would put a flamingo in a lumber yard.

## Relationship to FEAT-71

FEAT-71 (POI-satellite scatter for lawn furniture) anchors satellites on a POI by the same logic.
These are plausibly one mechanism with two pools, and the zone-and-clash machinery is the expensive
half — **decide once whether FEAT-73 consumes FEAT-71's placement or stands alone**, before either
is built. Building two zone solvers would be the mistake.

## Scope

- Registry entries for `barrel-plastic`, `drum-open`, `drum-crushed`, each with its authored
  collision metadata restated from its ticket. The drums are `hull-from-mesh`; note the field in
  `data/prop-models.js` is **`size`**, not the `dims` the ASSET tickets write — a `dims` here reads
  as no box at all and the marker silently falls back to the 1.6 m cube.
- A pool tag for industrial clutter, and the roster/zone wiring that consumes it.
- Yaw is free for a barrel and meaningful for a pallet; take it from a field on the registry entry,
  not a hard-coded list of keys.
- Clutter is **static dressing**. Whether any of it is knockable is a later question, and it is not
  this ticket's — `drumClosed` already has a separate life as a physics prop and the two paths
  should not be conflated.

## Open questions for the owner

- **Which POIs get a yard, and how heavy?** A sawmill or lumber yard should be strewn; a lone
  mailbox should have nothing. Does the count come from the POI's role?
- **Does clutter cluster or spread?** Real yards stack drums against a wall in twos and threes
  rather than spacing them evenly, and a clash-free solver will happily produce the even version
  unless told otherwise.
- **Draw-call budget.** These are one-material-per-colour models; a yard of eight is eight model
  loads and eight draws. Where is the cap per POI?

## Acceptance

- Every shipped clutter `.glb` has a registry entry with correct collision metadata.
- An industrial POI is dressed with clutter drawn from its own pool, inside a defined zone,
  deterministic in the seed and reproducible across a re-stream.
- **No overlap** — not with the POI model, not with the pad, not with the road, not with each
  other. Asserted in a headless gate against the authored collision boxes, not judged by eye.

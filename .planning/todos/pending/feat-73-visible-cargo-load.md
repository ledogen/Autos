---
id: FEAT-73
type: feature
status: open
severity: minor
opened: 2026-08-24
relates: ASSET-27, ASSET-28, ASSET-29, ASSET-30, FEAT-59, FEAT-36, FEAT-65, SM-3
---

# FEAT-73: Visible cargo — bed load and yard clutter

The consumer for the **cargo** asset class. Two of its four assets are built and only one of them
is reachable at all.

## The gap

| Asset | Model | Registry | Placed |
|---|---|---|---|
| ASSET-30 steel drum, closed head | `drum-closed.glb` | `drumClosed` | **yes** — `src/debris.js` hulls it; it is THE thrown physics prop |
| ASSET-30 steel drum, open + crushed | `drum-open.glb`, `drum-crushed.glb` | **missing** | no |
| ASSET-29 plastic barrel | `barrel-plastic.glb` | **missing** | no |
| ASSET-27 pallet | not modelled | — | — |
| ASSET-28 crate | not modelled | — | — |

So three shipped `.glb` files have no registry entry and no way into the world, and the one that
does got there through the debris system rather than through anything that understands cargo.

## What cargo is, per `items.md` §4

**Visible load, real mass, never a scoring axis.** It rides in the bed as mass that shifts the CoG
and changes how the truck drives, and the same models double as yard clutter around industrial and
rural POIs. Adding a cargo type should be *"mostly a mass value and a fragility flag"* — the
model is the cheap half.

That gives this ticket two consumers, and they share the models but not the placement:

1. **Bed load.** An item in the player's cargo manifest renders in the Ranger's bed at a bed-local
   slot, and its mass is real — it moves the CoG, it changes weight transfer, and on a rough enough
   road it should be able to shift or leave. This is the visible-kit rule applied to the truck the
   same way FEAT-66 applies it to the campsite: **what you carry is what renders.**
2. **Yard clutter.** The same barrels, drums and pallets stacked around a sawmill, a lumber yard or
   a fuel stop. That is a POI-satellite placement and it should go through **FEAT-71's** scatter
   rather than growing a second one — but the pool is different: drums beside a mill are industry,
   a gnome beside a cabin is habitation, and mixing the pools would put a flamingo in a lumber yard.

## Scope

- Registry entries for `barrel-plastic`, `drum-open`, `drum-crushed`, each with its authored
  collision metadata restated from its ticket (the drums are `hull-from-mesh`; the field in
  `data/prop-models.js` is `size`, **not** the `dims` the ASSET tickets write — a `dims` reads as
  no box at all).
- A pool tag for industrial clutter, distinct from `lawnFurniture`.
- Bed slots on the Ranger: base-seated, forward −Z, same convention as camp gear. Same slot ⇒ same
  origin ⇒ swapping the model is the whole change.
- Mass is plumbed into the vehicle, not faked. A loaded bed must be felt before it is seen.
- Empty manifest renders nothing — no placeholder load.

## Open questions for the owner

- **Does bed cargo become debris on a hard enough impact?** FEAT-36 already has a physics-prop path
  and SM-3 has a damage model; a drum coming out of the bed on a rollover is either excellent or a
  frustration multiplier, and that is a design call, not an implementation one.
- **How many bed slots**, and does a partial load render partially or not at all?
- **Is fragility visible?** `items.md` gives cargo a fragility flag; whether the player can *see*
  which crate is the fragile one changes how the mission reads.

## Acceptance

- Every shipped cargo `.glb` has a registry entry with correct collision metadata.
- A cargo item in the manifest renders in the bed and its mass is measurable in the physics — a
  loaded truck demonstrably transfers weight differently from an empty one, shown in the headless
  harness rather than by feel.
- Industrial clutter dresses an industrial POI through FEAT-71's scatter, from its own pool.

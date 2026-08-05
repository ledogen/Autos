---
id: ASSET-23
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-45, SM-1, ASSET-24
---

# ASSET-23: Tent

**Camp gear** — the player's own kit, rendered at their campsite. `.planning/story-mode/items.md`'s
**visible-kit rule**: what you carry is what renders, so *the campsite is the inventory screen*. All
camp gear shares one anchor convention (below), so upgrading is a model swap and never a placement
change — and every piece must fit the **6 m camp pad** (`campPadHalfM 3`, `src/camp.js`).

> **THE CAMP ANCHOR CONVENTION** (applies to ASSET-23..26). Origin is base-seated and centred on the
> gear's own footprint, forward −Z, and the piece is authored to sit at a **named slot** on the pad —
> `shelter` (bedroll / sleeping bag / tent), `fire` (campfire), `over-fire` (cooking kit), `shade`
> (tarp). Same slot ⇒ same origin ⇒ swapping the model is the whole upgrade.

## Request

A small two-person ridge or dome tent, guy-lined, fly slightly slack, door partly unzipped. In
`items.md`'s camp-gear ladder the tent **replaces the sleeping bag** in the rendered camp — it is the
moment *"the campsite visibly becomes a camp rather than a man on the dirt."*

## Spec

| Field | Value |
|---|---|
| Slot | `shelter` |
| Tri budget | **≤700** |
| Texture | one albedo, **1024×512** — fabric weave, seams, zips, pole sleeves, ground-in dirt along the base |
| Real size | 2.2 m × 1.4 m footprint × 1.1 m tall |
| Origin | base-seated and centred: groundsheet at y=0 |
| Forward | −Z (door faces −Z) |
| Collision | `{ shape: 'box', dims: [1.4, 1.1, 2.2] }` |
| Materials | fly is **double-sided** — the open door shows the inside |

Guy lines only if they cost <40 tris. Sag the fabric in the mesh; there is no cloth simulation.

## Acceptance

- `assets/models/tent.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/tent.blend` + `tent.py`.
- Seats correctly at the `shelter` slot and fits well inside the 6 m camp pad, leaving room for the
  `fire` slot and the truck.
- Fly renders correctly from inside the door.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **This is FEAT-45's deferred debt.** `todos/completed/feat-dispersed-camping-areas.md` closed by
  deferring *"tent model + animated campfire w/ dynamic shadows"* — this ticket and ASSET-24 are that
  work, arriving as assets rather than as a re-opened feature.
- **Smaller than it wants to be.** A real tent on a 6 m pad shares the space with a fire, a cooking
  A-frame, and a parked Ranger. Author to the footprint, not to realism.
- Bedroll, sleeping bag and blanket are the same slot's cheaper rungs and are **not** in this ticket.
  They are much smaller models; ticket them once the slot convention is proven by this one.
- No gameplay here. What a night is worth is `src/day.js` and SM-1; `items.md` flags that the
  sleeping-bag/tent multiplier must never surface as a number (SM-INV-10). An asset cannot violate
  that, but do not let a "tier" reading creep into how these are named in the registry.

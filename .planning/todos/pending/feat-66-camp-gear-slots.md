---
id: FEAT-66
type: feature
status: open
severity: minor
opened: 2026-08-17
updated: 2026-08-17
relates: ASSET-23, ASSET-24, ASSET-25, ASSET-26, FEAT-59, FEAT-45, SM-1
---

# FEAT-66: Camp gear slot renderer

`src/camp.js` builds a 6 m camp pad (`campPadHalfM 3`) but renders **no gear on it**. ASSET-23's
tent is authored, exported and export-clean, and has nowhere to go — it is not in
`data/prop-models.js` and nothing places it. This is the missing half of `items.md`'s **visible-kit
rule**: *what you carry is what renders, so the campsite is the inventory screen.*

Split out of ASSET-23 at close (2026-08-17): the model was the asset ticket, the placement path is
a feature.

## Scope

Four **named slots** on the pad, per the camp anchor convention in ASSET-23..26:

| Slot | Gear | Asset |
|---|---|---|
| `shelter` | bedroll / sleeping bag / tent | ASSET-23 (tent.glb, done) |
| `fire` | campfire | ASSET-24 |
| `over-fire` | cooking kit | ASSET-25 |
| `shade` | tarp | ASSET-26 |

Every camp-gear model is base-seated, centred on its own footprint, forward -Z. **Same slot ⇒ same
origin ⇒ swapping the model is the whole upgrade** — the renderer resolves slot → current kit item
→ model id, and nothing about placement changes when the player upgrades.

## Acceptance

- `data/prop-models.js` carries a `tent` entry (`assets/models/tent.glb`, collision
  `{ shape: 'box', dims: [1.4, 1.1, 2.2] }`).
- `src/camp.js` places the shelter slot's model at a fixed pad-local offset, loaded through
  `src/model-service.js` (FEAT-59), and leaves room for the `fire` slot and the parked Ranger
  inside the 6 m pad.
- Empty slots render nothing — no placeholder, no phantom gear.
- Adding ASSET-24/25/26 later is a registry entry plus a slot mapping, not renderer work.

## Notes

- **No tier language in the registry** (SM-INV-10 via items.md): the sleeping-bag/tent difference
  must never surface as a number. Name entries for what they are, not for what rung they occupy.
- The tent's fly is authored double-sided so the open door shows the inside — verify that survives
  the load path and is not flattened by a material default.

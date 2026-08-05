---
id: ASSET-26
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-45, SM-1, ASSET-06
---

# ASSET-26: Shade tarp

**Camp gear** — the player's own kit, rendered at their campsite. `items.md`'s **visible-kit rule**:
what you carry is what renders, so *the campsite is the inventory screen*. Shares the camp anchor
convention (ASSET-23), and must fit the **6 m camp pad** (`campPadHalfM 3`, `src/camp.js`).

## Request

A rectangular poly tarp pitched as a lean-to on two poles and two guy lines — grommets, a taped
repair, one corner sagging. `items.md` lists the canopy/tarp on the **vibe axis (shade)**: it makes an
exposed site bearable and is *inert under trees*. So the object the player looks at is most often
pitched somewhere with nothing overhead — it is the camp's answer to a bare hillside.

## Spec

| Field | Value |
|---|---|
| Slot | `shade` |
| Tri budget | **≤250** |
| Texture | one albedo, **512×512** — woven poly weave, grommet rings, faded panel, tape patch |
| Real size | 3.0 m × 2.4 m span, 2.0 m high at the ridge / 1.3 m at the low edge |
| Origin | base-seated and centred: pole feet at y=0 |
| Forward | −Z (open low edge faces −Z) |
| Collision | poles only — `{ shape: 'boxes', dims: 2× [0.05, 2.0, 0.05] }`; the tarp is **not** collidable |
| Materials | tarp is **double-sided** — it is looked at from underneath, always |

Sag the fabric in the mesh. No cloth simulation, no wind response.

## Acceptance

- `assets/models/shade-tarp.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/shade-tarp.blend` + `shade-tarp.py`.
- Seats at the `shade` slot and coexists with the `shelter` and `fire` slots on the 6 m pad without
  intersecting ASSET-23 or ASSET-24.
- Tarp renders correctly from below.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Deliberately much smaller than ASSET-06 (awning).** That is a 3 × 2.5 m free-standing camp awning
  belonging to a *place*; this is a scrappy tarp belonging to the *player*, on a pad it has to share
  with a tent, a fire and a truck. Same silhouette family, different story — do not reuse one for the
  other, and do not let the tarp look like equipment somebody installed.
- **Its whole job is to be sometimes useless.** `items.md`'s deficit rule makes vibe gear inert on a
  site that is already good at that factor (`min(itemCap, headroom)`), and the feedback is *"a
  lighter ghosted tail"* on the vibe bar — unlabelled, no numbers. The player reads *the tarp is
  working tonight* vs *the tarp is dead weight* from the world and the bar, so the model has to look
  equally plausible pitched in the open **and** pitched pointlessly under trees.
- No gameplay. The shade assist lives in `src/camp.js` / `src/day.js` and must be applied to the
  **chosen** site after the candidate hunt, never inside `_gradeFlat`/`_gradeAmenity`.

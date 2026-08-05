---
id: ASSET-09
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, ASSET-06
---

# ASSET-09: Winnebago RV

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A boxy Class-C motorhome of roughly 1980s vintage — cab-over bunk, beige-and-brown stripe, ladder
and A/C shroud on the roof. The most legible "someone is camped here" object in the game: parked on a
pad with an awning out and a fire pit going, it is an entire scene from one asset.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤2500** |
| Texture | one albedo, **1024×1024** — stripes, windows, badging, grime |
| Real size | 8.0 m long × 2.4 m wide × 3.2 m tall |
| Origin | base-seated: tyre contact patches at y=0, centred on the footprint |
| Forward | −Z (cab faces −Z) |
| Collision | `{ shape: 'box', dims: [2.4, 3.2, 8.0] }` — solid, not knockable |

Windows are texture, not geometry. No interior — never author rooms you cannot enter.

## Acceptance

- `assets/models/winnebago.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/winnebago.blend` + `winnebago.py`.
- Texture ≤2K, dimensions divisible by 4; no Draco, no KTX2.
- Tri count within budget; material names stable and distinctive.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Static prop, not a vehicle.** It does **not** follow the `src/vehicle-model.js` conventions —
  wheels stay merged into the body, and there is no material-name API (`spec.paint` / `spec.tail`).
  The vehicle loader strips child nodes much smaller than the body as wheels; do not route this
  through it.
- Pairs with ASSET-06 (awning) and ASSET-08 (fire pit) as its natural lawn furniture.
- 8 m on a lay-by pad is a real footprint — placement must confirm the pad is long enough and the
  RV does not intrude on drivable ground.

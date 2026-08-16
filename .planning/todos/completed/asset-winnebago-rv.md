---
id: ASSET-09
type: asset
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-08-15
closed: 2026-08-15
relates: FEAT-59 (model service — registry entry still owed), FEAT-46, FEAT-21, ASSET-06
---

# ASSET-09: Winnebago RV

## Resolution (2026-08-15) — built as amended, export-clean

`assets/models/winnebago.glb` at **1818 / 2000 tris** (Winnebago 1790 + WinnebagoGlass 28), 8
materials, 0 images, +Y up, nose −Z, ground contact 0.000. Sources committed and parametric,
`assets/models/src/winnebago.blend` + `winnebago.py`, self-asserting on length, ground contact,
wheel-vs-windshield, seat-vs-beltline and a 400-ray winding proof (0 inverted).

Built to the **2026-08-13 amendment** — a flat-front Class-A 1985 Chieftain 27DB, not the originally
specced Class-C cab-over — and it carries the second-ever transparency exception: all windows are
alpha-blended `RVGlass` at **0.45**, doubleSided, recorded in ART-STYLE.md. Camper windows get closed
pleated curtains as proud assemblies; the cab has real openings with a minimal interior behind them.

Two loose ends, neither blocking:

- **Not met — *"loads and places in-world."*** Same position as ASSET-29/30: the FEAT-59 import
  service exists (`src/model-service.js` + `data/prop-models.js`), so the `blocked-by: FEAT-59` label
  was stale. What is owed is a `PROP_MODELS` entry and a POI siting decision — and for this asset the
  siting is a **real constraint, not a formality**: 8 m of RV must fit a lay-by pad without intruding
  on drivable ground. Confirm that when it is placed.
- The reference board `assets/models/src/ref-chieftain/` was never committed and is **deleted
  locally**; regenerate it from the BaT listing if the model is ever revised.

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

**Amended 2026-08-13 (user):** a flat-front **Class-A 1985 Winnebago Chieftain 27DB**, not the
originally-specced Class-C cab-over. Reference: the BaT listing photo board at
`assets/models/src/ref-chieftain/` (untracked, like `ref-century/`). Cream body, maroon stripe
cluster wrapping nose and tail, flying-W flash on the front, rolled-up awning on the curbside,
A/C shroud + vent on the roof. The most legible "someone is camped here" object in the game.

## Spec (as amended and built 2026-08-13)

| Field | Value |
|---|---|
| Tri budget | **≤2000** — built at **1818** (Winnebago 1790 + WinnebagoGlass 28) |
| Texture | **none** — flat colours per ART-STYLE (supersedes the original 1024² albedo spec, same ruling as ASSET-23) |
| Real size | 8.0 m long × 2.4 m body width × 3.14 m tall (window frames/awning/mirrors run the visual width to 2.56/2.92) |
| Origin | base-seated: tyre contact at y=0, centred on the footprint |
| Forward | −Z (cab faces −Z) |
| Collision | `{ shape: 'box', dims: [2.4, 3.2, 8.0] }` — solid, not knockable |

**Glass ruling (user, 2026-08-13):** ALL windows are alpha-blended `RVGlass` (0.45, doubleSided) —
the second vehicle granted the broken-car transparency exception; recorded in ART-STYLE.md.
Camper windows carry CLOSED pleated curtains behind their panes (proud assemblies, no hull holes);
the cab has real openings (windshield + one slider per side) showing a minimal near-black interior
with two maroon velour captain chairs breaking the beltline.

Materials (8): `RVBody`, `RVStripe` (recolourable pair — stripe also serves as the taillights),
`RVTrim`, `RVDark`, `RVCurtain` (doubleSided: open pleat sheets), `RVSeat`, `RVSignal`, `RVGlass`.
Recolour targets are `RVBody`/`RVStripe`; the rest are fixed.

## Acceptance

- [x] `assets/models/winnebago.glb` exists, export-clean under `.planning/research/ASSETS.md`
      settings (68 KB, 0 images, no Draco/KTX2, +Y up, nose −Z, ground contact 0.000).
- [x] Sources committed: `assets/models/src/winnebago.blend` + `winnebago.py` (parametric,
      self-asserting: length, ground contact, wheel-vs-windshield, seat-vs-beltline, 400-ray
      winding proof — 0 inverted).
- [x] Tri count within budget; material names stable and distinctive.
- [ ] Loads and places in-world through the FEAT-59 model import service. **Still blocked.**

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Static prop, not a vehicle.** Does **not** route through `src/vehicle-model.js` — wheels stay
  merged into the body, no `spec.paint` API.
- Pairs with ASSET-06 (awning — the deployed one; the model's own awning is rolled) and ASSET-08
  (fire pit) as its natural lawn furniture.
- 8 m on a lay-by pad is a real footprint — placement must confirm the pad is long enough and the
  RV does not intrude on drivable ground.

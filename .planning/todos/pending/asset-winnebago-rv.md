---
id: ASSET-09
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-13
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, ASSET-06
---

# ASSET-09: Winnebago RV

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
| Tri budget | **≤2000** — built at **1298** (Winnebago 1270 + WinnebagoGlass 28) |
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

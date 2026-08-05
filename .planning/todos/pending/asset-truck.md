---
id: ASSET-19
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-04a, FEAT-35, ASSET-17
---

# ASSET-19: Truck

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A generic older work pickup, parked — dirty, a toolbox across the bed, mismatched panel or two. The
utility POI of the set: a parked truck gives any location an owner, and it is what makes a sawmill, a
lumber yard or a produce stall look staffed rather than abandoned.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤2000** |
| Texture | one albedo, **1024×1024** — paint, rust, glass, bed liner, mud along the rockers |
| Real size | 5.4 m long × 2.0 m wide × 1.9 m tall |
| Origin | base-seated: tyre contact patches at y=0, centred on the footprint |
| Forward | **−Z** (nose faces −Z — non-negotiable here, see Notes) |
| Collision | `{ shape: 'box', dims: [2.0, 1.9, 5.4] }` |

**Author it to the vehicle conventions even though it ships static** (`ASSETS.md` → "Conventions the
vehicle loader depends on"): forward −Z, **wheels as four separate child objects**, and stable
distinctive material names for paint and lamps (not `Material.001`).

## Acceptance

- `assets/models/work-truck.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/work-truck.blend` + `work-truck.py`.
- Wheels are separate nodes, materially smaller than the body — verified, because that is exactly
  what `src/vehicle-model.js` keys on when it strips them.
- Paint and lamp materials are addressable by substring (`spec.paint` / `spec.tail`).
- Tri count within budget.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The one asset in the class authored for promotion.** It ships as a static POI prop, but it is the
  obvious candidate to become drivable (FEAT-04a visual swap hook) or AI traffic (FEAT-35). Honouring
  the vehicle-loader conventions now costs nothing and makes that a data-only change later — a
  `VEHICLE_MODELS` entry, no re-model. Every other vehicle-shaped asset in this class (ASSET-09,
  ASSET-10, ASSET-18) explicitly does **not** do this; this one does.
- Promotion is **not** in scope. No drivetrain, no spec tuning, no swap-hook work here.
- The truck half of ASSET-17 (smoker trailer) — that ticket reuses this model and must not fork a
  second one.

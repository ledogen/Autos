---
id: ASSET-14
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-50, ASSET-13
---

# ASSET-14: Lone gas pump

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A single weathered pump on a small concrete pad, standing alone at the roadside — no canopy, no
store, maybe a hand-lettered sign. The rural counterpart to the full station: it says *this is the
last fuel for a while* far more effectively than a building does, and it is the cheapest POI in the
set to place anywhere.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤600** |
| Texture | one albedo, **512×512** — dial face, faded livery, rust streaks, price digits |
| Real size | 0.6 m × 1.1 m pad footprint, 1.9 m tall |
| Origin | base-seated: concrete pad at y=0 |
| Forward | −Z (dial face and nozzle face −Z) |
| Collision | `{ shape: 'box', dims: [0.6, 1.9, 1.1] }` — solid, not knockable |

Hose and nozzle as a simple hanging tube, ≤60 tris. Dial face is texture; do not model digits.

## Acceptance

- `assets/models/gas-pump.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/gas-pump.blend` + `gas-pump.py`.
- Texture ≤2K, dimensions divisible by 4; no Draco, no KTX2.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **This is the detailed pump; ASSET-13's are the simplified ones.** Deliberate duplication — the
  standalone is approached closely and alone, the station's four are seen together at a glance.
  Sharing one mesh would either overspend under the canopy or underdeliver at the roadside. If they
  ever converge, converge on this one.
- Refuelling *gameplay* is FEAT-50, not this ticket.
- Smallest POI in the class — it can sit on ground a building could not, which is most of its value.

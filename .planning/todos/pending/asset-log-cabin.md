---
id: ASSET-16
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, SM-1
---

# ASSET-16: Log cabin

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A single-room log cabin — notched log walls, shingled pitched roof, stone chimney, small covered
porch with a step. The archetypal destination of this whole set, and the strongest anchor for lawn
furniture: a cabin with a fire pit, a grill and a potted plant on the porch is a home.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤2500** |
| Texture | one albedo, **2048×1024** — log courses, shingles, stone chimney, door and window frames |
| Real size | 8.0 m × 6.0 m footprint × 5.0 m to ridge |
| Origin | base-seated: sill logs at y=0, centred on the footprint |
| Forward | −Z (door and porch face −Z) |
| Collision | `{ shape: 'box', dims: [6.0, 5.0, 8.0] }` — coarse box including the porch |

Log courses are **geometry** on the visible walls (the notched corner silhouette is the whole read)
but texture on everything else. Windows are texture; the door does not open.

## Acceptance

- `assets/models/log-cabin.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/log-cabin.blend` + `log-cabin.py`.
- Texture ≤2K, dimensions divisible by 4; no Draco, no KTX2.
- Reads correctly from the road at ~100 m as well as from the porch.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Exterior only. No interior, no enterable door.** State it in the registry entry so nobody plans a
  mission around going inside one. If an interior is ever wanted that is a much larger ticket than an
  asset.
- The **canonical provenance anchor** for lawn furniture — ASSET-01..08 were written with this
  object in mind. When placement rules get authored, start here.
- Sleeping/camping *gameplay* is SM-1 and `.planning/story-mode/DESIGN.md`; this asset does not
  imply a rest point.

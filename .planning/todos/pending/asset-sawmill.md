---
id: ASSET-11
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-09-30
blocked-by: FEAT-59
relates: FEAT-46, FEAT-32, ASSET-12, FEAT-91, ASSET-38
---

# ASSET-11: Sawmill

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Amended 2026-09-30 — the region-2 haul yard (FEAT-91)

The sawmill is now a **working yard POI in region 2 only**: it posts **haul** jobs for a banded bundle
of **6 ft boards** (ASSET-38) and **gives and takes courier** jobs. It is still the log-drag main
mission's terminus; nothing about that changes. What this adds to the model:

- **A loading bay** (named empty `BayBoards`, truck-sized ~3 × 6 m, bed end marked) on the road-facing
  side, clear of the log deck.
- **A raised board rack beside the bay** that the bundle tips off into the bed (`ReleaseBoards` at its
  lip). The rack surface is a collider — a clean inclined plane, ~1.5 m high at the lip so the bundle
  clears a Ranger bed rail (1.14 m).
- Lumber stacks from the ASSET-12 kit may dress the premises; they are not part of this model.

**Art style correction.** This ticket predates `.planning/research/ART-STYLE.md` (flat colours, no
textures, faceted). The texture line below is superseded — ART-STYLE wins.

## Request

An open-sided timber shed over a headrig saw — log deck on one side, green-chain and sawdust pile on
the other, corrugated roof, rusted everything. A working destination rather than a dwelling, and the
natural terminus for the log-drag main mission in `.planning/story-mode/missions.md`.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤4000** — the largest in the set |
| Texture | ~~one albedo, 2048×2048~~ **none — flat colours per ART-STYLE.md** (amended 2026-09-30) |
| Real size | 14 m × 9 m footprint × 6 m tall |
| Origin | base-seated: sill plates at y=0, centred on the footprint |
| Forward | −Z (open working face / log deck faces −Z) |
| Collision | `{ shape: 'box', dims: [9.0, 6.0, 14.0] }` — coarse box; per-post collision is not worth it |

Open-sided, so the interior *is* visible — but keep it to the headrig, the deck and the roof
trusses. No back rooms, no machinery detail that will never be approached.

## Acceptance

- `assets/models/sawmill.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/sawmill.blend` + `sawmill.py`.
- Texture at the 2K cap, dimensions divisible by 4; no Draco, no KTX2.
- Reads correctly from the road at ~100 m as well as up close — this one is seen at distance.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **⚠ It does not fit a lay-by pad, and that is a blocker, not a caveat.** `src/poi.js` sizes the
  POI pad at **14 × 8 m** (`poiPadHalfLen 7.0` / `poiPadHalfWid 4.0`) with a 3 m earthwork cap
  (`poiMaxCutFill`). A 14 × 9 m building consumes the entire pad and overruns it across the road.
  This asset needs a **different siting mechanism** — a larger authored clearing, not a bigger pad —
  and that decision should be made before it is modelled. Largest-footprint asset in the class.
- Pairs with ASSET-12 (lumber yard kit) — a sawmill with no stacked output looks abandoned.
- Ships static and silent. A blade sound, sawdust particles or any working animation is a VFX ticket
  citing this asset.

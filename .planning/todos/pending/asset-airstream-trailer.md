---
id: ASSET-10
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, ASSET-09
---

# ASSET-10: Airstream trailer

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A polished riveted-aluminium bullet trailer, tongue and jack wheel at the front, small awning rail
along one side. The upmarket counterpart to the Winnebago — same "someone is camped here" read, but
it catches light instead of absorbing it, so it carries a pad from much further away.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1800** |
| Texture | one albedo, **1024×512** — rivet lines, window frames, seams (the shine is material, not texture) |
| Real size | 7.0 m long × 2.4 m wide × 2.7 m tall (incl. wheels) |
| Origin | base-seated: tyre contact patches at y=0, centred on the footprint |
| Forward | −Z (tongue/hitch points −Z) |
| Collision | `{ shape: 'box', dims: [2.4, 2.7, 7.0] }` |

Rivets are **texture**, never geometry. Round the body cross-section enough to survive a moving
highlight — this is the one asset in the set where silhouette smoothness earns its tris.

## Acceptance

- `assets/models/airstream.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/airstream.blend` + `airstream.py`.
- **The metal reads as metal in-game, not as flat grey.** Verify in-world before closing, not in
  Blender's viewport — this is the ticket's real risk.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Mirror-polished aluminium is the open question.** A high-metalness / low-roughness material needs
  something to reflect. The project has a baked sky (PERF-21) and no per-object env map, so the
  first attempt may come back near-black. Fallbacks, in order of preference: (1) feed the baked sky
  in as the material's `envMap`; (2) settle for a brushed, higher-roughness finish that reads from the
  albedo. Pick one deliberately and record which.
- Static prop, not a vehicle — same caveat as ASSET-09.

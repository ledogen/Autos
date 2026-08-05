---
id: ASSET-20
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, ASSET-18
---

# ASSET-20: Hitchhiker

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A figure at the roadside with a pack at their feet and a thumb out. The only *person* in the asset
class, and by far the most narratively loaded object in it — an occupied road reads completely
differently from an empty one, and this is the cheapest way to say so.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** |
| Texture | one albedo, **1024×1024** — clothing, pack, face and hair baked in |
| Real size | 0.55 m wide × 1.8 m tall (pack adds ~0.4 m at the feet) |
| Origin | base-seated: boot soles at y=0 |
| Forward | −Z (facing the road, thumb out to the −Z side) |
| Collision | `{ shape: 'capsule', radius: 0.28, height: 1.8 }` |

**Unrigged.** No armature, no skeleton, no animation — the standing pose with the arm out is baked
into the mesh. Face is texture; model no facial geometry at this size.

## Acceptance

- `assets/models/hitchhiker.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/hitchhiker.blend` + `hitchhiker.py`.
- Export contains **no armature and no animation channels** — verify, since Blender exports these by
  default and nothing downstream would consume them.
- Silhouette reads as a person at ~80 m from a moving vehicle; the raised arm is the read.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The project has no character pipeline.** No rig, no skin, no animation system, no humanoid
  anywhere in `src/`. This asset deliberately does not create one: it is a statue. If a hitchhiker
  ever needs to walk, wave, or get in, that is a rig + animation + interaction effort several times
  this ticket's size, and it should be scoped as its own thing.
- **Ships with no interaction and no dialogue.** Whether a hitchhiker can be picked up, what they
  say, and whether they are anything other than a person on a road are all story-mode questions —
  `.planning/story-mode/DESIGN.md` governs, its invariants win, and the open design questions there
  are the owner's to answer, not this ticket's.
- Pairs with ASSET-18 (broken down car): a figure within sight of a dead car explains itself.
- A single unrigged pose repeated across a region will read as clones. Placement should be sparse —
  one is a story, four is a bug.

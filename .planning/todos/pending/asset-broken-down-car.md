---
id: ASSET-18
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, ASSET-20, FEAT-36
---

# ASSET-18: Broken down car

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

An old sedan pulled onto the shoulder, hood up, one wheel off and the corner on a jack, a spare and a
tyre iron on the ground beside it. A POI that is a *situation* rather than a place — the strongest
implied-story object in the set, and the natural companion to a hitchhiker.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1800** |
| Texture | one albedo, **1024×1024** — faded paint, rust blooms, dirt line along the sills, dull glass |
| Real size | 4.6 m long × 1.8 m wide × 1.45 m tall (hood raised: 1.9 m) |
| Origin | base-seated: three tyre contact patches and the jack foot at y=0 |
| Forward | −Z (nose faces −Z) |
| Collision | `{ shape: 'box', dims: [1.8, 1.45, 4.6] }` — solid |

The raised hood, the missing wheel and the jack are **baked into the mesh**, not separate posable
parts. Loose spare and tyre iron are part of the same `.glb`.

## Acceptance

- `assets/models/broken-car.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/broken-car.blend` + `broken-car.py`.
- The broken-down state reads instantly at a glance from a moving vehicle — if it just looks parked,
  the asset has failed. Raise the hood higher and cant the jacked corner further than feels correct.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Static prop, not a vehicle** — same caveat as ASSET-09. Do not route it through
  `src/vehicle-model.js`; the wheels are baked in place and one is deliberately absent.
- **Ships as scenery with no interaction.** A stranded-motorist mission, a tow job, or a parts-
  scavenging hook are all gameplay tickets citing this asset; `.planning/story-mode/DESIGN.md`
  governs whether any of them exist. This ticket must not assume one does.
- Pairs with ASSET-20 (hitchhiker) — a hitchhiker within sight of a dead car is a whole short story
  and costs nothing extra.
- Distinct from FEAT-36's dynamic props: this is immovable set dressing, not a rock that tumbles.

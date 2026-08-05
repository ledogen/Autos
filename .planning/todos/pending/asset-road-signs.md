---
id: ASSET-31
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-39, FEAT-16, ASSET-22
---

# ASSET-31: Road signs

**Road furniture** — repeats along the network, never a destination. It makes a road read as
maintained and inhabited *between* POIs, at a density no POI model can carry. Placed from **road
geometry**, not scattered at random — see the flag below, which is the whole risk of this ticket.

## Request

A small kit of roadside signage on galvanised or timber posts — curve warning, gradient, junction
fingerpost, route/mile marker — faded, shot at, canted. Signs are how a road tells you about itself
before you can see around the bend, and this project's roads have **real, measured** curvature and
grade to tell you about.

## Spec

**One post mesh + one sign-face quad, driven by a shared face atlas.** The kit is deliberately not
four models:

| Piece | Tris | Notes |
|---|---|---|
| `sign-post` | ≤120 | plain post, ~2.0 m; the mount for everything below |
| `sign-face` | ≤40 | a quad (plus a thin backing) UV'd into the atlas — **the atlas cell is the sign type** |
| `sign-fingerpost` | ≤250 | 2–3 pointing blades on a post; a distinct silhouette, so a distinct mesh |

| Field | Value |
|---|---|
| Texture | **one shared 1024×1024 atlas** — diamond warnings (curve L/R, gradient, dip), route shields, mile markers, blank plates. One cell per sign type |
| Real size | faces 0.60–0.75 m; post 2.0 m to face centre |
| Origin | base-seated: post foot at y=0 |
| Forward | −Z (face reads from −Z) |
| Collision | `{ shape: 'box', dims: [0.10, 2.0, 0.10] }` — post only, knockable |

## Acceptance

- `assets/models/sign-post.glb`, `sign-face.glb`, `sign-fingerpost.glb` exist, export-clean under
  `.planning/research/ASSETS.md` settings.
- Sources committed: one `assets/models/src/road-signs.blend` + `road-signs.py`.
- **A new sign type is an atlas cell plus a UV offset — never a new model.** Prove it by producing at
  least four visibly different signs from the one `sign-face` mesh.
- Faces are legible at ~60 m from a moving vehicle (this drives the atlas cell resolution; text
  minifies badly, so favour symbols over words).
- Tri counts within budget; material names stable.
- All three load and place in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **⚠ A sign that lies is worse than no sign.** This is the one asset in the class whose *placement*
  can actively damage the game: a curve-warning sign on a straight, or a left-curve sign on a right
  bend, teaches the player their instruments are untrustworthy. The road system already knows the
  truth — the router prices curvature as κ² and the centerline carries real min-radius and honest
  1-D EMA grade — so **signage must be derived from the routed centerline, never scattered**. Warning
  signs read `minR` on the run ahead; gradient signs read the grade profile. That derivation is a
  placement ticket; this ticket must not ship a scatter path that makes the wrong thing easy.
- **Signs are not navigation UI and must never become it.** The GPS overlay (FEAT-39) already owns
  chevrons and junction arrow boards, and `items.md` is emphatic that **neither GPS may ever render
  an ETA** (par is never a countdown, SM-INV-3). A physical sign is set dressing plus honest road
  information — no distances-to-mission, no destination names tied to the active job, no timing.
  Fingerpost blades name *places*, not objectives.
- Route shields and mile markers are the cheapest way to make a region feel like a **place with a
  road system** rather than generated terrain — and per-region shield styling is an atlas cell, not
  a model, which makes it nearly free (QUAL-23 wants per-region routing character; this is the
  visible half of the same idea).

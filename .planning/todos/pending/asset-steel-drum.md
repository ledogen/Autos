---
id: ASSET-30
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-15
blocked-by: FEAT-59
relates: FEAT-46, FEAT-36, ASSET-29
---

# ASSET-30: 55-gallon steel drum (variants)

**Cargo** — visible load, not scenery. It rides in the bed as **real mass that shifts CoG and
handling** (`items.md` rule 2: *a load, never a stat*), and doubles as set dressing around working
POIs. Per `items.md` §4, cargo is *"mostly a mass value and a fragility flag"* — adding one is a
content act, not a design act.

## Request

The steel drum, in its several states — the object that makes a place look *used*. Rusted by a
sawmill, painted and stencilled at a gas station, open-topped and full of trash at a market stall,
crushed and abandoned at the roadside. It is the workhorse of environment dressing and the natural
counterpart to ASSET-29.

## Spec

**One base mesh, three variants.** Variants are `.glb` files sharing one source and one texture
**atlas** — each variant's UVs point at a different region of the same 1024×1024 sheet, so a variant
costs a material lookup, not a texture:

| Variant | Tris | Notes |
|---|---|---|
| `drum-closed` | ≤350 — **built at 328 (2026-08-15)** | closed head, 2"+3/4" bungs — the default |
| `drum-open` | ≤450 | lid removed, rolled rim, visible interior wall (**do not** model contents) |
| `drum-crushed` | ≤400 | dented, staved-in top, canted; a distinct mesh, not a squashed transform |

| Field | Value |
|---|---|
| Texture | **none** — flat colours per ART-STYLE (supersedes the atlas spec; ASSET-23/09/29 precedent). Variety = RUNTIME RECOLOUR of `DrumPaint` (red-oxide default), not UV offsets; `DrumSteel` (bungs) fixed |
| Real size | 0.58 m diameter × 0.85 m tall |
| Origin | base-seated: base at y=0, centred (crushed variant sits on its actual contact points) |
| Forward | −Z (bungs / stencil face −Z) |
| Collision | closed & open `{ cylinder, r 0.29, h 0.85, mass_kg: 18 }`; crushed `{ box, [0.58, 0.6, 0.58], mass_kg: 18 }` |

Chimes and rolling hoops are geometry on all three — they are the silhouette.

## Acceptance

- [x] `assets/models/drum-closed.glb` exists, export-clean (328 tris, 2 materials, 0 images,
  0.580×0.850 m, base z=0, 2026-08-15). `drum-open.glb` / `drum-crushed.glb` **not built yet**.
- [x] Sources committed: `assets/models/src/steel-drum.blend` + `steel-drum.py` (closed only so far).
- ~~Shared atlas check~~ — moot, no textures.
- The closed variant reads correctly upright **and** on its side.
- Tri counts within budget; material names stable.
- All three load and place in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Three `.glb` files, one ticket** — the same deliberate exception as ASSET-12's lumber-yard kit:
  the variants share a source, a texture and a silhouette, and are meaningless as separate authoring
  jobs. If the set grows past three, split it.
- `mass_kg: 18` is the **empty** drum, **inert today** (FEAT-36 / FEAT-48).
- **A separate model from ASSET-29 (plastic barrel), not a recolour** — see that ticket's note.
- Rust and paint should live in the atlas, so a rustier drum is a **UV offset**, not a fourth mesh.
  Variety here is nearly free; spend it in texture space, never in geometry.

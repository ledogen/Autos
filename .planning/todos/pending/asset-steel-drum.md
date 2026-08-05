---
id: ASSET-30
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
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
| `drum-closed` | ≤350 | closed head, two bungs — the default |
| `drum-open` | ≤450 | lid removed, rolled rim, visible interior wall (**do not** model contents) |
| `drum-crushed` | ≤400 | dented, staved-in top, canted; a distinct mesh, not a squashed transform |

| Field | Value |
|---|---|
| Texture | **one shared 1024×1024 atlas** across all three — bare steel, rust bloom, faded paint, stencils |
| Real size | 0.58 m diameter × 0.85 m tall |
| Origin | base-seated: base at y=0, centred (crushed variant sits on its actual contact points) |
| Forward | −Z (bungs / stencil face −Z) |
| Collision | closed & open `{ cylinder, r 0.29, h 0.85, mass_kg: 18 }`; crushed `{ box, [0.58, 0.6, 0.58], mass_kg: 18 }` |

Chimes and rolling hoops are geometry on all three — they are the silhouette.

## Acceptance

- `assets/models/drum-closed.glb`, `drum-open.glb`, `drum-crushed.glb` exist, all export-clean under
  `.planning/research/ASSETS.md` settings.
- Sources committed: one `assets/models/src/steel-drum.blend` + `steel-drum.py` generating all three.
- All three reference the **same** atlas — confirm it is not embedded three times at full size, or
  accept and record that cost.
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

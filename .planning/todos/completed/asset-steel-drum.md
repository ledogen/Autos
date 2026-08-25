---
id: ASSET-30
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-15
closed: 2026-08-15
relates: FEAT-59 (model service — registry entries still owed), FEAT-46, FEAT-36, ASSET-29
---

# ASSET-30: 55-gallon steel drum (variants)

## Resolution (2026-08-15) — all three variants built and export-clean

`drum-closed.glb` **328**, `drum-open.glb` **316**, `drum-crushed.glb` **348** tris — each inside its
budget. Two shared materials (`DrumPaint` recolour hook, red-oxide default; `DrumSteel` fixed),
**0 images**, base-seated at z=0, ray-verified. One source generates all three:
`assets/models/src/steel-drum.blend` + `steel-drum.py`. Chimes and rolling hoops are geometry on all
three variants.

**One spec decision changed during the build and the ticket body below is stale on it:** the
1024² shared atlas is **gone**. ART-STYLE's no-texture rule won (same ruling as ASSET-23/09/29), so
variety comes from **runtime recolour of `DrumPaint`**, not UV offsets. That means this ticket's
closing note — *"a rustier drum is a UV offset, not a fourth mesh… spend variety in texture space"* —
no longer describes the asset. Variety is a material tint; if rust ever needs to read as *geometry*,
that is a new ticket, not a UV edit.

**Not met, and left to the placement layer:** *"all three load and place in-world."* Same position as
ASSET-29 — the FEAT-59 import service exists (`src/model-service.js` + `data/prop-models.js`), so the
`blocked-by: FEAT-59` label was stale; what is owed is three `PROP_MODELS` entries plus a consumer
that places them. `mass_kg: 18` (empty) stays inert.

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
| `drum-open` | ≤450 — **built at 316** | lid removed, rolled rim, bare-steel interior wall + floor, no contents |
| `drum-crushed` | ≤400 — **built at 348** | deterministic sin-crumple: 0.62×0.62×0.61 m, staved head, 7° cant reseated on contact points |

| Field | Value |
|---|---|
| Texture | **none** — flat colours per ART-STYLE (supersedes the atlas spec; ASSET-23/09/29 precedent). Variety = RUNTIME RECOLOUR of `DrumPaint` (red-oxide default), not UV offsets; `DrumSteel` (bungs) fixed |
| Real size | 0.58 m diameter × 0.85 m tall |
| Origin | base-seated: base at y=0, centred (crushed variant sits on its actual contact points) |
| Forward | −Z (bungs / stencil face −Z) |
| Collision | closed & open `{ cylinder, r 0.29, h 0.85, mass_kg: 18 }`; crushed `{ box, [0.58, 0.6, 0.58], mass_kg: 18 }` |

Chimes and rolling hoops are geometry on all three — they are the silhouette.

## Acceptance

- [x] All three exist and are export-clean (closed 328 / open 316 / crushed 348 tris; 2 shared
  materials, 0 images, base z=0, ray-verified 2026-08-15).
- [x] Sources committed: one `assets/models/src/steel-drum.blend` + `steel-drum.py` generating all three.
- ~~Shared atlas check~~ — moot, no textures.
- The closed variant reads correctly upright **and** on its side.
- Tri counts within budget; material names stable.
- **One of three** loads and places in-world (2026-08-15). `drum-closed` is registered as
  `drumClosed` in `data/prop-models.js` and is now THE thrown physics prop, replacing the retired
  `test-barrel` placeholder: `src/debris.js` hulls its mesh, and ρ 86 over the ≈0.209 m³ hull lands
  this ticket's 18 kg empty mass (the placeholder's ρ 70 was tuned to a bigger 0.254 m³ hull, so the
  number had to move to keep the mass honest). `drum-open` and `drum-crushed` remain unregistered
  and unplaced — they want a scatter-dressing consumer, which is FEAT-36 item 2's work, not this one's.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Three `.glb` files, one ticket** — the same deliberate exception as ASSET-12's lumber-yard kit:
  the variants share a source, a texture and a silhouette, and are meaningless as separate authoring
  jobs. If the set grows past three, split it.
- `mass_kg: 18` is the **empty** drum, **inert today** (FEAT-36 / FEAT-48).
- **A separate model from ASSET-29 (plastic barrel), not a recolour** — see that ticket's note.
- Rust and paint should live in the atlas, so a rustier drum is a **UV offset**, not a fourth mesh.
  Variety here is nearly free; spend it in texture space, never in geometry.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-71 (POI-satellite placement — lawn furniture and yard clutter)**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.

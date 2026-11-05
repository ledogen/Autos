---
id: ASSET-78
type: asset
status: open
severity: minor
opened: 2026-11-02
source: owner, 2026-11-02 (FEAT-66 plan) — "in game we need an unrolled version to be displayed"
relates: FEAT-66 (camp gear slots — the `bed` slot), FEAT-122 (the bedroll item + its rolled thumbnail),
         ASSET-23 (tent — the bed lies inside it), ASSET-79 (the blanket that lies on top)
---
lane: A

# ASSET-78: The bedroll, unrolled — what every camp sleeps on

**Camp gear** (FEAT-66's `bed` slot). Every run starts with the bedroll packed, so this is on the pad
every night a player camps without upgrading. The inventory thumbnail stays the ROLLED bedroll
(`assets/models/src/items.py` `build_bedroll`, `assets/items/bedroll.png`); this is the same bedroll
laid out to sleep on.

- **Form:** the thumbnail's wool roll, unrolled flat: green wool with the cream stripe bands, a thin
  ticking or canvas groundsheet under it, the two leather straps lying loose beside it with their
  buckles, a slight curl left at the foot where it was rolled. ~1.9 × 0.7 m, 3–5 cm thick. Read
  ART-STYLE.md: flat colours, faceted, no textures.
- **Build:** a builder in `assets/models/src/items.py` beside `build_bedroll` (same materials, so the
  two read as one object), exported through `export_glb` with a `WORLD` row
  (`"bedrollOpen": ("bedroll", <rest rotation>)`).
- **Convention (FEAT-66):** base-seated, centred on its footprint, length along Z, **head end at +Z**
  (the back of the tent; the door and the fire are at −Z). Fits inside the tent's 1.4 × 2.2 m.
- **Budget:** ~1000 tris is the floor for a hand-modelled asset; no ceiling worth worrying about for
  one instance per camp.
- **Collision:** none (camp gear spawns no bodies).

## Acceptance

- [x] `assets/models/bedroll.glb` exported from items.py (`export_glb` — runs headless since
      2026-11-02, `blender -b --factory-startup`).
- [x] `data/prop-models.js` `bedroll` entry; `ITEMS.bedroll.model = 'bedroll'`. That is the whole
      wiring: FEAT-66's renderer stacks it.
- [x] Seen at camp inside the tent and on its own (the sleeping bag and blanket stack on it).

## Built — 2026-11-03 (feature/run-shape, with FEAT-66; not merged)

- **`build_bedrollOpen`** in items.py, 5880 tris, 0.88 × 2.04 × 0.075 m:
  - A natural duck-canvas groundsheet, 6 mm thick, with a dark hem 3 mm proud and six brass grommets.
    Its material is new: `Duck` / `DuckHem`. The thumbnail's olive canvas vanished into the grass in game.
  - The wool, folded double: the fold along one side, the two open edges along the other with a seam
    between them. The roll's cream bands run its length.
  - The head end is folded back over itself for a pillow. A few slanting creases and low lumps cross the
    top. The foot is still curled up where it was rolled.
  - The two straps lie where they fell: one along the open edges, one across the foot, each with a flat
    buckle.
  - How it is built: one cross-section swept along one spine (pillow flap → head fold → bed → curl), so
    the bands wrap both bends without a seam.
- **The `WORLD` row names its own builder.** It is `("bedroll", rest, build_bedrollOpen)`, keyed by the
  item. The thumbnail stays the roll.
- **Normals:** `Builder.finish(name, closed=True)` orients closed shells with Blender's outside-recalc
  (`recalc_face_normals`). The ray-probe `fix_normals` misread the lofted quads: 467 of 4000 rays from
  outside hit a back face. With `closed=True` it is 1, a grazing hit where two 5 mm buckle bars cross.
- **Stacking:** `PROP_MODELS.bedroll.seatY = 0.044` is the height the next layer lies at. The pillow fold
  (0.075) and the curl (0.069) stand above it and end up inside the sleeping bag's 5 cm base. camp-gear.js
  seats a layer on `seatY` when the model has one, else on its bounding-box top.
- **Gate (camp-gear):** every bed model fits inside the tent's box, and a `seatY` lies under its model's
  top. Mutation-tested: `seatY` 0.2 fails.
- Shots (2026-11-03): the bedroll alone, in the tent, and under the sleeping bag.

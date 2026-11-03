---
id: ASSET-79
type: asset
status: open
severity: minor
opened: 2026-11-02
source: owner, 2026-11-02 (FEAT-66 plan) — "build blanket as a layer that can be put on top of either"
relates: FEAT-66 (camp gear slots — the `bed` slot's top layer), FEAT-122 (the blanket item + its folded
         thumbnail), ASSET-78 (the unrolled bedroll it lies on), the sleeping bag (items.py export)
---
lane: A

# ASSET-79: The blanket, as a layer on the bed

**Camp gear** (FEAT-66's `bed` slot, `layer: 2`). The blanket is an add-on (items.md §2c): it lies on
top of whatever the player sleeps on — the bedroll, a pad, the air mattress, or the sleeping bag on any
of those. FEAT-66 seats it on the measured top (bounding box) of the layer under it, so it must read
right on a flat bedroll AND on a domed sleeping bag. The inventory thumbnail stays the FOLDED blanket
(`items.py` `build_blanket`, the buffalo check).

- **Form:** the same buffalo-check wool, folded in thirds and laid across the FOOT end of the bed, the
  way you leave a blanket on a camp bed. Its ends hang down over the bed's sides ~8 cm, so on a
  domed sleeping bag (top ~0.13 m at the centre, rounding down at the zips) no gap shows under it.
  ~0.9 × 0.5 m on top.
- **Build:** a builder in `assets/models/src/items.py` beside `build_blanket` (same check, same
  materials), exported with a `WORLD` row.
- **Convention (FEAT-66):** base-seated; **origin at the BED's centre**, not its own — the geometry
  sits toward −Z (the foot, by the door), so the slot point stays the bed's and the blanket lands at
  the foot of whatever is under it. Forward −Z.
- **Collision:** none.
- **Know before modelling:** FEAT-66 seats a layer on the lower layer's BOUNDING-BOX top. The
  shipped sleeping bag's top is 0.25 m (its turned-back corner at the head) but ~0.135 m at the foot,
  where the blanket lies, so a blanket seated on it floats ~12 cm at the foot. **The fix exists since
  ASSET-78 (2026-11-03): `seatY` on a PROP_MODELS entry is the height the next layer lies at.** Give the
  sleeping bag one (~0.135, its top at the foot) and the deluxe pad one (its pillow raises its box top
  ~3.5 cm). Check it on the bag, on a pad, and on the bedroll, whose foot curl stands 2.5 cm above its
  `seatY` right where the blanket lies: the blanket's three layers must swallow it.

## Acceptance

- [x] `assets/models/blanket.glb` exported from items.py (`export_glb`, headless works).
- [x] `data/prop-models.js` `blanket` entry; `ITEMS.blanket.model = 'blanket'`.
- [x] Seen at camp on the bedroll and on the sleeping bag: no visible gap, no clipping into the bag.

## Built — 2026-11-03 (feature/run-shape, with FEAT-66 and ASSET-78; not merged)

- **`build_blanketLayer`** in items.py, 3636 tris, 0.93 × 0.50 m, sides hanging 9.5 cm:
  - The thumbnail's buffalo check (`RedWool` / `CheckStripe` / `CheckDeep`), folded in thirds. Each fold
    edge shows two layers' round fold and the third layer's seam.
  - It lies across the foot: z −0.80…−0.30 from the bed's centre.
  - How it is built: one cross-section (the fold's depth) swept along one spine across the bed — flat on
    top, dipping 2 cm at the shoulders, bending over the sides and hanging. The check is cut on the
    fabric's own (arc, depth) grid, so it wraps the bends.
- **Origin = the bed's centre at the blanket's underside.** The builder sets `keepOrigin`, so `export_glb`
  does not recentre it. camp-gear.js seats it on the layer under it, and the sides hang below.
- **Normals:** 0 of 4000 rays hit a back face. Two fixes on the way:
  - Blender's outside-recalc put the thin sheet inside-out. `finish(closed=True)` now also turns any shell
    whose topmost face points down.
  - The fold seam first overlapped the next fold sample (117 rays hit back faces). It now sits between them.
- **`seatY`, measured from each bed's vertices under the blanket's footprint:** sleeping bag 0.135
  (box 0.25), sleeping pad 0.064 (its valve makes the box 0.084), deluxe pad 0.10 (its pillow, 0.135),
  bedroll 0.044 (its creases peak at 0.047). The air mattress is flat (its box, 0.192).
  - The gate (camp-gear) pins it: the blanket seats within 1 cm of every bed's real top at the foot. The
    old box-top seating, which floated the blanket 12 cm on the bag, fails it.
- **Known limit:** the drape is rigid. On a bed narrower than the blanket (the pads, 0.51–0.64 m), its
  sides bridge out past the pad's edge and hang, rather than sagging onto it. It reads at camp distance.
- Shots (2026-11-03): on the bedroll, on the bag over the bedroll (and low from the foot), on the deluxe
  pad, and through the tent's door.

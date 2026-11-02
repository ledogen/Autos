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
  where the blanket lies, so a blanket seated on it floats ~12 cm at the foot. Either seat the top
  layer by the lower one's height under the blanket's footprint (src/camp-gear.js — a vertex scan of
  the lower model inside the blanket's x/z box), or drop the bag's flap height from the stack. Decide
  when the model is in hand and check it on the bag and on a pad.

## Acceptance

- [ ] `assets/models/blanket.glb` exported from items.py (GUI Blender via blender-mcp).
- [ ] `data/prop-models.js` `blanket` entry; `ITEMS.blanket.model = 'blanket'`.
- [ ] Seen at camp on the bedroll and on the sleeping bag: no visible gap, no clipping into the bag.

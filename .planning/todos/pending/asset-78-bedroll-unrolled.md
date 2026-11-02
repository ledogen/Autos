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

- [ ] `assets/models/bedroll.glb` exported from items.py (GUI Blender via blender-mcp — headless
      `blender -b` never exports).
- [ ] `data/prop-models.js` `bedroll` entry; `ITEMS.bedroll.model = 'bedroll'`. That is the whole
      wiring: FEAT-66's renderer stacks it.
- [ ] Seen at camp inside the tent and on its own (the sleeping bag and blanket stack on it).

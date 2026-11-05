---
id: FEAT-171
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05, after the FEAT-66 look on :3731 — "three item types: ground (sleeping pad, deluxe pad, air mattress), bedding (bedroll, sleeping bag), blanket (blanket, quilt). you can only use one of each type and the models will match (bedroll goes on top of sleeping pad and blanket on top)… tier goes air mat < pad < deluxe, bedroll < bag, blanket < quilt. since the starting pack is only two slots you wouldnt be able to use all 3 layers without a bag upgrade." Plus three answers the same evening (below).
relates: FEAT-66 (camp gear slots), ASSET-78/79 (bedroll, blanket), ASSET-81 (quilt), items.md §2b/§2c (SUPERSEDES the 10-16 bed rows there)
---
lane: A

# FEAT-171: The camp bed is three stacked layers — ground, bedding, blanket

**Supersedes items.md §2b's 2026-10-16 bed rows.** Under those, a pad or mattress *replaced* the bedroll,
and the bag and blanket were add-ons. Now each item is one of three **layers**. You use at most one item per
layer, and they stack in the rendered camp: ground at the bottom, bedding on it, blanket on top.

| Layer | Items, worst → best | Recovery bonus |
|---|---|---|
| Ground | air mattress · sleeping pad · deluxe pad | +5 · +10 · +15 % |
| Bedding | bedroll · sleeping bag | 0 · +10 % |
| Blanket | blanket · **quilt (new)** | +5 · **+10 %** (owner 11-05) |

- **Bonuses still add, as today:** `r × (1 + ground + bedding + blanket)`. The full kit is +35% (it was +30%).
- **Bedding is always present** (owner: "1. but starter pack is always just bedroll"). You always have the
  bedroll or the bag. The bag replaces the bedroll; neither is ever removed to nothing. The **starter Pack
  holds just the bedroll**, so its second slot starts empty. With 2 slots you can run at most two layers; all
  three need a Pack upgrade.
- **Every item takes one Pack slot**, as today.
- **Pillows on both bedding models** (owner: "Both"): the bedroll and the sleeping bag each get one.
- **The models stack:** each layer seats on the one below (a pad's top face, then the bedding's). Re-seat
  them, never float them. The blanket/quilt drapes over whatever bedding is there.

## Acceptance

- [x] One item per layer; fitting a second of a layer swaps it (the old one goes to the inventory).
- [x] The bonus math above in the energy gate; full kit +35%. (camp-gear gate, through day.js recoveryRate)
- [x] The starter Pack is the bedroll alone; a headless check over N runs. (20)
- [ ] Every combination renders stacked at camp with nothing floating or interpenetrating (a screenshot sheet: each ground × each bedding × each blanket/none).
- [ ] Pillows on the bedroll and sleeping bag models; the quilt model (ASSET-81).
- [x] items.md §2b/§2c rewritten to this (on Lane A's branch, which already edits items.md).
- [ ] The owner's look.

## Built — 2026-11-05 (feature/run-shape, Lane A; aac0a2ae, ee9180fa)

- **`data/items.js`:** `bed: 'ground' | 'bedding' | 'blanket'` replaces the old `sleep` flag and `layer`. The quilt
  row (+10 %, 2 kg [DEFAULT], its desc a placeholder). **`src/inventory.js`:** packing a second item of a layer swaps
  it, and the equipped pack never gives up its bedding (it used to be "its bed"). The inventory screen's
  "swap into pack" follows the layer.
- **The drape (`src/camp-gear.js stackBed`).** The bedding is wider than every pad: the bag is 0.86 m and the
  bedroll's canvas 0.88 m, on pads of 0.51–0.78 m, and the air mattress is 19 cm tall. A rigid layer seated on the
  one under it would float its edges. So each layer above the ground is bent onto the ones under it:
  - their tops are rasterised into a 2 cm height field in the bed's frame;
  - the field is spread so it falls away from a support's edge at 2.5 (rise per metre run) after a flat 3 cm reach;
  - every vertex is lifted by the field under it.

  The faces share no vertices, so seams stay closed. The draped copy is its own non-indexed geometry, disposed on
  hide (BUG-72: pooled geometry is never written). About 80 ms warm for a three-layer stack, run once behind the
  make-camp fade (and again on repacking at camp). `seatY` is gone.
- **Models (`assets/models/src/items.py`, headless `blender -b`):**
  - a shared `pillow()` on the bedroll (on its head fold) and the sleeping bag (at the head, zipped side);
  - the bedroll's canvas and the bag's bottom gridded every 6 cm (`sheet()`) so they can bend;
  - the blanket rebuilt FLAT (`bed_cover`), so the drape hangs it over whatever bedding is there (a bent-down
    blanket would hang twice).

  Re-exported: bedroll 8 308 tris, sleeping bag 11 613, blanket 3 844, quilt 1 676. Bag thumbnail re-rendered,
  quilt thumbnail new.
- **Gates.** camp-gear covers all 24 ground × bedding × blanket stacks on the real models: the worst sink into a
  layer below is 0.6 cm (limit 1.5), and the worst hover over the drape is 1.8 cm (limit 2: a sheet's chord between
  its vertices). The tallest tent over a step is 15.6 cm (an air mattress's side), reported, not failed. It also
  checks the layer rules, the starter Pack over 20 runs, and +35 %. inventory §6b now runs the layered rule.
- **Sheet:** `wip/feat-171/sheet.mjs` (24 stacks, two views each, on the lab's flat floor) → `wip/feat-171/sheet.png`.

**Owed:** the owner's look (the sheet, then at camp). [DEFAULT]s: the drape's fall 2.5 and reach 3 cm, the quilt's
mass and colours.

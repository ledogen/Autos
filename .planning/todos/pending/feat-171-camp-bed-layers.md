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

## Owner's look, round 1 (2026-11-06, relayed by the orchestrator) — and the fix

> "literally everything looks good except the folded over corner of the sleeping bag. on its own but especially
> with the pillow. use screenshot review to get just the bag with pillow looking right. since we're here also make
> the blankets a little bit longer so they go midway up the bedroll/bag"

What was wrong, in close renders (`wip/feat-171/bag-review.py`: the bag alone and with its pillow, four views):

- The turned-back stretch of the head collar, a 12 cm tube, ran straight through the pillow's footprint. It stood
  7 cm proud of a 5 cm flap and read as a log beside the pillow.
- The flap's lining and the lining it uncovered were the same flannel, so the corner read as one tan square. At
  full loft the flap stood up as a stiff wedge.

Fixed (f1fb5de2, c481bf0e):

- **The corner** is turned back on the opened half only (fold 0.35 m, was 0.60). The flap is pressed to 55 % of its
  loft. The uncovered lining is a shade darker (`FlannelShade`, the inside of the bag), so the flap reads against the
  hole it left. The collar runs along the kept head edge and ends in a round cap at the fold; on the shell side, its
  turned stretch would lie under the flap.
- **The pillow** sits beside the corner (y 0.105, 0.36 × 0.30 m), over the narrowest pad's top: the sleeping pad's
  ±0.255 m plus the drape's 3 cm flat reach.
- **The blanket and the quilt** run from the bed's middle to their old foot edge (0–0.80 m; they were 0.30/0.24–0.80).
- Found on the in-game sheet over pads, not in the bag-alone renders:
  - The lining was a separate 1 mm sheet on its own grid; draped, it crossed the slab and striped green. It is now
    the slab's own top inside a 2 cm rim (`sheet(rim=)`).
  - The drape bent the pillow vertex by vertex, shearing it into a beak over a pad's edge and the deluxe pad's 3.5 cm
    head rise. `stackBed` now lifts a `PillowCase` mesh in one piece, by the highest field under it.

Re-exported: sleeping bag 9 037 tris, blanket 5 324, quilt 2 012; bag thumbnail re-rendered. Gates green:
camp-gear (24 stacks, worst sink 0.6 cm, hover 1.8 cm), inventory, dist-assets, model-palette, model-variant.

**Known, left as is:** on the two narrow pads (0.51 m sleeping pad, 0.64 m deluxe) the turned corner hangs over the
pad's edge, so the flap folds down with the bag's side, and on the deluxe pad over its head rise too. That is the drape
doing its job: the bag is 35 cm wider than the sleeping pad. It only shows in the close head view.

**New sheet:** `wip/feat-171/sheet.png` (bag stacks first, then bedroll; three views each, the third close on the head
from the bag's opened side); halves `sheet-sleepingBag.png` / `sheet-bedroll.png`, preview `sheet-small.png`.

## Owner's look, round 2 (2026-11-06, the tracker page's feat171-round2, "changes in the note") — and the fix

> "can we open the corner more so it takes the entire width of the bag like we did for the sleeping bag
> thumbnail? then the pillow can go atop the folded over corner. pillow for bedroll and sleeping bag should be
> the same size"

Fixed (ba16a20c, c365fde6):

- **The fold runs corner to corner across the whole width** (fold line u + v = W = 0.85 m, was 0.35 m). The
  opened lining is the head-side triangle and the flap lies on the far side of the diagonal. The head collar is
  gone: a full-width fold leaves no kept head edge to carry it. Carried on the flap, it lay along the far side
  as the log round 1 removed.
- **The pillow is the bedroll's size on both beds** (0.50 × 0.34 m; the bag's was 0.36 × 0.30). It lies at the
  head, centred across the bag, and its foot-side corner rests on the fold. It is soft: `pillow(rest=)`
  raises its bottom on a smooth ramp off the fold line (smoothstep over the roll's radius + 10 cm, up to the
  roll's top, ~12 cm), and its top follows at 85 %. Its top is fanned from the centre: the bent 24-sided
  cap was triangulated corner to corner in game and showed a crease.
- Centred, the pillow stays inside the narrowest pad's top (±0.25 m vs the sleeping pad's ±0.255 + 3 cm reach),
  so the camp drape's one-piece lift never leaves its edge floating.

Re-exported: sleeping bag 10 819 tris, bedroll 8 404; bag thumbnail re-rendered. Gates green: camp-gear (24
stacks, worst sink −1.0 cm, hover 1.8 cm), inventory, dist-assets, model-palette, model-variant.

**Known, as round 1:** on the two narrow pads the bag's sides drape down over the pad's edges, and now the flap
spans the whole width, so the flap drapes down with them (the head view on those rows).

**New sheet:** `wip/feat-171/sheet.png` (bag stacks first, three views each; the third is close on the head).

**Owed:** the owner's look at the new sheet, then at camp. [DEFAULT]s: the drape's fall 2.5 and reach 3 cm, the quilt's
mass and colours.

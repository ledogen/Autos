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

- [ ] One item per layer; fitting a second of a layer swaps it (the old one goes to the inventory).
- [ ] The bonus math above in the energy gate; full kit +35%.
- [ ] The starter Pack is the bedroll alone; a headless check over N runs.
- [ ] Every combination renders stacked at camp with nothing floating or interpenetrating (a screenshot sheet: each ground × each bedding × each blanket/none).
- [ ] Pillows on the bedroll and sleeping bag models; the quilt model (ASSET-81).
- [ ] items.md §2b/§2c rewritten to this (on Lane A's branch, which already edits items.md).
- [ ] The owner's look.

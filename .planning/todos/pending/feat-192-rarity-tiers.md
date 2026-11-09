---
id: FEAT-192
type: feature
status: open
severity: minor
opened: 2026-11-08
source: owner, tracker inbox 2026-11-08 19:50Z
relates: FEAT-189 (power mods, intake first), FEAT-121 (item tracker), FEAT-168 (giver categories), data/parts.js RARITY_COLOR, data/offers.js RARITY_GATES + REWARDS, data/stock-weights.js
---
lane: C

# FEAT-192: five rarity tiers (how often), kept apart from the rank requirement (who can get it)

## Owner, verbatim

"after intaking the power mods data from the items page, we should restructure item rewards into common uncommon
rare epic legendary tiers. this is the rarity of the item i.e. how often it comes up as a mission reward and in a
shop inventory. we keep the reward requirements too i.e. C-B, B-A and so on. easier to organize the items this way.
it would also be easier if that's how the item form read. i just select rarity and rank requirements"

## Today

- `data/parts.js` `RARITY_COLOR` has four tiers (common, uncommon, rare, legendary) and no epic.
- `data/offers.js` `RARITY_GATES` **couples** rarity to rank gates: common → B/A, uncommon → A/S, rare → S,
  legendary → S. REWARDS rows override per item.
- The shop's likelihood is a separate four-step scale in `data/stock-weights.js` (the item page's `_stock`:
  Often / Sometimes / Rarely / Hardly ever).

## What

- Five tiers: **common, uncommon, rare, epic, legendary**. Rarity = frequency, as a reward and on the shop shelf.
- Rank requirement stays its own field per item (C–B, B–A, A–S, S), **decoupled** from rarity: `RARITY_GATES` goes.
- One frequency scale for both reward picks and shop stock. Propose the mapping from the old Often…Hardly ever
  scale to the owner with a table before switching (the weights are owner-set).
- The item setup page's cards read "rarity" + "rank requirement" as two selects (owner: "i just select rarity and
  rank requirements"). The power-mod cards already carry both in their free-text boxes (FEAT-189 table).
- An epic colour in `RARITY_COLOR` from the UI-STYLE token palette.

## Acceptance

- [ ] Every ITEMS/part row has `rarity` (5 tiers) and `gates` (rank requirement) as independent fields.
- [ ] Reward picks and shop stock weight by rarity alone; gates filter by rank alone.
- [ ] The item page's form has the two selects; existing answers migrate.
- [ ] The mapping from the old likelihood scale was shown to the owner before it changed.

## Proposed mapping (lane C, 2026-11-08) — owed to the owner before any data switches

Built from the live data: `data/stock-weights.js`, `data/parts.js` and `data/offers.js` at main 1f5c07dd.
Nothing below is applied yet.

### 1. Shelf words → rarity tiers

Recommended **(A)**: each old shelf word becomes one tier, and its weight stays the same. Legendary is a new step
below epic, a quarter of it, which is the same ×4 step as Rarely → Hardly ever.

| Old shelf word | Weight | New tier | Weight | One auto shop over a 12-day run* |
|---|---|---|---|---|
| Often | 10 | common | 10 | ~1.5 times |
| Sometimes | 4 | uncommon | 4 | ~0.6 times |
| Rarely | 1 | rare | 1 | 1 run in 7 |
| Hardly ever | 0.25 | epic | 0.25 | 1 run in 26 |
| — | — | legendary | 0.0625 | 1 run in 105 |
| no word (jerry can, rubber bed mat, school lunch) | 1 as a reward | rare | 1 | rewards only |

\* 4 slots, each empty slot fills at 6 % an hour, an item stays 6–48 h: ~26 fills a run. The shelf's total
weight is 143 today. It becomes ~174 once the ten power mods and the two engine swaps are stocked at their
ruled tiers; the column uses 174.

- No item in the game today changes its odds. The tiers only relabel the words.
- Legendary is empty until the turbo, the supercharger and the V8 arrive.
- In a reward pool the same weights apply: a legendary is 1/160 as likely as a common in the same pool,
  and 1/4 as likely as an epic.
- **(B)**: legendary at 0.125 (half of epic) instead. One auto shop shows a given legendary 1 run in 53.

### 2. The six doubled rows (FEAT-176)

FEAT-176 merged the front and rear springs and shocks into one part each, and gave each part the pair's weight:
stock 8 (Sometimes ×2), sport 2 (Rarely ×2), heavy-duty 0.5 (Hardly ever ×2). A tier cannot say ×2.

- **(a), recommended:** tier them by their word: stock uncommon, sport rare, heavy-duty epic. Each turns up half as
  often as now (stock springs at one shop: ~1.2 times a run → ~0.65).
- **(b):** keep a ×2 on those six rows only.

### 3. Rank requirement: `RARITY_GATES` goes, nothing moves

21 priced parts have no REWARDS row, and take their reward gates from their old tint today (common → B–A,
uncommon → A–S, rare → S). Each keeps exactly those gates, now written on its own row as its rank requirement:

- **B–A:** standard front pads, standard rear shoes, stock springs, stock shocks, stock front anti-roll bar,
  headlight, stock radiator, open differential, stock engine.
- **A–S:** load-range E tire, sport front pads, sport rear shoes, sport springs, sport shocks, heavy-duty springs,
  heavy-duty shocks, sport front and rear anti-roll bars, welded differential.
- **S:** race front pads, race rear shoes.

### 4. The icon tint follows the new rarity

Rarity is now frequency, so the colour behind an icon changes wherever the old tint and the shelf word disagreed:

| Part | Tint today | New tier |
|---|---|---|
| Stock engine | common (grey) | epic |
| Helical LSD | rare (blue) | epic |
| Heavy-duty springs, heavy-duty shocks, sport front and rear anti-roll bars | uncommon (green) | epic |
| Stock radiator, stock front anti-roll bar | common | rare |
| All-terrain tire, load-range E tire, lift kit, clutch-type LSD, sport springs, sport shocks | uncommon | rare |
| Mounted tire, open differential, stock springs, stock shocks (under 2a) | common | uncommon |

Tools, consumables and camp gear have no tint today. They get one.

A stock engine tinted epic is the rule working: it is hardly ever on the shelf. To keep it grey, its shelf
frequency has to rise to common.

### 5. The epic colour

`RARITY_COLOR` has grey, green, blue and orange (owner, 2026-10-20). Proposed: **purple `#9b5fd1`** for epic,
between blue and orange, the usual order for these tiers. It becomes the fifth colour in that one table, which is
the only place it lives.

### What the owner answers

1. Legendary's weight: (A) 0.0625 or (B) 0.125?
2. The doubled spring and shock rows: (a) by their word, half as often, or (b) keep the ×2?
3. The tint changes in §4, the stock engine going epic among them: accept, or raise the stock engine to common?
4. Epic in purple `#9b5fd1`?

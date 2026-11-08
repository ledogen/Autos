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

---
id: FEAT-199
type: feature
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I'm very happy to see more item rewards being offered I think we need to make them a choice though. The issue I'm running into now is during my playthrough it's just hard to come by money If we make the item reward Something the player can choose to take or leave Then they can choose to go with the cash on any item giving mission instead I Think the way we do this is we keep the mission card almost exactly the same except we add Optional item and then in parentheses minus the dollar amount that it takes off the reward At the end of the mission the player gets to choose to take the cash or take the reduced cash amount with the item"
relates: [FEAT-168, FEAT-121]
---
lane: Spare (mission.js / economy.js / the result card)

# An item reward is optional: full cash, or the item with reduced cash

## What

The mission card stays as it is, plus one line: `Optional item: <item> (−$N)`. At the end of the mission the
player picks: the full cash, or the cash less $N with the item.

Owner-only number: what $N is per item. Default until ruled: the item's shop price (the row in `data/items.js`).

## Acceptance

- [ ] The card shows the optional item and its cash cost.
- [ ] The result card offers the two choices; pad and mouse; the wallet and inventory match the choice.
- [ ] A full inventory still lets the player take the cash.
- [ ] $N comes from one place, so the owner can tune it.

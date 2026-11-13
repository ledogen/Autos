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

## Implementation (Spare, land/feat-199, 2026-11-12)

- Card: `Optional item: <item> (−$N) — <gate>` (offer-board.js card; the map card's form reads OPTIONAL ITEM · OFF THE CASH).
- A bonus offer now pays the FULL cash line, speed tip included — R-04's "the item is the tip" is retired
  (economy.js settle; the card quotes the plain range; the haul picker drops "flat").
- N = `itemCost(id)` = rewardValue (part price / shelf price / REWARD_VALUE, day-1 dollars) × `ITEM_COST_FRAC`
  (data/offers.js, 1 [DEFAULT] = the shop price). One knob, read by the card and the result card.
- Result card, item earned: `take $P` (continue, the full cash — also the default) or `take <item> + $(P−N)` (spends N,
  grants the item, closes). With no room the item button reads `no room for the <item> (Tab)` and is disabled; making
  room re-enables it. An item costing more than the job paid reads `take <item>, pay $(N−P)` and needs the wallet to cover it.
- The dinner invitation's stay costs its N the same way (`stay for dinner (30 min, −$5)`).
- Owner calls: N per item (default = shop price, not × the day tier); whether N > pay may draw on the wallet (built: yes);
  dinner costs its $5 (built: yes); Big tipper still never rides a bonus offer (kept so every seed rolls the same).

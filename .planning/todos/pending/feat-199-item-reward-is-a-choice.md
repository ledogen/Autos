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
  room re-enables it. ~~An item costing more than the job paid reads `take <item>, pay $(N−P)` and needs the wallet to cover it.~~
  Superseded by the cap (below).
- The dinner invitation's stay costs its N the same way (`stay for dinner (30 min, −$5)`).
- Owner calls: N per item (default = shop price, not × the day tier); ~~whether N > pay may draw on the wallet (built: yes)~~
  ruled: cap; dinner costs its $5 (built: yes); Big tipper still never rides a bonus offer (kept so every seed rolls the same).

## Verified (Spare, 2026-11-13) — HELD for the owner, not closed

Post-merge main 1f66acb7: the 34 affected gates are green. A Chrome drive on test seed 2879661543 took the item on the pad and with the mouse, and took the cash with the mouse; each time the wallet and the inventory matched the choice. With a full truck the item button read "no room for the Sport rear shoes (Tab)" and was disabled. Freeing a slot re-enabled it.
Screenshots: wip/feat-199/{offer-card,result-card,result-card-noroom}.png. Owner data point: an S-only Sport rear shoes ($8) rode a
$7.28 job, so taking it COSTS $0.72 from the wallet. Is an item worth more than the job's whole pay a sensible offer?
Held on DESIGN.md "a bonus item rides on top of cash, never instead of it" + R-04's retirement (orchestrator asked the owner).

## Owner ruling (2026-11-13, verbatim to the orchestrator: "f199 1. yes, 2. cap")

1. "yes" — keep the choice model: the optional item costs cash; R-04 "the item replaces the speed tip" is retired; a job
   with an item pays full cash, tip included, and the item is bought out of it at the result card.
2. "cap" — N never exceeds what the job paid.

DESIGN.md's 2026-10-08 amendment ("a bonus item rides on top of cash, never instead of it") is amended in place to this
model; missions.md (the job-board summary), items.md (the dinner invitation) and the mission-feel review's R-04 row are
annotated.

## The cap (Spare, 2026-11-13)

- `itemCost(id, paid = Infinity)` = min(rewardValue × ITEM_COST_FRAC, paid). The result card calls it with the payout
  (main.js onSettle), so `take <item> + $(P−N)` is never below $0 and the wallet is never touched; the
  `take <item>, pay $(N−P)` branch and the dinner button's wallet check are deleted.
- The offer card calls it uncapped (the pay is not known yet). It keeps the owner's `Optional item: <item> (−$N)` when
  the pay's floor is at least N, and reads `(−$N at most)` when the pay can come in below N: under the quoted base, on a
  haul or a demolition site (paid per piece, no floor), or on a fragile job (damage docks up to half the base).
- Gates: test/economy.mjs (the dearest reward on a cheap job costs exactly the pay; the wallet ends where it started),
  test/offer-board.mjs (the "at most" switch, and min(price, paid) for every reward).

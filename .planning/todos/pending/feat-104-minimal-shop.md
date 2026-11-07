---
id: FEAT-104
type: feature
status: open — the storefronts are built (feature/run-shape); waiting on the landing, then the owner's look
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, items.md, DESIGN.md (clock pauses in shops)
---

# FEAT-104: Minimal shop at the required classes

Step 7 of **Places and Missions**.

**State (alpha audit, Lane A, 2026-11-07 — superseded the same day by "Built" below):** only the **auto shop** sold anything: the Parts Shop screen
(`src/service-screen.js`) over FEAT-137's rotating shelf (`src/shop-stock.js`, `ITEM_PRICE` in `data/shop-stock.js`).
The **general store, gas station, food vendor and tackle shop had no buy menu**, so coffee, food, ice and the
other consumables reached the player only as mission rewards (`REWARD_VALUE`, data/offers.js) and the three packed
lunches. items.md's jerry-can row says so too: "that shop has no shelf". FEAT-121's `where:` field does not exist
in `data/items.js`. MILESTONES.md's alpha row ("built on `feature/parts`, lands with it") covers the auto shop only.

## Scope

- Park at a required class (general store, food vendor, auto shop, gas station, tackle shop) and a
  buy menu opens, listing items chosen by the class's tags from items.md.
- The clock pauses while shopping (DESIGN.md).
- Minimal: buy only. No selling, no stock levels.

## Acceptance

- Each required class shows a non-empty, class-appropriate list; buying debits the wallet.
- The map is reachable from the shop screen (moved in from FEAT-54, 2026-10-12). The service and
  camp screens follow the same rule when they get a screen (FEAT-41 menus).

## Amended 2026-10-14 (owner)

- ~~**Prices follow the furthest region unlocked**, not the shop's own region (design-amendments-
  2026-10-14.md §11). One function, so a region-1 shop visited from region 2 charges region-2 prices.~~
  **Retired 2026-10-21 (owner):** prices scale with the clock only (`dayTier`), wherever you buy.
- Stock levels stay out of this minimal shop; they arrive with the bed upgrades (FEAT-115).
- The camp gets the same clock pause in FEAT-118.

## Amended 2026-10-16

- **Stock lists come from FEAT-121's `where:` field**: each storefront sells the rows tagged with its
  POI type id (`generalStore`, `gasStation`, `autoShop`, `foodVendor`, `tackleShop`). Dashboard →
  Items → filter by the storefront to see its stock. Purchases land in the inventory (FEAT-122).

## Built — the storefronts' shops (Lane A, 2026-11-07, feature/run-shape)

**Parking at a general store, gas station or food vendor opens its shop.** It is the service screen in a store mode:
a **Shop** tab, plus **Jobs** when the store has live offers. The brake means one thing there, the auto shop's rule
(SM-3): the offers moved behind the Jobs tab. It is **buy only**: no My Vehicle, no My Items, no selling, and the
camera stays put. The clock holds while it is open (the service screen's existing hold), the map button is on the
card, and prices ride the day tier like every price (owner, 2026-10-21). A pump zone, a fetch pickup and a
requisition line's source still win the brake at a gas station or store, as before. On the tutorial's evening leg a
store stays shut, as a giver does (its Jobs tab must not hand out work before the casserole).

**What each sells** (`data/shop-stock.js` `STOREFRONT`): only items that exist in `data/items.js` with a ruled price.
items.md and FEAT-121's `where:` say which store sells what.

| Store | Always in stock | Now and then |
|---|---|---|
| General store | coffee $3, energy drink $4, zip ties $10, duct tape $8 | — |
| Gas station | coffee $3, energy drink $4, stop-leak $10, emergency gas $8 | jerry can $30, sold full ("rarely") |
| Food vendor | coffee $3, chili dog $5 | — |
| Tackle shop | nothing yet: its lines (the coolers, ice, fishing gear) aren't items | — |

**`[DEFAULT]`s for the owner:**
- **Duct tape and emergency gas at $8.** items.md says "$5–10". $8 is the reading the reward card already used
  (`REWARD_VALUE`). The midpoint would be $7.50, and the shelf and the card would then disagree.
- **"Rarely" for the jerry can** rolls on the auto shop's slots at the auto shop's odds: a fill lands on it as often as
  it would on a Rarely (weight 1) part, and the rest of the scale turns up nothing. Measured over 5 seeds × 20
  stations × 60 days: a gas station has one on the shelf **4.2 %** of hours. A Rarely part at an auto shop is on its
  shelf 2.1 % of hours, because there the other parts hold the slots half the time.
- **"park to shop"**, the prompt's words.
- **Everything else always in stock**, per this ticket's "no stock levels".

**Prices moved, values unchanged.** The storefront items' prices moved from `data/offers.js` `REWARD_VALUE` into
`ITEM_PRICE`, so one table prices the shelf and the reward card. Every reward card reads the same number. The
**jerry can** reward card now shows its $30, where before it named the can with no price (R-07's rule: a reward
carries its value).

**Not built:** the stores' stock on the map's hover card (only the auto shop's shows today); the tackle shop's lines;
the bedding layers (no shop price ruled); groceries, ice and the snacks (not items yet).

**Food is now buyable** (coffee everywhere, the chili dog at the food vendor). Hunger stays switched off: FEAT-169's
call is the owner's.

**Proof:**
- The **auto shop is unchanged**: a hash of every auto-shop shelf (the rolls, `shelf()`, `nextStockH`, purchases,
  prices; 3 seeds × 3 shops × 600 h) is identical before and after: `33daf821…31cd`. Its smoke `service` step is
  unchanged.
- `test/shop-stock.mjs` §8 pins the storefronts.
- cdp-smoke has a new **`store`** step: park at a general store; the Shop tab alone; buy a coffee at its listed price;
  it lands in the inventory and the clock holds; Esc closes. The `offer`, `save` and `pad` steps treat every shop type
  as the auto shop was treated.

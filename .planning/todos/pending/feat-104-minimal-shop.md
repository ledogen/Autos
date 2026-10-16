---
id: FEAT-104
type: feature
status: open
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, items.md, DESIGN.md (clock pauses in shops)
---

# FEAT-104: Minimal shop at the required classes

Step 7 of **Places and Missions**. No shop code exists today.

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

- **Prices follow the furthest region unlocked**, not the shop's own region (design-amendments-
  2026-10-14.md §11). One function, so a region-1 shop visited from region 2 charges region-2 prices.
- Stock levels stay out of this minimal shop; they arrive with the bed upgrades (FEAT-115).
- The camp gets the same clock pause in FEAT-118.

## Amended 2026-10-16

- **Stock lists come from FEAT-121's `where:` field**: each storefront sells the rows tagged with its
  POI type id (`generalStore`, `gasStation`, `autoShop`, `foodVendor`, `tackleShop`). Dashboard →
  Items → filter by the storefront to see its stock. Purchases land in the inventory (FEAT-122).

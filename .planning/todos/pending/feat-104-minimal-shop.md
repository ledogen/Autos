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

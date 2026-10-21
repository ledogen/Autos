---
id: FEAT-137
type: feature
status: open
severity: minor
opened: 2026-10-21
source: owner, 2026-10-21 — "as with all sold auto parts, only sometimes not always. We should probably come up with a stock table with probabilities for items that will rotate and be on sale"
relates: SM-3, FEAT-115 (bed upgrades as parts — "a shop stocks a subset"), FEAT-69 (repair-economy prices), FEAT-121 (item tracker)
---

# FEAT-137: Rotating shop stock — what a shop has on the shelf today

## Why

Today the service center (`src/service.js`, `src/service-screen.js`, feature/parts) sells **every**
part in `data/parts.js` at every auto shop, every visit. The owner ruled that sold auto parts — and
shop items such as the worn spare and the tire plug kit — are on sale **only sometimes**. A part
being missing from today's shelf is what makes a reward or a roadside find land as an event
(SM-INV-7), and it gives a reason to visit a second shop.

## Shape (to be filled in by the owner — the data is the owner's call)

A stock table: per item, the **chance it is on the shelf** at a given shop on a given day. It might
also need:

- **What it rotates on.** Per shop per day is the obvious key: seeded from the shop and the day, so
  a revisit the same day shows the same shelf. That keeps it run-layer randomness, with no save data.
- **Rarity as the default.** The parts' `rarity` (common / uncommon / rare) could set the default
  chance, with per-item overrides for the ones the owner names: the worn spare (50–80%, ~$15) and
  plug kits ($5–10).
- **Always stocked.** Some things might be on every shelf: the stock part for each socket, so a
  repair-by-replacement is always possible. Repairs themselves are labour and are never out of stock.
- **Which shops.** Auto shop only, or the general store and gas station too (plug kits, zip ties,
  duct tape, stop-leak are sold at more than one place per items.md).

## Acceptance

- [ ] The owner supplies the table: per item (or per rarity) a stock chance, and the shops that
      carry it.
- [ ] The service screen's Parts tab shows only today's shelf; fitted parts and the player's own
      parts are always listed.
- [ ] The same shop on the same day shows the same shelf (seeded, not re-rolled per visit).
- [ ] A headless gate pins the frequencies over many shop-days and the same-day stability.

## Not yet

Blocked on the owner's table. Don't invent the probabilities.

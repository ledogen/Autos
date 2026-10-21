---
id: FEAT-115
type: feature
status: open
severity: minor
opened: 2026-10-14
source: owner, 2026-10-12 — "Roof rack, flatbed, stake bed, extended bed, and light bar all fit into the
  same class of upgrades as suspension and tires. Vehicle upgrades mid-run, lost on death … [it] is
  not a different vehicle." Pricing: "Upgrade quality and cost scaling for the
  region … the challenge there, finding the upgrades."
relates: FEAT-112 (the configuration these modify), FEAT-104 (the shop), FEAT-88 (bed well colliders),
  items.md §3 and §7 (parts; bedliner, rubber mat, light bar)
requires: FEAT-104 (shop), FEAT-112 (load verdicts)
invariants: SM-INV-8 (lost on death), SM-INV-15 (not a different vehicle), SM-INV-10 (no stat on the
  part), SM-INV-9 (lateral, not a floor)
design: design-amendments-2026-10-14.md §2–3, §11
---

# FEAT-115: Bed upgrades as parts — roof rack, flatbed, stake bed, extended bed, light bar

## Request

Each upgrade is a part with a price, real mass, a model, and an `apply(config)` function on the
truck configuration (FEAT-112):

| Upgrade | What it changes |
|---|---|
| **Extended (long) bed** | Longer bed. Long loads fit |
| **Flatbed** | Wider deck, no sides: more room for strapped freight; a loose (haul) load is a warning and spills |
| **Stake bed** | Between the two: a bigger deck with stakes that keep most of a loose load in |
| **Roof rack** | A second load space for long, light items (boards); stacks with any bed |
| **Light bar** | No load effect (items.md §7) |

The three bed swaps replace the bed, one at a time. The roof rack and light bar stack.

**Price and stock** (design-amendments-2026-10-14 §11): ~~a part's price follows the furthest region
unlocked, not the shop's region~~ — retired 2026-10-21: a part's price scales with the clock only. A shop stocks a subset; upgrades also come as infrequent rewards
(`REWARDS`, kind `part`). Lower-tier parts stay findable later, at the later price.

## Open

- The flatbed and stake bed change the bed-well colliders FEAT-88's loose loads ride in.
- Models for each upgrade (asset tickets to mint).
- Stock sizes and restock timing per shop.

## Acceptance

- [ ] Each upgrade changes the FEAT-112 verdicts through its `apply` alone; a gate covers it.
- [ ] Bought at a shop, carried as real mass, lost on death.
- [ ] Price scales with the clock (`dayTier`) only — the furthest-region rule is retired (owner, 2026-10-21).

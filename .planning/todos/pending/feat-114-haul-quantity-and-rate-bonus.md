---
id: FEAT-114
type: feature
status: open
severity: minor
opened: 2026-10-14
source: owner, 2026-10-12 — "I like the idea of a limited-time rate bonus for haul yards and I do like
  the idea of the player picking the amount of pieces they want to haul." 2026-10-14: "player picks
  haul qty. Lets the car players and the truck players both party. Soft overload limit and hard
  overload cutoff should apply."
relates: FEAT-88 (haul — the rolled count this replaces), FEAT-91 (haul yards), FEAT-112 (the limits),
  data/offers.js (`HAUL_BUNDLES`, `HAUL_PAY_PER_BUNDLE`)
requires: FEAT-112 (load verdicts)
design: design-amendments-2026-10-14.md §8, §16
---

# FEAT-114: Haul — the player picks the quantity; yards run rate bonuses

## Request

- **The player picks how many pieces to load** at the yard. Past the truck's soft limit the picker
  warns; past the hard limit it stops (FEAT-112). Pay per piece stays `HAUL_PAY_PER_BUNDLE`.
- **The rolled count goes.** `HAUL_BUNDLES` and the per-offer `bundles` stream retire (FEAT-88,
  2026-10-05: "a range on purpose" — reversed).
- **A yard runs a limited-time rate bonus:** a higher per-piece rate for a window, rolled from the
  seed per yard and shown on the card with its own timer. This is where the rare, juicy haul now
  comes from.
- Good deeds keep following the share aboard (`haulPointsFor`).

## Ruling — the tip and the bonus item (owner, 2026-10-16)

Haul scores the **count delivered**, not the share (design-amendments-2026-10-14.md §16, missions.md).

- **Pay = pieces delivered × the yard's per-piece rate.** No speed tip: haul is decoupled from
  courier, and the FEAT-113 deadline is its only clock.
- **Bonus item = a delivered-count target stated on the offer** ("bring 12 for the item"); the
  target sets the rarity. A car (≤ 8, can't lose a piece) can only chase low targets; a truck
  chasing a high one loads extra for margin and has to keep it aboard.
- **Per-yard rates are hand-set**, one per yard tier: firewood (R1) tier 1, lumber (R2) tier 2, rock
  (R3) tier 3 (owner, 2026-10-16). Not per kg.

## Acceptance

- [ ] The picker offers 1 up to the hard limit, warns past the soft limit, and the card's pay follows.
- [ ] `HAUL_BUNDLES` is gone; same seed → same yard bonuses and windows (SM-INV-12).
- [ ] The rate bonus shows its own timer and pays on settle.
- [ ] No speed tip on haul; the bonus item is granted on a delivered-count target shown on the card.

---
id: FEAT-114
type: feature
status: open
severity: minor
opened: 2026-10-14
source: owner, 2026-10-12 — "I like the idea of a limited-time rate bonus for haul yards and I do like
  the idea of the player picking the amount of pieces they want to haul." 2026-10-14: "player picks
  haul qty. Lets the car players and the truck players both party. Soft overload limit and hard
  overload cutoff should apply." 2026-10-21 (re-scoped): haul AND freight pick from the giver's stock;
  "some missions just don't have enough cargo available for you to even get up there and rank"; the
  rate bonus retires in favour of FEAT-142 traits; bonus gates print as counts.
relates: FEAT-88 (haul — the rolled count this replaces), FEAT-91 (haul yards), FEAT-112 (the limits),
  data/offers.js (`HAUL_BUNDLES`, `HAUL_PAY_PER_BUNDLE`)
requires: FEAT-112 (load verdicts), FEAT-138 (count / kg letters)
design: design-amendments-2026-10-21-mission-recut.md §5, §5b, §6 (supersedes design-amendments-2026-10-14.md §8, §16)
---

# FEAT-114: Haul and freight — the player picks the load from the giver's stock

> **Re-scoped 2026-10-21.** This ticket was haul-only with a yard rate bonus and no speed tip
> (10-14 / 10-16). The 2026-10-21 amendment extends the picker to freight, caps it at a rolled stock,
> retires the rate bonus (FEAT-142's Wholesale and Generous traits do that job), moves the bonus gate
> onto the stock, and gives haul a speed tip (scored in FEAT-138). The superseded text is in git
> history and design-amendments-2026-10-14.md.

## Request

- **The giver has a limited stock**, rolled with the offer from its **own** seeded stream (an extra
  draw on the shared `spec` stream shifts every other offer — offer-board.js warns about this).
  Haul stock in pieces; freight stock in units (FEAT-140) or one indivisible load.
- **The stock can be below S.** Most jobs can't be ranked S; that's on purpose (owner). Wholesale
  (FEAT-142) is the rare big stock.
- **The player picks how much to load:** 1 up to the smaller of the stock and the truck's hard limit.
  Past the soft limit the picker warns (FEAT-112). The verdict reads the **picked** load, not the
  offer.
- **Haul stock is bought** (owner, 2026-10-22, §5b): the yard charges **half the job's base pay per
  piece** for every piece loaded, deducted when the load drops. The picker's top is also capped by
  the wallet. An expired or abandoned haul costs its purchase. Freight is not bought.
- **Par and the deadline are computed after the pick** (haul × `HAUL_PAR_SLACK`, freight ×
  `FREIGHT_PAR_SLACK_PER_KG`).
- **The card quotes a rate** ("Base pay $0.40 a bundle"); the picker shows the total as the count
  changes.
- **Bonus gates print as a number:** "deliver 10+" or "400 kg+". The gate is still a letter inside
  (`bonusEarned` unchanged) — the card prints the count or kg behind that letter from FEAT-138's
  table. **A bonus only rolls when the stock can meet its gate.**
- **The rolled count goes:** `HAUL_BUNDLES` and the per-offer `bundles` stream retire.
- **The yard rate bonus retires** (never built).
- A car can't reach the upper counts by capacity alone; no vehicle is barred from any reward.

## Acceptance

- [ ] Stock rolled per offer from its own stream; same seed → same stocks (SM-INV-12).
- [ ] Picker for haul and freight: 1 … min(stock, hard limit), warning past the soft limit, verdict on
      the picked load.
- [ ] Par and deadline follow the picked load.
- [ ] Haul: the purchase (½ base × pieces) is charged at loading, capped by the wallet, shown on the
      picker beside the pay; an expired haul keeps the charge.
- [ ] Card shows the rate; the picker shows the total (and, on haul, the purchase).
- [ ] Bonus gates show as counts / kg and only roll when the stock meets them.
- [ ] `HAUL_BUNDLES` gone; `test/offer-board.mjs`, `test/load-verdict.mjs`, `test/haul-load.mjs`
      updated.

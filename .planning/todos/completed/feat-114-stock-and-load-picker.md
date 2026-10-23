---
id: FEAT-114
type: feature
status: closed
closed: 2026-10-23
severity: minor
opened: 2026-10-14
source: owner, 2026-10-12 — "I like the idea of a limited-time rate bonus for haul yards and I do like
  the idea of the player picking the amount of pieces they want to haul." 2026-10-14: "player picks
  haul qty. Lets the car players and the truck players both party. Soft overload limit and hard
  overload cutoff should apply." 2026-10-21 (re-scoped): haul AND freight pick from the giver's stock;
  "some missions just don't have enough cargo available for you to even get up there and rank"; the
  rate bonus retires in favour of FEAT-142 traits; bonus gates print as counts. 2026-10-22: freight
  leaves the picker — "freight should just be posted … gated upon completion" (amendment §2b).
relates: FEAT-88 (haul — the rolled count this replaces), FEAT-91 (haul yards), FEAT-112 (the limits),
  data/offers.js (`HAUL_BUNDLES`, `HAUL_PAY_PER_BUNDLE`)
requires: FEAT-112 (load verdicts), FEAT-138 (count / kg letters)
design: design-amendments-2026-10-21-mission-recut.md §5, §5b, §6, §2b (supersedes design-amendments-2026-10-14.md §8, §16)
---

# FEAT-114: Haul — the player picks the load from the giver's stock

> **Re-scoped again 2026-10-22 (owner, amendment §2b): haul only.** Freight is posted with a fixed
> load; it has no stock and no picker. The one freight line left here is the offer card: a freight
> bonus prints *"— on delivery"* and only rolls a gate the posted mass meets. The haul scope below is
> unchanged.

> **Re-scoped 2026-10-21.** This ticket was haul-only with a yard rate bonus and no speed tip
> (10-14 / 10-16). The 2026-10-21 amendment extends the picker to freight, caps it at a rolled stock,
> retires the rate bonus (FEAT-142's Wholesale and Generous traits do that job), moves the bonus gate
> onto the stock, and gives haul a speed tip (scored in FEAT-138). The superseded text is in git
> history and design-amendments-2026-10-14.md.

## Request

- **The yard posts ONE offer at a time** (owner, 2026-10-22): one stock, at most one reward, one
  count to pick. Several offers with different rewards would make the player compare each reward's
  count against the picker — too much clicking. The bonus still rolls like any job (it can be absent).
  Haul rewards: **rubber bed mat** (B–A) now; **bedliner** (A–S) joins when its thumbnail
  (`assets/items/bedliner.png`) exists.
- **The giver has a limited stock**, rolled with the offer from its **own** seeded stream (an extra
  draw on the shared `spec` stream shifts every other offer — offer-board.js warns about this).
  Haul stock in pieces. ~~Freight stock in units (FEAT-140) or one indivisible load.~~ (§2b: freight
  has no stock.)
- **The stock can be below S.** Most jobs can't be ranked S; that's on purpose (owner). Wholesale
  (FEAT-142) is the rare big stock.
- **The player picks how much to load:** 1 up to the smaller of the stock and the truck's hard limit.
  Past the soft limit the picker warns (FEAT-112). The verdict reads the **picked** load, not the
  offer.
- **Haul stock is bought** (owner, 2026-10-22, §5b): the yard charges **half the job's base pay per
  piece** for every piece loaded, deducted when the load drops. The picker's top is also capped by
  the wallet. An expired or abandoned haul costs its purchase. Freight is not bought.
- **Par and the deadline are computed after the pick** (haul × `HAUL_PAR_SLACK`). Freight's stay
  set at posting (× `FREIGHT_PAR_SLACK_PER_KG`), as before.
- **The card quotes a rate** ("Base pay $0.40 a bundle"); the picker shows the total as the count
  changes. Freight's card quotes one Base pay number, since its load is known.
- **Bonus gates print as a number:** "deliver 10+". The gate is still a letter inside
  (`bonusEarned` unchanged) — the card prints the count behind that letter from FEAT-138's
  table. **A bonus only rolls when the stock can meet its gate.**
- **Freight's bonus prints "— on delivery"** (§2b), never a weight or a letter. It only rolls a gate
  the posted mass already meets, so delivery always earns it.
- **The rolled count goes:** `HAUL_BUNDLES` and the per-offer `bundles` stream retire.
- **The yard rate bonus retires** (never built).
- A car can't reach the upper counts by capacity alone; no vehicle is barred from any reward.

## Acceptance

- [x] Stock rolled per offer from its own stream; same seed → same stocks (SM-INV-12).
- [x] Picker for haul: 1 … min(stock, hard limit), warning past the soft limit, verdict on
      the picked load. Freight has no picker.
- [x] Par and deadline follow the picked load.
- [x] Haul: the purchase (½ base × pieces) is charged at loading, capped by the wallet, shown on the
      picker beside the pay; an expired haul keeps the charge.
- [x] Card shows the rate; the picker shows the total (and, on haul, the purchase).
- [x] Haul bonus gates show as counts and only roll when the stock meets them.
- [x] Freight bonus line reads "— on delivery" and only rolls a gate the posted mass meets; freight
      card quotes one Base pay number.
- [x] `HAUL_BUNDLES` gone; `test/offer-board.mjs`, `test/load-verdict.mjs`, `test/haul-load.mjs`
      updated.

## Resolution (2026-10-23)

Built on `feature/mission-recut`; owner play-test 1–4 passed 2026-10-23 (slider readout, the wallet
charge at accept, the "Stock bought" row on the result card, the charge kept on abandon).

- **Freight picker dropped** by the §2b ruling. Freight keeps its posted load. Its bonus prints
  "on delivery" and only rolls a gate the posted mass meets.
- **The stock follows the gate**, not the other way round (owner, 2026-10-23). The bonus rolls at the full
  25 % share, and the stock is then floored at that gate's count. Filtering gates on a stock drawn first
  cut the yard's share to ~18 %. Measured over 2000 seeds × 12 days: 24.8 % of yard offers carry the mat.
- **Charged at accept**, not at the drop: the slider is the purchase.
- **No letter anywhere on haul** (owner, 2026-10-23): the letter only decides the item. So the card,
  the slider and the result card name the count instead. The haul card is three lines: the rate and
  cost, then distance and stock, then the bonus strip "deliver N+ bundles". It shows no timers.
- **The bedliner waits on its thumbnail.** `test/dist-assets.mjs` needs `assets/items/bedliner.png`,
  made in the items session's thumbnail pass. Add the bedliner to REWARDS (A–S, firewoodYard) and to
  ITEMS once that file exists.
- Debug: Story · Economy has a "wallet +$50" button.

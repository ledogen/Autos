---
id: FEAT-142
type: feature
status: open
severity: minor
opened: 2026-10-21
source: owner, 2026-10-21 — "Let's not just inject noise to the pay band. We should come up with a
  couple different identifiers like impatient, patient, collector, timid, generous, stingy … these
  would naturally fit on a mission card in the bottom left." Then: "change neighborly with 'the right
  thing to do'"; "kill after hours"; "All except after hours."
relates: FEAT-67 (the offer card), FEAT-117 (reputation), FEAT-103 (six-deed gate), FEAT-116
  (protection multiplies thresholds), FEAT-114 (stock), FEAT-138
requires: FEAT-138
design: design-amendments-2026-10-21-mission-recut.md §10
---

# FEAT-142: Giver traits — 0–2 per offer, on the card's bottom-left

## Request

Every job pays the same dollars per kilometre today; traits are how one offer stands out. Each trait
is a data row that nudges contract terms the job already has. No new systems. Every trait is a trade,
except Generous and Stingy.

| Trait | Applies to | Changes (starting values; FEAT-69 tunes) |
|---|---|---|
| Impatient | all but papers | +20 % pay; tighter deadline; on courier, tighter time thresholds |
| Patient | all but papers | −20 % pay; looser deadline and thresholds |
| Collector | fragile | more pay; damage floors × < 1 (multiplied, like FEAT-116) |
| Easygoing | fragile | less pay; damage floors × > 1 |
| Generous | all but papers | more pay |
| Stingy | all but papers | less pay |
| Big tipper | all but papers | less base, a bigger tip pool |
| Wholesale | haul, freight | a big stock, enough to fill the truck; a lower rate per piece or kg |
| Off the books | all but papers | more pay; no good-deed point, no reputation |
| The right thing to do | all but papers | less pay; +½ good-deed point at C or better; counts toward FEAT-103 |

- 0–2 per offer. Opposed pairs never together.
- Shown bottom-left of the offer card. The terms they change show on the card anyway.
- Rolled from their own seeded stream (an extra draw on the shared stream shifts every offer).
- Rejected: After hours (doesn't fit the deadline system).

## Notes

- **There is no random pay roll today** — offer pay is deterministic. Traits are the first pay variety.
- **Big tipper reverses** DESIGN.md "the tip is never mentioned on the offer" at wording level
  (owner-accepted).
- Wholesale replaces FEAT-114's retired yard rate bonus as the "rare, juicy haul".
- `data/offers.js` TRAITS table; `offer-board.js` `_rollSpec` + `card()`; term changes at accept
  (`mission.js`, main.js ~4160–4178); deed and reputation changes in `economy.js` settle and FEAT-117.

## Acceptance

- [ ] TRAITS table; 0–2 per offer from its own stream; same seed → same traits (SM-INV-12).
- [ ] Shown bottom-left of the card; the quoted pay and terms include their effect.
- [ ] Each trait's term change applies at accept and settle as tabled.
- [ ] Off the books gives no deed; The right thing to do gives +½ at C or better.
- [ ] `test/offer-board.mjs` covers trait rolls and exclusions.

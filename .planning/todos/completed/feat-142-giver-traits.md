---
id: FEAT-142
type: feature
status: done
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
| Wholesale | haul, ~~freight~~ **OPEN** | a big stock, enough to fill the truck; a lower rate per piece ~~or kg~~ |
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
- **OPEN (owner) — Wholesale on freight.** Freight is posted with a fixed load since 2026-10-22
  (amendment §2b); it has no stock for Wholesale to enlarge. Either Wholesale is haul-only, or on
  freight it means "a heavier posting at a lower rate per kg" (which also lifts the internal tier,
  so a better item). Recommendation: haul-only, the simpler one. Build it haul-only until ruled.
- **The right thing to do on freight — RULED by extension (2026-10-22, flagged).** The owner ruled
  that freight deeds read the internal kg letter (amendment §2b answer 1). So the trait's +½ at C or
  better reads that same internal letter. A light (internal D) freight gets no extra ½.
- `data/offers.js` TRAITS table; `offer-board.js` `_rollSpec` + `card()`; term changes at accept
  (`mission.js`, main.js ~4160–4178); deed and reputation changes in `economy.js` settle and FEAT-117.

## Acceptance

- [x] TRAITS table; 0–2 per offer from its own stream; same seed → same traits (SM-INV-12).
- [x] Shown bottom-left of the card; the quoted pay and terms include their effect.
- [x] Each trait's term change applies at accept and settle as tabled.
- [x] Off the books gives no deed; The right thing to do gives +½ at C or better.
- [x] `test/offer-board.mjs` covers trait rolls and exclusions.

## Resolution — 2026-11-01 (Spare)

- `data/offers.js` **TRAITS** (the ten rows above) + **TRAIT_COUNT_WEIGHTS**. `_rollSpec` rolls 0–2 on
  the offer's own `traits` stream (no draw on `spec`, so no existing offer's destination, place or
  bonus moves), skipping opposed pairs, off-family traits, papers, and Big tipper on a bonus offer.
- Terms, through what the job already has:
  - spec: `payMult` × pay (and × perPiece on a haul), `deadlineSlack` × deadline, Wholesale's stock =
    the yard's max (HAUL_STOCK[1]), fragile shock thresholds (floor, 1 %, break) × floors;
  - mission (`_planOne`): `tipMult` × tip (Big tipper), `thresholdScale` (courier only — the other
    families letter on amounts), `deeds`; `MissionSystem.accept` scales the frozen time thresholds;
  - `economy.settle`: Off the books → 0 deeds; The right thing to do → +½ at C or better (it counts
    toward FEAT-103's camp gate, which reads the same deeds). FEAT-117 reputation is not in code yet.
- The card: the quoted pay includes the traits (tip pool too), the deed line says what the trait does,
  and the names sit bottom-left — the parked panel and the map's hover card.
- Gates: offer-board (determinism, count shares, exclusions, every trait seen, terms as tabled,
  Wholesale), economy (deed rules, threshold scaling at accept); affected 27/27; smoke 20/20.

### Starting values and calls — owner to confirm (FEAT-69 tunes the numbers)

- **How many:** 0 / 1 / 2 traits at 50 / 35 / 15 %.
- **Pay:** Impatient, Generous, Off the books +20 %; Collector +25 %; Patient, Stingy −20 %;
  Easygoing, The right thing to do −15 %; Big tipper −20 % pay with the tip pool × 1.6 (net tip × 1.28).
- **Deadline:** Impatient × 0.6, Patient × 1.5. **Courier thresholds:** × 0.9 / × 1.1.
- **Fragile floors:** Collector × 0.8 (more delicate), Easygoing × 1.25.
- **Wholesale:** haul-only (the ticket's OPEN), the yard's whole stock at 80 % of the rate per piece.

## Owner look, 2026-11-01 — two changes

> i cant tell if the modifiers are actually doing anything. either way we should print the effect
> on the same line. also i dont want them to stack. one at a time max

1. ONE trait per offer, max (count weights become none / one; no stacking).
2. The card prints the trait's EFFECT on the same line as its name, in plain numbers.
Lane: Spare.

**Built (Spare, 2026-11-01).**
- **One at most.** `TRAIT_COUNT_WEIGHTS` = { 0: 0.5, 1: 0.5 } — the old two-trait share folded into one,
  so plain offers stay half the board. Same `traits` stream: an offer that had one trait keeps it, one
  that had two keeps its first, and no other roll moves. The opposed-pair rule is moot and gone.
- **The effect on the line**, in this offer's own numbers against the same offer without the trait
  (`OfferBoard._traitLine`): pay in dollars off the quoted base (per bundle on a haul), the deadline
  in game time, courier rank times and a fragile load's shock tolerance in percent, the tip in percent,
  Wholesale's full-yard stock, and the deed change. Live samples, story seed 6:
  "patient: −$0.64 pay · deadline +29 min · rank times 10% looser", "generous: +$1.12 pay",
  "the right thing to do: −$1.14 pay · +1/2 deed at C or better".
- The map card does not wrap text, so the trait row wraps at its " · " joins when it outruns the card
  (the card grows by those rows). The parked panel is HTML and wraps on its own.
- Gate: offer-board — one trait at most with shares near the weights, and every traited card's line
  names the trait and carries each of its effects. Card screenshots: `wip/feat-142/`.

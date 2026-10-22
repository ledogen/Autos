---
id: FEAT-138
type: feature
status: open
severity: major
opened: 2026-10-21
source: owner, 2026-10-21 — "rank should be based on the core principle of the mission type"; "all
  missions should tip based on speed"; "a player should see the progression of themselves going from
  struggling to get B or A rank to getting S rank because of the upgrades they made to their truck
  within the region"
relates: FEAT-114 (stock + picker, builds on this), FEAT-96 (freight), FEAT-97 (fragile), FEAT-132
  (one-piece fetch), FEAT-87 (rank timer), FEAT-69 (balance)
design: design-amendments-2026-10-21-mission-recut.md §1–4, §8, §11b, §12
---

# FEAT-138: Every mission type ranks on its own axis; speed is the tip; thresholds step by region

## Request

Rank is the career's core skill and the tip is speed. This ticket is the scoring core every other
2026-10-21 ticket builds on. It changes how a finished job is lettered and paid, not how it is offered
or shown.

| Type | Letter reads | Tip | Base |
|---|---|---|---|
| Courier | time vs par (unchanged) | speed (unchanged) | guaranteed (unchanged) |
| Haul | **pieces delivered**, absolute counts per cargo | speed, × the amount delivered | per piece delivered |
| Freight | **kg delivered**, absolute | speed, × the amount delivered | per kg delivered |
| Fragile | remaining health (unchanged, `fragileGrade`) | **speed** (was condition) | **half guaranteed, half × health** |
| Papers | unchanged here — FEAT-141 re-cuts papers | | |
| One-piece fetch (FEAT-132) | **time**, like courier | speed | guaranteed |

**Thresholds are a table keyed by type and region** (§11b), never by day and never by the player's
truck:

- **Haul, R1 (firewood):** S = a brimming stock-Ranger bed, **measured** with the haul-load harness
  (drop bundles until they settle brimming over the rails; the owner expects 22–26). A / B / C at 85 /
  70 / 55 % of S. Later regions' cargo sets S past brimming for the stock bed.
- **Freight, R1 — PROVISIONAL, owner play-tests and signs off:** S 712 kg (125 % of the 570 kg
  rating), A 570, B 428, C 285. R2/R3 S sits past the stock truck's legal limit; numbers at play-test.
- **Fragile:** the existing health letters, the same in every region.
- **Courier:** R1 = today's day-1 thresholds. Later regions may tighten slightly (tentative).

## Notes for the implementer

- **The day ramp retires:** `rankThresholds(day)`, `rankDayLate`, `rankTightenDays` (economy.js
  ~122–217). Terms frozen at accept now carry the region's thresholds.
- `par.js`: replace the `haulGrade` time + load blend (452–489) with a count grade; add a kg grade.
  `fragileGrade` stays.
- `main.js` onSettle (~3883–3901) assigns the letter per type. Haul's `payMult × share` becomes
  `payMult × pieces delivered` (the rate × count); freight's becomes × kg delivered.
- **Base pay stays × par** (DESIGN.md `parBase = k × par` is load-bearing against farming tiny jobs).
  "Per piece" multiplies the par line; it is not a flat fee.
- `economy.js` `splitFragilePayout`: base = half guaranteed + half × health; the tip comes from the
  time ratio like every other type; `FRAGILE_TIP_ZERO` retires. Destroyed (health 0) still fails and
  pays nothing.
- **Freight knobs:** `FREIGHT_TIME_SLACK` retires (time no longer ranks freight; mission.js 372–381).
  `FREIGHT_PAR_SLACK_PER_KG` stays (par after the pick). `FREIGHT_TIP_MULT` and `FREIGHT_PAY_PER_KG`
  stay as FEAT-69 knobs.
- **Good deeds:** `pointsFor(letter)` on every type. `haulPointsFor` and the health bands retire.
- SM-INV-4 holds: money reads the count, kg, health or time, never the letter.
- Until FEAT-114 lands, haul and freight load counts are whatever the offer carries today; the grade
  functions take the delivered amount as input so they work before and after.

## Acceptance

- [ ] A threshold table keyed by type and region; nothing reads the run day for a letter.
- [ ] Haul letters on the count delivered; freight on kg delivered; fragile unchanged; the one-piece
      fetch on time.
- [ ] The haul S count is measured headless and recorded in the table with the measurement method.
- [ ] Haul, freight and fragile tip on the time ratio; haul's and freight's tips scale with the amount
      delivered (dumping half the load never pays more).
- [ ] Fragile base = half guaranteed + half × health; health 0 fails and pays 0.
- [ ] `pointsFor(letter)` gives every type's deeds.
- [ ] `test/economy.mjs`, `test/haul-load.mjs`, `test/fragile-cargo.mjs` updated; "the day, in plain
      words" re-checked under the new base pay.

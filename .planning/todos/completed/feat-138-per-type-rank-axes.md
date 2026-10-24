---
id: FEAT-138
type: feature
status: closed
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

- [x] A threshold table keyed by type and region; nothing reads the run day for a letter.
- [x] Haul letters on the count delivered; freight on kg delivered; fragile unchanged; the one-piece
      fetch on time.
- [x] The haul S count is measured headless and recorded in the table with the measurement method.
- [x] Haul, freight and fragile tip on the time ratio; haul's and freight's tips scale with the amount
      delivered (dumping half the load never pays more).
- [x] Fragile base = half guaranteed + half × health; health 0 fails and pays 0.
- [x] `pointsFor(letter)` gives every type's deeds.
- [x] `test/economy.mjs`, `test/haul-load.mjs`, `test/fragile-cargo.mjs` updated; "the day, in plain
      words" re-checked under the new base pay.

## Resolution (2026-10-22)

- **One table** — `economy.js` `ECONOMY_PARAMS.RANK_TABLE`, read by `rankTable(kind, region, cargoId)`.
  It is keyed by type and region (the region clamps like `regionTier`). `rankThresholds(day)`,
  `rankDay1`, `rankDayLate` and `rankTightenDays` are deleted. `terms()` freezes region 1's time row,
  and haul and freight read theirs at settle from the frozen `terms.region`.
  - Courier/papers time: today's day-1 values in every region (R2/R3 PROVISIONAL).
  - Haul firewood: **S 25, A 22, B 18, C 14** (A/B/C = 85/70/55 % of S, rounded up). R2/R3 copy R1,
    PROVISIONAL.
  - Freight: 712/570/428/285 kg, PROVISIONAL in every region.
- **Haul S measured** with `test/measure-haul-brim.mjs`. It uses the game's own loader (truck parked
  square, 5 seeds per N), sharing the rig `test/lib/haul-rig.mjs` with the `haul-load` gate.
  - The bed is full to the rail at ~20–21 bundles.
  - N 26 is the largest load whose heap stays within half a bundle of the rail; N 28 mounds up to
    0.34 m. The median aboard at N 26 is 25.
  - `inBedWell` alone can't measure this: it counts a piece up to 0.6 m over the rail, so its count
    never plateaus below ~40.
- **Letters:** `par.js` `amountGrade(amount, t)` (higher is better) grades haul on pieces delivered
  and freight on `cargoKg`. `fragileGrade` now goes through it with the same 90/83.3/76.7/70 % floors.
  `haulGrade`, `timeScore` and the HAUL_LOAD_* / HAUL_TIME_CAP constants are deleted. The one-piece
  fetch needs nothing new: it grades on time through `gradeRun`, and FEAT-132 wires it up.
- **Pay:**
  - Fragile: `splitFragilePayout(par, ratio, health, …)` = base × (½ + ½·health) + the courier
    speed tip. Health 0 pays $0. `FRAGILE_TIP_ZERO` / `fragileTipShare` are deleted.
  - Freight: `FREIGHT_TIME_SLACK` is retired (offers.js, mission.js accept, main.js, settle), so its
    tip reads the plain ratio × `FREIGHT_TIP_MULT`.
  - Haul: unchanged. Its payMult was already the rate × pieces delivered, base and tip together.
- **Deeds:** `pointsFor(letter)` on every type. `haulPointsFor` is deleted.
- **Interim (owner, 2026-10-22):** until FEAT-114's picker, today's 10–15-bundle offers top out at C,
  and most freight grades D. Only 455 kg+ loads reach B. `feature/mission-recut` does not merge to
  main before FEAT-114.
- **"The day, in plain words":** courier pay is untouched, and the break-even checks in
  `test/economy.mjs` §1 still pass.
- The FEAT-87 rank timer still draws time bands on haul/freight/fragile. FEAT-139 re-cuts the strip.

## Addendum (owner, 2026-10-22) — the freight kg letter becomes internal

Amendment §2b: freight is **posted, not picked**. The poster sets the load, so its kg letter is fixed
before the drive and is **never shown**. It only decides which bonus items the load may carry.

- What this ticket shipped stays: `rankTable('freight', …)` and `amountGrade` on `cargoKg` now read
  as the internal item tier. Pay is unchanged.
- **Code follow-ups** (none belong to this closed ticket):
  - The freight offer card's bonus line reads *"— on delivery"* and only rolls a gate the posted mass
    meets → FEAT-114 (already in the `gateLine` work on this branch).
  - No freight letter on the HUD strip, no FEAT-87 bar on freight, no letter or tier on the freight
    result card → FEAT-139.
  - Freight deeds go through `pointsFor(letter)` on the internal letter. **Ruled the same day**
    (owner: *"use internal letter"*), with the SM-INV-14 tension accepted. No code change.
  - Every freight load stays as-built (FEAT-140 cancelled), so `rankTable('freight', …)` reads the
    posted load's own mass. A load under 285 kg carries no bonus item, on purpose.

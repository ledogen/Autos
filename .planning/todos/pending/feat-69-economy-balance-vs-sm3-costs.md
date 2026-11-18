---
id: FEAT-69
type: feature
status: open
opened: 2026-08-18
severity: minor
source: FEAT-53 closure — Phase D item 2's original condition was never met and could not be
relates_to: >
  FEAT-53 (closed 2026-08-18 — the par re-anchor landed as its Phase D), SM-3 (the wear/repair
  costs this must balance against), SM-INV-14 (points economics shifted under it),
  run-shape.md "The mission count", src/economy.js dayTierTable, FEAT-28/SM-4 (the region index)
---

# FEAT-69: Balance the payout ramp against SM-3's real costs, and recount the run

## Next steps
Owner: on the owed card `feat69-freight-lists`, type the numbers of the freight ideas you approve (list B) and the light
loads to kill (list A) in the note box under the card. Then a lane adds the approved loads (new ones need ASSET tickets;
ideas marked REUSE do not) and trims the killed ones. Built 2026-11-17: freight B 300 kg, oil change $6. Still owed: the
recorded multi-day run, which must measure game hours a day on maintenance and on buying and eating food (see Answers).

## Summary
The one-region point and money budget, recounted (2026-11-16, Lane U): today a day costs 1.4–2.0 × its $7.50 anchor
(food alone is $8), so at 2 jobs a day costs overtake income on day 8, and a grinder reaches the camp on day 3. The
numbers are the owner's; the proposal is the dive. Still owed: one recorded multi-day run.

## Description

### Origin

FEAT-53's Phase D item 2 asked for `dayTierTable` + `rankDayLate` to be balanced **against real
multi-day runs**. `rankDayLate` was balanced (softened 7% → 3%, fitted to recorded drives) but
`dayTierTable` was deliberately **not touched**, because the thing it has to balance against —
SM-3's repair and maintenance costs — does not exist yet. Closing FEAT-53 on the re-anchor would
otherwise have buried this.

run-shape.md's own rule: *tier, rank ramp and cost escalation are ONE problem.* Two of the three
now have real numbers behind them. The third does not.

### What this owes

1. **`dayTierTable` against SM-3 costs.** The current curve (~×1.15/day to a ~5× asymptote) was
   authored before any repair bill existed. Whether it is right is unanswerable until they do.
2. **Recount the 27-point run budget.** SM-INV-14's wording (1 at B+, ½ at C, 0 at D) is unchanged
   but its *economics* moved: par is a C now, so a drive that used to earn a full point may earn
   half. Flagged provisional in `run-shape.md`; a first-order estimate over the 24-run corpus put
   17/20 drives still earning a full point, i.e. probably close for a competent player and harsher
   for a weak one — **an estimate, not a recount.**
3. **Multi-day run data.** Nobody has recorded a full 20-day run. Any ramp balance without one is
   modelling.

### Not blocked on, but worth folding in

- The **region multiplier** (FEAT-53) is inert until FEAT-28/SM-4 supplies a real region index —
  `EconomySystem`'s `getRegion` dep returns 1 today. Its curve (1 → 12) was solved against the
  owner's stated $5-15 → $500-1500 targets and should be re-checked once regions are real.
- Two owner-labelled "slow" drives sit **0.10 apart in ratio** and were labelled the same, which is
  par pricing two routes differently for the same felt pace. Recorded in `src/par.js`; needs more
  labelled runs before it is chaseable, and it is a par question rather than an economy one.

### Moved in from FEAT-54 (2026-10-12)

- **Repairs need a time cost alongside the money cost**, applied as a clock skip (the
      shops/service/camp pause ruling, run-shape.md). Price the time with the money.
      *Built with SM-3's service:* every repair quote carries `hours` beside `price` (`src/service.js:89`,
      the shop's minimum `REPAIR_SETUP = { price: 5, hours: 0.5 }` in `data/parts.js:278`). (alpha audit, Lane A, 2026-11-07)

### Amended 2026-10-14 (owner) — what this now balances

design-amendments-2026-10-14.md §12–15 change the problem:

- **Pay no longer rides `dayTier`** (FEAT-117). `dayTierTable` now scales **costs only**: the day's
  cost anchor, repairs, gas and parts. The 2026-10-12 difficulty knobs scale that growth.
- **Pay grows with the region step × a capped regional reputation** (FEAT-117). Solve the cap, the
  points to reach it, the day-1 cost share `c₀` and the daily cost growth `g` so each region pays for
  itself for about its planned length, then gets tight.
- **Run shape for alpha: three regions, provisionally 7 / 6 / 5 days** (supersedes ~12–14 days).
  Recount the point budget against it.
- **Re-solve `regionMult` for three regions** (it is solved for six). The step must cover the cost
  growth since the run began and still be a raise over the old region at full reputation.
- ~~Parts are priced by the furthest region unlocked (§11), so their prices follow the region step,
  scaled by the upgrade/item-cost knob.~~ **Retired 2026-10-21 (owner):** parts scale with the clock
  (`dayTier`) like every other cost, times the upgrade/item-cost knob. No region term.

### Owner, 2026-11-05 (page inbox) — more spread between S and D

"relevant to rebalancing: i think we want more spread between S and D times S is about right maybe slightly too
challenging, C should be accessible at a much more forgiving time (+10%-20%). just add it to the ticket for now"

**A conflict to resolve when this is built:** C is pinned at exactly par (ratio 1.00) in every region, because par
is the pass line by definition (the 2026-08-16 re-anchor), and `tipZero` is solved from it. Moving C to 1.10–1.20
breaks that. The clean way that keeps it: raise `PAR_SLACK` 1.15 → ~1.32–1.38, so par itself sits 15–20 % later,
and pull S/A/B down as ratios so S's absolute time barely moves (S 0.77 → ~0.66; "maybe slightly too challenging"
→ a touch easier still). The owner rules on which, with numbers, at build time.

**Measured options (Lane B, 2026-11-05; nothing shipped changed).** The day-1 average region-1 job: today par
180 s, so its reference drive is 180 / 1.15 = 156.5 s. Rules used in every option:
- S's absolute time is held at 138.6 s.
- A and B keep their place in the S→C gap (A 17 %, B 43 % of the way from S to C), so the spread grows evenly.
- `fullTipRatio` stays = S and `tipZero` = 2 − S (both gated today), so par still earns half the tip.
- `k` is rescaled by 1.15 / slack, so the average job still pays $5 base and $10 max (the owner's day-1 anchors).

| `PAR_SLACK` | S / A / B ratios | S | A | B | C (= par) | base pay only from |
|---|---|---|---|---|---|---|
| 1.15 (today) | 0.770 / 0.810 / 0.870 | 138.6 s | 145.8 s | 156.6 s | 180.0 s | 221 s |
| 1.27 | 0.697 / 0.750 / 0.829 | 138.6 s | 149.1 s (+2 %) | 164.8 s (+5 %) | 198.8 s (+10 %) | 259 s |
| 1.32 | 0.671 / 0.728 / 0.814 | 138.6 s | 150.4 s (+3 %) | 168.2 s (+7 %) | 206.6 s (+15 %) | 275 s |
| 1.38 | 0.642 / 0.704 / 0.797 | 138.6 s | 152.1 s (+4 %) | 172.3 s (+10 %) | 216.0 s (+20 %) | 293 s |

Pay at each letter's line is the SAME in every option: S $10.00 · A $9.57 · B $8.91 · C $7.50 · D floor
$5.00. The tip is linear in time between S and C, and both ends are held, so only the times move. What
changes is the pay for a given drive time, because the tip runs out later:

| drive time | 150 s | 160 s | 170 s | 180 s | 190 s | 200 s | 210 s |
|---|---|---|---|---|---|---|---|
| 1.15 (today) | $9.31 | $8.71 | $8.10 | $7.50 | $6.90 | $6.29 | $5.69 |
| 1.27 | $9.53 | $9.11 | $8.70 | $8.28 | $7.86 | $7.45 | $7.03 |
| 1.32 | $9.58 | $9.21 | $8.85 | $8.48 | $8.11 | $7.74 | $7.38 |
| 1.38 | $9.63 | $9.31 | $8.99 | $8.66 | $8.34 | $8.02 | $7.69 |

If `k` is NOT rescaled, par grows and every dollar above grows with it: ×1.10 / ×1.15 / ×1.20 (1.38 gives a
$6 base and a $12 max on the average job).

Knock-on effects to weigh:
- B moves 5–10 % later, so more drives earn a whole deed. FEAT-168 sized the 12-day run (10 deeds) on
  today's lines.
- Everything priced off par grows by the same factor: offer deadlines, the papers deadline (par × 1.5),
  and haul and freight pars.
- Gate pins to re-express: region 1's time row == par.js `RANK_THRESHOLDS_DEFAULT`, and "S at or above the
  best honest drive, ratio 0.740". In absolute time that drive is 133 s, still faster than S's 138.6 s.

### Built — 2026-11-06 (Lane B): the owner's spread

Owner, 2026-11-06 (relayed by the orchestrator): **"S 10% more forgiving. D 30% more forgiving. interpolate
between."**, with `k` rescaled so pay at each line stays put (the recommended default).

**What changed:**
- `src/par.js`: `PAR_SLACK` 1.15 → **1.495**, so par (the C/D line) is 30 % later.
- `RANK_THRESHOLDS_DEFAULT` → **S 0.652 · A 0.707 · B 0.794 · C 1**. Each line's time moved later by a share
  interpolated on where it sat between S and C:
  - S +10 %;
  - A (17 % of the way) +13.5 %;
  - B (43 %) +18.7 %;
  - C +30 %.
- `src/economy.js`: `k` 10/180 → **10/234**. `fullTipRatio` 0.652 and `tipZero` 1.348 (still S and 2 − S). The
  `RANK_TABLE.time` rows follow.
- `[DEFAULT]`, this side's call: the interpolation runs by time position, not by letter step. Letter steps would
  have given A +16.7 % and B +23.3 %.

**The average job (par 180 → 234 s):**

| Line | Before | After |
|---|---|---|
| S | 138.6 s | 152.6 s |
| A | 145.8 s | 165.4 s |
| B | 156.6 s | 185.8 s |
| C (par) | 180 s | 234 s |
| tip runs out | 221 s | 315 s |

- Pay at the lines: S $10, A $9.60 (was $9.57), B $8.97 (was $8.91), par $7.50, base $5.
- Pay for a given drive:

| Drive | 150 s | 160 s | 170 s | 180 s | 190 s | 200 s | 210 s | 234 s |
|---|---|---|---|---|---|---|---|---|
| before | $9.31 | $8.71 | $8.10 | $7.50 | $6.90 | $6.29 | $5.69 | $5.00 |
| after | $10.00 | $9.77 | $9.46 | $9.16 | $8.85 | $8.54 | $8.24 | $7.50 |

**What it does to the run** (the 8 recorded new-grip drives in `runs-v2/`, re-graded under both sets):

| Drive (felt) | Before | After |
|---|---|---|
| 0019 very fast | S (0.740) | S (0.569) |
| 0020 par | A (0.784) | S (0.603) |
| 0021 slow | D (1.041) | C (0.801) |
| 0022 par | B (0.857) | A (0.660) |
| 0023 very fast | B (0.817) | S (0.628) |
| 0024 very slow | D (1.208) | C (0.929) |
| 0025 fast | A (0.789) | S (0.607) |
| 0026 fast | S (0.730) | S (0.562) |

- **Deeds per job: 0.75 → 0.88 (+17 %).** Both felt-slow drives now earn ½ instead of 0. No recorded drive reaches
  D any more, which undoes the 2026-08-16 slack property ("every felt-very-slow drive lands at or above 1.0").
- **FEAT-168's 12-day run shortens to about 10 days.** The owner's one run made 6 deeds in 7 days; at +17 % the
  10-deed camp opens around day 10. `campDeeds` **12** would restore ~12 days. The owner has since ruled the camp opens at 6 good
  deeds (DEC-120).
- **Money: mean pay per job +9 %** on the same corpus (0.881 → 0.961 of the max). FEAT-168's affordability check
  (two B jobs clear day 12's costs) still passes, with more room.
- **S becomes common:** 5 of 8 drives grade S (before: 2). Every felt-fast drive now pays the whole tip.

**Knock-ons, left riding par (`[DEFAULT]`, owner to rule):**
- Delivery deadlines (`par × (1 + DEADLINE_SLACK)`) and the papers deadline (par × 1.5) are 30 % longer in game
  time.
- Haul and freight pars grow too. Their pay doesn't change, because `k` follows.

**Gates:** `test/economy.mjs` re-pinned. It now pins `PAR_SLACK` 1.495 and the four lines, checks each line's time
moved by its interpolated share, and checks k·234 = $10. The average job's par is `AVG_PAR` (180 × slack / 1.15).
The best-honest-drive pin is re-expressed (0.740 at slack 1.15 = 0.569 today), and the B fixtures moved 0.83 → 0.75.
`test/fragile-cargo.mjs` reads `fullTipRatio` instead of 0.77.

**Gates, 2026-11-06:**
- First run of the 65 gates the four files select: 62 green, plus 2 test fixtures still on the old lines.
- `freight-strap` sampled "S pace" at 0.77. It now uses `fullTipRatio`.
- `paper-route` had three: its taper samples now sit around `fullTipRatio`; its slow round sits past `tipZero`;
  its "B" round moved 0.8 → 0.75 of par (0.8 is now a C).
- Both fixed gates pass. Total: 64/64 node gates green; cdp-smoke is the landing's.

### The owner's answer to the knock-ons (2026-11-06, tracker item rank-spread-knock, verbatim)

> "12 days includes the expedition camp missions. keep the spread you just built"

Read as: the camp opens at **6** good deeds (DEC-120, replaces the 2026-11-07 reading of 10),
and the spread stands as built, its par knock-ons included. Folded in by the alpha audit (Lane A, 2026-11-07).
**What this ticket still owes for the alpha:** the point-budget recount for one region and one recorded multi-day
run behind it.

## Tracker
- [x] Repairs carry a time cost beside the money (moved in from FEAT-54; built with SM-3's service).
- [x] The one-region point budget recounted under today's letters, as a proposal (the dive, 2026-11-16).
- [x] Owner answered the dive (2026-11-17, DEC-385..390); freight B 300 kg and oil change $6 built.
- [ ] Freight median at 300 kg: needs the owner's approved and killed lists, then a lane adds and trims loads.
- [ ] Food at about $0.35 per hour of hold and a couple more foods: Lane C's hunger and food rebuild (FEAT-250/260).
- [ ] `dayTierTable` justified against actual costs rather than an authored guess (the dive's `cost-level` answer).
- [ ] The point schedule decided and `run-shape.md`'s provisional warning replaced with the new number.
- [ ] At least one recorded multi-day run backing the ramp (owner drive, about 1–2 h).

## Decisions
- 2026-11-06, owner: "S 10% more forgiving. D 30% more forgiving. interpolate between." (built, above).
- 2026-11-06, owner: "12 days includes the expedition camp missions. keep the spread you just built" (DEC-120: 6 deeds).

- 2026-11-17, owner (dive answers, DEC-385..390), verbatim:
  1. S line: "keep the lines: tune for a player about 30 % slower than me" (DEC-385).
  2. Freight: "raise the threshold to an even 300kg. We just need to add more heavy cargo Variants. Possibly trim some lighter variants. The median freight job should be 300kg, so half the options are 1 deed and really heavy and half the offers are half a deed and can be relatively easy for steady earners. pay should also scale with weight. i think it might already. Send me a list of freight options ideas above 300kg And say how many need to be above 300 kilograms to set median to 300. and I'll approve some. also tell me all the freight that's below 50kg and i might kill some." (DEC-386)
  3. Pace: "about 2 jobs a day", "i want the game to be a little easier so maybe 1.5-2" (DEC-387).
  4. Cost: "cut costs: food to about $0.35 per hour of hold, and the oil change $8 → $6", "We should add a couple more types of food to add some variety" (DEC-388, DEC-390).
  5. Run length: "keep 6 for now and decide after the recorded run", "I think you underestimate the amount of time necessary for maintenance and Acquiring food items." (DEC-389).

## Open questions
- Which freight loads to add (list B) and which light ones to kill (list A): the owed card feat69-freight-lists.
- Run length and the camp gate: after the recorded run.

## Answers, built and measured (2026-11-17, `land/feat-69-budget`)
Conflicts found between the answers and standing records or invariants: none. DEC-017 (stock truck B or A) fits answer 1,
DEC-120 (6 deeds) is answer 5, DEC-018 (freight ranks on kg) is kept, DEC-025 (costs ride the day) is untouched.

1. **S line.** What the lines are fitted to: PAR_SLACK 1.495 and S 0.652 / A 0.707 / B 0.794 / C 1.00 of par, set by the owner's feel on 2026-11-06
   (S +10 %, par +30 %). His recorded median ratio is 0.61. "30 % slower than me" is 0.61 x 1.3 = 0.79, which is exactly the B line.
   So no line moves and nothing is built; the target is now on record. Before and after are the same, in seconds of drive:

   | Job (par) | S | A | B | C (par) | owner median (0.61) | 30 % slower (0.79) |
   |---|---|---|---|---|---|---|
   | short, 120 s | 78 | 85 | 95 | 120 | 73 | 95 (B) |
   | average, 234 s | 153 | 165 | 186 | 234 | 143 | 186 (B) |
   | long, 420 s | 274 | 297 | 333 | 420 | 256 | 333 (B) |

   At pace x1.3 the model grades S 5 % · A 8 % · B 40 % · C 43 % · D 5 %.
2. **Freight.** Built: `RANK_TABLE.freight` B 285 to 300 kg (S 712, A 570, C 0 unchanged). No load sits between 285 and 300, so no post
   changes grade today (deeds per freight job 0.54 before and after). Lists A and B and the count are below. Pay already scales with weight:
   par x (1 + 0.0007 kg) x (1 + 0.0003 kg), `FREIGHT_PAR_SLACK_PER_KG` and `FREIGHT_PAY_PER_KG` in `data/offers.js`.
3. **Pace 1.5 to 2 jobs a day.** It feeds the budget model only (`test/budget-recount.mjs`: jobs a day sets the income per day against the day's
   cost) and is the sizing pace for costs and the camp gate; no game number reads it. Net per day (earn minus cost x day tier), answers 2 and 4
   applied, owner pace: at 2 jobs a day costs overtake income on day 12 (was 8), at 1.5 on day 10 (was 6). A player 30 % slower: day 10 at 2 jobs
   (was 6), day 8 at 1.5 (was 4). Net per day, owner pace, 2 jobs: 9.7 · 9.0 · 8.4 · 7.6 · 6.8 · 6.0 · 5.2 · 4.3 · 3.3 · 2.2 · 1.1 · -0.1 (day 12). At 1.5:
   6.2 · 5.6 · 5.1 · 4.4 · 3.7 · 3.0 · 2.2 · 1.4 · 0.5 · -0.4 (day 10). Run `node test/budget-recount.mjs` for the full table (food $0.35 per hour is a model lever there).
4. **Cost level.** Built: `OIL_CHANGE.price` 8 to 6 (`data/parts.js`). Food prices and food items are Lane C's (FEAT-250/260); not touched.
5. **Run length.** Nothing built (6 stays, DEC-120). The recorded run must measure, per game day: minutes (game hours) on maintenance and on buying and
   eating food. `tools/run-log-summary.mjs` did not report them (it counts meals and lists purchases, nothing about time). Added (a few lines): a
   SHOP TIME block, per day, of the game hours a checkout skipped, split maintenance vs food. Limit: only table or repair time at the service
   screen is logged; time spent walking to a shop and browsing is not, and a purchase with no table time adds none. The model assumed 2 h between
   jobs and 1.5 h a day for camp and meals; compare the recorded run with both.

### Freight lists for the owner (2026-11-17)
```
LIST A: every freight load under 50 kg today (kill any of these). Shares are of all freight posts on 300 seeded boards.
1. An empty propane pack, 43 kg (4 x 7.7 kg + a small pallet). From any giver except the general store, to the general store or a gas station. 46.4 % of all freight posts: the single biggest freight job on the board.
2. A small crate, 30 kg (18 kg crate + 12 kg pallet). Generic yard trade: general store, gas station or farm, to the same three. 4.1 % of freight posts.
(Fragile jobs under 50 kg are a separate family and not in this list: vase 9, mirror 16, artwork 16, chairs 24, pelican case 35, dining table 45.)

LIST B: ideas for freight above 300 kg (the Ranger's rating is 570 kg; a post over 570 is an overload). Arithmetic first, then who posts it and where it goes. REUSE means an existing .glb can carry it (a recolour or a rescale, no new ASSET ticket).
1. Plywood, 12 sheets of 3/4 in: 12 x 27.5 = 330 kg. General store to a work site or a residence. REUSE plywood-sheets.glb (built, never posted).
2. Two drums of oil on a pallet: 2 x 201 + 20 = 422 kg. Gas station or farm to a farm or a work site. REUSE drum-stack.glb with two drums removed.
3. Thirty-two tyres stacked: 32 x 10.5 + 20 = 356 kg. Auto shop to the general store or a gas station. REUSE tire-stack.glb, taller.
4. Pallet of sand: 14 bags x 22.7 kg (50 lb) + 20 = 338 kg. General store to a residence or a work site. REUSE potting-soil-pallet.glb, recoloured.
5. Pallet of animal feed: 20 bags x 22.7 + 20 = 474 kg. Farm or general store to a farm. REUSE potting-soil-pallet.glb, recoloured.
6. Pallet of wood pellets: 20 bags x 18 kg (40 lb) + 20 = 380 kg. General store to a residence. REUSE potting-soil-pallet.glb, recoloured.
7. Pallet of bricks: 200 x 2.3 kg + 20 = 480 kg. General store to a work site or a residence. REUSE cinder-block-pallet.glb, recoloured and shorter.
8. Pallet of drywall: 12 sheets of 5/8 in, 4 x 8 ft, x 32 kg + 20 = 404 kg. General store to a work site. REUSE plywood-sheets.glb, recoloured.
9. Eight treated fence posts, 6 in x 8 ft: pi x 0.075^2 x 2.44 m = 0.043 m3 x 1050 kg/m3 = 45 kg each, x 8 = 360 kg. General store or farm to a farm. REUSE railway-ties.glb, thinner.
10. Two steel I-beams, W8x24, 16 ft: 24 lb/ft x 16 = 384 lb = 174 kg each, x 2 = 348 kg. Work site to a work site. New model (long form).
11. Granite slab, 3.0 x 1.4 m x 3 cm: 4.2 m2 x 0.03 x 2700 kg/m3 = 340 kg. Work site or residence to a residence. New model.
12. Gun safe, 40-gun: about 750 lb = 340 kg. Residence to a residence. New model.
13. Stock tank, 100 gal, full of water: 379 kg + 20 kg tank = about 400 kg. Farm to a farm. New model.
14. IBC tote (a 1000 L cage tank), half full of water: 500 kg + 60 kg tote = 560 kg. Farm to a farm or a residence. New model.
15. Two small round hay bales, 4 x 4 ft: 2 x 225 kg = 450 kg. Farm to a farm. New model.
16. Sixteen square hay bales, two-string: 16 x 25 kg = 400 kg. Farm to a farm or the general store. New model.
17. Five 100 lb propane cylinders: 5 x 76 kg (31 kg tare + 45 kg propane) = 380 kg. Gas station or general store to a residence or a farm. REUSE propane-tank.glb on propane-pallet.glb.
18. Six rolls of field fence, 330 ft x 60 kg + 20 = 380 kg. General store to a farm. New model (rolls).
19. An oak log, 2.4 m long x 0.5 m across: pi x 0.25^2 x 2.4 = 0.47 m3 x 750 kg/m3 = 353 kg. Farm or work site to a work site or a farm. New model (a drag load).
20. A 100 gal diesel transfer tank, full: 378 L x 0.85 = 321 kg + 40 kg tank = 361 kg. Gas station to a farm or a work site. New model.

HOW MANY ABOVE 300 KG (median weighted by posts, not by load: a load posted by more givers is drawn more often; measured on 300 seeded boards, 1014 freight posts):
Before: 6 loads at or above 300 kg (squash 315, soil 344, tomatoes 365, ties 455, concrete 670, cinder blocks 785) hold 10.0 % of freight posts. Median freight post: 43 kg. Mean 129 kg. 50.5 % of posts are under 50 kg.
The median is 300 or more once 50 % of posts are at or above 300 kg. The count depends on who posts it:
- Loads posted by any giver (like the empty propane pack): 3 new loads give 55.7 % at or above 300 kg, 2 give 49.4 %. So 3.
- Loads posted by one or two giver types (the realistic pools in list B): all 20 ideas together reach only 46 %, because the empty propane pack still takes 46 % of today's posts. Not enough.
- List B (all 20) AND the empty propane pack killed: 64.7 % at or above 300 kg, median 340 kg. The first 12 ideas plus that kill already reach 59 %.
- Killing the empty propane pack and the small and large crates with the first 10 ideas: 36 %. Killing is the cheaper lever than adding.
After (list B all 20, empty propane killed): 26 loads at or above 300 kg, 64.7 % of posts, median 340 kg.
PAY: it already scales with weight. Pay = (the route's par x (1 + 0.0007 x kg)) x (1 + 0.0003 x kg) x the offer's pay multiplier, with the speed tip halved. Factor on the same route: 30 kg x1.03, 300 kg x1.32, 570 kg x1.64. The grade line (300 kg for a whole deed) is the load's posted kg and does not depend on how you drive.
```

## Links
- Deep dive: `.planning/dives/FEAT-69-one-region-budget.html`
- DEC-004, DEC-014, DEC-017, DEC-025, DEC-026, DEC-090, DEC-120

## Files
`src/economy.js` · `src/par.js` · `data/shop-stock.js` · `data/parts.js` · `data/offers.js` · `test/budget-recount.mjs`

## Log
- 2026-11-17 (freight r2, `land/feat-69-freight-r2`, DEC-406): `test/freight-mass-census.mjs` (offered mass, 40 seeds x 5 days). Before: median 65 kg, 8.5 % >= 300 kg, empty propane 43.4 % of posts. Added plywood (330, generalStore -> workSite/residence); empty propane pools thinned to residence/store/gas -> residence/gas. After: median 105 kg, 11.7 %, propane 21.4 %. Every other list-B item needs recoloured or new art: owed (card feat69-freight-r2-look). Goal (45-55 %) NOT met.
- 2026-11-17 (budget lane s2, `land/feat-69-budget`): dive answers built: freight B 300 kg, oil change $6; DEC-385..390; run-log-summary SHOP TIME block; budget-recount section 5 (answers, day by day). Gates: see commit. Unverified: the freight median count rides the offer-board sim, not a drive.
- 2026-11-16 (Lane U, `land/feat-69-proposal`): `test/budget-recount.mjs` (rainy-day, not a gate, ~1 s) re-grades all
  51 recorded drives under today's par (41 S) and models jobs, days and runs from the real offer board. The 11-06
  re-grade missed mu 0.80 → 0.72 (0021 is B, not C). Dive written; no game number changed. Unverified: every
  `ASSUME` value (jobs a day, engine load, fuel per km, crashes, fragile/demolition letters).

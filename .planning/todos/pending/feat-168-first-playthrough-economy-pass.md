---
id: FEAT-168
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 — first serious playthrough (reached day 7, six good deeds, a few failed jobs and crashes; "overall pacing feels good"). Quoted under each item.
relates: FEAT-117 (its day-tier half is item 1 here; reputation stays parked there), FEAT-165 (item 4 amends its ALWAYS list), FEAT-166 (clutch LSD — "will fill the gap nicely"), FEAT-137 (shelf), FEAT-69 (economy numbers)
---
lane: B

# First-playthrough economy pass — pay locked, fuel rides the day, part rewards, guaranteed basics, tire wear

Build on feature/machine AFTER its landing set merges. That set already edits these files: FEAT-165's
ALWAYS list, the clutch LSD's stock weight, and the tire prices.

## What

1. **Pay no longer scales with the day** (owner: "payment shouldnt scale with the day but item costs and
   fuel should... otherwise there is no incentive to hurry up and collect good deeds. pay should only scale
   with regions, and as that's a post-alpha feature we should just lock payment scales for now").
   `EconomySystem.terms()` returns `payTier = regionTier` (1.0 in alpha). It keeps carrying `dayTier`
   for costs and the readout. This is FEAT-117's ratified "day tier leaves pay" (DESIGN.md 2026-10-14)
   minus the reputation multiplier, which stays parked in FEAT-117. Retire the "1 a.m. buys tomorrow's
   rate" comment in `terms()` and fix the economy.js header and `test/economy.mjs` to match.
   The haul stock price follows pay, so a bundle stays a fixed share of the haul's base `[DEFAULT]`.
2. **Fuel rides the day tier.** The pump price is `fuelPricePerGal × tierNow()`: $0.50/gal on day 1,
   $1.16 on day 7. That covers can refills and every place that shows the price.
3. **More item rewards, especially parts** (owner: "not enough item rewards. especially vehicle part
   rewards"). `BONUS_CHANCE` goes 0.25 → **0.40** `[DEFAULT]`. Today's pick uses the shelf weights, so
   coffee and energy drinks (weight 10) crowd out parts. The owner's fix is **reward categories**
   (11-05, "item 'types' so we can assign the broad type to givers"). The proposal is under
   § Reward categories below and is the owner's call. Until it is answered, build the rest. If
   categories are refused, fall back to `kind: 'part'` ×3 in the pick `[DEFAULT]`.
4. **Guaranteed basics: the old tire and the air filter** (owner: "need tires to basically always be
   available to buy at one or the other service station since its a true need for players. maybe only
   old tires are guaranteed. same with the engine air filter... you basically will need the air filter by
   day 3 and its not a guaranteed spawn - not fun"; and 11-05 later: "tire patch kit would also go a long
   way… i just popped two tires from a moderate crash and only had one"). FEAT-165's `ALWAYS` becomes
   `['tireOld', 'airFilterStock', 'tirePlugKit']`. The plug kit is the `[DEFAULT]` reading of "patch
   kit". The standard tire goes back into the rotating slots at weight 10. Today an air filter is about
   7 % of shelf fills, so a given shop has one in stock only ~17 % of the time.
5. **The helical LSD is a mission reward only from day 3** (owner: "lock its spawn behind day 3 or so as
   a mission reward. its ok if its expensive in shops before then"; 11-05 later: "helical lsd reward day 3
   onward. clutch type can be available day 1"). The offer board drops `diffLSD` from the reward pool
   before day 3. The shelf keeps it on every day, at its price × the day tier. `diffClutchLSD` is a reward
   from day 1.
6. **Tire wear** (owner, 11-05: "put standard tires to .9 durability. sport to .8 old to .7").
   Old: `FAMILY_DURABILITY.old` 0.6 → **0.7**. Standard: a per-tire `durability: 0.9` on `tireStandard`.
   The oem family also covers springs and brakes, so the family value stays 1. Sport stays **0.8**.
7. **Bigger shelves** (owner: "increase slots to 6 and on average they should carry ~3 items. it feels like
   they carry about 2 right now"). `SHELF_SLOTS` 4 → **6**. To average 3 rotating items, `P_FILL`
   0.06 → **0.037**. A slot is then filled half the time: mean shelf life 27 h, mean empty 1/0.037 ≈ 27 h.
   Today's 4 slots at 0.06 average 2.5. Keeping 0.06 with 6 slots would give 3.7. The ALWAYS rows come on
   top.
8. **A region-1 run takes ~12 days** (owner: "there is a lot of content i didnt engage with… i wouldnt mind
   the runs taking a little longer. maybe 12 days should be expected for a R1 run"). The run's length is
   the deeds gate: `campDeeds` 6 → **10** `[DEFAULT]`. The owner's one run made 6 deeds in 7 days; that's a
   single sample, so re-measure on the next playthrough. **The cost curve has to come down with it.**
   Prices now ride the day while pay is flat, and today's ×1.15/day table reaches 3.68× on day 12. A day's
   costs (1.5 × a base pay) would then be $27.60 against about $20 for two top jobs. Re-cut
   `dayTierTable` to **1.065^(d−1)**: day 7 = 1.46×, day 12 = 2.0× `[DEFAULT]`. At that rate, steady
   B-grade driving (two average jobs ≈ $17.80) still clears day 12's $15 of costs, and a run that dawdles
   to day 20 pays 3.3×.

## Reward categories (RULED 2026-11-05: "take it, with my edits" — built, see the work log)

Today each REWARDS row lists its own `pools` (giver types). That leaves big holes. Brakes, springs,
shocks, anti-roll bars, the radiator, the headlight, the engine and all camp gear are never a reward
anywhere. The doctor, tackle shop, office and school give no reward at all, so their jobs never carry a
bonus. Only Larry's house, the auto shop and the farm hand out more than a couple of parts.

Proposal: every rewardable item gets one **category**, and every giver type lists the **categories** it
gives. An item is eligible at a giver when its category is on that giver's list. Its rank gate comes from
its `rarity` (common B–A, uncommon A–S, rare S) unless the row overrides it. `minDay` is the only other
per-item knob (the helical LSD's 3). Adding a new part makes it a reward everywhere its category goes,
with no pool edits.

| Category | Items |
|---|---|
| tires | tires, wheels, the mounted spare, plug kit, compressor |
| brakes | pads and shoes, every grade |
| suspension | springs, shocks, anti-roll bars, lift kit |
| engine | air filter, radiator, headlight, stop-leak, engine |
| drivetrain | the diffs |
| recovery | quick-jack, hi-lift, zip ties, duct tape |
| fuel | emergency gas, jerry can |
| camp | bedroll, pads, air mattress, blanket, sleeping bag; **the tent, shade tarp, awning and cooking kit** (owner 11-06, camp-gear-source "camp + shelf": these four also go on the shop shelf, `STOCK_WEIGHT` + `ITEM_PRICE` `[DEFAULT]`) |
| food | meals, snacks, the dinner invitation |
| drink | coffee, energy drink |
| bed | rubber bed mat (and the bedliner when it exists) |

| Giver | Categories |
|---|---|
| auto shop | tires, brakes, suspension, engine, drivetrain, recovery |
| gas station | fuel, drink, food, engine, tires |
| stranded motorist | tires, recovery, fuel, engine |
| farm | tires, suspension, drivetrain, recovery, food, camp |
| work site | tires, suspension, recovery, bed |
| firewood yard | bed, recovery, camp |
| residence | food, camp, brakes, drivetrain |
| food vendor | food, drink |
| general store | food, drink, camp, recovery, fuel |
| doctor | drink, food |
| tackle shop | camp, food (fishing gear joins when it exists) |
| office | drink, food, engine |
| school | food, drink |
| Larry's house | everything |

## Acceptance

- [ ] A day-7 job quotes the same base and max as the same job on day 1. Parts, repairs, the tow and
      fuel cost the day-7 tier (2.31×). `test/economy.mjs` pins both.
- [ ] The pump, the cans and the map card all show the day's fuel price.
- [ ] Over N seeds, part rewards make up a clearly larger share of bonus offers than today (report the
      before/after share).
- [ ] Every shop always stocks the old tire and the air filter. The standard tire is back in the rotation.
- [ ] No `diffLSD` reward appears before day 3. The shelf still stocks it.
- [ ] The three tire durabilities are set (0.7 / 0.9 / 0.8).
- [ ] 6 slots; a headless census over N seeds × days averages ~3 rotating items per shop.
- [ ] `campDeeds` 10 and the re-cut cost curve; `test/economy.mjs` pins both.
- [ ] If the owner takes the categories: every giver type has at least one category, and every part and
      camp item is a reward somewhere. A census reports each giver's reward count before and after.
- [ ] The owner plays a run and confirms the wear feel, the economy and the run length.

## Work log

**2026-11-05, Lane B (feature/machine).** Items 1, 2, 4–8 built; item 3 half-built (the chance), its pick
waits on the owner's reward-cats call.

1. Pay locked. `terms().payTier = regionTier`; `dayTier` rides along for costs and the readout. The
   "1 a.m. buys tomorrow's rate" comment is gone; the economy.js header and `test/economy.mjs` match.
   The haul stock price follows pay, so a bundle is still a fixed share of the haul's base.
2. Fuel × day tier at the pump, to the cent (`main.js` `fuelStop.open`); the cans fill on the same
   counter. Nothing on the map shows a fuel price today, so there is no map card to change.
3. `BONUS_CHANCE` 0.40. Census over 300 boards on the real roster (`wip/feat-168/reward-census.mjs`,
   not a gate): bonuses 17.7 % → 27.8 % of offers (the givers with no rewards count in the total);
   parts stay 45 % of bonuses, so offers carrying a part go 8.0 % → 12.5 %. The share of parts
   AMONG bonuses only moves with the pick change (categories, or the ×3 fallback).
4. `ALWAYS = ['tireOld', 'airFilterStock', 'tirePlugKit']`; the standard tire rotates at weight 10. The
   plug kit's always-row has no condition, like a rolled item (it was about to be granted with `{cond: 1}`).
5. `diffLSD` carries `minDay: 3`; both bonus picks (giver and receiver) drop it for an offer born before
   day 3 (`dayAllows`, day from `bornH`). Gate: 0 early vs 70 from day 3 over 200 seeds; with the
   filter switched off, 398 early.
6. Tire durability: old 0.7 (family), standard 0.9 (its own), sport 0.8 (unchanged).
7. 6 slots, `P_FILL` 0.037: the gate measures 3.03 rotating items a shelf (estimate 3.08).
8. `campDeeds` 10; `dayTierTable` = 1.065^(d−1) to the cent (day 7 1.46, day 12 2.00, day 20 3.31,
   day 30 6.21). Gate: two B-line jobs ($17.83) clear day 12's costs ($15.00).

Notes for the owner:
- Acceptance 1 said "the day-7 tier (2.31×)"; that was the old curve. With item 8 it is 1.46×.
- The 2026-08-17 end target "a day-20 region-6 job pays $500–1500" leaned on the day tier (~4.6×).
  Pay by region alone gives $224 for that job. Regions are post-alpha (FEAT-28 / SM-4), so the gate
  now reports it instead of pinning it; `regionMult` wants a re-cut when regions land.
- A job accepted before this lands keeps the pay tier it froze at accept (day 7 → 2.31×), once.

**2026-11-06, Lane B — item 3's pick: reward categories, as ruled.** Owner, reward-cats: "good base. leave
room for some unlikely pulls i.e. residential has a low chance to give car parts \"i happened to find this
in my garage\", etc. maybe tackle, office, schoole each can have rare rewards too (school lunch?)".
camp-gear-source (11-06): "camp + shelf".

- Every REWARDS row carries a `cat`; `pools` is gone. `REWARD_CATS` (data/offers.js) lists each giver
  type's categories. Every carried part WITHOUT a row is a reward with no row: `REWARD_LIST`
  (src/offer-board.js) adds it under its slot's category (`PART_REWARD_CAT`) at its rarity's gates
  (`RARITY_GATES`: common B–A, uncommon A–S, rare S). The owner-ruled rows keep their own gates. 62 rewards
  (was 22).
- **Off-list pulls:** a giver may carry `rare` categories. `RARE_PULL` 0.1 `[DEFAULT]` of its bonuses draw
  from them instead (the bottom tenth of the bonus roll, so no new draw). Residence → tires, suspension,
  engine (the garage, the owner's). Tackle shop → recovery, fuel `[DEFAULT]`. Office → camp `[DEFAULT]`.
  School → its lunch. The receiver's half (FEAT-67) re-picks from the destination's ordinary categories only.
- **School lunch** (`schoolLunch`): NEW food, its own category `lunch`, so only the school (and Larry)
  hands it out. B–A, holds hunger 8 h (the packed lunch's), the packed lunch's bag icon, value $5 — all
  `[DEFAULT]`. Its desc is a placeholder: **the owner writes its words.**
- **Camp gear:** blanket, air mattress, shade tarp B–A; sleeping pad, quilt, sleeping bag, tent, awning,
  cooking kit A–S; deluxe pad S `[DEFAULT]`. The tent, tarp, awning and cooking kit are also shelf stock
  at weight 1 ("Rarely") for $15 / $6 / $12 / $15 `[DEFAULT]`. The bed layers are rewards only, weighted
  4 / 4 / 4 / 1 / 1 / 0.25 `[DEFAULT]`. **The bedroll is left out**: every run starts with one and the
  sleeping bag replaces it, so as a reward it is a dud.
- **The engine keeps its rarity's B–A** (at weight 0.25 it is about 1 % of the engine category). An
  S-only engine was the office's one S item, and gates draw evenly among the gates a giver has
  (GATE_WEIGHTS), so it came out as 23 % of the office's bonuses.
- Gates: `offer-board` +6 checks (every source has a category; every named category holds a reward;
  all 47 parts and camp items are a reward at a giver besides Larry; the doctor bonuses; 10.4 % of
  residence bonuses are garage parts; the school lunch only at the school). `shop-stock` and `inventory`
  read the category lists.

Census (`wip/feat-168/reward-census.mjs [<root>]`, 300 boards on the real roster, days 1–4; main vs this
branch; both at BONUS_CHANCE 0.40):

| Giver | Distinct items | Parts among its bonuses |
|---|---|---|
| auto shop | 16 → 38 | 77 % → 91 % |
| work site | 4 → 24 | 35 % → 81 % |
| gas station | 8 → 19 | 22 % → 60 % |
| stranded motorist | 6 → 19 | 75 % → 76 % |
| farm | 7 → 43 | 91 % → 65 % (food + camp joined) |
| residence | 4 → 41 | 66 % → 53 % (dinner leads; brakes are its parts) |
| firewood yard | 1 → 15 | 0 % (bed mat → camp gear + recovery) |
| general store | 2 → 19 | 0 % |
| office / school / tackle / doctor | 0 → 14 / 5 / 17 / 4 | office 34 % (engine bay) |

Overall: bonuses 27.8 % → 31.9 % of offers (the four silent givers now reward). Offers carrying a part
stay **12.5 % → 12.4 %**, against 8.0 % before FEAT-168. So the gain over the pre-pass game is the
chance (0.25 → 0.40); the categories add variety and move parts to the givers that should have them, but
the farm and residence lose part share to food and camp. Parts are 39 % of bonuses (was 45 %): camp gear
takes 13.7 %. If parts should rise further, the lever is the table (e.g. drop food from the farm).


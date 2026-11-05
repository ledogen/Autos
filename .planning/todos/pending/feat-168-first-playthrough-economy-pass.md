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
   rewards"). `BONUS_CHANCE` goes 0.25 → **0.40** `[DEFAULT]`, and `kind: 'part'` rewards weigh **×3** in
   the reward pick `[DEFAULT]`. Today's pick uses the shelf weights, so coffee and energy drinks
   (weight 10) crowd out parts.
4. **Guaranteed basics: the old tire and the air filter** (owner: "need tires to basically always be
   available to buy at one or the other service station since its a true need for players. maybe only
   old tires are guaranteed. same with the engine air filter... you basically will need the air filter by
   day 3 and its not a guaranteed spawn - not fun"). FEAT-165's `ALWAYS` becomes
   `['tireOld', 'airFilterStock']`. The standard tire goes back into the rotating slots at weight 10.
   Today an air filter is about 7 % of shelf fills, so a given shop has one in stock only ~17 % of the time.
5. **The LSD is a mission reward only from day 3** (owner: "i got an lsd on day 1 which felt great but was
   a little too early... lock its spawn behind day 3 or so as a mission reward. its ok if its expensive in
   shops before then"). The offer board drops `diffLSD` from the reward pool before day 3. The shelf keeps
   it on every day, at its price × the day tier. The clutch LSD (FEAT-166) is not gated.
6. **Tire wear** (owner: "old tire wears a little too fast. standard wears a little too slow").
   Old: `FAMILY_DURABILITY.old` 0.6 → **0.7**. Standard: a per-tire `durability: 0.85` on `tireStandard`.
   The oem family also covers springs and brakes, so the family value stays 1. Sport: 0.8 → **0.68**, which
   keeps the owner's "wears ×1.25" against the standard tire. All `[DEFAULT]`.

## Acceptance

- [ ] A day-7 job quotes the same base and max as the same job on day 1. Parts, repairs, the tow and
      fuel cost the day-7 tier (2.31×). `test/economy.mjs` pins both.
- [ ] The pump, the cans and the map card all show the day's fuel price.
- [ ] Over N seeds, part rewards make up a clearly larger share of bonus offers than today (report the
      before/after share).
- [ ] Every shop always stocks the old tire and the air filter. The standard tire is back in the rotation.
- [ ] No `diffLSD` reward appears before day 3. The shelf still stocks it.
- [ ] The three tire durabilities are set. The owner plays a run and confirms the wear feel and the economy.

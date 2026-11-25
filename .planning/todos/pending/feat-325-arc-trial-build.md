---
id: FEAT-325
type: feature
status: open
severity: major
opened: 2026-11-23
source: owner, 2026-11-23 — a three-part run arc, "maintenance days → upgrade days → boss"; the logged run showed no pull toward upgrades
relates: FEAT-201, FEAT-165, FEAT-168, FEAT-304, DEC-408, DEC-441, DEC-302, src/parts.js, src/jalopy.js, data/parts.js
---
lane: unplaced (prototype branch `proto/arc-trial`, worktree `/Users/ledogen/CodeShit/CarGame-arc`)

# FEAT-325: The arc trial — I4 jalopy, the V6 swap and power mods (first trial build)

## Next steps
Owner: play a story run on `proto/arc-trial` and log it. The orchestrator mints superseding records only if the trial is adopted. Nothing here lands on main.

## Summary
The first trial build of the "maintenance days → upgrade days → boss" arc. The run starts in a weaker truck: four old
tires, worn springs and shocks, a detuned four-cylinder. Every auto shop always sells the V6 as the boss-prep swap, and
seven power mods give the upgrade days something to buy. The ending is still the 5-mission expedition camp. The boss
("blasting run") is not in this build.

## Description

### The owner's rulings (2026-11-23), and what was built for each
1. "start with all 4 tires old", tires "around 50%" → `src/jalopy.js`: all four corners take `tireOld`, tire condition rolls **40–60 %**.
   Shocks and springs "roll at 30-50%" → **30–50 %**. The spare is unchanged (an old tire, 40–80 %).
2. "double the durability" of shocks and springs ("they're too fragile. they dont last long enough under sporty driving") →
   `src/damage.js`: `durDamper` 1.2e3 → **2.4e3**. Springs have no `durSpring`: a spring is priced per bump-stop event
   by the curve. Its `springBumpRefDmg` also prices the wheel's bend (BUG-160), so halving that number would halve
   wheel wear too. Instead a new `springDurability: 2` divides each spring event's cost inside `wear()`. That is the
   same divisor a part's family durability already uses. Net effect: every spring hit costs exactly half what it cost on main.
3. The run starts on the four-cylinder, detuned 10 % ("approved") → `engineI4` (`duratec23`) is fitted by the jalopy roll;
   peak **209 → 188.1 N·m**. The detune is `PARTS.engineI4.torqueX = 0.9`, a debug slider (Story · Parts → Engine &
   power mods). Engine sound follows `params.engine`, which the fit sets, so the I4's baked loops play.
4. The V6 ("The way the V6 drives right now is fantastic", unchanged) is the shop's swap: "The shop should always carry the
   v6 engine, it's the tried and true boss prep item" → `engineStock` (renamed in the UI to "3.0 L V6 engine") is an
   **ALWAYS** row at every auto shop, new, **$60** (× the day tier like every shelf price). It stays the stock part,
   so free roam and data/ranger.js keep the V6 bit-for-bit.
5. Tire prices: **Old $6, Standard $10, Sport $15, All-terrain $15**. "slightly reduce the frequency" of tires as mission
   rewards → a tire's reward weight × **`TIRE_REWARD_X = 0.75`** (data/offers.js) [DEFAULT]. The shelf's weights are untouched.
6. Power mods (all seven), "mods fit both engines. they also carry over if you upgrade the engine" → six new sockets
   (intake, exhaust, flywheel, cams, chip, forced induction). Each has a stock part (price 0, never sold). The engine's
   params are derived from the fitted map (`src/parts.js engineFor`), so swapping the engine keeps every mod.
7. The 6-good-deed gate (DEC-120) is unchanged.
8. Heavy-duty springs and shocks are unchanged.
9. (Added 2026-11-23 through the orchestrator.) Duct tape and zip ties are instant, everywhere. The owner said "We might
   want to make them instant use". Asked "boss only, or everywhere?", the owner answered "everywhere". In
   `src/recovery.js FIELD_REPAIR`, `hours` goes 0.25 → **0** for both. The repair effect is unchanged (+10 % / +20 %,
   never past REPAIR_CAP), and so are the uses per pack. The picker's button reads "Patch it" with no time on it.
   Stop-leak keeps its 15 min.

### The power-mod model (the simplest honest one)
Each mod carries a GAIN curve over rpm, `[[rpm, gain], …]`. It is read the same way the engine's own torque curve is
read: linear between the points, flat past the ends. The engine's wide-open-throttle curve is multiplied by
(1 + gain) at every rpm, and the mods compound. The modded curve is sampled on the engine's own points plus every
250 rpm. **No boost-lag model:** a turbo makes its gain the instant the rpm is there.

| Part | Effect | Price | Shelf weight | Reward |
|---|---|---|---|---|
| Intake | +0 % at 2000 rpm rising to +4 % at 4500 and up | $10 | 1 (Rarely) | A/S, engine category |
| Exhaust | +5 % everywhere | $15 | 1 | A/S |
| Light flywheel | engine inertia × 0.6, no power | $10 | 1 | A/S |
| Cams | −3 % at 2500 and below, rising to +6 % at 4000 and up | $15 | 1 | A/S |
| Chip tune | +3 % everywhere | $10 | 1 | A/S |
| Turbo | +0 % at 1500, rising to +25 % at 3000 and up | $60 [DEFAULT] | reward only | S only, weight 0.25 (Hardly ever) |
| Supercharger | +20 % everywhere | $60 [DEFAULT] | reward only | S only, weight 0.25 |
| 3.0 L V6 engine | the Vulcan, unchanged | $60 | ALWAYS row | never |
| 2.3 L four-cylinder engine | the Duratec × 0.9 | $30 [DEFAULT] (sell-back value) | never | never |

Every number above is a debug slider (Story · Parts (SM-3) → Engine & power mods (FEAT-325)).
- **The light flywheel only does something with the manual gearbox.** The automatics' engine speed follows the converter
  and has no inertia state of its own (`engineRpmLag` is 0), so with the default 4R44E it is a part with no effect.
- One forced-induction socket: a turbo OR a supercharger, never both.
- The first three prices follow "reduce costs by $5 for each" ($15/$20/$15 drafts → $10/$15/$10). Cams and chip are
  "same ballpark". The turbo and supercharger prices matter only to the reward-price window (DEC-204). At $60, a turbo
  fits only S cards whose top figure is about $23–43. If the owner's log shows none, cut their price.
- The engines never appear as rewards: stock weight 0 now means "never a reward" (src/offer-board.js REWARD_LIST).

### Numbers (headless: test/drivetrain-climb's flat plane and contact model, the stock 4R44E automatic, full throttle from rest)
The script is `wip/feat-325/accel.mjs` (outside src/; copied into the worktree's git-invisible wip/).

| Engine + mods | Peak torque | 0–25 m/s, new standard tires | 0–60 mph, new standard | 0–60 mph, old tires at 50 % |
|---|---|---|---|---|
| I4 detuned (the jalopy) | 188.1 N·m | 10.38 s | 11.68 s | 12.02 s |
| I4 + intake/exhaust/chip/cams | 220.8 N·m | 9.18 s | 10.22 s | 10.57 s |
| I4 + the four + turbo | 276.0 N·m | 7.85 s | 8.63 s | 9.35 s |
| V6 (stock) | 250.0 N·m | 8.57 s | 9.50 s | 10.17 s |
| V6 + intake/exhaust/chip/cams | 291.8 N·m | 7.88 s | 8.65 s | 9.45 s |
| V6 + turbo | 312.5 N·m | 7.65 s | 8.38 s | 9.23 s |
| V6 + the four + turbo | 364.8 N·m | 7.30 s | 7.92 s | 8.80 s |
| V6 + the four + supercharger | 350.2 N·m | 7.40 s | 8.03 s | 8.87 s |

"starts to overwhelm standard tires": every configuration spins the rears at a full-throttle launch, the stock V6
included. The gain flattens fast. The four bolt-ons buy 0.85 s on the V6, but the turbo on top buys only 0.7 s more for
+73 N·m. Old tires cost the stock V6 0.67 s and the fully stacked V6 0.88 s, against 0.34 s for the jalopy I4. So
traction, not torque, is the V6's ceiling. These are straight-line WOT numbers. A cornering or a hill check is not done.

### The deeds in the jalopy (ruling 7)
Not proven by a drive. Estimate: at converter stall in 1st gear the I4 puts about 188 × 2.47 × 3.73 × ~2 ≈ 3.5 kN·m on
the axle. That is about 9.4 kN at the tire, which is enough for roughly a 45 % grade with a 2 t laden truck. Pars are
set from road geometry. A slower truck (0–60 mph in 11.7 s against 9.5 s) may lose some rank on pace. The owner's log
will show it.

### What this build contradicts (listed, not edited; the orchestrator supersedes only if the trial is adopted)
- **DEC-408**: the standard and the old tire each about 5–6 % of item rewards. The tire reward weight × 0.75 lowers
  both shares, and the new tire prices move tires inside the reward-price window.
- **DEC-441**: "a little longer", with no number until FEAT-304 answers. Here the dampers last ×2 (and so do the springs).
- **DEC-302**: "in the alpha they [top parts] do not drop", and "an auto shop stocks the top parts". The turbo and
  supercharger are S-rank rewards only and never on a shelf.
- **FEAT-201** (ticket): "only one old tire and it's in the front". Now all four tires are old.
- **FEAT-165 / the items setup prices** (ticket): Old $8, Standard $18, Sport $20, All-terrain $25.
- **FEAT-168** (ticket): "every part is a reward at some giver". The two engines are not.
- **The jalopy ranges of 2026-10-21** (src/jalopy.js, no record): tire 40–80 %, springs 50–85 %, shocks 40–80 %.
- **items.md §7 (owner, 2026-10-20: duct tape "15 min per use")** and items.md's rule that "Zip ties, duct tape and
  stop-leak each cost 15 min". No decision record pins the time. DEC-128 (zip ties do not mend the radiator) still holds.
- **The engine-bay note of 2026-10-22** (data/parts.js): the stock engine was "Stock only for now". The I4 is now a part,
  and the V6 moved from a rolled shelf slot at weight 0.25 to an ALWAYS row.

### Not built
The boss ("blasting run"), a recommended-equipment card, instant heal items, a liquid load, any boost-lag or turbo-heat
model, the mods' own thumbnails (they show the engine's), and mods in the debug Drivetrain panel's engine selector (that
selector still swaps the raw engine and bypasses the parts, as on main).

### Placeholders awaiting the owner's words
Part names: "3.0 L V6 engine", "2.3 L four-cylinder engine", "Intake", "Exhaust", "Light flywheel", "Cams",
"Chip tune", "Turbo", "Supercharger", and the stock rows "Stock intake", "Stock exhaust", "Stock flywheel",
"Stock cams", "Stock tune", "No forced induction". Socket names: "Intake", "Exhaust", "Flywheel", "Cams", "Engine tune",
"Forced induction". The maintenance tree node "Power mods" (under Engine and Cooling). Every one-line description in
data/parts.js for those parts. The V6 keeps main's description ("The factory six, on a pallet. A long day to swap.").

## Tracker
- [x] Jalopy: four old tires at 40–60 %, springs and shocks at 30–50 %, the detuned I4 fitted
- [x] Dampers and springs last twice as long (durDamper ×2; springDurability 2)
- [x] The V6 is an ALWAYS row at $60; the engine is a fitted part a save restores
- [x] Tire prices 6 / 10 / 15 / 15; tire reward weight × 0.75
- [x] Seven power mods with debug sliders, carried over an engine swap
- [x] Gates updated to pin the trial (jalopy, parts, shop-stock, offer-board, service, damage-bumpstop)
- [x] Duct tape and zip ties are instant (no time cost), the repair effect unchanged
- [ ] The owner plays and logs a run on the branch

## Decisions
- 2026-11-23, owner: the eight rulings above, in the owner's words where quoted. Prototype only; the standing records stand on main.

## Open questions
- Is the light flywheel meant for the automatic too? With the 4R44E it does nothing (see above).
- Turbo and supercharger price ($60 [DEFAULT]): the reward window decides how often they can drop at all.
- `TIRE_REWARD_X` 0.75 [DEFAULT]: is that "slightly"?

## Files
`data/parts.js` · `data/offers.js` · `data/shop-stock.js` · `data/stock-weights.js` · `src/parts.js` · `src/jalopy.js` ·
`src/damage.js` · `src/offer-board.js` · `src/service-screen.js` · `src/recovery.js` · `src/main.js` (the patch button) · `data/items.js` · `test/parts.mjs` · `test/jalopy.mjs` · `test/shop-stock.mjs` ·
`test/offer-board.mjs` · `test/service.mjs` · `test/damage-bumpstop.mjs` · `test/recovery.mjs`

## Log
- 2026-11-23: built on `proto/arc-trial` (6a53e12d, 1a9b74fa, …). The parts gate pins a mod carried over the I4 → V6 swap
  and a putTruck/loadTruck round-trip of the engine and mods. Not verified by a drive.
- 2026-11-24 evening, owner in chat while playing :8005: "always stock standard instead of old". data/shop-stock.js ALWAYS: tireOld → tireStandard; the old tire is now a mission reward only (it stays REWARD_ONLY at weight 30). shop-stock gate ALL OK. Contradicts DEC-408 (the old tire always on the shelf, the standard tire rotates) for the trial only; a record is written if the trial's numbers are kept.
- 2026-11-24 night, owner after run autos-run-3996330376 (ended broke on day 5 after a flip, $0.80): "a lot of the tire replacement cost is from the labor. we should reduce it so a tire change is like $3 in labor or so. swapping corners is like $1" → HUB $1 → $0.50, BEAD $2 → $1 (loose tire 2 hub + 2 bead = $3; a mounted tire or a corner swap 2 hub = $1). "reduce standard tire to $8" → tireStandard 10 → 8. "the auto shop should stock all basic consumables so stock pads and shoes" → ALWAYS gains brakesFrontStd, brakesRearStd. Gates service, shop-stock, parts, inventory, recovery ALL OK. STILL OWED from the same note, amounts not given: a further cut to the air filter and oil change; beans nerfed a little and groceries buffed; the shop always sells the next pack tier up from the base Pack.
- 2026-11-24 night, owner: "ah yes also reduce tire wear by 25%" → src/damage.js durTire 19260 → 25680 (the slip-wear rate × 0.75; the one constant every tire goes through; flat-tire wear untouched). On top of FEAT-284's × 1.2 on main.
- 2026-11-24 night, owner answered the orchestrator's four proposals ("1.yes 2. yes 3. rucksack, auto store. 4. yes."): (1) air filter 3.5 → 2.5, oil change 6 → 4. (2) heated beans 6 → 5 h, cooked groceries 10 → 12 h; the proposal said "prices alone", but that broke DEC-407 (groceries at $0.208 an hour is under the owner's band floor $0.245; beans at $0.30 are no longer the cheapest hour), so prices follow: beans 1.5 → 1.25, groceries 2.5 → 2.95. (3) the Rucksack is an ALWAYS row of the auto shop, $20 (DEC-487's price from main). (4) worn-suspension alerts: slots w15..w18, front/rear springs and shocks, at 50 % and 30 % like the filter and oil (src/main.js _MACHINE_WORD; tools/run-log-summary.mjs alertTrack). Words [DEFAULT]. Narrows FEAT-216's "spring damage stays sound-only" for the trial. Gates inventory, shop-stock, service, parts, run-log ALL OK; main.js `node --check` only (not driven in a browser).

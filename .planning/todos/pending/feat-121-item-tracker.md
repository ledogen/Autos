---
id: FEAT-121
type: feature
status: open
severity: minor
opened: 2026-10-16
source: owner, 2026-10-16 — "I'd like to be able to see every item that we intend to add… filter by
  items that require building custom effects… at a glance what all I have to build."
relates: FEAT-122 (inventory), FEAT-104 (storefronts), FEAT-66 (camp gear render), FEAT-115 (bed
  upgrades), FEAT-116 (cargo protection), FEAT-112 (load-rating parts), FEAT-67 (reward grants)
---

# FEAT-121: Item tracker — every item we intend to add, and what each one costs to build

**This ticket is the item tracker's data.** `npm run dash` → **Items** reads it live: each `##` below
is a category, each `###` is one item, and the line under the heading is
`status: … · design: … · build: … · needs: … · where: …`. Keep that shape when editing.

**`items.md` is the design catalog and still wins on what an item *is*.** This ticket is the build
burn-down: what each item needs before it is in the game. Add a row here when an item lands in
items.md; cut it here (`status: cut`) when items.md strikes it.

## How to read

- **status** — build state: `todo` · `wip` · `shipped` · `cut`.
- **design** — items.md's status: `ratified` · `proposed` · `idea` · `implied` (a ratified mechanic
  needs it, nobody specified it) · `blocked` (waits on a system that doesn't exist) · `kit` (starting
  kit, already decided).
- **build** — what has to be made, beyond the inventory row and a 2D icon every item gets:
  - `effect` — **new gameplay code**: the thing the item does does not exist yet.
  - `param` — swaps a value the physics already reads (`data/ranger.js`, bed friction). No new code
    beyond the swap.
  - `gate` — the effect already ships; owning the item turns it on.
  - `model` — a `.glb`, because the item is visible (camp pad, bed, bolted on the truck).
- **needs** — a system that must exist first. `hunger` (items.md §1d), `quick slots` (§1c — keys
  1–4), `spoilage` (§1b), `timed effects` (§1a), `fishing` (FEAT-37), `hazards` (FEAT-26/27), `surfaces` (FEAT-38 per-surface μ), `cuts` (FEAT-52), `spirits` (spirits-and-pacts.md), `bed parts`
  (FEAT-115), `cargo protection` (FEAT-116), `load verdicts` (FEAT-112), `camp render` (FEAT-66).
  **Every item needs the inventory (FEAT-122), so it is not listed.**
- **where** — how the player gets it. Storefronts use the POI type id from `src/poi.js`:
  `generalStore` · `gasStation` · `autoShop` · `foodVendor` · `tackleShop`. Otherwise `reward` (an
  offer's bonus item, `data/offers.js` REWARDS), `found`, `kit` (starting kit), `spirit`, `caught`,
  `mission`. **Filter by a storefront to see its stock list** (FEAT-104).

**Not items, so not here:** fuel at the pump and repairs at the auto shop are storefront *services*
(FEAT-104); brands and durability tiers (items.md §3d) are a modifier on every part, not a row of
their own; cargo is `cargo.md`; story keys are knowledge; the campfire spawns to mark camp (only the
cooking kit modifies it).

## Food & drink

### Coffee
status: shipped · design: ratified · build: effect · needs: quick slots · where: foodVendor, generalStore, gasStation, reward
In the inventory with its thumbnail; auto-binds to a quick key and drinks on the press (FEAT-122). Sold nowhere yet: reward only until FEAT-104.
Energy now, sleepy earlier tomorrow — a loan against tomorrow. The energy clock ships (`src/day.js`),
so the effect is a debt term on it. Already a REWARDS id (`coffee`), grant stubbed.
**Ruled 2026-10-20:** +5 h / −2 h (`src/day.js`, was −3), $3, reward from the food vendor and gas
station (C–B), never found.

### Energy drink
status: todo · design: ratified · build: effect · needs: quick slots · where: gasStation, generalStore, reward
**Ruled 2026-10-20:** +5 h now, a crash of −2.5 h four hours later. $4. Reward from the gas station
and general store (C–B), never found.
Coffee's short, steep twin: a bigger hit and the crash comes the same day. Must carry a debt or it is
free alertness (fish's job).

### Chili dog
status: todo · design: ratified · build: effect · needs: hunger · where: foodVendor, reward
Already a REWARDS id (`chiliDog`, kind food). A meal: resets the hunger clock.
**Ruled 2026-10-20:** a plain meal that holds hunger 10 h. $5. Food vendor only (B–A), never found.
Spoils in 16 h (2026-10-21). Flavor: "Kinda gross" (owner, 2026-10-22).

### Dinner meal
status: todo · design: ratified · build: effect · needs: hunger · where: foodVendor, reward
Renamed from diner meal (owner, 2026-10-21). One generic sit-down meal, a menu item at the food
vendor: holds hunger 8 h, 30 min to eat, $5–10, eat-in only, never found. Flavor: "A hearty meal.
Dine in only" (owner, 2026-10-22). **As a reward it is a dinner invitation** (owner, 2026-10-22): a C–B
reward from residences, the food vendor and farms — the customer asks you to join them for dinner;
optional, 30 min, and you are fully fed. Needs its own effect on the delivery card.

### Burger
status: todo · design: ratified · build: effect · needs: hunger · where: foodVendor, reward
The standard meal, its own item (owner, 2026-10-21): holds hunger ~8 h, so two cover a waking day.
Spoils in 16 h; $5; a C–B reward from the food vendor; never found (2026-10-21). Flavor: "The
classic" (owner, 2026-10-22).

### Packed lunch
status: todo · design: ratified · build: effect · needs: hunger, spoilage · where: reward
Never sold (owner, 2026-10-21): a bonus item from residences, farms and the food vendor (B–A), worth
$6. Holds hunger 8 h; fresh 24 h. Never found. Flavor: "Homemade!" (owner, 2026-10-22).

### Groceries
status: todo · design: ratified · build: effect · needs: hunger, spoilage, camp render · where: generalStore, farm, reward
A delayed meal (owner, 2026-10-20): bought, carried, cooked into a meal at camp — only with the
cooking kit. Still on the spoilage clock. Ruled 2026-10-21: one meal a bag, holds 10 h, +30 min to cook,
evening or morning; fresh 24 h, and the cooler slows them (×1/6); no kit bonus on top. $5 at the general
store and farms (a farm sells for the first time); a farm and general-store reward (B–A); never found.
Flavor: "Fresh and goes together easy" (owner, 2026-10-22).

### Potato
status: todo · design: ratified · build: effect · needs: hunger · where: generalStore, reward
New (owner, 2026-10-21). Inedible raw; cooked on the campfire — the only food you buy that needs no
cooking kit — it is a decent meal. Sold at the general store; a farm reward. **Ruled 2026-10-22:**
holds hunger 4 h; +30 min to cook; raw never spoils, cooked keeps 24 h; the cooking kit's food bonus
applies; stacks 5. Under $5; C–B; never found. Fish cooks on the campfire too. Flavor: "Potato".

### Bag of peanuts
status: todo · design: ratified · build: effect · needs: hunger · where: gasStation, reward, found
A gas-station snack (split from one row, owner 2026-10-21). Holds hunger 3 h, stacks 3. Under $5;
a C–B reward from the gas station and general store; less rare as a find than the others; found roadside near gas stations, rarely. All food can be
eaten while driving. Flavor: "Mmm, salty" (owner, 2026-10-22).

### Gummy worms
status: todo · design: ratified · build: effect · needs: hunger · where: gasStation, reward, found
A gas-station snack (split from one row, owner 2026-10-21). Holds hunger 2 h, stacks 5. Under $5;
a C–B reward from the gas station and general store; found roadside near gas stations, rarely. All food can be
eaten while driving. Flavor: "Only a couple blue ones" (owner, 2026-10-22).

### Spicy chips
status: todo · design: ratified · build: effect · needs: hunger · where: gasStation, reward, found
A gas-station snack (split from one row, owner 2026-10-21). Holds hunger 3 h, stacks 3. Under $5;
a C–B reward from the gas station; found roadside near gas stations, rarely. All food can be
eaten while driving. Flavor: "Almost too hot" (owner, 2026-10-22).

### Candy bar
status: todo · design: ratified · build: effect · needs: hunger · where: gasStation, reward, found
A gas-station snack (split from one row, owner 2026-10-21). Holds hunger 3 h, stacks 4. Under $5;
a C–B reward from the gas station; found roadside near gas stations, rarely. All food can be
eaten while driving. Flavor: "A bit melty" (owner, 2026-10-22).

### Salmon
status: todo · design: proposed · build: effect, model · needs: fishing, spoilage · where: caught
A fish species (owner, 2026-10-21 — fish split into four). Alertness that is not repaid; ~6 h fresh
uncooled, ~36 h in the cooler. Species carry different effects — which, is open.

### Rainbow trout
status: todo · design: proposed · build: effect, model · needs: fishing, spoilage · where: caught
A fish species (owner, 2026-10-21 — fish split into four). Alertness that is not repaid; ~6 h fresh
uncooled, ~36 h in the cooler. Species carry different effects — which, is open.

### Brown trout
status: todo · design: proposed · build: effect, model · needs: fishing, spoilage · where: caught
A fish species (owner, 2026-10-21 — fish split into four). Alertness that is not repaid; ~6 h fresh
uncooled, ~36 h in the cooler. Species carry different effects — which, is open.

### Catfish
status: todo · design: proposed · build: effect, model · needs: fishing, spoilage · where: caught
A fish species (owner, 2026-10-21 — fish split into four). Alertness that is not repaid; ~6 h fresh
uncooled, ~36 h in the cooler. Species carry different effects — which, is open.

## Consumables

### Spare tire
status: wip · design: ratified · build: effect · where: autoShop, reward, found
Fitting it is a 2 h timeskip that clears the flat (owner, 2026-10-22 — supersedes 90 min, 2026-10-20);
the compressor takes 30 min off and the quick-jack 1 h, and they stack. Real mass all the time. Already a REWARDS id
(`spareTire`). Flats ship (`flat[]`, FEAT-94). **Ruled 2026-10-21:** self-contained (factory jack always
aboard), full-size only; worn (50–80%, ~$15) and new (~$25) variants in different pools; auto shop;
reward from the auto shop and stranded motorist (A–S); rare roadside find. The fit (`use: 'spare'`) is
built on feature/parts, not merged. **An ordinary inventory part, one slot** (owner, 2026-10-21: parts go
in the inventory, never the bed). The swapped-off pair goes into the slot the spare left, as a flat
spare (tire id + both wears); a plug kit or the shop restores it; the shop can swap any mounted pair per
corner. Jalopies start with one 60% of the time, at 40–80%. Flavor: "This could help out in a pinch"
(owner, 2026-10-22). The owner's world-drop / proximity-inventory idea is FEAT-143 (world items +
proximity inventory, in progress on feature/stranded-spare).

### Tire plug kit
status: wip · design: ratified · build: effect · where: autoShop, reward, found
Renamed from tire patches (owner, 2026-10-21). In ITEMS as `tirePlugKit` (`use: 'plug'`) with its
thumbnail and a REWARDS row (auto shop, gas station, work site; B–A). One plug per kit, $5–10, rare
roadside find. It fixes the hole and restores no condition. The whole repair, plugging and
inflating, is 2 h by hand (bike pump) or 30 min with the compressor (owner, 2026-10-21). **The effect is built on feature/parts (08baccc5, unmerged):** the buttons sit in the inventory's detail strip.
Flavor: "I hope I don't have to use this" (owner, 2026-10-22).

### Spare air filter
status: wip · design: ratified · build: effect · where: autoShop, reward, found
Sets the `airFilter` track in `src/damage.js` to the spare's own condition at the roadside, in 15 min.
Each spare carries a condition like the spare tire: new from the auto shop ($10), never great as a
roadside find. A reward from the auto shop and gas station (B–A). Ruled 2026-10-21. It is the
air filter part, `airFilterStock`, built to this row on feature/parts (f5fa9cf9, 2026-10-22): $10, "Fit it
— 15 min" from the inventory, the old filter comes off into the inventory with its own condition, and a
REWARDS row (auto shop, gas station; B–A). Icon `airFilter.png`.

### Zip ties
status: todo · design: ratified · build: effect · where: generalStore, autoShop, reward, found
Field repair, 10% on the `armor*` / `headlight*` tracks and the radiator. 5 per pack. 15 min per use;
holds for the run (2026-10-20). $5–10; an auto-shop reward (B–A); a rare roadside find (2026-10-21).
Flavor: "A mechanic's best friend" (owner, 2026-10-22).

### Duct tape
status: todo · design: ratified · build: effect · where: generalStore, reward, found
Field repair, 20% on body panels. 3 uses per roll. 15 min per use; holds for the run (2026-10-20). $5–10;
a reward from the auto shop, gas station and general store (B–A); a rare roadside find (2026-10-21).

### Coolant jug
status: cut · design: proposed · build: effect · where: autoShop, gasStation
Struck in items.md (owner, 2026-10-16): FEAT-51 has no coolant to top up — radiator condition is the
cooling capacity. Replaced by stop-leak.

### Stop-leak
status: todo · design: ratified · build: effect · where: autoShop, gasStation, reward
Field repair: restores 15% radiator condition (owner, 2026-10-16), never past 50%. Under FEAT-51 that
is cooling capacity directly — aimed at the overheat → power loss → engine wear chain. One use per
bottle; 15 min; holds for the run (2026-10-20). $5–10; a reward from both (B–A); never found (2026-10-21).
Flavor: "Maybe this will keep 'er going" (owner, 2026-10-22).

### Emergency gas
status: wip · design: ratified · build: effect, model · where: gasStation, reward
A 2 gal RotoPax, single-use — the mid-tier fuel reward (B–A). REWARDS id `emergencyGas` exists; granted into the inventory with its thumbnail (FEAT-122). Fuel shipped (FEAT-50, 2026-10-17); the pour itself is still unbuilt. Ruled 2026-10-21: parked only, a 10 min timeskip; $5–10; a gas-station and stranded-motorist reward (B–A); never found.
The pour sounds like a glug glug glug, same as the jerry can (owner, 2026-10-22; FEAT-120).

### Jerry can
status: todo · design: ratified · build: effect · where: gasStation, reward, found
New (owner, 2026-10-21): a refillable 5 gal can — pour it, refill it at any pump. A top-tier reward.
Shares the emergency-gas pour. **Ruled 2026-10-22:** parked, a 10 min pour; 18 kg full (14 kg of gas +
a 4 kg steel can); an A–S reward from the gas station; sold at the gas station, rarely, $30; a very
rare roadside find. The pour sounds like a glug glug glug (FEAT-120).

### Bubble wrap
status: todo · design: ratified · build: effect · needs: cargo protection · where: generalStore, reward
1 use, any fragile item: thresholds ×2 (FEAT-116). Spent by the job it protects; how it is put on is open
(the job card, or on the load in the bed). A reward from work sites and fragile jobs (A–S) (2026-10-21).
Under $5; never found (2026-10-22). Flavor: "Pop, pop, pop" (owner, 2026-10-22).

### Furniture pad
status: todo · design: ratified · build: effect · needs: cargo protection · where: generalStore, reward
3 uses, `furniture`-tagged items: thresholds ×1.3 and 25% less damage (FEAT-116; owner, 2026-10-22).
A use is spent when you take the job. $10 at the general store; a B–A reward from farms, work sites,
the general store, gas stations, the auto shop, and freight jobs; never found. Flavor: "Covered in
fiberglass for some reason".

### Heavy-duty pad
status: todo · design: ratified · build: effect · needs: cargo protection · where: reward
3 uses, any fragile item: 50% less damage (FEAT-116; owner, 2026-10-22). A use is spent when you take
the job. **Never sold:** an A–S reward from farms, work sites, gas stations, the auto shop, the general
store, and freight jobs (rare); worth $10–30; never found. Flavor: "Not very padded".

### Ice
status: todo · design: ratified · build: effect · needs: spoilage · where: gasStation, generalStore
The cooler's running cost (owner, 2026-10-21): a bag lasts 72 h, so the cooler is refilled every 3 days
(the Ice King's ice lasts 5 days). $5 at the gas station and the general store; never a reward; never
found (2026-10-22). Flavor: "Cold and wet".

### Dynamite
status: todo · design: blocked · build: effect · needs: hazards, cuts · where: found
Clears one hazard on one cut, once.

## Tools

### Bike pump
status: todo · design: ratified · build: effect · where: kit
Always in the truck, not bought, not in the inventory. Plug + pump is 2 h in all. The repair card's
*Pump the tire by hand* button carries its pictogram, `assets/items/bikePump.png` (2026-10-21).

### Compressor
status: wip · design: ratified · build: effect · where: autoShop, reward
Makes a plug repair 30 min in all instead of 2 h. In ITEMS as `compressor` (tool, 4 kg) with its
thumbnail (2026-10-21); owning it adds the *Inflate tire* button. **Ruled 2026-10-22:** it also takes
30 min off the 2 h spare change, stacking with the quick-jack. No engine needed; 4 kg. $20 (replaces
the shop session's $15 stand-in); sold at the auto shop, rarely; an A–S reward from the auto shop and
work sites (rare); never found.

### Quick-jack
status: todo · design: ratified · build: effect · where: autoShop, reward
Roadside lift. **Ruled 2026-10-22:** takes 1 h off changing a whole tire (the spare's 2 h fit), and
stacks with the compressor's 30 min. The spare does not need it — the factory jack is always in the
truck. It does not shorten a plug repair: "you don't need to jack to plug" (owner, 2026-10-22). $30; sold at the auto shop; an A–S reward from the auto shop and stranded motorists; never found.

### Hi-lift jack
status: todo · design: proposed · build: effect, model · where: autoShop, reward
Rights a rolled truck where it lies. **Ruled 2026-10-22:** usable on any roll the death check did not
end (the SM-INV-1 answer). It applies a roll torque for a set time (2–5 s) to a truck that is not on
its wheels, in the direction the player picks; live in the physics, not a timeskip; a cooldown stops
abuse; it will not flip the truck in every case. 13 kg. Sold at the auto shop; a reward from the auto
shop and stranded motorists. Open: rank gate, price, roadside find, torque and cooldown figures.

### Breaker bar
status: cut · design: implied · build: effect · where: autoShop
Cut by the owner (2026-10-22, the item setup page). Struck in items.md §2.

### Cooler
status: todo · design: ratified · build: effect, model · needs: spoilage · where: tackleShop, generalStore, reward, found
×1/6 spoilage rate: fish keeps ~36 h instead of ~6 h; holds 4 fish (owner, 2026-10-21). **Runs on ice,
refilled every 3 days** (Ice row). General store + tackle shop, $10–30; tackle-shop reward A–S; a
roadside find rarer than the common ones. Flavor: "Keeps stuff cold" (owner, 2026-10-22).

### Ice King
status: todo · design: ratified · build: effect, model · needs: spoilage · where: tackleShop, generalStore, reward
Renamed from better cooler (owner, 2026-10-22). ×1/8 spoilage rate: fish keeps ~48 h; its ice lasts 5
days. Both coolers can be carried. $30–100; sold at the tackle shop and general store, very rarely; an
S-only reward from the tackle shop and residences; never found. Open: how many fish it holds.

### Fishing gear
status: todo · design: implied · build: effect · needs: fishing · where: tackleShop
Required for the fishing minigame (FEAT-37). Proposed by the owner (2026-10-22, "prob"): three rods —
Basic, Advanced and Professional.

### Rubber bed mat
status: todo · design: ratified · build: param, model · where: autoShop, reward
Raises cargo-to-floor friction in the bed: stops sliding, not bouncing. The lesser bedliner: it grips
less, μ 0.30 (owner, 2026-10-22). $5–10 at the auto shop; a B–A reward from the firewood yard; never
found. Still needs an in-game visual.

### Chain
status: todo · design: ratified · build: effect, model · where: mission
The log drag's one-sided distance constraint. Open: carried item, or supplied by the mission?

### Chainsaw
status: todo · design: blocked · build: effect, model · where: autoShop
Not a general item — possibly a region-2 choice: tow the log *or* cut it.

### Cargo net
status: todo · design: blocked · build: effect, model · where: generalStore
Light items caught, heavy ones break through. Candidate physics: a drag field over the bed opening.

## Navigation

### Paper map
status: shipped · design: kit · where: kit
FEAT-16 (`M`). Listed so the navigation ladder reads whole.

### GPS unit
status: todo · design: ratified · build: gate, effect · where: autoShop, reward, found
FEAT-39's route overlay already ships; story mode boots with it off until the item is owned. Never
an ETA. **Owner, 2026-10-22: "it's a minimap."** No minimap exists in `src/`, hence `effect`. It shows
**alongside** the in-world chevrons, not instead of them (owner, 2026-10-22). Strictly per run; uncommon; $10–30; sold at
the auto shop, rarely; an A–S reward from the auto shop and stranded motorists. Roadside find: open.

### Destination beacon
status: todo · design: idea · build: effect · where: found, generalStore
A beam of light rising from the destination — bearing, not route. A sky shader that must respect
fog and night.

### Shortcut GPS
status: todo · design: ratified · build: effect · needs: cuts, spirits · where: found
FEAT-39's overlay applied to the cuts the Shortcut has revealed. Very rare.

### CB radio
status: todo · design: proposed · build: effect, model · needs: hazards · where: autoShop
Hazard reports on the Highway's roads (FEAT-119).

## Camp gear

### Bedroll
status: wip · design: kit · build: model · needs: camp render · where: kit
In the inventory, packed in the starter Pack, with its thumbnail (FEAT-122). The camp-render model is still owed.
The baseline sleeping item, no bonus. Fills one of the starter Pack's 2 slots.

### Air mattress
status: todo · design: ratified · build: effect, model · needs: camp render · where: generalStore
Sleeping item: +5% recovery rate. Swaps for the bedroll in its slot and in the render.

### Sleeping pad
status: todo · design: ratified · build: effect, model · needs: camp render · where: generalStore
Sleeping item: +10% recovery rate. Swaps for the bedroll.

### Deluxe sleeping pad
status: todo · design: ratified · build: effect, model · needs: camp render · where: generalStore
Sleeping item: +15% recovery rate, the best bed. Swaps for the bedroll.

### Blanket
status: todo · design: ratified · build: effect, model · needs: camp render · where: generalStore
Add-on, own slot, not required to sleep: +5% recovery rate, adding to the bed and the sleeping bag.

### Sleeping bag
status: todo · design: ratified · build: effect, model · needs: camp render · where: generalStore
Add-on, own slot, not required to sleep: +10% recovery rate, adding to the bed and the blanket.
Renders with the bed, not in place of it.
Camp render (owner, 2026-10-20): shown unrolled, corner unzipped and turned back; layered variants
for bag + blanket (and the other pairings) are owed so the stack looks natural. Pads likewise render
unrolled, which is why their thumbnails are unrolled inflatables.

### Tent
status: todo · design: idea · build: effect · needs: camp render · where: generalStore
A multiplier on the night (open: flat like the bag and blanket?). Model done (ASSET-23); placement is FEAT-66.

### Cot
status: todo · design: idea · build: effect, model · needs: camp render · where: generalStore
Vibe axis — fills part of the site's flatness deficit.

### Canopy / tarp
status: todo · design: idea · build: effect, model · needs: camp render · where: generalStore
Vibe axis — shade deficit. Model is ASSET-26.

### Binoculars
status: todo · design: idea · build: effect, model · where: generalStore, tackleShop
Vibe axis — view deficit (`1 − viewScore`). The cheapest camp row: its whole dependency chain ships.

### Shovel
status: todo · design: idea · build: effect · where: generalStore, reward, found
Renamed from camp shovel (owner, 2026-10-22). Raises `campGateUnevenM` (1.2 m → ~1.6 m, ≈11–15°).
Folded into the 30 min make-camp chore. $10–30 at the general store; a B–A reward from the general
store, farms and work sites; a rare roadside find (2026-10-22).

### Long-handled shovel
status: todo · design: idea · build: effect · where: generalStore, reward
Raises it to ~2.2 m (≈20°). Both shovels can be carried, no extra effect (2026-10-22). $10–30 at the
general store; an A–S reward from farms, work sites and the general store; never found.

### Cooking kit
status: todo · design: idea · build: effect · needs: camp render, hunger · where: generalStore
≈23 kg always carried; flat bonus to food effects; the only way to cook groceries (2026-10-20). Model is ASSET-25 (A-frame + Dutch oven).

## Backpacks

### Pack
status: wip · design: ratified · build: effect · needs: camp render · where: kit
In the inventory (FEAT-122): equipped at run start with the bedroll, pack/unpack/equip in the Tab screen, thumbnail. Reach is not wired to `campRoadEdgeM` yet — the starter's 40 m is today's tether, so it waits on a second pack.
The starter pack: 2 slots, the bedroll in one, one open. Reach 40 m (today's tether). The equipped pack must always hold a sleeping item.

### Daypack
status: todo · design: idea · build: effect · needs: camp render · where: generalStore
Few slots, far reach (cap 120 m). Holds the camp gear you bring, one item per slot, shovels included; sets `campRoadEdgeM` for the
night (items.md §2c). The walk is inside the 30 min make-camp chore.

### Duffel
status: todo · design: idea · build: effect · needs: camp render · where: generalStore
Many slots, barely past the shoulder. More kit on near ground.

### Rucksack
status: todo · design: ratified · build: effect · needs: camp render · where: generalStore
Between the Duffel and the Frame pack: fewer slots than the Duffel, less reach than the Frame pack.

### Frame pack
status: todo · design: idea · build: effect · needs: camp render · where: generalStore
Many slots and far reach — the "good at both" pack, priced to match.

## Vehicle upgrades

### Welded differential
status: wip · design: ratified · build: param · where: autoShop
Replaces the locker (owner, 2026-10-22): "You never go slow enough in my game to need a locker for
offroad purposes but I do want a silly locked diff option to show up occasionally and we already built
the part." The spider gears welded, both rear wheels always together. The locked-diff part on
feature/parts (`diffLocked`) is renamed; cheaper than the locker's $35. Shelf likelihood Sometimes.
Price, sources and rank gate open on the setup page. Icon `diff.png`.

### Limited-slip differential
status: todo · design: ratified · build: param · where: autoShop, reward, found
`rearDiffMode: 'lsd'` already exists in `data/ranger.js` (debug panel). The barn find. **Ruled
2026-10-22:** use the LSD already built — nothing new. A barn-find event; $30–100; sold at the auto
shop; an S-only reward from the auto shop, stranded motorists and residences, very rare.

### Power mods
status: todo · design: ratified · build: param · where: autoShop, reward
A worse car without the literacy — the cursed item nobody had to author. **Ruled 2026-10-22:** +3%
power per rung; the exhaust ladder is stock → sport → open headers → race (open headers are the
loudest and a little sketchy, not the most powerful). Added, figures open: cold-air intake, cams,
light flywheel, turbo, supercharger, chip tune, race ECU. Sold at the auto shop; a reward from the
auto shop, stranded motorists and residences. Rank gate, price and finds open.

### Tire compound
status: cut · design: proposed · build: param · where: autoShop
Replaced by the named tire types (Old / Standard / Sport / Off-road / LT), items.md §3g.

### Brake pads (per axle)
status: todo · design: proposed · build: param · where: autoShop
Pad grade per axle sets bias. **Pads are front-only; the rear axle has drum shoes** (owner, 2026-10-21) —
feature/parts already names its rear slot "Rear brake shoes". Icons: `pads.png` (front), `shoes.png` (rear).

### Sport anti-roll bars
status: todo · design: ratified · build: param · where: autoShop
`arbStiffness{Front,Rear}` 9500 / 6500 vs stock 5000 / none.

### Heavy-duty springs
status: todo · design: ratified · build: param · needs: load verdicts · where: autoShop
Raises the spring rating (FEAT-112). Harsher empty, less squat loaded.

### Heavy-duty dampers
status: todo · design: ratified · build: param · needs: load verdicts · where: autoShop
Raises the damper rating (FEAT-112).

### Sport springs
status: todo · design: proposed · build: param · where: autoShop
A sport suspension tier (owner, 2026-10-22), front and rear, §3d Sport character (wears faster).
Rate, ride height and load ratings open on the setup page. Icon `springs.png`.

### Sport shocks
status: todo · design: proposed · build: param · where: autoShop
The sport tier's shocks (owner, 2026-10-22), front and rear. Damping and load ratings open on the
setup page. Icon `dampers.png`.

### LT load-range-E tires
status: todo · design: ratified · build: param, effect · needs: load verdicts · where: autoShop
Raises the tire rating; overloaded, they shift down the puncture curve (the effect half).

### ABS / traction control
status: cut · design: proposed · build: effect · where: autoShop
Killed as items (owner, 2026-10-22): "these are assists available in the settings menu. not parts".
FEAT-57 still frames them as parts.

### Bedliner
status: todo · design: ratified · build: param, model · where: autoShop, reward
The mat's friction, done properly; never wears out. μ 0.60 (owner, 2026-10-22). $10–30 at the auto
shop, very rarely; an A–S reward from the firewood yard (haul jobs); never found. Still needs an
in-game visual.

### Extended bed
status: todo · design: ratified · build: effect, model · needs: bed parts · where: autoShop, reward
Long loads fit (FEAT-115).

### Flatbed
status: todo · design: ratified · build: effect, model · needs: bed parts · where: autoShop, reward
Wider deck, no sides — loose haul spills (FEAT-115).

### Stake bed
status: todo · design: ratified · build: effect, model · needs: bed parts · where: autoShop, reward
Bigger deck, stakes keep most of a loose load in (FEAT-115).

### Roof rack
status: todo · design: ratified · build: effect, model · needs: bed parts · where: autoShop, reward
A second space for long, light loads (FEAT-115).

### Light bar
status: todo · design: proposed · build: effect, model · where: autoShop, reward
See further at night (FEAT-115).

### Steel wheel
status: wip · design: ratified · build: param, model · where: autoShop, reward, found
Its own part (owner, 2026-10-21): wheels and tires are separate (items.md §3g). The stock wheel,
`wheelSteel` on feature/parts: one socket per corner (30 min), $8, 9 kg; a bent rim is its damage.
**Set 2026-10-22:** $5–10; a B–A reward from the auto shop, farms and residences; a rare roadside find.
Icon `wheel.png`. Model ticket exists (asset-steel-wheels).
Shop-mounted only: a flat at the roadside needs the spare, since there are no tools to seat a bead
(owner, 2026-10-21). Its desc must say it is just a rim.

### Skid plates
status: todo · design: idea · build: effect, model · needs: hazards · where: autoShop
§3c's "space for more" — counters the sharp-rock line.

### Stock engine
status: wip · design: proposed · build: param · where: autoShop
New part on feature/parts-shop (2026-10-22), `engineStock`: the engine bay had damage tracks and no part,
so exchange and the shelf had nothing to sell. A used stock 4.0 V6, 180 kg, 8 h to swap, $90 stand-in.
Icon `engine.png`. Owner, 2026-10-22: "This would make for a sweet freight delivery as well" — a
candidate row in cargo.md (Freight).

### Stock radiator
status: wip · design: proposed · build: param · where: autoShop
New part on feature/parts-shop (2026-10-22), `radiatorStock`: 7 kg, 1.5 h to swap, $22 stand-in. Icon
`radiator.png`, shared with the heavy-gauge radiator below.

### Headlight
status: wip · design: proposed · build: param · where: autoShop
New part on feature/parts-shop (2026-10-22), `headlightStock`: one unit, either side, 1.5 kg, 30 min to
swap, $4 stand-in. Icon `headlight.png`.

### Heavy-gauge radiator
status: todo · design: idea · build: param · where: autoShop
§3c's "space for more" — survives the front hit. (FEAT-51 shipped: radiator condition is the cooling capacity.)

### Old tires
status: todo · design: ratified · build: param · where: autoShop, reward, found
items.md §3g. The bottom rung: −10% grip on pavement and dirt (owner, 2026-10-22). They show up found
or in a junkyard (a rare roadside find), and the auto shop sells them, $5–10; a C–B reward from the
auto shop and farms.

### Standard tires
status: shipped · design: ratified · build: param · where: kit, autoShop, reward, found
items.md §3g. The tire the truck runs today (P235/75R15). A part of its own since 2026-10-21 (12 kg,
tire only; sold at the auto shop). **Set 2026-10-22:** $10–30; a B–A reward from the auto shop,
stranded motorists and farms; a rare roadside find. Shop-mounted only; every tire's
desc reads "Just a tire. Can't drive on it without a rim" (owner, 2026-10-21). When dirt lands it loses a tiny bit of dirt
grip against today's single value (FEAT-38).

### Sport tires
status: todo · design: proposed · build: param · where: autoShop, reward
items.md §3g. Better than standard on pavement, worse on dirt, wears out faster (§3d Sport): +10% /
−10%, wear ×1.25 (owner, 2026-10-22). $10–30 at the auto shop; an A–S reward from the auto shop and
stranded motorists. Roadside find: open.

### Off-road tires
status: todo · design: proposed · build: param · needs: surfaces · where: autoShop, reward
items.md §3g. Same pavement grip as standard, +15% on dirt (owner, 2026-10-22). Taller, wider,
heavier: clearance and taller gearing; fits without the lift. The dirt half waits on per-surface grip
(FEAT-38, `muScale` in `src/tire.js`). $10–30 at the auto shop; an A–S reward from farms, the auto
shop and work sites. Roadside find: open.

### Off-road suspension
status: todo · design: ratified · build: param · where: autoShop, reward
items.md §3g — the lift kit, 2 in (owner, 2026-10-22). $10–30 at the auto shop; a B–A reward from
work sites, the auto shop and farms; never found. Ride height + travel (`suspensionBodyOffset*`, `suspensionTravel*`,
`suspensionRestLength*`). Cost is emergent: higher CG, more roll, earlier rollover.

## Spirit gifts

### Host's charm
status: todo · design: proposed · build: effect · needs: spirits, quick slots · where: spirit
Timed damage reduction only (owner, 2026-10-22 — the invulnerability window is dropped). Never shown
as a number.

### Highway amulet
status: todo · design: idea · build: effect · needs: spirits · where: spirit
Carry banked camber onto roads for a while. ⚠ Reverses items.md §1a-H — owner's call.

### Confluence lure
status: todo · design: idea · build: effect · needs: spirits, fishing · where: spirit
A lure, or fords held down for a day.

## Oddments

### Radio tapes
status: todo · design: idea · where: found
No stat (owner, 2026-10-15). Story content only, if they survive.

## Acceptance

- Every live row in items.md has a row here; struck items are `cut`.
- The dashboard's Items tab shows them all with no parser warnings.

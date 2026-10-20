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
status: todo · design: proposed · build: effect · needs: hunger · where: foodVendor, reward
Already a REWARDS id (`chiliDog`, kind food). A meal: resets the hunger clock.
**Ruled 2026-10-20:** a plain meal that holds hunger 10 h. $5. Food vendor only (B–A), never found.

### Diner meal
status: todo · design: proposed · build: effect · needs: hunger, timed effects · where: foodVendor
A sit-down meal. Resets hunger; the carrier for "for the next 8 h" effects (a hearty breakfast holds
the clock longer, a greasy one makes you sleepy after).

### Packed lunch
status: todo · design: proposed · build: effect · needs: hunger, spoilage · where: generalStore
Resets hunger on the road. The natural first non-fish figure on the spoilage clock (turns by
afternoon).

### Gas-station snacks
status: todo · design: proposed · build: effect · needs: hunger, quick slots · where: gasStation
The quick-slot meal — eaten while driving. Smaller than a meal.

### Fish
status: todo · design: proposed · build: effect, model · needs: fishing, spoilage · where: caught
Alertness that is not repaid — *coffee is debt, fish is income*. ~4–5 h fresh uncooled. Whether
cooked fish carries timed effects is the owner's open call (items.md §1a).

## Consumables

### Spare tire
status: todo · design: implied · build: effect, model · where: autoShop, reward
Fitting it is a 90 min timeskip (owner, 2026-10-20) that clears the flat. Real mass all the time. Already a REWARDS id
(`spareTire`). Flats ship (`flat[]`, FEAT-94).

### Tire patches
status: todo · design: proposed · build: effect · where: autoShop, generalStore
Patching is a 30 min timeskip (2026-10-20). Fixes the puncture, restores no condition. Leaves the tire flat until re-inflated (bike pump 2 h,
compressor 30 min).

### Spare air filter
status: todo · design: implied · build: effect · where: autoShop
Resets the `airFilter` track in `src/damage.js` at the roadside.

### Zip ties
status: todo · design: proposed · build: effect · where: generalStore, autoShop
Field repair, ~10% on the `armor*` / `headlight*` tracks. Several per pack. 15 min per use; holds for the run (2026-10-20).

### Duct tape
status: todo · design: proposed · build: effect · where: generalStore
Field repair, ~25% on body panels. 15 min per use; holds for the run (2026-10-20).

### Coolant jug
status: cut · design: proposed · build: effect · where: autoShop, gasStation
Struck in items.md (owner, 2026-10-16): FEAT-51 has no coolant to top up — radiator condition is the
cooling capacity. Replaced by stop-leak.

### Stop-leak
status: todo · design: proposed · build: effect · where: autoShop, gasStation
Field repair: restores 15% radiator condition (owner, 2026-10-16). Under FEAT-51 that is cooling
capacity directly — aimed at the overheat → power loss → engine wear chain. 15 min; holds for the run
(2026-10-20).

### Emergency gas
status: wip · design: implied · build: effect, model · where: gasStation, reward
The jerry can: a 2 gal RotoPax, single-use. REWARDS id `emergencyGas` exists; granted into the inventory with its thumbnail (FEAT-122). Fuel shipped (FEAT-50, 2026-10-17); the pour itself is still unbuilt.

### Bubble wrap
status: todo · design: ratified · build: effect · needs: cargo protection · where: generalStore
1 use, any fragile item: high threshold increase (FEAT-116).

### Furniture pad
status: todo · design: ratified · build: effect · needs: cargo protection · where: generalStore
3 uses, `furniture`-tagged items: low threshold increase + low damage reduction (FEAT-116).

### Heavy-duty pad
status: todo · design: ratified · build: effect · needs: cargo protection · where: generalStore, autoShop
3 uses, any fragile item: medium damage reduction (FEAT-116).

### Ice
status: todo · design: idea · build: effect · needs: spoilage · where: gasStation, generalStore
One of three unruled candidates for the cooler's running cost (items.md §2). Only if the owner picks it.

### Dynamite
status: todo · design: blocked · build: effect · needs: hazards, cuts · where: found
Clears one hazard on one cut, once.

## Tools

### Bike pump
status: todo · design: proposed · build: effect · where: kit
Always in the truck, not bought. Re-inflates a patched tire: a 2 h timeskip.

### Compressor
status: todo · design: proposed · build: effect · where: autoShop
Re-inflates a patched tire in 30 min instead of 2 h. Worthless without patches.

### Quick-jack
status: todo · design: implied · build: effect · where: autoShop, found
Roadside lift that makes a spare usable. May be the hi-lift's other job — one tool, not two.

### Hi-lift jack
status: todo · design: proposed · build: effect, model · where: autoShop
Rights a rolled truck where it lies. ⚠ Needs the SM-INV-1 ruling on where "rolled" ends and
"crashed" begins.

### Breaker bar
status: todo · design: implied · build: effect · where: autoShop
Roadside wrenching, paired with the jack. Behaviour unspecified.

### Cooler
status: todo · design: idea · build: effect, model · needs: spoilage · where: tackleShop, generalStore
×0.2 spoilage rate: fish keeps ~24 h. Its cost (ice / bed volume / slot) is unruled.

### Better cooler
status: todo · design: idea · build: effect, model · needs: spoilage · where: tackleShop
×0.1: fish keeps ~48 h.

### Fishing gear
status: todo · design: implied · build: effect · needs: fishing · where: tackleShop
Required for the fishing minigame (FEAT-37).

### Rubber bed mat
status: todo · design: proposed · build: param, model · where: generalStore, autoShop
Raises cargo-to-floor friction in the bed: stops sliding, not bouncing. The lesser bedliner (grips
less or wears out — undecided).

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
status: todo · design: ratified · build: gate · where: generalStore, autoShop, found
FEAT-39's route overlay already ships; story mode boots with it off until the item is owned. Never
an ETA.

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

### Camp shovel
status: todo · design: idea · build: effect · where: generalStore
Raises `campGateUnevenM` (1.2 m → ~1.6 m, ≈11–15°). Folded into the 30 min make-camp chore.

### Long-handled shovel
status: todo · design: idea · build: effect · where: generalStore
Raises it to ~2.2 m (≈20°). Open: replaces the camp shovel or stacks?

### Cooking kit
status: todo · design: idea · build: effect · needs: camp render, hunger · where: generalStore
≈23 kg always carried; flat bonus to food effects. Model is ASSET-25 (A-frame + Dutch oven).

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

### Limited-slip differential
status: todo · design: ratified · build: param · where: autoShop, found
`rearDiffMode: 'lsd'` already exists in `data/ranger.js` (debug panel). The barn find.

### Power mods
status: todo · design: ratified · build: param · where: autoShop
A worse car without the literacy — the cursed item nobody had to author.

### Tire compound
status: cut · design: proposed · build: param · where: autoShop
Replaced by the named tire types (Old / Standard / Sport / Off-road / LT), items.md §3g.

### Brake pads (per axle)
status: todo · design: proposed · build: param · where: autoShop
Pad grade per axle sets bias.

### Sport anti-roll bars
status: todo · design: ratified · build: param · where: autoShop
`arbStiffness{Front,Rear}` 9500 / 6500 vs stock 5000 / none.

### Heavy-duty springs
status: todo · design: ratified · build: param · needs: load verdicts · where: autoShop
Raises the spring rating (FEAT-112). Harsher empty, less squat loaded.

### Heavy-duty dampers
status: todo · design: ratified · build: param · needs: load verdicts · where: autoShop
Raises the damper rating (FEAT-112).

### LT load-range-E tires
status: todo · design: ratified · build: param, effect · needs: load verdicts · where: autoShop
Raises the tire rating; overloaded, they shift down the puncture curve (the effect half).

### ABS / traction control
status: todo · design: proposed · build: effect · where: autoShop
FEAT-57.

### Bedliner
status: todo · design: proposed · build: param · where: autoShop
The mat's friction, done properly; never wears out.

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

### Steel wheels
status: todo · design: idea · build: param, model · where: autoShop
§3c's "space for more": mass and refinement out, survivability in. Model ticket exists
(asset-steel-wheels).

### Skid plates
status: todo · design: idea · build: effect, model · needs: hazards · where: autoShop
§3c's "space for more" — counters the sharp-rock line.

### Heavy-gauge radiator
status: todo · design: idea · build: param · where: autoShop
§3c's "space for more" — survives the front hit. (FEAT-51 shipped: radiator condition is the cooling capacity.)

### Old tires
status: todo · design: proposed · build: param · where: autoShop, found
items.md §3g. The bottom rung: worse than standard on pavement and dirt.

### Standard tires
status: shipped · design: ratified · build: param · where: kit
items.md §3g. The tire the truck runs today (P235/75R15). When dirt lands it loses a tiny bit of dirt
grip against today's single value (FEAT-38).

### Sport tires
status: todo · design: proposed · build: param · where: autoShop, reward
items.md §3g. Better than standard on pavement, worse on dirt, wears out faster (§3d Sport).

### Off-road tires
status: todo · design: proposed · build: param · needs: surfaces · where: autoShop, reward
items.md §3g. Same pavement grip as standard, best on dirt. Taller, wider, heavier: clearance and
taller gearing. The dirt half waits on per-surface grip (FEAT-38, `muScale` in `src/tire.js`).

### Off-road suspension
status: todo · design: proposed · build: param · where: autoShop, reward
items.md §3g — the lift kit. Ride height + travel (`suspensionBodyOffset*`, `suspensionTravel*`,
`suspensionRestLength*`). Cost is emergent: higher CG, more roll, earlier rollover.

## Spirit gifts

### Host's charm
status: todo · design: proposed · build: effect · needs: spirits, quick slots · where: spirit
Timed damage reduction or a short invulnerability window you trigger. Never shown as a number.

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

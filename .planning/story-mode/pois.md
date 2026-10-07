# Autos — Places: POI types and roadside spots

**Downstream of DESIGN.md and `missions.md`.** Where they disagree, those win. This is the list of
every place a job can start or end, and what each one gives and receives. It is the companion to
`cargo.md`: there, the cargo rows say *from → to* in these names. The dashboard's Places view
reads this file together with the live code.

**Live types are not listed here.** Their source of truth is the code. `POI_ROSTER` in
`src/poi.js` gives the type, count, model, siting and tags, and `SOURCES` in `data/offers.js` gives
the job types each one posts, its slots and its expiry. The dashboard reads both directly, so
nothing here can drift from them. When a planned type below lands in code, delete its row.

**Gives** lists the job types a place posts. **Receives** lists what can be delivered there: `any`
means any job may end there, and specific cargo is named when only that cargo makes sense. A place
that gives nothing still costs a pad, but it adds nothing to the job supply (see "Cycling jobs").

## Planned POI types

| Type | Status | Region | Gives | Receives | Tags | Model | Ticket |
|---|---|---|---|---|---|---|---|
| `farm` | planned (owner 2026-10-06) · additional class ×3 (2026-10-07) | any | freight, courier | canning jars, tractor keys, drums, tools (chainsaw, splitting axe, shovel) | farm | produce stall placeholder (ASSET-15), then the ASSET-65..67 composite, which needs a bigger pad than 14 × 8 m | FEAT-96, FEAT-98 |
| `workSite` | planned — **the job site**, required class (owner 2026-10-07) | any | courier (memo from the foreman); later the region boss | cones, cinder blocks, concrete bags, job box, workers | jobSite | placeholder, then ASSET-71 | FEAT-103 |
| `residence` | planned — additional class ×5 (owner 2026-10-07) | any | courier, fragile | any | residence | today's `missionGiver` pool (trailer home, etc.) | FEAT-98 |
| `office` | planned — additional class ×1 (owner 2026-10-07) | any | courier | keys to the office | office | placeholder, then ASSET-69 | FEAT-98 |
| `school` | planned — additional class ×1 (owner 2026-10-07) | any | courier | keys to the school | school | placeholder, then ASSET-73 | FEAT-98 |
| `doctor` | planned — additional class ×1 (owner 2026-10-07) | any | courier (prescriptions) | any | doctor | placeholder, then ASSET-70 | FEAT-98 |
| `strandedMotorist` | planned — additional class ×1 (owner 2026-10-07) | any | courier (a passenger to the shop), 0–1 jobs | — | motorist | ASSET-18 broken-down car (shipped), shown only while the job is open | FEAT-102 |
| `sawmill` | planned | R2 | haul (lumber), courier | any | haulYard | ASSET-11 | FEAT-91 |
| `quarry` | planned | R3 | haul (rocks), courier | any | haulYard | ASSET-35 | FEAT-91 |

## Roadside spots — destinations that are not POIs

These are spots on the road with a name, an offer-board destination and nothing else: no pad, no
model, no offers. Today they are half the destinations (`DEST_POI_CHANCE = 0.5` in
`data/offers.js`). The names are in `data/offer-names.js`.

| Spot | Form | Tags | Promises an object? | Status | Note |
|---|---|---|---|---|---|
| "Mile # pullout", "the turnaround", "the county line" … | landmark (`LANDMARKS`) | receives, empty | **no**: believably empty (owner 2026-09-26) | live | any job may end here |
| "the Hadley farm", "the Pruitt place" … | place (`[lastname] [PLACE_NOUNS]`) | receives, home | **yes**: a farm, ranch, dairy or quarry should be visible | live (the grammar is still proposed) | breaks the believably-empty rule for some nouns; see below |
| "the airport" | institution | receives, institution | **yes** | proposed | the airport x-ray machine |

**The tension, and the case for upgrading.** The believably-empty rule says a roadside name must not
promise an object that isn't there. Landmarks pass it. Institution names fail it: "the school" with
no school breaks the spell, as "the dead tractor" would. So do some place nouns, such as "the Hadley
quarry". Upgrading those names to **receive-only POIs** (with a pad and a model, giving nothing)
fixes the rule. It costs pads and models, and no job supply (see below). Landmarks can stay roadside
forever.

**Resolved 2026-10-07 (Places and Missions):** the school and the office are now POI classes (above),
and `farm`, `quarry` and `dairy` leave `PLACE_NOUNS` so no roadside name promises a farm that isn't
there (FEAT-99). The airport stays roadside for now.

## Places and Missions — POI classes and the job budget [OWNER, 2026-10-07]

> "Places and Missions" is the owner's name for this push. It replaces the 2026-09-29 "about 30
> places offering about 15 jobs" cycling proposal, which it settles.

**The idea.** Every POI is a **class**, and its tags drive what it gives, what it receives, which job
types it posts, the name forms on its card and (required classes only) a minimal shop. Everything
except the required classes is only a job giver and receiver for now.

### The roster, per region

| Group | Classes (count) | Jobs |
|---|---|---|
| **Required (9)** | general store · food vendor (`foodVendor`) · auto shop ×2 (`autoShop`) · gas station ×2 · tackle shop · job site (`workSite`) · haul yard (FEAT-91: splitting yard R1, sawmill R2, quarry R3) | food vendor 2–3 always; haul yard 2 always; job site hosts the region boss; the rest 0–2 from the budget |
| **Additional (12)** | residence ×5 · farm ×3 · office · school · doctor · stranded motorist | 0–2 each from the budget (motorist 0–1) |
| **Fixtures (R1)** | mom (`residence`, `mom`: you can sleep there, she receives) · Larry (`residence`, `larry`: always has a job, save his re-roll timer) | Larry 1 always |

Region 1 is therefore **23 POIs**. Two of each gas station and auto shop stay, as today; scaling the
counts with region size comes later. The gas station and tackle shop posting jobs **reverses** the
2026-09-26 "some stores are just stores" ruling.

### Job supply

- **Always on, outside the budget:** Larry 1, haul yard 2, food vendor 2–3, plus the bridge-site
  supply pickups in R2.
- **The budget:** about **12 live jobs**, shared by every 0–2 place (required shops and additional
  classes alike). When a budget job ends, its refill lands on a uniformly random eligible place
  (not locked, under its cap). The board then shows about 12 + 2–3 + 2 + 1 ≈ 17–18.
- **The lock rule (reverses 2026-09-27):** a completion **and** a cancel both lock the slot for a
  **fresh full expiry**, counted from that moment. Keeping the original timer let a player finish a
  job ten minutes before it expired and get a new one straight away.
- **Determinism (SM-INV-12) holds:** the board stays a pure function of (seed, POI list, clock,
  completion/cancel log). The budget couples places' timing to each other, which is the accepted cost.

### The job site and the bosses

The job site sits **on the region wall** (SM-INV-13: the gate is a place). Region unlock is a boss
battle, different per region: **R1 is the log drag**, **R2 is finishing the bridge**, a progress meter
filled by courier jobs (workers) and haul jobs (lumber, stone) delivered to the site. Hovering the
bridge site on the map reveals where supplies can be picked up. Until SM-4 opens, the job site is an
ordinary job place; the bosses and region **modifiers** (undefined yet) are SM-4 work.

### Names

Each class owns **several** name forms ("the Hadley place", "Hadley house", "Hadley's"…). The existing
names in `data/offer-names.js` are re-sorted into classes, and names without a person are added
("Bits & Bobs General Store"). The doctor has a single form; the school is "school" or "academy".

### Stranded motorist

The pad is permanent (worldgen); the broken-down car shows only while the motorist has a job open, so
an idle motorist pad is an empty lay-by. **Deferred, long-term:** after their job a motorist moves
somewhere else on the map.

### Pad supply — measured 2026-10-07

Full 2500 m story region around the canonical spawn, shipped params, headless:

| Seed | 11 | 90 | 3 | 31337 | 2024 | 42 | 777 | 6 |
|---|---|---|---|---|---|---|---|---|
| Viable pads | 41 | 43 | 44 | 44 | 45 | 48 | 51 | 54 |

A trial 23-slot roster filled **23/23** on the three sparsest seeds (11, 90, 3), each POI 200 m from
its nearest neighbour at minimum and 540–620 m at the median (straight line). So region 1 has room
for 18–31 more POIs. **Open, for later regions:** the map grows but gets sparser, so the POI count
and the job count must be re-derived together. The measure to use: how much better the best
two-job chain is than taking the nearest job each time — too few jobs and there is nothing to
choose, too many and a good job is always nearby; aim for the count where that gap is largest.

### Roadmap

| Step | Ticket |
|---|---|
| 0. Measure the pad supply | done (above) |
| 1. Classes, tags and the key rename | FEAT-98 |
| 2. Class name forms | FEAT-99 |
| 3. To-tags: destinations filtered by class | FEAT-100 |
| 4. Job supply: always-on sources, the budget, the lock rule | FEAT-101 |
| 5. Stranded motorist | FEAT-102 |
| 6. Job site POI (R1, on the wall) | FEAT-103 |
| 7. Minimal shop at the required classes | FEAT-104 |
| Placeholder-replacing models: school, office, doctor's office, job site | ASSET-73, ASSET-69..71 |
| Later, behind SM-4: bosses, region modifiers, motorist relocation, counts scaled to region size | — |

### Candidate classes — liked, not adopted (owner 2026-10-07: "ship something first")

| Class | Gives | Receives | Why it fits |
|---|---|---|---|
| Ranger station | courier (notices, a ranger to the trailhead) | maps, radio parts | FEAT-28's ranger reopens the trails |
| Campground / trailhead | courier (hikers back to their cars) | firewood, people | a natural sink for the R1 firewood |
| Feed & farm supply | haul (hay, feed) | produce | closes farm ↔ feed store ↔ general store |
| Scrapyard | freight (blocks, rims), demolition | wrecks, scrap | a parts source for SM-3 |
| Roadhouse / bar | courier (a patron home at night) | kegs, food | the tipsy passenger already exists |
| Church | courier (wedding, funeral) | flowers, a cake (fragile) | a fragile destination that matters |
| Post office | courier (parcels) | any | generic hub; competes with every giver |
| Motel | courier (guests to the trailhead) | linens, groceries | must NOT be sleepable — it would undercut camping |

Ranger station and campground first if any are adopted: each closes an existing loop.

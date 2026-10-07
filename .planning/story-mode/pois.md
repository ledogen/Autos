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
| `farm` | planned (owner 2026-10-06) | any | freight, courier | canning jars, tractor keys, drums | | produce stall placeholder (ASSET-15), then the ASSET-65..67 composite, which needs a bigger pad than 14 × 8 m | FEAT-96 |
| `workSite` | planned (owner 2026-10-06) | any | courier (memo from the foreman) | cones, cinder blocks, concrete bags, job box, workers | | none yet: needs an asset ticket | — |
| `sawmill` | planned | R2 | haul (lumber), courier | any | haulYard | ASSET-11 | FEAT-91 |
| `quarry` | planned | R3 | haul (rocks), courier | any | haulYard | ASSET-35 | FEAT-91 |
| `brokenDownCar` | proposed | any | courier (a passenger to the shop) | — | roadside | ASSET-18 (shipped) | missions.md (marked a POI mission provider 2026-08-11) |

## Roadside spots — destinations that are not POIs

These are spots on the road with a name, an offer-board destination and nothing else: no pad, no
model, no offers. Today they are half the destinations (`DEST_POI_CHANCE = 0.5` in
`data/offers.js`). The names are in `data/offer-names.js`.

| Spot | Form | Tags | Promises an object? | Status | Note |
|---|---|---|---|---|---|
| "Mile # pullout", "the turnaround", "the county line" … | landmark (`LANDMARKS`) | receives, empty | **no**: believably empty (owner 2026-09-26) | live | any job may end here |
| "the Hadley farm", "the Pruitt place" … | place (`[lastname] [PLACE_NOUNS]`) | receives, home | **yes**: a farm, ranch, dairy or quarry should be visible | live (the grammar is still proposed) | breaks the believably-empty rule for some nouns; see below |
| "the school" | institution | receives, institution | **yes** | proposed | keys to the school |
| "the office" | institution | receives, institution | **yes** | proposed | keys to the office |
| "the airport" | institution | receives, institution | **yes** | proposed | the airport x-ray machine |

**The tension, and the case for upgrading.** The believably-empty rule says a roadside name must not
promise an object that isn't there. Landmarks pass it. Institution names fail it: "the school" with
no school breaks the spell, as "the dead tractor" would. So do some place nouns, such as "the Hadley
quarry". Upgrading those names to **receive-only POIs** (with a pad and a model, giving nothing)
fixes the rule. It costs pads and models, and no job supply (see below). Landmarks can stay roadside
forever.

## Cycling jobs — about 30 places offering about 15 jobs [PROPOSED, owner's call]

**Today:** 15 POIs post up to **15 live offers**. Larry has 1 slot, two service shops have 1 each,
the burger joint 3, the general store 2, the firewood yard 2, and five mission givers 1 each. Mom's
house, the gas stations and the tackle shop post nothing. Every slot re-rolls when its expiry ends,
so the board is nearly always full.

**Target:** about 30 places, still about 15 live offers. On average, each giving place is open half
the time.

**Rule 1: receivers don't count.** Only places that *give* draw from the 15-job budget. A
receive-only POI (an upgraded school, office or airport) adds a destination and a pad, not an
offer. So "30 POIs" may be, for example, 20 givers and 10 receivers, and the cycling only has to
halve the rate for the givers.

**Rule 2: cycle each slot independently (recommended).** After an offer ends (it expires, or is
completed or cancelled), the slot sits **idle** for a seeded gap before it rolls again. Occupancy is
`p = expiry / (expiry + idle)`. Set the idle gap equal to the expiry and `p = 0.5`. With 30 one-slot
givers, the board then averages 15, with a standard deviation of √(30 × 0.5 × 0.5) ≈ 2.7. So it
usually shows 12–18. This is one new knob per source, `idleH`, which generalises the `minEmptyH`
Larry already has. The slot, expiry and cancel-lock model is unchanged, and each slot stays a pure
function of the seed.

**The alternative: a region budget.** Hold exactly 15 live offers. When one ends, a weighted draw
picks which place posts next, favouring places that have been quiet longest. The count is constant,
but it needs a global scheduler, and every place's offers then depend on every other place's
timing, so they are harder to reason about.

**What it buys:** a place that is dark this morning may have work tonight. That gives the visible
board something to plan against (missions.md, the job board, 2026-08-17: plot a chain a mission or
two ahead).

**The pad supply needs checking before committing to 30.** Seed 6 measured 43–46 viable pads in a
2500 m region (`src/poi.js`). Thirty POIs fit there with about 15 to spare, but sparse seeds weren't
measured. The roster rule is *relax the distance, never the count*, so a short pool shows up as a
warning and a smaller roster.

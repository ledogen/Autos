# Autos — Cargo master list

**Downstream of DESIGN.md, `missions.md` §3 and `items.md` §4.** Where they disagree, those win.
This file is the burn-down list. It names every thing a delivery can carry, grouped by delivery
type, and within each type tiered **early → late game** by how valuable or demanding the job is.
Owner brain-dump 2026-10-06, organised the same day.

Cheap, forgiving loads come early. Examples are mulch and topsoil for freight, or someone's ratty
old dining chairs for fragile. Valuable, demanding loads come late, such as a job box or a piano.
**Tiers are gated by region** (owner, 2026-10-06): R1 is early, R2 is mid, and R3 and beyond is
late. This is the same order the haul yards already follow.

The four delivery types (missions.md §3, amended 2026-10-06):

| Type | Rides | Scored on | Ticket | Needs a model? |
|---|---|---|---|---|
| **Courier** | in the cab | time vs par | FEAT-89 | **No** — text on the card only |
| **Haul** | in the bed, **loose** | time vs par × share still aboard | FEAT-88 | yes |
| **Freight** | in the bed, **strapped**, durable | time vs par; par and pay grow with mass | FEAT-96 | yes |
| **Fragile** | in the bed, **strapped** | (Base + tip) × cargo health | FEAT-97 | yes, except crate contents |

**From → to** (owner, 2026-10-06, option C): **blank means generic**, so any normal giver can post
it, to any destination. Only items that make sense for certain places are tagged. Names are the
place classes in `src/poi.js` (`generalStore`, `autoShop`, `foodVendor`, `gasStation`,
`tackleShop`, `firewoodYard`, `workSite` (the job site), `residence`, `farm`, `office`, `school`,
`doctor`, `strandedMotorist`), plus the planned `sawmill` and `quarry` — see pois.md "Places and
Missions". The
full list of places, and what each gives and receives, is `pois.md`. **†** marks a roadside spot
(an `institution` spot in `pois.md`), not a POI. In `data/offers.js` "from" is `pools` and "to"
is `to` (FEAT-100): a thing with a `to` always ends at a POI of a listed class, never at a
roadside spot. The dashboard warns when an existing thing and its row here disagree.

Mass is real for every bed load (SM-INV-10, *a load, never a stat*). Mass ranges are the
suggestions written in each asset ticket. "Existing" means the thing is already an entry in
`data/offers.js`.

---

## Courier — in the cab, no models

Every courier thing is a phrase on the card. Nothing renders.

### Things

| Region | Thing | From → to | Note |
|---|---|---|---|
| R1 | a memo from the foreman | workSite → any | existing |
| R1 | lunch for the partner | foodVendor → any | |
| R1 | a private note | | existing (any normal giver) |
| R1 | much-needed reading glasses | generalStore → any | |
| R1 | keys for the tractor | any → farm | existing |
| R1 | a chainsaw · a splitting axe · a shovel | generalStore → firewoodYard / sawmill / quarry / farm | existing. Owner 2026-10-07; ~6 / 3 / 2 kg. Cargo for the yard crews, not a player tool (items.md §7 keeps the chainsaw out as a general item) |
| R1 | two bags of takeout · a week of groceries · their prescription | foodVendor / generalStore / residence / doctor → any (as today) | existing |
| R1 | a hubcap · a headlight · a taillight · a set of wheel bearings | autoShop → any | existing |
| R2 | keys to the school | any → school | |
| R2 | keys to the office | any → office | |
| R2 | a muffler · a drive shaft · a body panel · a tailgate | autoShop → any | existing (10–30 kg in the cab) |

### People — passengers in the cab

| Region | Job | From → to | Note |
|---|---|---|---|
| R1 | taking someone to the party | | |
| R1 | taking someone from their broken-down car | strandedMotorist → autoShop / any | the pickup is the ASSET-18 broken-down car scene |
| R2 | taking someone to help their grandma | | |
| R2 | workers for the site | any → workSite | more than one passenger; capped by the cab's seats |
| R3 | taking someone from the party (tipsy) | | flavour only (ruling 5) |

---

## Haul — loose in the bed

One per region, from the haul yards (FEAT-91).

| Region | Load | From → to | Asset | Mass |
|---|---|---|---|---|
| R1 | firewood bundles | firewoodYard (splitting yard) → any | ASSET-37 (shipped) | 10–15 × 11 kg |
| R2 | lumber boards | sawmill → any | ASSET-38 | per board |
| R3 | rocks | quarry → any | none — the procedural `rock` debris type (~50 kg granite cobble) | per rock |

---

## Freight — strapped, durable, mass does the work

| Region | Load | From → to | Asset | Mass (kg) | Note |
|---|---|---|---|---|---|
| R1 | traffic cones | autoShop → workSite | ASSET-49 | 40–80 | |
| R1 | water carboys | generalStore → any | ASSET-50 | 80–90 | |
| R1 | mulch | generalStore / farm → any | ASSET-51 (bulk heap, mulch variant) | 150–250 | |
| R1 | pallet of tomatoes · squash · peppers | farm → generalStore / residence | ASSET-56 (three variants) | 200–350 | |
| R1 | pallet of potting soil | generalStore → any | ASSET-47 | 300–400 | |
| R1 | steel car rims, a stack of 4 or 8 | autoShop → any | ASSET-53 | 40–100 | |
| R1 | eight tyres, strapped | autoShop → any | ASSET-61 | 80–100 | |
| R1 | drum · barrel · crate · pallet | | ASSET-30 / 29 / 28 / 27 | per FEAT-96 | FEAT-96's first slice, generic |
| R2 | pallet of soft drinks | any → generalStore / foodVendor / gasStation | ASSET-46 | 350–450 | |
| R2 | sheets of plywood | sawmill → any | ASSET-54 | 220–350 | longer than the bed, rides on the lowered tailgate |
| R2 | bed full of topsoil | farm → any | ASSET-51 (bulk heap, topsoil variant) | 500–700, tuned by feel | **a mild overload, on purpose**; suspension and tyre upgrades carry it (items.md §1a) |
| R2 | pallet of cinder blocks | generalStore → workSite | ASSET-55 | 350–450 | |
| R2 | pallet of concrete bags | generalStore → workSite | ASSET-47 (concrete variant) | 350–450 | |
| R2 | railway ties | | ASSET-52 | 300–450 | 2.6 m, rides on the lowered tailgate |
| R2 | stack of 55-gal drums | autoShop / gasStation → farm / any | ASSET-48 | 120–450 | reuses the ASSET-30 drum |
| R3 | job box (jobsite tool chest) | any → workSite | ASSET-57 | 150–250 | |
| R3 | a Persian rug or two | | ASSET-58 | 30–60 per roll | light but valuable; 2.7 m, rides on the lowered tailgate |

---

## Fragile — strapped, health-scored

The ASSET-28 crate (and the ASSET-39 pelican case) are the catch-alls. **Their contents are text
only** and are never modelled.

| Region | Load | From → to | Asset | Mass (kg) | Note |
|---|---|---|---|---|---|
| R1 | crate of milk bottles | farm → generalStore | ASSET-28 + text | 15–40 | |
| R1 | crate of canning jars | generalStore → farm | ASSET-28 + text | 15–40 | for preserves |
| R1 | eggs | farm → generalStore / foodVendor | ASSET-28 + text | light | items.md §4 |
| R1 | four dining chairs | | ASSET-59 | 20–35 | the "ratty old furniture" job (worn recolour) |
| R1 | grandma's vase | | ASSET-41 | 3–8 | existing `vase` |
| R1 | full-length mirror | | ASSET-64 | 15–30 | |
| R2 | crate of fine china | | ASSET-28 + text | 15–40 | |
| R2 | a windshield | autoShop → any | crate until modelled | 12–18 | existing |
| R2 | dining table | | ASSET-60 | 40–70 | the "nice" set, paired with ASSET-59 |
| R2 | ornate vase | | ASSET-41 | 3–8 | the valuable version of grandma's vase |
| R2 | framed artwork, crated | | ASSET-44 | 10–30 | |
| R2 | panes of glass | | ASSET-40 | 60–120 | the most fragile |
| R2 | garden fountain | generalStore → any | ASSET-62 | 150–300 | heavy stone |
| R2 | wardrobe | | ASSET-63 | 100–180 | **the high-CG job**: the top is about 2.5 m off the road |
| R2 | pelican case (contents as text) | | ASSET-39 | 15–40 | tough; high-tech contents |
| R3 | sculpture | | ASSET-43 | 40–200 | |
| R3 | upright piano | | ASSET-42 | 200–270 | heavy *and* fragile |
| R3 | airport x-ray machine | any → "the airport"† | ASSET-45 | 300–400 | high-tech, heavy and delicate |

**Damage feedback** (FEAT-97): on each damaging hit the load plays a sound and **blinks red**. No
HUD number appears.

---

## Rulings (owner, 2026-10-06)

1. **A region gates each tier.** R1 is early, R2 is mid, and R3 and beyond is late.
2. **Steel wheels are car rims**, in a stack of 4 or 8 (ASSET-53).
3. **Tyres are freight**, not fragile (ASSET-61).
4. **A bed of topsoil is a mild overload, tuned by feel.** It is the one freight load that is
   meant to sit over the payload. Suspension and tyre upgrades are what carry it (items.md §1a's
   load budget).
5. **Ride smoothness is not a thing.** The tipsy passenger is flavour text only. No courier job is
   scored on how it is driven, only on time vs par, and passengers never render.

## Adding cargo

Add a row here, under its type and tier. If it needs a model, also mint one `asset-*.md` ticket in
the cargo role (it closes when the `.glb` ships), and add the `data/offers.js` thing when the
type's ticket wires it.

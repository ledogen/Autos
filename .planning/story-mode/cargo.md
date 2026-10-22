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
| **Fragile** | in the bed, **strapped** | Base (guaranteed) + a tip set by cargo condition | FEAT-97 | yes, except crate contents |

**From → to** (owner, 2026-10-06, option C): **blank means generic**, so any normal giver can post
it, to any destination. Only items that make sense for certain places are tagged. Names are the
place classes in `src/poi.js` (`generalStore`, `autoShop`, `foodVendor`, `gasStation`,
`tackleShop`, `firewoodYard`, `workSite` (the job site), `residence`, `farm`, `office`, `school`,
`doctor`, `strandedMotorist`), plus the planned `sawmill` and `quarry` — see pois.md "Places and
Missions". The
full list of places, and what each gives and receives, is `pois.md`. **†** marks a roadside spot
(a roadside spot in `pois.md`), not a POI. **One thing per row** (owner, 2026-10-07). In `data/offers.js` "from" is `pools` and "to"
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
| R1 | lunch for their partner | residence / farm → any | existing |
| R1 | a private note | | existing (any normal giver; not the office, school or motorist) |
| R1 | much-needed reading glasses | residence / farm → any | existing |
| R1 | their lucky boots | residence / farm → any | |
| R1 | golf clubs | residence / farm → residence / farm | |
| R1 | a camping chair | residence / farm → any | |
| R1 | fruit cake | residence / farm → residence / farm | |
| R1 | tuna casserole | residence / farm → residence / farm | |
| R1 | homemade beer | residence / farm → residence / farm | |
| R1 | Woodcraft Vol 2. | residence / farm → residence / farm | |
| R1 | keys for the tractor | any → farm | existing |
| R1 | their class notes | residence / farm → school | existing |
| R1 | a presentation deck | residence / farm → office | existing |
| R1 | a full 20 lb propane tank | generalStore / gasStation → any | existing; ~17 kg (7.7 kg cylinder + 9.1 kg gas) |
| R1 | an empty 20 lb propane tank | any → generalStore / gasStation | existing; ~8 kg. The bed version of both is the freight 4-pack (ASSET-72) |
| R1 | a box of lightbulbs | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a box of screws | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a box of nails | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a roll of duct tape | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a pack of paper towels | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a pack of toilet paper | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a coil of rope | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a ball of string | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a ream of paper | generalStore → any | existing; the tackle shop FETCHES it (FEAT-102) |
| R1 | a box of size-12 dry flies | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); ~0.1 kg |
| R1 | spinners and spoons | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 0.3–0.6 kg |
| R1 | a bag of lead sinkers | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 0.3–0.6 kg |
| R1 | a spool of 12 lb mono | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 0.1–0.2 kg |
| R1 | a dozen nightcrawlers | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 0.2–0.3 kg |
| R1 | a landing net | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 0.8–1.2 kg |
| R1 | a tackle box | tackleShop → residence / farm / roadside | existing (BUG-88, owner 2026-10-16); 2–4 kg |
| R1 | a box of paper clips | generalStore → any | existing |
| R1 | cooking scissors | generalStore → any | existing |
| R1 | a turkey baster | generalStore → any | existing |
| R1 | a full jerry can | gasStation → any | existing; ~18 kg (5 gal ≈ 14 kg of fuel + the can). The stranded motorist also FETCHES it (FEAT-102) |
| R1 | a spare tire | autoShop → strandedMotorist | existing; FETCH only (FEAT-102) — the auto shop never posts it as a courier job, and it stays a bonus reward |
| R1 | a chainsaw | generalStore → firewoodYard / sawmill / quarry / farm | existing; ~6 kg. Cargo for the yard crews, not a player tool (items.md §7 keeps the chainsaw out as a general item) |
| R1 | a splitting axe | generalStore → firewoodYard / sawmill / quarry / farm | existing; ~3 kg |
| R1 | a shovel | generalStore → firewoodYard / sawmill / quarry / farm | existing; ~2 kg |
| R1 | two bags of takeout | foodVendor → any | existing |
| R1 | a week of groceries | generalStore → any | existing |
| R1 | their prescription | generalStore → any | existing |
| R1 | a hubcap | autoShop → any | existing |
| R1 | a headlight | autoShop → any | existing |
| R1 | a taillight | autoShop → any | existing |
| R1 | a set of wheel bearings | autoShop → any | existing |
| R2 | keys to the school | any → school | |
| R2 | keys to the office | any → office | |
| R2 | a muffler | autoShop → any | existing (10–30 kg in the cab) |
| R2 | a drive shaft | autoShop → any | existing |
| R2 | a body panel | autoShop → any | existing |
| R2 | a tailgate | autoShop → any | existing |

### People — passengers in the cab

| Region | Job | From → to | Note |
|---|---|---|---|
| R1 | taking someone to the party | | |
| R1 | taking someone from their broken-down car | strandedMotorist → autoShop | existing (`motoristRide`; the motorist's other jobs are fetching a jerry can or a spare tire, FEAT-102). The pickup is the ASSET-18 broken-down car scene, shown only while the motorist has work |
| R2 | taking someone to help their grandma | | |
| R2 | workers for the site | any → workSite | more than one passenger; capped by the cab's seats |
| R3 | taking someone from the party (tipsy) | | flavour only (ruling 5) |

---

## Haul — loose in the bed

One per region, from the haul yards (FEAT-91).

| Region | Load | From → to | Asset | Mass |
|---|---|---|---|---|
| R1 | firewood bundles | firewoodYard (splitting yard) → any | ASSET-37 (shipped) | 11 kg a bundle. ~~× 10–15 bundles, a range on purpose: each offer rolls the bundle COUNT~~ **The player picks the count** inside the truck's limits, and the yard's limited-time rate bonus is what makes one haul better-paid than another (owner, 2026-10-14; FEAT-114) |
| R2 | lumber boards | sawmill → any | ASSET-38 | per board, 1.8 m SPF at 450 kg/m³: 2x4 2.7 · 2x6 4.3 · 2x8 5.6 kg. Haul is the LOOSE boards; the banded bundle is freight (owner, 2026-10-12) |
| R3 | rocks | quarry → any | none — the procedural `rock` debris type | ~50 kg a rock (granite cobble) |

---

## Freight — strapped, durable, mass does the work

**Posted** rows are live jobs: each Load is the job's exact phrase in `data/offers.js` (THINGS,
`family: 'freight'`), so the dashboard flags any drift between the two. Mass is what a job rolls,
and every modelled load is ONE number, as built: counted off the model at real unit weights
(owner, 2026-10-11). Pallets are 20 kg (1.0 × 1.2) and 12 kg (the small 0.8 × 0.8). A range is left
only where there is no model to count yet. The debug menu's "Load Cargo" (`data/freight.js`) uses
the same numbers. **In game everything rolls in R1 for
now** (owner, 2026-10-10) — there is one region; the Region column is the design tier.

| Region | Load | From → to | Asset | Mass (kg) | Note |
|---|---|---|---|---|---|
| R1 | a pallet of tomatoes | farm → generalStore / residence | ASSET-56 (tomato variant) | 365 | posted. 8 crates × 62 L at 0.65 kg/L = 40 kg of fruit + 3 kg crate, + pallet |
| R1 | a pallet of squash | farm → generalStore / residence | ASSET-56 (squash variant) | 315 | posted. 8 crates × 62 L at 0.55 kg/L = 34 kg + 3 kg crate, + pallet |
| R1 | a pallet of peppers | farm → generalStore / residence | ASSET-56 (pepper variant) | 235 | posted. 8 crates × 62 L at 0.38 kg/L = 24 kg + 3 kg crate, + pallet |
| R1 | a pallet of potting soil | generalStore → any | ASSET-47 | 344 | posted. 18 bags × 18 kg + pallet |
| R1 | eight tyres | autoShop → any | ASSET-61 | 105 | posted. 8 × 10.5 kg (650 mm × 210 mm on a 15" rim ≈ 215/70R15) + pallet |
| R1 | a pallet of full propane tanks | generalStore / gasStation → any | ASSET-72 (reuses ASSET-05's cylinder) | 80 | posted. 4 × 16.8 kg (20 lb cylinder full) + small pallet. The single tank is a courier thing |
| R1 | a pallet of empty propane tanks | any → generalStore / gasStation | ASSET-72 | 43 | posted, back to refill; any giver but the general store. 4 × 7.7 kg + small pallet |
| R1 | mulch | generalStore / farm → any | ASSET-51 (bulk heap, mulch variant) | 150–250 | not posted. **A range because there is no model yet** — fixed when the heap is built |
| R1 | steel car rims, a stack of 4 or 8 | autoShop → any | ASSET-53 | 40–100 | not posted. **A range because there is no model yet** (4 or 8 rims × ~10 kg) |
| R1 | a drum of oil | generalStore / gasStation / farm → generalStore / gasStation / farm | ASSET-30 on the small pallet | 213 | posted (owner, 2026-10-12). Full of oil: 208 L × 0.88 + 18 kg drum, + small pallet |
| R1 | a barrel of water | generalStore / gasStation / farm → generalStore / gasStation / farm | ASSET-29 on the small pallet | 230 | posted (owner, 2026-10-12). Full of water: 208 kg + 10 kg HDPE, + small pallet |
| R1 | a small crate | generalStore / gasStation / farm → generalStore / gasStation / farm | ASSET-28 on the small pallet | 30 | posted (owner, 2026-10-12). Crate 18 kg + small pallet. The bare pallet is no longer a load |
| R1 | a large crate | generalStore / gasStation / farm → generalStore / gasStation / farm | ASSET-28 on the full pallet | 65 | posted (owner, 2026-10-12). Crate 45 kg + full pallet |
| R3 | four 55-gallon drums | autoShop / gasStation → any | ASSET-48 | 804 | not posted — **a later-region load** (owner, 2026-10-12: full, explicitly for later missions). An overload: 4 full drums of oil × 201 kg, no pallet |
| R2 | a pallet of soft drinks | generalStore → foodVendor / gasStation | ASSET-46 | 240 | posted. 24 trays × 24 cans × 0.37 kg + trays, + pallet |
| R2 | a pallet of cinder blocks | generalStore → workSite | ASSET-55 | 785 | posted. **An overload, and it rolls** (owner, 2026-10-10). 45 blocks (8" CMU) × 17 kg + pallet |
| R2 | a pallet of concrete bags | generalStore → workSite | ASSET-47 (concrete variant) | 670 | posted. **An overload, and it rolls** (owner, 2026-10-10). 18 × 80 lb bags (36 kg) + pallet |
| R2 | sheets of plywood | sawmill → any | ASSET-54 | 330 | not posted — the sawmill does not exist yet. 12 sheets of 3/4" 4×8 × 27.5 kg. Rides angled over the tailgate |
| R2 | bed full of topsoil | farm → any | ASSET-51 (bulk heap, topsoil variant) | 500–700 | not posted. **A range because there is no model yet**; an overload, set by feel once the heap is built |
| R2 | five railway ties | generalStore / gasStation / farm → generalStore / gasStation / farm | ASSET-52 | 455 | posted (owner, 2026-10-12). 5 hardwood ties, 7×9 in × 2.6 m, × 91 kg. Rides angled over the tailgate |
| R3 | a job box | residence → workSite | ASSET-57 | 175 | posted (route: owner, 2026-10-11). 95 kg steel chest + ~80 kg of tools — the tools are unseen, so that half is an assumption |
| R3 | a Persian rug or two | | ASSET-58 | 30–60 per roll | not posted. **A range because there is no model yet** |
| R3 | a stock engine (a used 4.0 V6, crate-ready) | | none yet (the part's icon `engine.png` only) | ~180 | **proposed — owner idea, 2026-10-22:** *"This would make for a sweet freight delivery as well."* The same engine as the stock-engine part (items.md / FEAT-121, 180 kg). Not posted; shipper open. **R3 is a placeholder** (a valuable load reads late), the owner's to set |

**How freight pays** (owner, 2026-10-11; numbers in `data/offers.js`): par × (1 + 0.0007 × kg) for
the time the load costs; pay × (1 + 0.0003 × kg) on top, so pay outgrows time; every rank threshold
× 1.15 (par pace is a B); the tip × 0.5. Haul wins the fast run; freight is the reliable earner.

---

## Fragile — strapped, health-scored

The ASSET-28 crate (and the ASSET-39 pelican case) are the catch-alls. **Their contents are text
only** and are never modelled.

| Region | Load | From → to | Asset | Mass (kg) | Note |
|---|---|---|---|---|---|
| R1 | crate of milk bottles | generalStore → residence | ASSET-28 + text | 40 | 24 quart glass bottles, full, × 1.4 kg + crate. Contents are text, so the count is an assumption |
| R1 | crate of canning jars | generalStore → residence | ASSET-28 + text | 20 | for preserves. 36 empty quart jars × 0.4 kg + crate |
| R1 | eggs | farm → residence | ASSET-28 + text | 31 | items.md §4. 30 dozen × 60 g + flats + crate |
| R1 | four dining chairs | generalStore / residence → residence | ASSET-59 | 24 | the "ratty old furniture" job (worn recolour). 4 × 6 kg |
| R1 | grandma's vase | | ASSET-41 | 9 | existing `vase`. Glazed ceramic, 0.78 m, + its base |
| R1 | full-length mirror | generalStore / residence → residence | ASSET-64 | 16 | framed, 0.6 × 1.7 m, blanket-wrapped |
| R2 | crate of fine china | generalStore / residence → residence | ASSET-28 + text | 30 | ~24 kg of china + crate |
| R2 | a windshield | autoShop → any | crate until modelled | 14 | existing. The glass alone |
| R2 | dining table | generalStore / residence → residence | ASSET-60 | 45 | the "nice" set, paired with ASSET-59. Solid wood, 1.6 × 0.9 m |
| R2 | ornate vase | generalStore / residence → residence | ASSET-41 | 9 | the valuable version of grandma's vase — same model |
| R2 | framed artwork, crated | generalStore / residence → residence | ASSET-44 | 16 | painting ~6 kg + travel crate ~10 |
| R2 | panes of glass | generalStore → any | ASSET-40 | 240 | the most fragile. 10 panes, 8 mm, 10.5 m² in all × 20 kg/m², + A-frame ~30 |
| R2 | garden fountain | generalStore → any | ASSET-62 | 200 | heavy cast stone, three tiers |
| R2 | wardrobe | generalStore / residence → residence | ASSET-63 | 120 | **the high-CG job**: solid wood, 2 m tall, the top ~2.5 m off the road |
| R2 | pelican case (contents as text) | | ASSET-39 | 35 | tough; ~20 kg case + ~15 kg of equipment (the contents are an assumption) |
| R3 | sculpture | generalStore / residence → residence | ASSET-43 | 120 bronze · 220 marble | two models: hollow-cast bronze abstract + stone plinth; solid marble figure + plinth |
| R3 | upright piano | generalStore / residence → residence | ASSET-42 | 230 | heavy *and* fragile. A 1.28 m studio upright |
| R3 | airport x-ray machine | | ASSET-45 | 450 | high-tech, heavy and delicate. A compact 1.6 m baggage scanner (full-size ones run to a tonne). Generic: the airport place was dropped (owner, 2026-10-07) |

**Damage feedback** (FEAT-97): on each damaging hit the load plays a sound and **blinks red**. No
HUD number appears.

---

## Rulings (owner, 2026-10-06)

1. **A region gates each tier.** R1 is early, R2 is mid, and R3 and beyond is late.
2. **Steel wheels are car rims**, in a stack of 4 or 8 (ASSET-53).
3. **Tyres are freight**, not fragile (ASSET-61).
4. **Overloads are on purpose.** Topsoil (500–700 kg, tuned by feel once modelled), concrete
   (670 kg), cinder blocks (785 kg) and four full drums (804 kg), all as built, sit over the Ranger's ~500–570 kg payload.
   Suspension and tyre upgrades are what carry them (items.md §1a's load budget). They roll before
   those upgrades exist (owner, 2026-10-10).
5. **Ride smoothness is not a thing.** The tipsy passenger is flavour text only. No courier job is
   scored on how it is driven, only on time vs par, and passengers never render.

## Rulings (owner, 2026-10-10 / 11)

1. **This file decides who posts.** A place posts a load when its row names it in From; "any" is any
   normal giver.
2. **A blank From posts nowhere** until the owner names a shipper.
3. **Everything rolls in R1** while there is one region.
4. **Freight vs haul** — see "How freight pays" above.

## Rulings (owner, 2026-10-12)

1. **Shippers for the palletised singles and the ties:** the drum, the barrel, both crates and the
   railway ties go to and from the general store, the gas station and the farms.
2. **The four drums stay full (804 kg) and are a later-region load.** In general, item weight ramps
   in the later regions. They post nowhere until regions carry their own freight.
3. **Lumber:** the haul is loose boards; the banded bundle (ASSET-38's 170 kg) is freight.
4. **The sawmill and the quarry get a big pad** — bigger than the splitting yard's 14 × 8.
5. **Each source picks a family first, then a thing in it**, so every family it posts gets an even
   share there. Freight went from ~13 % of offers (2.3 a board, none on 7 % of boards) to ~31 %
   (5.4 a board, never none); courier holds ~52 %.

## Rulings (owner, 2026-10-14)

Provenance: `design-amendments-2026-10-14.md`.

1. **Every bed load carries its size and a form** (`boxed`, `loose`, `long`) for the load verdicts
   (FEAT-112). Masses stay as built.
2. **Every thing carries a delivery deadline** (FEAT-113): ~~lax 1–3 days (freight), chill 6 h–1 day
   (most), stringent 1–4 h (takeout, perishables)~~ — **re-cut 2026-10-15** as par × (1 + slack):
   takeout +50 %, other courier +100 %, haul and fragile +200 %, freight +300 %
   (`DEADLINE_SLACK` / a thing's own `deadlineSlack` in `data/offers.js`).
3. **The `furniture` tag** goes on four dining chairs, the dining table, the full-length mirror, the
   wardrobe and the upright piano (FEAT-116's furniture pad).
4. **Haul counts are the player's pick** (FEAT-114). The overloads above stay posted; whether each is
   a warning or an overload on the stock truck is FEAT-112's open number.

## Rulings (owner, 2026-10-15) — fragile shippers

- Milk bottles: general store → residence. Canning jars and eggs → residence (their "from" is
  unchanged: jars from the general store, eggs from a farm).
- Dining chairs, dining table, mirror, ornate vase, framed artwork, wardrobe, piano, sculpture and
  fine china: general store → residence, AND residence → residence.
- Panes of glass and the garden fountain: general store → any.
- Not named, so still unrouted: grandma's vase keeps its residence → any row; the windshield keeps
  autoShop → any; the pelican case and the x-ray machine post nowhere yet.
- Everything is R1 for now (the 2026-10-10 ruling stands).

## Adding cargo

Add a row here, under its type and tier. If it needs a model, also mint one `asset-*.md` ticket in
the cargo role (it closes when the `.glb` ships), and add the `data/offers.js` thing when the
type's ticket wires it.

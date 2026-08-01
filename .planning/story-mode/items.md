# Autos — Items catalog

*Working design notes. **Downstream of `DESIGN.md`** — where this document and the bible disagree,
the bible wins. Companions: `missions.md`, `run-shape.md`, `opening.md`, `spirits-and-pacts.md`,
`IDEAS.md`.*

**What this file is for.** One place to add, organize, and eventually **burn down as assets** every
discrete *thing* in the game — consumables, tools, parts, cargo, and catch. Design rationale lives in
the bible and the companion docs; this file is the **inventory of objects** and what each one needs
before it can be built.

**Status, honestly:** nothing on this list is ratified *as an item system*. `IDEAS.md` is explicit
that the item structure itself is deferred — don't build an item framework off any single entry here.
What this catalog is good for right now is **seeing the whole surface at once** and spotting which
entries are load-bearing for a mechanic that *is* ratified.

---

## The four rules every item inherits

These come from the bible and are not negotiable per-item. They're restated here because they're what
makes an item legal or illegal, and it's easier to check a new entry against four lines than to
re-read DESIGN.md.

1. **Described, never scored (SM-INV-10).** No number on an item, ever. Straps don't grant "+20%
   fragility resistance"; a secured load *sees less shock than the truck does*. If an entry can only
   be explained as a stat, it's the wrong entry.
2. **Stowed items are real mass.** Consumables and tools ride in the truck as actual load that shifts
   CoG and handling — *a load, never a stat* (DESIGN.md "The car"). Trivial for a box of straps,
   real for a spare tire, decisive for freight.
3. **No item may raise the floor (SM-INV-9).** Litmus test: *does it make late runs comfortable?*
   Items are found, bought, or **won on a bonus objective** — always **within a run** — and die with
   it (SM-INV-8 as narrowed 2026-07-29 — only literacy and the garage survive). Nothing here
   persists.
4. **An item should enable a harder choice, not make an easy one safe** (`IDEAS.md`, cargo straps).
   The framing to hold everywhere: straps let you *accept freight-grade fragile work you couldn't
   otherwise carry* — they don't turn a normal fragile run into a cruise.

**Columns used below.** `Source` = where the player gets it — bought, found, starting kit, or **won
as a mission bonus objective** (*"a little extra if you finish with an A"* — ratified 2026-08-01,
`missions.md`; the reward is an item, deliberately unnamed up front). `Cost` = what it charges, in a
currency other than the one it pays out in (rule 4 restated). `Status` = **RATIFIED** / **PROPOSED** /
**IDEA** / **IMPLIED** (something a ratified mechanic needs but nobody has specified yet).

---

## 1. Consumables

Used up. Per-job or per-day decisions, not permanent upgrades.

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Coffee** | Alert now, sleepy earlier tomorrow. **A loan against tomorrow, repaid at interest.** The canonical consumable and the shape every other one is measured against. | Bought (towns, stations) | Tomorrow's hours | **RATIFIED** — DESIGN.md "The day and the clock" |
| **Cargo straps** | Makes the **next fragile cargo** more resilient by changing the coupling between chassis and load — the cargo sees less shock than the truck does. Enables freight-grade fragile work you'd otherwise turn down. | Bought or found | Cash; a slot; trivial mass | **IDEA** — `IDEAS.md` 2026-07-29. *Open: single-use per job, degrades over several, or a reusable tool?* |
| **Fish (eaten)** | Alertness that **does not have to be repaid** — the only honest restoration in the game. *"Coffee is debt. Fish is income."* | Caught; best at a favored water | A long relationship with the water | **PROPOSED** — `spirits-and-pacts.md` #04. ⚠ Depends on The Confluence, which is deferred |
| **Spare tire** | Recovers from a puncture without a tow. Puncture is a hard fail state in the wear model. | Bought/found; starts in some jalopies | Real mass, all the time | **IMPLIED** — named in DESIGN.md "The car" as a stowed consumable; behavior unspecified |
| **Air filter (spare)** | Replacement for the track the player must actively *watch* — it does ~nothing until it does. | Bought/found | Cash; a slot | **IMPLIED** — same |
| **Fuel** | The tank. Burn is a function of rpm and load, so a par-beating drive costs fuel as well as wear. **The one cost that scales with distance** — SM-INV-5 keeps wear off the distance axis, and this is what fills it. Bought at gas stations. | Gas stations (a POI type) | Cash — and the detour, if you let it get low | **RATIFIED** — owner, 2026-08-01. Reverses this row's old *NOT DESIGNED*. Ticket FEAT-50; gauge already ships (FEAT-49). See DESIGN.md "Fuel and gas stations" |
| **Jerry can** | Fuel you carry. The cheap answer to running dry, which is otherwise the breakdown predicament (tow, or don't). | Bought/found | Cash; a slot; **real mass, always** — and it is fuel, so it is not trivial mass | **IMPLIED** — falls out of the fuel ruling; see the tools carry-cost question in §2 |

> **The coffee test.** Coffee works because its cost is in a *different currency* than its payout
> (hours for alertness) and lands *later*. Any consumable that pays and costs in the same currency is
> just a price tag. Check new entries against it.

## 2. Tools

Kept, re-used, and heavy. The distinction from consumables is that a tool's cost is **permanent mass
plus a slot**, paid on every mile you carry it, against a payoff you only occasionally collect.

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Quick-jack** | Lifts the truck for roadside work — the thing that makes a spare tire usable away from a shop. | Bought/found | Real mass, always | **IMPLIED** — named in DESIGN.md "The car"; behavior unspecified |
| **Breaker bar** | Roadside wrenching. Paired with the quick-jack in the bible's own list. | Bought/found | Real mass, always | **IMPLIED** — same |
| **Chain** | Chains onto a downed log for the drag. **A one-sided distance constraint** — zero force slack, hard tension taut — and the snatch impulse *is* the damage signal. | Main-mission equipment | The truck, by design | **RATIFIED premise** — `missions.md` "Main missions". *Open: carried item, or supplied by the mission?* |
| **Fishing gear** | Required for the fishing minigame. | ? | ? | **IMPLIED / UNSPECIFIED** — see the gap note below |
| **GPS unit** | **Draws the mission route in the 3D world** so you drive it by looking out of the windscreen instead of stopping to read the map — FEAT-39's chevrons + junction arrow boards, already shipped in `src/gps.js`. A **direct convenience upgrade for any player**, and deliberately a common find: it does not make you *faster*, it makes knowing-the-way *free*. A skilled player reads the map and spends the cash elsewhere. **Until you find one, the paper map (FEAT-16, `M`) is all you get** — navigation is map-reading, landmarks, and memory. | Found or bought within a run | Cash; a slot; trivial mass — the real cost is that you had to *earn* legibility | **RATIFIED premise** — owner, 2026-07-31: "GPS should be an item; until you find it you navigate via the map alone." *Open: strictly per-run (SM-INV-8 says items die with the run — you re-find it every run), or does knowing-where-one-sells count as the literacy that persists?* |
| **Destination beacon** | Shows a **beam of light rising from the destination**, visible over terrain from far off. Gives *bearing*, not route — the point is that it makes **off-route travel** findable: you can leave the road, crest the ridge, and steer by the light. It answers "where," never "how." | Found or bought within a run | Cash; a slot | **IDEA** — owner, 2026-07-31. *Open: always-on while carried, or aimed/activated? Render: a sky-beam is cheap and reads at range, but must respect fog/night (day/night pass made fogColor a radiance value).* |
| **Shortcut GPS** | **The Shortcut, distilled onto a chip you mount on the dash.** Functionally identical to the pact: it **recomputes par over the cut-inclusive graph and routes you through the cuts** (FEAT-52). Without either this or the pact, **you are never routed through a cut.** The advanced GPS — very rare. | Found or bought within a run; **very rare** | Cash; a slot; **the route it gives you is riskier by construction** — it spends your truck to save your clock | **RATIFIED premise** — owner, 2026-08-01. *The "what is a shortcut" tech question is ANSWERED: cuts are real worldgen objects (FEAT-52), not an overland-routing problem.* |

> **The GPS is the one tool whose mechanic already ships.** FEAT-39's overlay exists and currently
> defaults **ON** in missions (it was left on for playtesting + FEAT-30 par calibration). Making it an
> item means story mode boots with `__setGpsEnabled(false)` until the item is acquired; the sandbox /
> assists-menu toggle (FEAT-41) stays a plain toggle — the *item* gate is story-mode-only. It is also
> the cleanest expression of rule 4 in the catalog: the map is the game, the GPS lets you *stop paying
> attention* — exactly the comfort SM-INV-9 says must be bought, not given.
>
> **The navigation ladder.** Map, beacon, GPS, shortcut GPS are one family, and each answers a
> *different question*: the map answers "what's out there," the beacon "where is it," the GPS "how do
> I get there," the shortcut GPS "how do I get there *fast*." That's what keeps them from being tiers
> of the same upgrade — a beacon-carrier still reads the map to pick a line; a GPS-carrier who finds a
> beacon gains off-route options the GPS would never suggest. Author them so no item obsoletes
> another — with the deliberate exception below, where an item obsoletes a *spirit*.
>
> **The shortcut GPS IS the Shortcut** [RATIFIED 2026-08-01, owner]. Not a parallel mechanic — the
> same one, in a box. The spirit is so **clueless and simplistic in essence** — no memory of being
> built, no idea whether the trail connects, certainty it has not earned — that the whole of it fits
> on a chip you mount on the dash. **A spirit dumb enough to be firmware.** That is the joke, and it
> is also the lore justification; it needs no further reconciliation.
>
> **Two doors, one room.** The chip and the pact grant the same power: par recomputed over the
> cut-inclusive graph, and routing that uses cuts. They are acquired completely differently — **one by
> luck, one by relationship** — and that is enough. Redundancy only hurts when the acquisition paths
> are the same; a rare find that trumps a system is ordinary roguelike practice, and it means a player
> who never meets the spirit is not locked out of the playstyle.
>
> **The gating rule:** with a plain GPS and no pact, **you are never routed through a cut.** The road
> GPS honestly prefers the maintained network — by the router's own cost function a cut *is* bad line
> — so cuts stay something you find yourself, until the chip or the pact puts them on the route.
>
> **⚠ Neither GPS may ever render an ETA or time-remaining.** A real GPS shows arrival time; these must
> not, ever. Par is never a countdown (SM-INV-3), and an ETA readout is par on the HUD wearing a
> navigation costume. Route lines, chevrons, distance — fine. Clocks — no. This belongs in FEAT-39
> before anyone "completes" the GPS feature set.
>
> **The chip is honest, not helpful — and that is the interesting part.** It does not know you are
> carrying eggs. Fragile cargo scores on vertical shock and freight puts real mass through ruts
> (`missions.md` §3b/§3c), so **a cut-inclusive route is actively wrong for two of the three delivery
> types** — while par has *already tightened* to assume you took it. Following the chip blindly on a
> fragile run is how you break the vase and miss par in the same drive. Knowing when to ignore your
> own navigation is exactly the literacy this game rewards, and it falls out of mechanics that
> already exist.
>
> *(Superseded: an earlier draft split the item from the pact — the item showing a cut **exists**, the
> pact showing which cuts still **go** — to stop the item devaluing the pact. Owner ruled against it
> 2026-08-01, and the objection was weaker than it read: items die with the run, so the chip sells a
> within-run convenience rather than permanent knowledge, and the player's own memory of a seed's cuts
> was never the item's to sell. The old "an item that reveals off-road lines systematically beats par"
> flag retires with it — cuts now carry four real costs, so a revealed cut is not a free second.)*
>
> **The carry-cost question, unresolved and worth deciding early.** Tools are the only category whose
> cost is paid continuously and whose benefit is occasional. That's a genuinely interesting decision
> (*do I carry the jack today?*) **only if the mass is felt**. If it isn't, tools are free and the
> category collapses into "things you buy once." Decide whether stowed mass is legible to the player
> before authoring more of them.

## 2b. Camp gear

The kit you sleep under. A sub-category of tools, because it inherits the tool cost model exactly —
**permanent mass plus a slot, paid every mile, collected one night at a time**. It gets its own
section because it is the only gear with a *shipped* mechanic under it: FEAT-45's camping and
FEAT-47's energy clock already exist, so these are the first entries whose effect has somewhere to
land. Nothing here is built (owner, 2026-07-30: *catalog it, don't build it*).

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Bedroll (+ campfire)** | **The default camp — no modifier.** Everybody has one; you sleep on the ground beside a fire. It is the baseline the rest of this table is measured against, and the thing that renders when you carry nothing else. | Starting kit | Its own trivial mass | **IDEA** — 2026-07-30 |
| **Sleeping bag** | Multiplies the energy a night buys, by a fixed factor (~1.1×). **Replaces the bedroll** in the rendered camp. | Bought/found | Cash; a slot; small mass | **IDEA** — 2026-07-30 |
| **Tent** | The same multiplier, larger. **Replaces the sleeping bag** in the rendered camp — the campsite visibly becomes a camp rather than a man on the dirt. | Bought/found | Cash; a slot; real mass | **IDEA** — 2026-07-30 |
| **Blanket** | **Energy axis.** The small end of the same multiplier — the cheap first upgrade over the bare bedroll, and the thing you still have when you've sold the tent. | Bought/found | Cash; a slot; trivial mass | **IDEA** — 2026-08-01 |
| **Cot** | **Vibe axis — flatness.** Makes unflat ground sleepable: fills part of the flatness deficit of the site you chose. Inert on ground that is already flat. | Bought/found | Cash; a slot; real mass (it's a folding frame) | **IDEA** — 2026-08-01 |
| **Canopy / tarp** | **Vibe axis — shade.** Makes an exposed site bearable: fills part of the shade deficit. Inert under trees. | Bought/found | Cash; a slot; small mass | **IDEA** — 2026-08-01 |
| **Binoculars** | **Vibe axis — view.** Something to look at from a site with nothing much to look at. Inert on a spot that already has the valley in front of it. ⚠ Depends on a **view** contribution to the site score, which DESIGN.md names as a layer-3 factor but `VIBE_W` (`src/camp.js`) does not yet carry. | Bought/found | Cash; a slot; negligible mass | **IDEA** — 2026-08-01 |
| **Cooking kit** | ~50 lb (≈23 kg) of always-carried mass. Renders as an **A-frame over the campfire with a Dutch oven hanging from it**. Gives a **flat bonus to the effect of food items** — there is deliberately no cooking *system*, no recipes, no ingredients. | Bought/found | ≈23 kg on every mile, for a benefit collected only at camp | **IDEA** — 2026-07-30. ⚠ Depends on food items, which do not exist (§1: fish is PROPOSED, and upstream of a fishing minigame nobody has framed) |

> **The visible-kit rule.** Camp gear is the one category whose ownership is legible *without a UI*:
> what you carry is what renders at the site, so **the campsite is the inventory screen**. That is
> the argument for growing this category ahead of the others — every entry pays for itself in
> readability, and none of it needs the inventory structure `IDEAS.md` has deferred. It also picks up
> the visuals FEAT-45 deferred on closing (`todos/completed/feat-dispersed-camping-areas.md` —
> "tent model + animated campfire w/ dynamic shadows"): that render work and this table are the same
> job seen from two ends.

> **Two axes: some gear scales the energy, some gear scales the vibe.** [RULED 2026-08-01, owner —
> supersedes this section's original "it multiplies the energy, *never* the vibe."] The site's vibe
> score decides what a night at that spot is worth (`r(vibe) = lerp(1.5, 3.0, vibe)` in `src/day.js`).
>
> - **Energy axis** — bedroll, blanket, sleeping bag, tent, cooking kit. These scale what you *take
>   away* from the night, whatever the night was. They stack with any site.
> - **Vibe axis** — cot, canopy, binoculars. Each names **one segment** of the vibe score and fills
>   part of that segment's **deficit** on the site you already chose.
>
> **SM-INV-6 is preserved by the deficit rule, not by keeping gear out of the vibe term.** The assist
> is `min(itemCap, headroom)` — headroom being what the site left unearned on that factor — so gear
> is **inert on a site that is already good at that thing**, and the caps are set so flat + shade +
> view assists together cannot manufacture a top-vibe site out of a bad one. The place still sets the
> ceiling; gear only reclaims part of what a bad place withheld. Better ground still beats worse
> ground, so *the last leg of the day is still finding good ground* — which is the clause SM-INV-6
> actually turns on. What is forbidden is an **uncapped or site-blind** vibe bonus: that is the tent-
> substitutes-for-ground substitution, and it stays forbidden.
>
> **Apply the vibe assist to the CHOSEN site, after the candidate hunt** — never inside
> `_gradeFlat`/`_gradeAmenity` (`src/camp.js`). The hunt is flattest-first with an early break on
> `flatScore + AMENITY_MAX`; boosting scores during the search would change *which* spot gets picked,
> i.e. the cot would start steering the player toward worse ground. Different mechanic, worse one.
>
> **Show the assist on the vibe bar, unlabelled** — a lighter ghosted tail on the end of the segment
> being helped (`_renderVibeBar`, `src/main.js`). No legend, no numbers, no item name: the player
> sees *the cot is working tonight* vs *the cot is dead weight*, which is the feedback loop that
> makes carrying it a real decision. SM-INV-3-shaped — a diegetic read, not a meter.

**Two open flags, recorded rather than resolved:**

1. **SM-INV-10 tension.** "1.1×" is a number on an item. The multiplier is legal as *internals* — the
   game is already full of them — but the figure must never surface in the UI, and no described-not-
   scored phrasing has been written yet. A sleeping bag is *warmer than the ground*; a tent is *the
   difference between weather happening to you and weather happening outside*. Settle the language
   before the mechanic.
2. **23 kg on a 1360 kg truck is ~1.7%, and will not be felt.** That is §2's own unresolved
   carry-cost question arriving with a concrete number attached: if the cooking kit's mass is
   invisible, its cost is invisible, and it is a free upgrade rather than a decision. The kit is
   therefore the **first real test case** for whether stowed mass is legible at all — decide that
   question here, or accept that camp gear is priced in cash and slots only.

## 3. Parts

Architecture choices, not stat sticks (SM-INV-10). Split into the **wear-model parts** (each carries
its own 0–100% condition track) and **character parts** (change what the truck does, don't wear as a
tracked economy). A jalopy rolls in with all of these already half-worn (SM-INV-7).

### 3a. Wear-tracked parts — the repair economy

Each is a per-component condition track in the ONE damage framework (DESIGN.md "Damage, wear &
repair"). These are the items money mostly exists to replace.

| Part | Reads (honest signal) | Note |
|---|---|---|
| **Tires** | Slip, load, surface | Wear deliberately accelerated as an economic driver; puncture is a hard fail |
| **Engine** | Torque-hours, redline time, over-temp | Overheat → power loss → engine wear → blown head gasket is the specified chain |
| **Air filter** | Intake load over time | **The one the player must watch** — does ~nothing until it does. Gets the can't-miss warning |
| **Suspension** | Bump-stop over-travel / suspension-velocity spikes | Same signal `missions.md` §3b reads for fragile cargo — one plumbing, two consumers |
| **Brakes** | ∫(brake torque × time); pad grade per axle sets bias | Front/rear pad grades are also a *character* choice |
| **Radiator** | Cooling headroom; front-end impacts | Early cooling is *designed* marginal. A strong front hit punctures it |

### 3b. Character parts — architecture, not condition

| Part | What it changes | Status |
|---|---|---|
| **Open vs. LSD differential** | What the truck does when you get greedy mid-corner. The bible's canonical "described, never scored" example | **RATIFIED premise** |
| **Power mods** | On an open-diff RWD truck, a *worse car* for a driver without the literacy — **a cursed item nobody had to author** | **RATIFIED premise** |
| **Tire compound/type** | Grip character and how it degrades; interacts with surface class (FEAT-38) | **DEFAULT** |
| **Brake pad grade, per axle** | Bias — a race pad changes what the truck does under braking | **DEFAULT** |

### 3c. The durability axis — sportiness traded for endurance [RATIFIED 2026-08-01]

**A whole class of parts that are worse to drive and harder to kill.** Owner-ratified 2026-08-01 as a
sanctioned upgrade direction, and it is the cleanest expression of SM-INV-10 in the catalog: nothing
here is *better*, everything here is a **trade you can feel through the wheel**.

| Part | The trade | Reads (honest signal) |
|---|---|---|
| **LT load-rated tires** | Stiffer sidewall, heavier, less peak grip and a duller turn-in — but they take load and abuse a sport tire won't, and they resist puncture far longer on the wear→fragility curve | tire condition track; per-wheel μ |
| **Heavy-duty off-road suspension** | **No dual-rate damping** — cruder, floatier, less composed on pavement — but it eats bump-stop hits that would degrade a sport damper | suspension condition; bump-stop over-travel |
| *(space for more)* | Skid plates, a heavier-gauge radiator, steel wheels over alloys — same shape: mass and refinement out, survivability in | |

**Why this axis earns its place.** Three things fall out of it for free:

1. **It is the counter-play to the Shortcut pact.** A player who takes cuts is buying wear with time
   saved; durability parts change that exchange rate. The two systems synergize without either being
   authored against the other — the truck build *becomes* the statement of which road you take.
2. **It is impossible to express as a number**, which makes it self-policing under SM-INV-10. There is
   no "+15 durability" reading of a tire that grips less and dies slower; you either feel the trade or
   you don't.
3. **It is lateral, not upward** — the SM-INV-9 litmus test passes cleanly. Durability doesn't make
   late runs comfortable; it makes a *different* run, one that is slower against par and cheaper to
   keep alive. Given payout is continuous in the par ratio, that is a genuine economic fork: you earn
   less per job and spend less on repairs.

> **Watch the one failure mode:** if durability parts are strictly better in the late game — when
> repairs are expensive and par matters less — the axis collapses into "the correct build" and stops
> being a trade. The tightening rank thresholds are what should prevent that, since a slower truck
> loses ground on the grading curve exactly as the run matures. Verify this when the economy is tuned;
> it is the interaction most likely to quietly break.

> **Vehicles are not items (SM-INV-15).** You cannot buy a different car during a run. Parts are the
> entire in-run upgrade path; *starting* vehicles are the meta layer (DESIGN.md "The garage").

## 4. Cargo

Not owned — carried, for someone, under a scoring axis. Cargo is the mission type made physical, so
each entry here is really an instance of a type in `missions.md` §3.

| Cargo | Type / axis | Mass | The fear |
|---|---|---|---|
| **Newspapers** | Paper route — **coverage** | Light; a fixed stack that is also the mission's second budget | Running out of daylight with papers left |
| **Milk / small errand goods** | Point-to-point — **margin** | Light | Crashing; earning nothing. *Perishable: dies overnight if you camp mid-job* |
| **Grandma's vase** | Fragile — **restraint** | Light–medium | Vertical shock. **The type that makes surface class (FEAT-38) matter** — the paved detour vs. the dirt shortcut |
| **Eggs** | Fragile — **restraint** | Light | Same. *"Arrive with the eggs unbroken"* is the bible's own phrasing |
| **Pallets / freight** | Freight — **mass does the work** | **Heavy** | The truck. Sustained load on a long grade is what marginal early cooling cannot survive |
| **Logs (downed)** | Clearance — main mission | Dragged, not carried | Being pulled sideways above a drop |

> **Cargo is the only category whose "item" is mostly a mass value and a fragility flag.** Adding a
> new cargo is a *content* act; adding a new scoring axis is a *design* act (`missions.md`). Keep the
> two apart when burning these down — a dozen cargo assets is cheap, a fifth axis is not.

## 5. Catch — fish

The section you flagged. **Structurally the weakest part of this catalog**, because it's the only
category with no ratified mechanic under it (see the gap note below).

What the docs currently commit to:

- Fish is the **restoration currency**: *coffee is debt, fish is income* — alertness that isn't
  repaid, eaten at a favored river camp.
- The ledger that matters is **distinct waters visited**, not fish landed. Fishing one hole
  repeatedly should **deplete it and read as greed**.
- The **fishing perk tree, if any, *is* The Confluence's disposition track** — one system, not two,
  so every perk held is evidence of a relationship rather than a purchase.

**Species: unspecified, and that's the burn-down question.** Nothing in the docs names a single fish.
Before authoring a species list, the axis it varies along has to exist. Candidates, cheapest first:

| Axis | What a species would mean | Note |
|---|---|---|
| **Restoration size** | Bigger fish = more unrepaid alertness | Simplest; risks becoming a number (SM-INV-10 pressure) |
| **Water type** | Species keyed to stream vs. pond vs. altitude/temperature | **Strongest fit** — the world already generates streams and ponds distinctly, and it rewards the map literacy The Confluence's ledger is built to reward |
| **Rarity / season** | Some fish only in some waters, some conditions | Feeds "distinct waters" directly; needs a condition model |
| **Cargo** | Fish as deliverable freight, not food | Would cross into `missions.md` §3b — a fragile, perishable delivery |

## 6. Found objects & one-offs

| Item | Note | Status |
|---|---|---|
| **A better part, in a barn** | Mid-run finds are **events** — "an LSD in a barn, a better radiator." The find *is* the item; the category exists to make sure finds stay authored as moments, not loot rolls | **RATIFIED premise** |
| **Story keys** | The Roamer's currency. **Not an item** in the inventory sense — knowledge and unlocks, never resources or run-layer power (SM-INV-8/9). Listed only so nobody models them as inventory | **RATIFIED** |
| **Mission items from low country** | Open Q9A names "a specific mission item only found back down low" as the rare reason to return to unprofitable early regions | **PROPOSED** — unspecified |

---

## Gaps worth knowing before burning down assets

1. **There is no fishing system.** DESIGN.md mentions fish exactly once, in passing ("no fire, no
   fish, wake half-tired"). The whole catch category, The Confluence, and *coffee-is-debt-fish-is-
   income* rest on a minigame nobody has framed. **This is the single biggest gap in the catalog** —
   and it's upstream of any fish asset work.
2. **The item *structure* is deferred** (`IDEAS.md`). No slot model, no weight budget, no
   inventory UI is specified. Every "a slot" cost above is an assumption, not a rule.
3. **Consumables-as-real-mass is stated but never quantified.** It's the rule that makes tools
   interesting (§2) and it currently has no numbers behind it.
4. **Spare tire, air filter, quick-jack, breaker bar are named but undesigned.** They appear in one
   sentence of DESIGN.md as examples of stowed consumables. Whether roadside repair is even a
   player action is unspecified — which is a *mechanic* question, not an asset one.
5. **The chain may not be an item at all.** If the log drag supplies it, it belongs to the mission,
   not the inventory. Cheap to decide, and it changes whether it needs an asset.

## Adding to this catalog

Before a new item is worth a row:

1. What is it **described** as doing — in a sentence with no number in it (SM-INV-10)?
2. What does it **cost**, in a currency other than the one it pays out in?
3. Does it **enable a harder choice**, or make an easy one safe? (Only the first is legal.)
4. Is it consumed, carried, or fitted — and what does carrying it **weigh**?
5. Does it survive the run? (**It must not** — SM-INV-8/9.)

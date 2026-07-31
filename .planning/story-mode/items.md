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
   Items are found or bought **within a run** and die with it (SM-INV-8 as narrowed 2026-07-29 —
   only literacy and the garage survive). Nothing here persists.
4. **An item should enable a harder choice, not make an easy one safe** (`IDEAS.md`, cargo straps).
   The framing to hold everywhere: straps let you *accept freight-grade fragile work you couldn't
   otherwise carry* — they don't turn a normal fragile run into a cruise.

**Columns used below.** `Source` = where the player gets it. `Cost` = what it charges, in a currency
other than the one it pays out in (rule 4 restated). `Status` = **RATIFIED** / **PROPOSED** /
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
| **Fuel?** | Not in the design. Noted only so nobody assumes it exists. | — | — | **NOT DESIGNED** |

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
| **Cooking kit** | ~50 lb (≈23 kg) of always-carried mass. Renders as an **A-frame over the campfire with a Dutch oven hanging from it**. Gives a **flat bonus to the effect of food items** — there is deliberately no cooking *system*, no recipes, no ingredients. | Bought/found | ≈23 kg on every mile, for a benefit collected only at camp | **IDEA** — 2026-07-30. ⚠ Depends on food items, which do not exist (§1: fish is PROPOSED, and upstream of a fishing minigame nobody has framed) |

> **The visible-kit rule.** Camp gear is the one category whose ownership is legible *without a UI*:
> what you carry is what renders at the site, so **the campsite is the inventory screen**. That is
> the argument for growing this category ahead of the others — every entry pays for itself in
> readability, and none of it needs the inventory structure `IDEAS.md` has deferred. It also picks up
> the visuals FEAT-45 deferred on closing (`todos/completed/feat-dispersed-camping-areas.md` —
> "tent model + animated campfire w/ dynamic shadows"): that render work and this table are the same
> job seen from two ends.

> **It multiplies the energy, never the vibe.** The site's vibe score decides what a night at that
> spot is worth (`r(vibe) = lerp(1.5, 3.0, vibe)` in `src/day.js`); gear scales what you take away
> from it. Keeping them separate is what preserves **SM-INV-6** — *camping is a button, but the place
> decides the quality*. Folding gear into the vibe term would let a tent substitute for good ground,
> which is precisely the substitution that invariant exists to forbid. Do not "simplify" it later.

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

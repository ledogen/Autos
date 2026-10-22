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

**The build burn-down is FEAT-121** (`npm run dash` → **Items**): one row per item with what it needs
built (effect / param / gate / model), which systems it waits on, and which storefront sells it. This
file stays the design source; add an item here first, then its row there.

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
| **Coffee** | Alert now, sleepy earlier tomorrow. **A loan against tomorrow, repaid at interest.** The canonical consumable and the shape every other one is measured against. **+5 h now, −2 h off the next wake-up** (owner, 2026-10-20; was −3: five hours awake costs about three hours of sleep, so the cup has to beat that ratio or nobody drinks it). | Bought (general store, gas station, food vendor), **$3** | Tomorrow's hours | **RATIFIED** — DESIGN.md "The day and the clock"; figures §7 rulings 2026-10-20 |
| ~~**Cargo straps**~~ **[STRUCK 2026-10-14 — not an item; FEAT-110 closed, see §3e]** | Makes the **next fragile cargo** more resilient by changing the coupling between chassis and load — the cargo sees less shock than the truck does. Enables freight-grade fragile work you'd otherwise turn down. | Bought or found | Cash; a slot; trivial mass | **IDEA** — `IDEAS.md` 2026-07-29. *Open: single-use per job, degrades over several, or a reusable tool?* |
| **Fish (eaten)** | Alertness that **does not have to be repaid** — the only honest restoration in the game. *"Coffee is debt. Fish is income."* | Caught; best at a favored water | A long relationship with the water | **PROPOSED** — `spirits-and-pacts.md` #04. ⚠ Depends on The Confluence, which is deferred. **Four species (owner, 2026-10-21): salmon, rainbow trout, brown trout, catfish — each carries a different effect** (§5) |
| **Groceries** | **A delayed meal.** Bought at the general store **or a farm** (owner, 2026-10-21), carried, and **cooked into a meal at camp — only if you own the cooking kit**. **Ruled 2026-10-21:** one meal per bag; the cooked meal holds 10 h; cooking adds 30 min; cook it in the evening or the morning before you break camp; fresh for 24 h, and the cooler slows them like fish; the kit's flat food bonus does not apply on top — cooking them *is* the kit's bonus. $5; a reward from farms and the general store (B–A); never found. They still spoil (§1b), so they buy hours, not days. The meal for later in a run, when you camp far from a food vendor and the next stop with a kitchen is a day's drive off. Flavor: *"Fresh and goes together easy"* (owner, 2026-10-22). | Bought (general store, farm) | Cash; the spoilage clock; and the cooking kit's ≈23 kg on every mile | **RATIFIED** — owner, 2026-10-20; every figure set 2026-10-21 (the item setup page). Needs hunger (§1d) and the cooking kit |
| **Potato** | **The campfire meal** (owner, 2026-10-21). **Inedible raw.** Cooked on the campfire — **the only food you can cook without the cooking kit** — it becomes a decent meal. **Ruled 2026-10-22:** the cooked potato holds hunger 4 h; cooking adds 30 min; raw it never spoils, cooked it keeps 24 h; the cooking kit's food bonus applies to it; 5 to a slot. Under $5; a C–B reward from farms; never found. **Fish cooks on the campfire too** (§1b) — the potato is not the only campfire food, only the only one you buy. Flavor: *"Potato"*. | Bought (general store); a reward from farms | Cash; a slot | **RATIFIED** — owner, 2026-10-21; every figure set 2026-10-22 (the item setup page) |
| **Spare tire** | Recovers from a puncture without a tow. **Fitting it is a 2 h timeskip** (owner, 2026-10-22). **This supersedes the 90 min of 2026-10-20**, which had replaced 30 min (2026-09-30). **The compressor takes 30 min off and the quick-jack 1 h, and they stack** (§2): 1 h 30 min with the compressor, 1 h with the quick-jack, 30 min with both. Puncture is a hard fail state in the wear model. **Ruled 2026-10-21:** self-contained — the truck always carries the factory jack. Full-size only, no donut. **Two items in different pools: worn (50–80% condition, ~$15) and new (~$25).** Sold at the auto shop; a bonus item from the auto shop and stranded motorists (A–S); a rare roadside find. **The spare is the mounted pair** (2026-10-21, now that wheels and tires are separate parts, §3g): a standard tire on a new steel wheel, 21 kg, so fitting it also replaces a bent rim on that corner. **It is an ordinary inventory part, one slot** (owner, 2026-10-21: parts go in the inventory, never the bed — the bed stays open for hauling and freight; this retired a same-day under-bed carrier). After a roadside swap the punctured pair comes off still mounted, as a flat spare that keeps its tire and both wears, into the slot the spare left — so there is always room. A plug kit or the shop makes it a spare again. Flavor: *"This could help out in a pinch"* (owner, 2026-10-22). | Bought/found; in the inventory of 60% of jalopies, at 40–80% | Real mass, all the time | **RATIFIED** — owner, 2026-10-20/21 (the item setup page); the fit is built on feature/parts, not merged |
| **Air filter (spare)** | Replacement for the track the player must actively *watch* — it does ~nothing until it does. **Ruled 2026-10-21:** fitting takes 15 min and sets the filter to **the spare's own condition** — every spare filter carries one, like the spare tire: the auto shop sells them new ($10), and a roadside find is never in great shape. Sold at the auto shop; a reward from the auto shop and gas station (B–A). | Bought/found | Cash; a slot | **RATIFIED** — owner, 2026-10-21 (the item setup page) |
| **Fuel** | The tank. Burn is a function of rpm and load, so a par-beating drive costs fuel as well as wear. **The one cost that scales with distance** — SM-INV-5 keeps wear off the distance axis, and this is what fills it. Bought at gas stations. | Gas stations (a POI type) | Cash — and the detour, if you let it get low | **RATIFIED** — owner, 2026-08-01. Reverses this row's old *NOT DESIGNED*. Ticket FEAT-50; gauge already ships (FEAT-49). See DESIGN.md "Fuel and gas stations" |
| **Jerry can** | **A refillable 5 gal can** (owner, 2026-10-21): pour it into the tank, refill it at any pump. Fuel you carry — the cheap answer to running dry, which is otherwise the breakdown predicament (tow, or don't). **A top-tier reward**, rare on purpose: carried full, it all but retires running dry. **Ruled 2026-10-22:** poured parked, a 10 min timeskip like the emergency gas; **18 kg full** (14 kg of gas + a 4 kg steel can). An A–S reward from the gas station; **sold at the gas station, rarely**, for $30; a very rare roadside find. **Pouring sounds like a glug glug glug** — for the jerry can and the emergency gas (owner, 2026-10-22; FEAT-120). | A reward (gas station); bought (gas station, rarely); found (very rare) | Cash; a slot; **real mass, always** — 18 kg full | **RATIFIED** — owner, 2026-10-21; every figure set 2026-10-22 (the item setup page). Was IMPLIED (falls out of the fuel ruling) |
| **Emergency gas** | **A single-use 2 gal RotoPax** (owner, 2026-10-08). **Ruled 2026-10-21:** poured parked only, a 10 min timeskip; gone once poured. $5–10 at the gas station; a reward from gas stations and stranded motorists (B–A — mid tier, confirmed 2026-10-21), under the top-tier jerry can; never found. | Bought (gas station); a reward | Cash; a slot; 7.2 kg | **RATIFIED** — owner, 2026-10-21. In the game files (`data/items.js` `emergencyGas`, `data/offers.js` REWARDS); the grant is stubbed and the pour unbuilt |
| **Ice** | **The cooler's running cost** (owner, 2026-10-21). A bag lasts 72 h, so the cooler is refilled every 3 days; ice in the Ice King lasts 5 days (§2). **Ruled 2026-10-22:** $5 at the gas station and the general store; never a reward; never found. Flavor: *"Cold and wet"*. | Bought (gas station, general store) | Cash; the stop to buy it | **RATIFIED** — owner, 2026-10-21/22 (the item setup page) |

> **The coffee test.** Coffee works because its cost is in a *different currency* than its payout
> (hours for alertness) and lands *later*. Any consumable that pays and costs in the same currency is
> just a price tag. Check new entries against it.

### 1a. Food & temporary effects — the idea pool [owner brain-dump 2026-08-18]

Owner, unprompted, working the question *"what can food and items actually do to power up the
player?"* — **captured as stated, none of it ratified.** The value of the dump is that it shows the
whole shape of a **timed-effect layer** at once, which is the thing the catalog has been missing.
Sorted below by how close each one is to legal, not by the order they were said.

| # | The idea, as stated | Read |
|---|---|---|
| **A** | **Increases carry capacity** — temporarily, "maybe eight hours or a day" | **The strongest, and it drags a real mechanic in with it — see the load-budget ruling below.** As an item it needs a reframe: eating does not stiffen springs. The version that survives is *willingness*, not capacity — it lets you **accept an over-budget load**, and the truck then genuinely handles like it (rule 4 exactly: a harder choice, not a safe one) |
| **B** | **Overheat less** — "though I don't know how useful that would be" | **More pointed than the owner thought.** Early cooling is *designed* marginal, and freight on a long grade is the specified trigger for the overheat → power loss → engine wear → head gasket chain (`missions.md` §3c). An item that buys headroom on exactly that chain is aimed at the one wear track the catalog already knows is load-bearing. Pairs naturally with A — take the heavy load *and* survive the climb |
| **C** | **Day-only / night-only effects** | **Not an item — a modifier shape**, and a free one: the day clock already exists (SM-1). Anything below can be given a time-of-day window instead of a duration. A night-only effect is also the only clean way to make coffee's debt interesting a second time |
| **D** | **Burn less gas** | Legal in principle — fuel is the ratified distance cost — but this reads like a **part**, not a meal. Fuel burn is a function of rpm and load; a *driver* doesn't change it, a component does. Park it in §3b unless a fiction appears |
| **E** | **Damage resistance for the truck** | **The category error to watch.** Food acts on the driver; this acts on the chassis. Either it becomes a driver effect (steadier hands, so less shock reaches the truck — but then it is a number on the player) or it moves to §2 as strapping/padding, where cargo straps already live. As written it is a stat with no fiction under it |
| **F** | **Higher mission payout while the effect is active** | **Fails the coffee test as written** — bought with cash, pays out in cash, so it is a price tag with a timer. Salvageable only if the cost is in a different currency: hours, a detour, a worse load, an obligation |
| **G** | **Traction in the rain** | **Blocked — there is no weather.** Worth keeping on the list precisely because it names a whole missing system; do not author it as an item first |
| **H** | **Changes something about the world — "increases road camber temporarily"** | **The weakest, and the one to reject loudest.** The world is the one thing that must stay honest — MESH == PHYSICS, and *emergent over injected* is the standing worldgen rule. An item that edits terrain to be nicer is a power floor wearing a physics costume (SM-INV-9) |
| **—** | **Something that makes you faster** | **Rejected by the owner in the same breath** — "a little on-the-nose." Recorded so nobody re-proposes it |

**"Some of them can be fish too."** This is the first proposed *use* for the catch category beyond
alertness, and it would give the distinct-waters ledger (§5) somewhere to land. ⚠ **It also collides
with the one thing fish are currently committed to:** *coffee is debt, fish is income* — fish as
unrepaid alertness (`spirits-and-pacts.md` #04). If fish become the carriers of timed effects, they
stop being the honest-restoration counterweight and become a buff table with scales on. **Owner's
call, flagged not resolved.** The cheap compromise, if wanted: fish restore, *cooked* fish at camp
carry the effect — which prices the effect in camp time and firewood rather than in nothing.

**The structural question under all of it.** A timed-effect layer is a stat framework, and SM-INV-10
says described, never scored. Two things have to be answered before any of these becomes a row above:

1. **How does the player know an effect is running, without a meter?** This is less hostile than it
   was — the 2026-08-17 amendment reversed SM-INV-3's "never live" clause for the rank indicator, so
   a live diegetic indicator is no longer forbidden on principle. It still has to read as *the world
   telling you*, not a buff bar.
2. **What is the duration in?** "Eight hours or a day" is the right instinct — the game's clock is the
   day, so effects should expire on **sleep or hours**, never on a job count. That also makes every
   effect cost the same scarce thing the day already costs.

#### The load-budget ruling this dropped out of [owner-specified 2026-08-18, needs ratifying]

Idea **A** carried a freight mechanic with it, and the mechanic is the more valuable half:

> At a freight giver, you're shown **a variety of objects to pick from**. Each has a mass. Some are
> **too heavy for your vehicle to carry** — outside its budget. You raise the budget by **upgrading
> suspension and tires**, which lets you take the heavier items: harder to deliver, worth more money.

Why this is good: it makes freight a **choice at the giver** rather than a load handed to you, it
gives §3a's suspension and tire parts a *reason to be bought* that isn't "wear ran out", and the
difficulty scales through mass — which is already real load that shifts CoG, so nothing new has to be
plumbed (`missions.md` §3c: *"no new wear plumbing"*). It also gives the visible-offer-board work
(FEAT-67) a second thing to show.

Open, and the owner's to settle:

- **[RESOLVED 2026-10-14 — FEAT-112]** Soft *and* hard: past a soft limit the card warns and you may
  take it; past a hard limit (size or weight) you may not. Each part moves the limits through its own
  function on the truck configuration. *Original question:* **Is the budget a hard refusal or a soft one?** Refusing to load is clean; letting you load it and
  watching the truck squat onto the bump stops is more honest and more AUTOS. The middle option —
  it loads, but the giver tells you it's a bad idea — is probably the answer.
- **Does this survive the run?** Suspension and tires are run-layer purchases, so the *budget* dies
  with the run (SM-INV-8/9). Fine — but say so, because "upgrade to carry more" is the exact sentence
  shape a power floor usually arrives in.
- **Where does the mass menu come from?** §4's cargo table is currently one row for freight
  ("pallets"). A pick-list needs three or four masses with different shapes — and shape matters as
  much as mass once it's in the bed.

### 1b. The spoilage clock [owner-specified 2026-08-22]

**A real timer, running all the time, measured in hours.** Every food and perishable item carries a
spoilage clock that ticks against the day clock whether you are driving, parked or asleep. This is
the first piece of §1a's missing timed-effect layer to be specified — and note it is a **decay**
clock, not a buff clock: it takes things away rather than granting them, which is why it can exist
before the buff question is settled.

**Everything is in hours.** Multi-day durations are still expressible — they are just written 24 or
48, never "two days." One unit, one clock, no second vocabulary.

| Perishable | Fresh for | Consequence when it runs out |
|---|---|---|
| **Fish, uncooked** | **~6 h** (2026-10-21; was ~4–5 h) | Gone. Cook and eat it on the spot, or lose it |
| **Fish, in a cooler** | **~36 h** (2026-10-21: ×1/6); **~48 h in the Ice King** (2026-10-22: ×1/8) | You can carry it, camp on it, and still eat it tomorrow — a two-rung ladder, see below |
| **Chili dog** | **16 h** (2026-10-21) | Gone |
| **Packed lunch** | **24 h** (2026-10-21) | Gone |
| **Burger** | **16 h** (2026-10-21, like the chili dog) | Gone |
| **Groceries** | **24 h**; the cooler slows them like fish (×1/6) (2026-10-21) | Gone |
| **Potato** | **raw: never spoils; cooked: 24 h** (2026-10-22) — inedible until cooked on the campfire | Cooked: gone |
| *(everything else)* | unspecified | Cooked fish and food-as-cargo still want a figure |

**What the fish number actually does.** The day is 12–16 h (the alertness ladder, FEAT-54), so a
fish landed in the morning is dead by mid-afternoon. Without cooling, **fishing early is a
commitment to stopping early** — you break off, make a fire, and cook it, which spends the one thing
the day is made of. Fishing late is the free version; fishing at dawn costs you the middle of the
day. That tension is entirely a product of the two clocks meeting, and nobody had to author it.

**The cooler is the modifier, and it is a rate multiplier** (§2) — owner-ruled 2026-08-22. The
owner's first shaping was *a flat percentage reduction to the spoilage timer*; the stored form is a
**multiplier on the decay rate**, because multipliers compose when a second modifier turns up and
percentages-off do not. Same design, honest arithmetic.

> **The arithmetic, stated because it changes what kind of item this is.** 4–5 h → 24–48 h is not a
> trim: it is the decay rate divided by roughly five to ten. So a cooler is never a marginal
> modifier — it is the switch between two regimes, *eat it now* and *carry it*.

**There is deliberately room above the first cooler** — owner-ruled 2026-08-22. This is why the
multiplier form matters: at ~80–90% off there is almost no percentage left to give a better box, but
as a rate multiplier the ladder just keeps halving and never runs out of room. So the first cooler
must **not** be authored at the top of the range — a basic box that already gets you 48 h leaves the
better one nothing to sell.

The natural split — *proposed, not ruled; the owner has ratified the headroom, not these figures*:

| Tier | Rate multiplier | Fish keeps for | Reads as |
|---|---|---|---|
| **None** | ×1 | ~4–5 h | An appointment: cook it where you stand |
| **Cooler** | **×0.2** | **~24 h** | Carry it through the day, eat it at camp tonight |
| **Better cooler** (now the **Ice King**) | **×0.1** | **~48 h** | Camp on it and still have it tomorrow |

That reading takes the owner's own *"a day or two"* and treats **24–48 h as the ladder rather than
one item's spread**, which is the cheapest way to honour the headroom ruling. The second tier is also
where §3d's brand logic would naturally land if the shop ever wants it: same object, better
insulation, priced as durability is priced.

**SM-INV-10 is satisfied the same way the camp gear satisfies it:** the multiplier is legal as
*internals* — the game is full of them — provided the figure never surfaces in the UI. The player is
told *the fish is still good* or *the fish has turned*, never a percentage or a countdown bar.

**RULED 2026-10-21 (the item setup page):** uncooled fish keep ~6 h; **the cooler holds 4 fish** and keeps them
~36 h (×1/6 — so the proposal table below is superseded for the first rung).

**RULED 2026-10-22:** the better cooler is renamed the **Ice King**. It is **×1/8**, so fish keeps
~48 h, and **its ice lasts 5 days** instead of 3. Both coolers can be carried (§2).

Open, and the owner's:

- **Does the clock pause anywhere?** Sleeping advances hours, so an uncooled fish dies overnight by
  simple arithmetic — which is the right answer. But if a *cooled* fish is meant to survive two
  nights, 48 h has to be measured against nights slept, not just hours elapsed.
- **Can you cook away from camp?** The fish rule leans on being able to make a fire and cook. Camping
  is a gated button in campable regions (SM-INV-6, FEAT-45). If cooking is camping, then a morning
  fish forces an early *camp*, not just an early *stop* — a much bigger cost, and possibly the more
  interesting one. *Half-answered 2026-10-22: fish does cook on the campfire, like the potato. Whether
  that fire needs a full camp is still open.*
- **What else is on the clock?** The table above has one row filled in. Bought food, cooked fish and
  any perishable freight need figures before this is a system rather than a fish rule.

### 1c. Instant-use items — the quick slots [owner-specified 2026-09-24]

Owner, captured as stated — **not ratified**:

> Instant-use items are bound to keys — maybe **1 2 3 4** — and trigger instantly. They can be used
> **while driving**, and are either **consumable** or on a **cooldown**.

This is the first concrete proposal for part of the deferred **item structure** (Gaps #3): a
handful of quick slots for things you use *on the move*, separate from whatever holds tools, parts
and cargo. Keys 1–4 are currently unbound in `src/` (checked 2026-09-24).

| Item | As stated | Kind | Read |
|---|---|---|---|
| **Coffee** | Restores restfulness on the go | Consumable | **Already ratified as an item** (§1 row 1) — this adds *how you use it*: one keypress, mid-drive, no stopping. The loan still stands: alert now, sleepy earlier tomorrow. The quick slot changes the verb, not the price |
| **Energy drink** | Same job as coffee | Consumable | **RULED 2026-10-20: +5 h now, and a crash of half that (−2.5 h) four hours later, the same day.** $4. Needs to differ from coffee or it's a duplicate. The natural split is **the shape of the loan**: coffee borrows from *tomorrow*; an energy drink hits harder and faster, and the **crash comes the same day, a few hours later**. A short, steep loan versus a long, soft one — a real choice between two slots. ⚠ As stated ("restores restfulness") it would be free alertness, which is fish's role alone (*coffee is debt, fish is income*). It has to carry a debt |
| **Sacred object / totem / charm** | Grants a **percentage damage reduction**, or **invulnerability** — **both versions are timed** (owner 2026-09-24: "the percentage version is also either on cooldown or consumable") | Cooldown or consumable, either version | **RULED 2026-10-22 (the item setup page): timed damage reduction only.** The invulnerability window is dropped; the rest of this cell is the 2026-09-24 reading. **Two versions, both kept.** *Reduction*: for a while, knocks land softer on the truck. *Invulnerability*: a **short window you trigger** — "for a moment, nothing touches the truck" — an event that asks for a timing decision (you press it as you see the crash coming). The owner's ruling that the reduction is timed too takes out the floor objection: nothing is permanent, so it doesn't raise the floor (SM-INV-9). **Still to hold:** the reduction must never be *shown* as a number (rule 1, SM-INV-10). The player feels it; no "−30%" appears anywhere. It is also exactly §1a-E ("damage resistance for the truck"), and the fiction resolves that category error: this is a spirit's gift, not food. In both versions the physics still happens (SM-INV-1; the truck still rolls), and only the damage is softened or skipped. **Source: the Host** (`spirits-and-pacts.md` #02, owner 2026-09-24). The charm is the *active* form of the Host's damage-resistance reward; the *passive* form is slower wear while you're in favour. Its price beyond the cooldown is still open, and the Host's good-nights streak is the natural candidate. It dies with the run (rule 3) |

Open, and the owner's to settle:

- **Cooldown vs consumable is a real fork.** A consumable is spent. A cooldown item is *owned* for
  the rest of the run, and in practice becomes a permanent ability until the run ends. The charm can
  be either (owner, 2026-09-24). ~~Open: is it one item that comes in two forms, or two different
  charms?~~ **Ruled 2026-10-22: one form — timed damage reduction only.** Still open: is "cooldown"
  meant for spirit gifts only?
- **How does the player see a slot's state** (a charge left, a cooldown ticking) without a meter?
  This is §1a's question 1 again. The quick slots are the first place it has to be answered for real.
- ~~**Does using an item while driving cost anything physical?**~~ **RULED 2026-10-20: no — a free
  action.**
- **Four slots or fewer?** The number of slots is itself a load budget. Fewer slots make each one a
  harder choice (rule 4).

### 1d. Hunger — a rate on the energy clock, not a second meter [owner-approved direction 2026-09-30, figures open]

**Hunger is not a bar.** It is a **multiplier on the energy drain** that already ships (`src/day.js`:
awake drains 1 h of energy per in-game hour). Past a threshold since your last meal, the tank drains
faster. Eating resets the clock. There is one clock on the driver, and it is still energy.

| Hours since last meal | Energy drain | Reads as |
|---|---|---|
| 0 – ~6 h | ×1 (baseline) | Fed. Nothing happens |
| hold expired | **×1.25, rising to ×1.5** | *You're running on empty* — the sleepy stage arrives earlier in the day |

**RULED 2026-10-20:** the rate is ×1.25 rising to ×1.5. **The threshold depends on the food:** each
food carries its own *hold*. A standard meal (a burger) holds about **8 h** — energy does not drain
asleep, so two of them cover a 16 h waking day. The chili dog holds **10 h**.

**Why this shape.** A separate hunger meter would add a pressure mainly so items can relieve it, and it
would be a second clock competing with energy for the player's attention. As a drain rate it costs
nothing to understand: skip lunch and the day is shorter. **Ignoring it is never fatal**, it only
spends daylight, so it can't turn into a chore. Thirst is out (owner, 2026-09-30: *too much*).

**What it gives the catalog, all at once:**

- **A food class.** Diner meals, a packed lunch, cooked fish, gas-station junk food. Each resets the
  hunger clock; they differ in what else they do. **The roster as of 2026-10-21:** the **burger** (its
  own item at the food vendor — the standard meal, ~8 h; spoils in 16 h, $5, a C–B reward from the food
  vendor, never found), the **dinner meal** (renamed from diner meal:
  one generic sit-down meal at the food vendor, 8 h, 30 min to eat, $5–10, eat-in only, never found;
  **as a reward it is a dinner invitation** (owner, 2026-10-22): a C–B reward from residences, the
  food vendor and farms, where the customer asks you to join them for dinner — optional, 30 min, and you
  are fully fed), the chili dog
  (10 h, spoils in 16 h), the **packed lunch** (never sold — a $6 reward from homes, farms and the food
  vendor, B–A; 8 h; fresh 24 h), groceries (§1, cooked at camp: the meal holds 10 h), the **potato** (§1, cooked on the campfire, no kit
  needed; inedible raw; holds 4 h), and four gas-station snacks split from one: **bag of peanuts 3 h × 3, spicy chips
  3 h × 3, candy bar 3 h × 4, gummy worms 2 h × 5** (hold × stack, owner 2026-10-21). All under $5; a C–B
  reward from the gas station (peanuts and gummy worms also the general store); found roadside near gas
  stations — rare, peanuts less so.
- **Flavor lines** (owner, 2026-10-22 — the in-game text on each food; groceries and the potato
  carry theirs on their §1 rows):
  - **Burger** — Flavor: *"The classic"*
  - **Dinner meal** — Flavor: *"A hearty meal. Dine in only"*
  - **Chili dog** — Flavor: *"Kinda gross"*
  - **Packed lunch** — Flavor: *"Homemade!"*
  - **Bag of peanuts** — Flavor: *"Mmm, salty"*
  - **Spicy chips** — Flavor: *"Almost too hot"*
  - **Candy bar** — Flavor: *"A bit melty"*
  - **Gummy worms** — Flavor: *"Only a couple blue ones"*
- **The "reduce energy drain" items** the owner asked for — they are simply the meals, and the
  effect is honest (a fed driver tires at the normal rate).
- **A home for §1a's timed effects.** A meal is the natural carrier for *"for the next 8 h"*: a
  hearty breakfast holds the hunger clock longer, a greasy one does it and makes you sleepy after
  (a same-day loan, the energy drink's shape). Every effect expires on the §1b hours clock.
- **A reason to stop.** Diners and stores become stops with a purpose, priced in the detour and the
  time it takes to eat — the coffee test passes (cash + time for daylight).
- **Fish stays honest.** A fish is a meal *and* the Confluence's unrepaid alertness, so *coffee is
  debt, fish is income* still holds, and cooked fish gets a second job without becoming a buff table.

**SM-INV-10.** No hunger number, no hunger bar. The driver *is hungry* — a line on the energy meter's
stage text, or a card at a stop, never a gauge. The energy meter already shows the consequence.

Open, and the owner's:

- **Does sleep reset hunger?** Simplest: waking counts as a meal only if you ate at camp (cooking kit,
  fish). Otherwise you start the day already on the clock — which gives the cooking kit its real job.
- **Food on the spoilage clock (§1b).** Bought food needs a fresh-for figure; a packed lunch that
  turns by afternoon is the natural first one.
- ~~**Quick slot or stop?** Snacks from a quick slot while driving (§1c); meals only when stopped.~~
  **RULED 2026-10-21: all food can be eaten while driving.** (The dinner meal is eaten at the vendor
  because it is a sit-down menu item, not because carried food needs a stop.)

## 2. Tools

Kept, re-used, and heavy. The distinction from consumables is that a tool's cost is **permanent mass
plus a slot**, paid on every mile you carry it, against a payoff you only occasionally collect.

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Quick-jack** | Lifts the truck for roadside work. **Ruled 2026-10-22: it takes 1 h off changing a whole tire** — the spare's 2 h fit becomes 1 h — **and stacks with the compressor's 30 min** (both: 30 min). The spare does not need it: the factory jack is always in the truck (§1). $30; sold at the auto shop; an A–S reward from the auto shop and stranded motorists; never found. | Bought; a reward | Cash; a slot; real mass, always | **RATIFIED** — owner, 2026-10-22 (the item setup page). Was IMPLIED (named in DESIGN.md "The car") |
| ~~**Breaker bar**~~ **[STRUCK 2026-10-22 — cut by the owner on the item setup page]** | Roadside wrenching. Paired with the quick-jack in the bible's own list. | — | — | **CUT** |
| **Chain** | Chains onto a downed log for the drag. **A one-sided distance constraint** — zero force slack, hard tension taut — and the snatch impulse *is* the damage signal. | Main-mission equipment | The truck, by design | **RATIFIED premise** — `missions.md` "Main missions". *Open: carried item, or supplied by the mission?* |
| **Fishing gear** | Required for the fishing minigame. **Proposed by the owner (2026-10-22, "prob"): three rods — Basic, Advanced and Professional.** | ? | ? | **IMPLIED / UNSPECIFIED** — see the gap note below |
| **Cooler** | **A flat rate reduction on the spoilage clock (§1b).** Uncooled, a fish is good for about four or five hours — cook it on the spot or lose it. In the cooler it keeps for a day or two, so you can carry the catch, camp on it, and eat it tomorrow. **Ruled 2026-10-21: ~6 h uncooled → ~36 h in the cooler, and it holds 4 fish.** **Its running cost is ice** (owner, 2026-10-21): it must be refilled every 3 days (a bag of ice lasts 72 h), bought at the gas station and the general store. Sold at the general store and tackle shop, $10–30; a tackle-shop reward (A–S); a roadside find rarer than the common ones. **Primarily fishing kit** — it is the thing that lets a catch leave the water without being eaten where it was landed. Flavor: *"Keeps stuff cold"* (owner, 2026-10-22). | Bought/found | Cash; a slot; **deliberately trivial mass — which is the problem, see the note below** | **RATIFIED** — owner, 2026-08-22; every figure set 2026-10-21/22 (the item setup page). Was IDEA |
| **Ice King** (was the better cooler) | **The second cooler** (renamed by the owner, 2026-10-22). **×1/8 on the spoilage rate — fish keeps ~48 h** — and **its ice lasts 5 days** instead of 3. **Both coolers can be carried.** $30–100; sold at the tackle shop and the general store, very rarely; an S-only reward from the tackle shop and residences; never found. | Bought; a reward | Cash; a slot; ice every 5 days | **RATIFIED** — owner, 2026-10-22 (the item setup page). How many fish it holds is open |
| **GPS unit** | **Draws the mission route in the 3D world** so you drive it by looking out of the windscreen instead of stopping to read the map — FEAT-39's chevrons + junction arrow boards, already shipped in `src/gps.js`. A **direct convenience upgrade for any player**, and deliberately a common find: it does not make you *faster*, it makes knowing-the-way *free*. A skilled player reads the map and spends the cash elsewhere. **Until you find one, the paper map (FEAT-16, `M`) is all you get** — navigation is map-reading, landmarks, and memory. **Owner, 2026-10-22: "it's a minimap."** No minimap exists in `src/` today; whether it replaces the in-world chevrons or joins them is open. **Ruled 2026-10-22:** strictly per run — you re-find it every run; **uncommon** (this replaces "deliberately a common find" above); $10–30; sold at the auto shop, rarely; an A–S reward from the auto shop and stranded motorists. | Found or bought within a run | Cash; a slot; trivial mass — the real cost is that you had to *earn* legibility | **RATIFIED premise** — owner, 2026-07-31: "GPS should be an item; until you find it you navigate via the map alone." ~~*Open: strictly per-run, or does knowing-where-one-sells count as the literacy that persists?*~~ **Strictly per run (2026-10-22).** Whether it is a roadside find is still open |
| **Destination beacon** | Shows a **beam of light rising from the destination**, visible over terrain from far off. Gives *bearing*, not route — the point is that it makes **off-route travel** findable: you can leave the road, crest the ridge, and steer by the light. It answers "where," never "how." | Found or bought within a run | Cash; a slot | **IDEA** — owner, 2026-07-31. *Open: always-on while carried, or aimed/activated? Render: a sky-beam is cheap and reads at range, but must respect fog/night (day/night pass made fogColor a radiance value).* |
| **Shortcut GPS** | **The Shortcut's relationship, rendered on the windscreen.** It ties cut generation (FEAT-52) into the on-screen navigation — FEAT-39's chevrons and junction boards applied to **cuts** as well as roads. It shows you what the Shortcut has **already revealed to you**, so it is worthless at zero esteem and better the warmer he gets. Par is unaffected: par is always the road route (SM-INV-2). The advanced GPS — very rare. | Found or bought within a run; **very rare** | Cash; a slot | **RATIFIED** — owner, 2026-08-02 (**rebuilt**; was "his knowledge on a chip, strictly stronger than his pact"). *The "what is a shortcut" tech question is ANSWERED: cuts are real worldgen objects (FEAT-52), not an overland-routing problem.* |

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
> beacon gains off-route options the GPS would never suggest. **Author them so no item obsoletes
> another** — and, as of 2026-08-02, so that **no item obsoletes a *spirit* either.**
>
> **The shortcut GPS renders the Shortcut; it does not replace him** [RATIFIED 2026-08-02, owner —
> **this reverses the 2026-08-01 "a spirit dumb enough to be firmware" framing**]. The owner's rule:
>
> > **The spirits are the gameplay tension. Items build on them, they don't arbitrate between them.**
>
> So the chip **ties cut generation into the on-screen navigation** — nothing more. It draws what the
> Shortcut has already told you, using the FEAT-39 overlay you already have. Three consequences:
>
> - **It is worthless at zero esteem** and improves as he warms. Item and relationship *multiply*
>   rather than compete, which is the shape the whole catalog is supposed to have.
> - **The coercion problem is gone.** The old chip "revealed **and routed**," so a Highway-aligned
>   player carrying it was fighting their own nav overlay and risking wrong turns by ignoring it. A
>   display layer over cuts you already know about has no opinion about your route.
> - **`pact ⊂ chip` is gone**, because there is no pact — the route domain is **relationships, not
>   pacts** (`spirits-and-pacts.md` #05/#06, rebuilt 2026-08-02). The redundancy this section used to
>   *tolerate*, and its parked fix (*"an item can know; only a spirit can act"*), are both **moot and
>   deleted.**
>
> **The gating rule:** with a plain GPS and no standing with the Shortcut, **you are never routed
> through a cut** — and you don't know where they are. The road GPS honestly prefers the maintained
> network, because by the router's own cost function a cut *is* bad line. Cuts stay something you find
> yourself until the Shortcut starts talking; the chip only ever puts *his* knowledge on the screen.
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
> *(Superseded twice, recorded so neither draft is re-proposed. **Draft 1** split the item from the
> pact — item shows a cut **exists**, pact shows which cuts still **go** — to stop the item devaluing
> the pact; ruled against 2026-08-01. **Draft 2** made the chip strictly stronger than the pact;
> retired 2026-08-02 along with the pact itself. The chip is now a **display layer over the
> relationship**, so there is nothing left to devalue. The old "an item that reveals off-road lines
> systematically beats par" flag retires with both — cuts carry real costs, so a revealed cut is not a
> free second.)*
>
> **The carry-cost question, unresolved and worth deciding early.** Tools are the only category whose
> cost is paid continuously and whose benefit is occasional. That's a genuinely interesting decision
> (*do I carry the jack today?*) **only if the mass is felt**. If it isn't, tools are free and the
> category collapses into "things you buy once." Decide whether stowed mass is legible to the player
> before authoring more of them.

> **The cooler is the first item aimed at a *spoilage clock* — and that clock is already ratified**
> [owner, 2026-08-22]. It is one object sitting across two mechanics, which is why it is worth more
> than its row.
>
> - **The catch — this is the primary one** [owner, 2026-08-22]. Uncooled, a fish is good for about
>   four or five hours: cook and eat it where you stand, or lose it. Cooled, it keeps a day or two,
>   so the catch can travel. That is the whole item, and it is a **flat rate reduction on the
>   spoilage clock** — the mechanic is specified in §1b. It also unblocks the *fish-as-cargo* axis in
>   §5's species table, and carries a hoarding hazard — see the flag there.
> - **Perishable quest cargo — secondary, and open.** DESIGN.md "The day and the clock"
>   (ratification pass 2026-07-19) commits that camping mid-mission is job-dependent: *short,
>   perishable ones die overnight — the milk spoils, the fiction supplies the penalty*. **The milk is
>   a quest item, not a food item** [owner, 2026-08-22] — that rule is mission fiction, not the §1b
>   clock, and the two must not be conflated. There is *potentially* room for the cooler to assist
>   here, but it is a separate ruling and it has not been made. If it ever does, rule 4 holds **only
>   under the acceptance framing**: it lets you take a perishable job you *cannot* finish before
>   dark — one you'd otherwise refuse — and it must not make an ordinary same-day milk run safer,
>   because that run was never at risk. Write it that way or it becomes insurance.
>
> **Its cost is the unsolved half, because trivial mass means no continuing cost at all.** This is
> §2's carry-cost question arriving with a second concrete instance (the cooking kit's 23 kg was the
> first): bought with cash, paying out in jobs you can now accept, it is a price tag with a lid.
> Three candidate costs, none ruled — **owner's call**:
>
> 1. **Ice.** The box is only cold while it has ice, and ice is bought in town and gone on the day
>   clock. That prices the effect in cash *plus a detour*, which is precisely how fuel was priced
>   when it was ratified (2026-08-01), and it makes the cooler **the first tool in the catalog that
>   eats a consumable**. The fiction and the POI both already exist — `asset-gas-station.md` puts an
>   ice chest by the door.
> 2. **Volume, not mass.** A cooler in the bed competes for space with the load-budget pick-list
>   (§1a): free on an empty run, and on a freight run it is the reason the big item doesn't fit.
>   Self-policing, and it needs no plumbing that the pick-list ruling doesn't already want.
> 3. **A slot and nothing else** — the honest minimum, and the weakest.
>
> *(Read: 1 and 2 together are the strong version — ice gives it a running cost in the currency the
> day is already made of, volume gives it a cost that only bites when you're being greedy.)*
>
> **Everything is in hours** [owner-ruled 2026-08-22 — this replaces an earlier reading in this note
> that put the unit in nights]. Multi-day durations are written 24 or 48, not "two days." One clock,
> one unit. The figures the cooler is measured against live in §1b.
>
> **Describe it, never score it (SM-INV-10).** *The milk is still cold in the morning* — not a
> freshness percentage, not a spoil timer on the HUD. **Legibility is half-solved for free:** a
> cooler is a box in the bed, so ownership reads without a UI (camp gear's visible-kit rule applies
> here too). Whether its *state* reads — still cold vs. ice long gone — is the open one; a puddle
> under the tailgate is the diegetic answer if it needs one.
>
> ⚠ **The fishing half is downstream of gap 2** — there is no fishing system, so the cargo half
> (perishable freight) is buildable today and the catch half is not.

## 2b. Camp gear

The kit you sleep under. A sub-category of tools, because it inherits the tool cost model exactly —
**permanent mass plus a slot, paid every mile, collected one night at a time**. It gets its own
section because it is the only gear with a *shipped* mechanic under it: FEAT-45's camping and
FEAT-47's energy clock already exist, so these are the first entries whose effect has somewhere to
land. Nothing here is built (owner, 2026-07-30: *catalog it, don't build it*).

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Bedroll** | **The baseline sleeping item — no bonus.** Everybody has one. It is what the rest of this table is measured against. | Starting kit | Its own trivial mass; the sleeping item's slot in the pack (§2c) | **RULED** — owner, 2026-10-16. Replaced by an air mattress or a pad, never removed for nothing |
| **Air mattress** | **Sleeping item.** **+5% recovery rate.** **Replaces the bedroll** in its slot and in the rendered camp. | Bought/found | Cash; the sleeping item's slot; small mass | **RULED** — owner, 2026-10-16 |
| **Sleeping pad** | **Sleeping item.** **+10% recovery rate.** Replaces the bedroll. | Bought/found | Cash; the sleeping item's slot; small mass | **RULED** — owner, 2026-10-16 |
| **Deluxe sleeping pad** | **Sleeping item — the best bed.** **+15% recovery rate.** Replaces the bedroll. | Bought/found | Cash; the sleeping item's slot | **RULED** — owner, 2026-10-16 |
| **Sleeping bag** | **Add-on, not a sleeping item.** Not required to sleep; takes **its own slot**. **+10% recovery rate**, combining with the bed and the blanket. Renders with the bed, not in place of it. | Bought/found | Cash; its own slot; small mass | **RULED** — owner, 2026-10-16 (was a ~1.1× multiplier that replaced the bedroll) |
| **Tent** | A multiplier on the energy a night buys, larger than the sleeping bag's old ~1.1×. *Open since 2026-10-16: the bed and add-ons are now % bonuses on the recovery rate — is the tent one too, and what does it replace in the render?* Was: **replaces the sleeping bag** in the rendered camp — the campsite visibly becomes a camp rather than a man on the dirt. | Bought/found | Cash; a slot; real mass | **IDEA** — 2026-07-30 |
| **Blanket** | **Add-on, not a sleeping item.** Not required to sleep; takes **its own slot**. **+5% recovery rate**, combining with the bed and the sleeping bag. The cheap first upgrade over the bare bedroll. | Bought/found | Cash; its own slot; trivial mass | **RULED** — owner, 2026-10-16 (was the small end of the multiplier) |
| **Cot** | **Vibe axis — flatness.** Makes unflat ground sleepable: fills part of the flatness deficit of the site you chose. Inert on ground that is already flat. | Bought/found | Cash; a slot; real mass (it's a folding frame) | **IDEA** — 2026-08-01 |
| **Canopy / tarp** | **Vibe axis — shade.** Makes an exposed site bearable: fills part of the shade deficit. Inert under trees. | Bought/found | Cash; a slot; small mass | **IDEA** — 2026-08-01 |
| **Binoculars** | **Vibe axis — view.** Something to look at from a site with nothing much to look at. Inert on a spot that already has the valley in front of it. **Unblocked:** view is now a real segment — `VIBE_W = { flat .40, view .15, shade .20, water .25 }` in `src/camp.js`, re-ratified 2026-08-01, and the raw score is `skylineView()`'s angular field-of-vision scan. So the deficit this fills is `1 − viewScore`, and it is **the cheapest entry in this table to build** — the only camp-gear row whose whole dependency chain already ships. | Bought/found | Cash; a slot; negligible mass | **IDEA** — 2026-08-01; **owner re-affirmed 2026-08-18** |
| **Backpack** | **Moved to §2c — backpacks are now their own item class** (owner, 2026-10-16). The reach idea below survives as one of a pack's two traits. | — | — | see §2c |
| **Shovel** (renamed from camp shovel, owner 2026-10-22) / **Long-handled shovel** | **Sources ruled 2026-10-22.** *Shovel:* $10–30 at the general store; a B–A reward from the general store, farms and work sites; a rare roadside find. *Long-handled shovel:* $10–30 at the general store; an A–S reward from farms, work sites and the general store; never found. **Both can be carried; owning both adds nothing.** **Permission — a fourth axis, the Backpack's twin.** Lets you **dig a level pad on sloped ground**: raises the campable gate (`campGateUnevenM`, the max height spread across the 6 m pad, 1.2 m today ≈ 8–11° of slope depending on how the pad sits on the fall line). Two tiers: the folding camp shovel moderate, the long-handled shovel to roughly **20°**. Fills no vibe segment — a dug bench on a hillside still scores zero flatness, and **the Cot is what pays that deficit**, so the two stack rather than overlap. **Measured, raw terrain, seeds 1/6/42, random pad orientation:** today's 1.2 m gate passes **~5–7%** of the map; **1.6 m (≈11–15°) → ~10%**; **2.2 m (≈15–20°) → ~20%**; 3.0 m (≈20–27°) → ~35%. So each tier roughly doubles the campable ground — 2.2 m is the "max 20°" figure. | Bought — the general store already stocks shovels (`data/offers.js` cargo `shovel`, ~2 kg); long-handled tier rarer/pricier | Cash; a slot; ~1 kg / ~2.5 kg | **IDEA** — owner, 2026-10-15. **No extra clock time** (owner, 2026-10-15): the dig is folded into the existing 30-min make-camp chore (`src/day.js`), whatever the slope. ~~*Open: does the long shovel replace the camp shovel or stack?*~~ **Both can be carried, no extra effect (2026-10-22).** Open: the gate each one raises to (1.6 m and 2.2 m proposed) |
| **Cooking kit** | ~50 lb (≈23 kg) of always-carried mass. Renders as an **A-frame over the campfire with a Dutch oven hanging from it**. Gives a **flat bonus to the effect of food items** — there is deliberately no cooking *system* and no recipes. **One ingredient exists:** groceries (§1), which only the kit can turn into a meal (owner, 2026-10-20 — amends this row's original *no ingredients*). | Bought/found | ≈23 kg on every mile, for a benefit collected only at camp | **IDEA** — 2026-07-30. ⚠ Depends on food items, which do not exist (§1: fish is PROPOSED, and upstream of a fishing minigame nobody has framed) |

> **The visible-kit rule.** Camp gear is the one category whose ownership is legible *without a UI*:
> what you carry is what renders at the site, so **the campsite is the inventory screen**. That is
> the argument for growing this category ahead of the others — every entry pays for itself in
> readability, and none of it needs the inventory structure `IDEAS.md` has deferred. It also picks up
> the visuals FEAT-45 deferred on closing (`todos/completed/feat-dispersed-camping-areas.md` —
> "tent model + animated campfire w/ dynamic shadows"): that render work and this table are the same
> job seen from two ends.

> **Vibe-assist cap [RULED 2026-10-20]:** cot + canopy + binoculars together add at most **+0.3** to a
> site's 0–1 vibe.
>
> **Two axes: some gear scales the energy, some gear scales the vibe.** [RULED 2026-08-01, owner —
> supersedes this section's original "it multiplies the energy, *never* the vibe."] The site's vibe
> score decides what a night at that spot is worth (`r(vibe) = lerp(4/3, 8/3, vibe)` h/h in `src/day.js`).
>
> - **Energy axis** — the sleeping items (bedroll, air mattress, sleeping pad, deluxe sleeping pad),
>   blanket, sleeping bag, tent, cooking kit.
>
> **The campfire is not an item** (owner, 2026-10-16). It spawns to mark camp, every camp has one,
> and it never takes a slot. No gear modifies it — **the cooking kit is the only exception**, and
> that is the cooking kit's effect, not the fire's. These scale what you *take
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

> *Reach is now a per-pack trait (§2c, owner 2026-10-16), capped at 120 m, and its cost is slots,
> not daylight — the walk is inside the make-camp chore. The rest of the reasoning below still holds.*
>
> **The backpack is a THIRD axis — reach — and it is the only camp item that raises the ceiling**
> [owner, 2026-08-18; needs ratifying against SM-INV-6]. Cot, canopy and binoculars are all
> *deficit patchers*: `min(itemCap, headroom)` on a site you already chose, deliberately inert on a
> good site, so the place still sets the ceiling. The backpack does something categorically
> different — it changes **which sites are eligible at all** by extending the road tether, so the
> hunt itself gets a longer ladder and genuinely better ground becomes reachable.
>
> That is not automatically illegal. SM-INV-6's clause is *the last leg of the day is still finding
> good ground* — and this item makes that hunt **bigger**, not shorter. It's the opposite failure
> mode from the tent-substitutes-for-ground substitution. But it is a ceiling raise, so it needs a
> real cost and a cap, and both are open:
>
> - **What does it cost?** The honest one is **the day clock at both ends** — you spend daylight
>   getting out there and you spend it again getting back to the road in the morning, before the
>   first job. That's a cost in hours against a payout in vibe: different currencies, so it passes
>   the coffee test. Mass and a slot are the small half of the price.
> - **How far, and is it capped?** 40 m is the shipped tether. Doubling it is a different game from
>   ten-xing it: the tether is what makes the camp zone *a road-corridor selector rather than a blob
>   of terrain* (`src/camp.js` header). Past some radius the yellow casing on the 2D map stops
>   describing where you can sleep, and the zone disc — which is deliberately never drawn — starts
>   to matter. Pick a number that keeps the corridor reading true.
> - **⚠ The fiction assumes on-foot movement, which the game does not have.** A backpack means you
>   carry your kit in from the parked truck. There is no walking in AUTOS. So either the item is
>   really a *driving* permission ("you can hump the gear in from wherever you got the truck to") and
>   the name is doing fictional work the mechanic doesn't, or it wants an out-of-truck mode, which is
>   a much larger ask. **Owner's call** — the mechanic is clean either way, only the name is at risk.
> - **Cheap to build, and it does not touch determinism.** `campRoadEdgeM` is a `CAMP_PARAMS` key
>   and is explicitly kept out of `routeCacheSig`, so a per-run modifier on the tether re-bakes
>   nothing and cannot move a zone (SM-INV-12 holds for free). It already has a debug slider
>   (5–80 m).

**Two open flags, recorded rather than resolved:**

1. **SM-INV-10 tension.** Every restfulness bonus is a number on an item (the sleeping bag's old
   "1.1×" was the first). The multiplier is legal as *internals* — the
   game is already full of them — but the figure must never surface in the UI, and no described-not-
   scored phrasing has been written yet. A sleeping bag is *warmer than the ground*; a tent is *the
   difference between weather happening to you and weather happening outside*. Settle the language
   before the mechanic.
2. **23 kg on a 1360 kg truck is ~1.7%, and will not be felt.** That is §2's own unresolved
   carry-cost question arriving with a concrete number attached: if the cooking kit's mass is
   invisible, its cost is invisible, and it is a free upgrade rather than a decision. The kit is
   therefore the **first real test case** for whether stowed mass is legible at all — decide that
   question here, or accept that camp gear is priced in cash and slots only.

## 2c. Backpacks [owner, 2026-10-16]

**A backpack decides which camp gear comes to camp, and how far from the road camp can be.** It is
its own item class, not a row of §2b: it does nothing at the site itself — it is the carrier for the
things that do.

**How it works.**

- **Owned is not packed.** Every camp item you own rides in the truck as real mass (rule 2). The
  backpack holds the ones you **choose to bring**. Unpacked gear stays in the truck — still owned,
  still weighing on the truck — it just doesn't come out tonight.
- **Packed gear is there automatically.** Make camp, and everything in the pack is set up at the
  site. There is no unpacking step, and FEAT-66's visible-kit rule now reads *what you packed is what
  renders*.
- **Each pack has two traits: slots and reach.**
  - **Slots** — how many camp items it holds. One item, one slot.
  - **Reach** — how far past the road edge you may make camp. It sets the tether `campRoadEdgeM`
    (40 m today, `src/camp.js`) for the night. This is §2b's old backpack idea, now carried by every
    pack.
- **The two trade off.** Some packs reach far but hold little. Some hold a lot but keep you near the
  road. A few are good at both, and those cost real money. So the nightly choice is **more kit on
  near ground, or less kit on better ground** — a harder choice, not a safer one (rule 4).

**Roster.** The Pack and the Rucksack's place are the owner's (2026-10-16); the other figures are
still placeholders.

| Pack | Slots | Reach | Cost | Status |
|---|---|---|---|---|
| **Pack** | **2** — the bedroll fills one, so a new player has **one open slot** to take something else along | 40 m (today's tether) | Starting kit | **RULED** — owner, 2026-10-16. Every run starts with it |
| **Daypack** | Few | Far (up to the 120 m cap) | Cheap; light | **IDEA** — owner, 2026-10-16 |
| **Duffel** | Many | Barely past the shoulder | Cheap; bulky | **IDEA** — owner, 2026-10-16 |
| **Rucksack** | Fewer than the Duffel | Less than the Frame pack | Mid-priced | **RULED** — owner, 2026-10-16. Sits between the Duffel and the Frame pack |
| **Frame pack** | Many | Far (up to the 120 m cap) | Expensive | **IDEA** — owner, 2026-10-16. The "good at both" pack |

**Rulings this implies, stated so they can be checked:**

- **The bedroll takes a slot; the campfire is not an item** (owner, 2026-10-16). The bedroll is the
  default sleeping item and starts the run packed in the Pack. The fire just spawns to mark camp.
- **The equipped pack must always hold a sleeping item** (owner, 2026-10-16). Spare packs in the
  truck carry no such rule. The bedroll can be swapped for an
  upgrade — **sleeping pad, air mattress, deluxe sleeping pad** (§2b) — but never removed for
  nothing. So one slot of the equipped pack is always the bed; with the starter Pack equipped, that
  leaves exactly one free slot.
- **Restfulness bonuses are a percentage on the recovery rate** — how fast energy recovers per hour
  slept (owner, 2026-10-16). The bed: **bedroll 0 · air mattress +5% · sleeping pad +10% · deluxe
  sleeping pad +15%.** The add-ons: **blanket +5% · sleeping bag +10%.** The same percentage on any
  site, applied to `r(vibe) = lerp(sleepRateWorstH 4/3, sleepRateBestH 8/3, vibe)` h/h
  (`src/day.js`). The bedroll adds nothing, so the "average site, 8 h = full tank" contract is the
  baseline. SM-INV-6 holds because the place still sets the rate the bonus scales — a deluxe pad on
  bad ground still sleeps worse than a deluxe pad on good ground.
- **The sleeping bag and blanket are add-ons, not sleeping items** (owner, 2026-10-16). Neither is
  required to sleep; each takes its own slot, separate from the bed's, and both can be carried at once.
  So a starter Pack carries the bedroll plus *either* a blanket *or* something else.
- **Bonuses add, they don't compound:** `r × (1 + bed + blanket + bag)`. Full kit is +30% (compounding
  would give +32.8% — close enough that the simpler rule wins). What that buys, full-from-empty on
  the 16 h tank:

  | Kit | Worst site | Average site | Best site |
  |---|---|---|---|
  | Bedroll only | 12.0 h | 8.0 h | 6.0 h |
  | Bedroll + blanket (starter's best) | 11.4 h | 7.6 h | 5.7 h |
  | Deluxe pad + bag + blanket (+30%) | 9.2 h | 6.2 h | 4.6 h |

  So the best kit saves about 2 h on an average night — and bad ground with the best kit (9.2 h) is
  still worse than average ground with a bedroll (8.0 h).
- **One equipped pack.** You can own several packs; the spares ride in the truck like any other gear.
  One is **equipped** — selected in the inventory screen — and that one is used automatically when
  you make camp (owner, 2026-10-16).
- **Packing happens in the inventory screen (FEAT-122), any time.** Making camp just reads the pack.
- **Described, never scored (SM-INV-10).** The pack's slots are visible as **room in the pack**, not
  as a number. Its reach shows only as where the camp zone lets you sleep. Neither figure appears in
  the UI.

**Ruled (owner, 2026-10-16).**

1. **Every camp item takes exactly one slot**, whatever its size. The cooking kit (≈23 kg) and the
   binoculars cost the same room. Mass is the truck's problem, not the pack's.
2. **The shovels need a slot.** They are camp gear like any other, so "dig on the slope" competes
   with "carry the tent" for room in the pack.
3. **The walk is inside the 30-min make-camp chore** (`src/day.js`), like the shovel's dig. Reach
   costs no extra daylight. Its whole price is the slots a far-reaching pack gives up. This replaces
   §2b's "the day clock at both ends". (Measured: a loaded walk at ~4 km/h covers 120 m in about
   2 minutes, so the clock was never a real price at this range.)
4. **Reach tops out at 120 m** past the road edge — 3× today's 40 m. The site hunt grades one
   candidate every `CAMP_RAY_STEP_M` (~2 m) along the tether, so the longest pack grades ~60
   candidates against today's 21. The debug slider ("road tether (m)") goes to 120 m to match.

**Cheap to build.** `campRoadEdgeM` is already a `CAMP_PARAMS` key with a debug slider and is kept
out of `routeCacheSig`, so a per-night reach re-bakes nothing (SM-INV-12 holds). The slot count is a
length check on the packed list. The real work is the packing UI (FEAT-122) and the render (FEAT-66).

## 3. Parts

Architecture choices, not stat sticks (SM-INV-10). Split into the **wear-model parts** (each carries
its own 0–100% condition track) and **character parts** (change what the truck does, don't wear as a
tracked economy). A jalopy rolls in with all of these already half-worn (SM-INV-7).

**The jalopy roll** (owner, 2026-10-21; built on feature/parts): tires are standard or old only
(50:35); springs, shocks and brakes are stock; the diff is open and there is no lift; the front
anti-roll bar is stock 90% of the time and missing 10%; a spare is in the inventory 60% of the
time at 40–80%; the air filter starts at 40–80%. The other condition ranges are the parts session's,
as proposed to the owner. Shop stock rotates (FEAT-137, waiting on the owner's probabilities).

### 3a. Wear-tracked parts — the repair economy

Each is a per-component condition track in the ONE damage framework (DESIGN.md "Damage, wear &
repair"). These are the items money mostly exists to replace.

| Part | Reads (honest signal) | Note |
|---|---|---|
| **Tires** | Slip, load, surface | Wear deliberately accelerated as an economic driver; puncture is a hard fail |
| **Engine** | Torque-hours, redline time, over-temp | Overheat → power loss → engine wear → blown head gasket is the specified chain |
| **Air filter** | Intake load over time | **The one the player must watch** — does ~nothing until it does. Gets the can't-miss warning |
| **Suspension** | Bump-stop over-travel / suspension-velocity spikes | ~~Same signal `missions.md` §3b reads for fragile cargo~~ — fragile now reads the strap force instead (FEAT-97, 2026-10-06) |
| **Brakes** | ∫(brake torque × time); pad grade per axle sets bias | Front/rear pad grades are also a *character* choice |
| **Radiator** | Cooling headroom; front-end impacts | Early cooling is *designed* marginal. A strong front hit punctures it |

### 3b. Character parts — architecture, not condition

| Part | What it changes | Status |
|---|---|---|
| **Open vs. LSD differential** | What the truck does when you get greedy mid-corner. The bible's canonical "described, never scored" example. **Ruled 2026-10-22:** the LSD is the one already in the game (`rearDiffMode: 'lsd'`, `data/ranger.js`) — "just use what we've already built". A barn-find event (§6); $30–100; sold at the auto shop; an S-only reward from the auto shop, stranded motorists and residences, very rare | **RATIFIED premise**; figures set 2026-10-22 |
| **Welded differential** | **Replaces the locker (owner, 2026-10-22):** the spider gears welded, so both rear wheels always turn together — scrubs in every corner, pushes, hops on tight turns. *"You never go slow enough in my game to need a locker for offroad purposes but I do want a silly locked diff option to show up occasionally."* The locked-diff part is already built on feature/parts (`diffLocked`) and is renamed. **Cheaper than the locker** ($35); price, sources and rank gate open on the setup page. On the shelf "Sometimes" (owner's pick, 10-22) | **RATIFIED** |
| **Sport springs and shocks** | **A sport suspension tier (owner, 2026-10-22):** sport springs and sport shocks, front and rear, beside stock and heavy-duty (§3f). §3d **Sport** character: wears faster than stock. Spring rate, ride height, damping and load ratings are open on the setup page (proposed: springs +20/35/50% over stock's 33 kN/m, stock height or 1–2 in lower; shocks +25/40/60%; load ratings stock or lower) | **RATIFIED premise**, figures open |
| **Power mods** | On an open-diff RWD truck, a *worse car* for a driver without the literacy — **a cursed item nobody had to author**. **Ruled 2026-10-22:** **+3% power per rung**; sold at the auto shop; a reward from the auto shop, stranded motorists and residences. The exhaust ladder is **stock → sport → open headers → race** (§3d). **Added (owner, 2026-10-22), figures open:** cold-air intake, cams, light flywheel, turbo, supercharger, chip tune, race ECU. Rank gate, price and finds are open | **RATIFIED premise** |
| **Tire compound/type** | Grip character and how it degrades; interacts with surface class (FEAT-38) | **Named 2026-10-17 — see §3g** |
| **Brake pad grade, per axle** | Bias — a race pad changes what the truck does under braking. **Front pads, rear drum shoes** (owner, 2026-10-21) | **DEFAULT** |
| **Sport anti-roll bars** | Flattens roll and sharpens turn-in, but couples each axle side-to-side — one wheel's bump is now the other's problem, and a lifted inside wheel comes sooner | **DEFAULT** |

**ARB values [owner-specified 2026-08-09].** Stock is the asymmetric factory setup; sport is a matched
pair. Both axles are `arbStiffness{Front,Rear}` in `data/ranger.js`, N/m along the strut axis.

| Set | Front | Rear |
|---|---|---|
| **Stock** | 5000 | **none — the pickup ships without a rear bar** |
| **Sport** | 9500 | 6500 |

The stock pair is already the shipped default. Fitting a rear bar where the factory fitted none is a
change in *kind*, not degree: the stock rear axle is fully independent side-to-side, and the sport
bar couples it.

**Delivery: a shop part, never a slider [owner-specified 2026-08-09].** The `arbStiffness*` sliders
in the debug menu are a **tuning surface for development only**. The player never drags them. Roll
bars are **purchased as parts from the service shop** and swapped onto the truck — so the numbers
above are two purchasable states, not a continuous range. Swappable bars are not implemented yet;
this is the specified final state. The same applies to every part in §3 that currently exists only as
a param: the shop is the interface, the slider is the dev tool.

The 9500/6500 pair above is the **Sport** bar in §3d's taxonomy — so it also carries Sport's *lower*
durability than the OEM bar. Off-road and heavy-duty bars are unspecified; when they're set, they
belong in this same table.

### 3c. The durability axis — sportiness traded for endurance [RATIFIED 2026-08-01; refined by §3d 2026-08-09]

> **Read §3d first.** This section framed durability as a single lateral axis (sporty ⟷ durable). The
> 2026-08-09 ruling splits it into two independent axes — *character* (sport/off-road/heavy-duty) and
> *durability* (brand tier, paid for). The reasoning below still holds; the taxonomy is §3d's.


**A whole class of parts that are worse to drive and harder to kill.** Owner-ratified 2026-08-01 as a
sanctioned upgrade direction, and it is the cleanest expression of SM-INV-10 in the catalog: nothing
here is *better*, everything here is a **trade you can feel through the wheel**.

| Part | The trade | Reads (honest signal) |
|---|---|---|
| **LT load-rated tires** | Stiffer sidewall, heavier, less peak grip and a duller turn-in — but they take load and abuse a sport tire won't, and they resist puncture far longer on the wear→fragility curve | tire condition track; per-wheel μ |
| **Heavy-duty off-road suspension** *(split into heavy-duty springs + dampers, §3f)* | **No dual-rate damping** — cruder, floatier, less composed on pavement — but it eats bump-stop hits that would degrade a sport damper | suspension condition; bump-stop over-travel |
| *(space for more)* | Skid plates, a heavier-gauge radiator, steel wheels over alloys — same shape: mass and refinement out, survivability in | |

**Why this axis earns its place.** Three things fall out of it for free:

1. **It is the counter-play to cut hazards, and they are the same taxonomy** [sharpened 2026-08-02].
   FEAT-52's pass-2 hazards — rockslide, ford, ruts, sharp rock — map straight onto the per-component
   damage model, so these parts finally counter something **specific** instead of "cuts" in the
   abstract. A truck on load-rated rubber can take the sharp-rock line; one on sport tires cannot.
   The truck build stops being a philosophy and becomes a **route-planning tool**, and neither system
   was authored against the other.
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

### 3d. Component families & brands — the build matrix [RATIFIED 2026-08-09]

> **Scope [owner, 2026-10-19]:** this taxonomy is for **chassis components** (springs, dampers, bars,
> tires and the like), not for every mod. Power mods (exhaust, intake…), lighting and bed liners/mats
> do not fit it and are not forced into it. An engine mod only really goes one way: more power.
> Exhausts are their own ladder: **stock → sport → open headers → race** (owner, 2026-10-22; was
> stock → sport → race → open headers). *"The open headers are loudest and a lil sketchy. Not the most
> powerful."* Each rung is +3% power (§3b). (FEAT-120 follow-up.)

**Most component families ship in three characters, priced against an OEM baseline.** This is the
owner-specified shape of the shop, and it supersedes the single-axis reading in §3c (which treated
"durability" as one lateral trade; it is actually two independent axes).

| Family | Focused on | Durability vs. OEM |
|---|---|---|
| **OEM** | The baseline the truck was built around — the reference point, not a tier | — |
| **Sport** | On-road performance | **Lower than OEM** |
| **Off-road** | Off-road performance | Slightly better than OEM |
| **Heavy-duty** | Heavy-load performance — but higher spring rates mean it **does not drive well on road** | Very high |

**Two axes, priced separately.** *Character* (sport ↔ heavy-duty) is what the part does. *Durability*
is what it survives. The player **pays a premium for durability**, and pays a smaller marginal cost to
get the truck driving the way they want. So there is no single "upgrade" direction: a heavy-duty part
is not a better sport part, it is a different truck that happens to also last longer.

**Brands carry durability.** Fake in-game brands are the durability signal — a part's survivability is
mostly a function of *which brand made it*, with only subtle tweaks to the actual spring rates and
stiffnesses between them. This keeps the physics honest (rates stay in a believable band) while giving
the shop a legible quality ladder that isn't a stat line on the part.

> **The design goal — synergy, not ranking.** The truth about building a vehicle is that no one spring
> rate is better than another; what's effective is a **package of components set up to work together**.
> The catalog exists so the player can arrive at *"I really like the brand A coilovers with the brand B
> roll bar with the brand C tire"* — a build they chose and can defend, not a row they climbed to.
> Any part that reads as strictly-better in isolation has failed this section.

**SM-INV-10 reconciliation.** Owner-ruled 2026-08-09: durability and brand tier *are* genuinely
rankable, so the invariant's "no number on a part, ever" now governs **presentation and character** —
the shop may express price and a brand's reputation, but a part still never prints a handling stat, and
the character families stay lateral to each other. Flagged for a matching edit in DESIGN.md.

### 3e. Bed upgrades and cargo protection [owner, 2026-10-14]

Provenance: `design-amendments-2026-10-14.md` §2–3, §9–11.

**Bed upgrades are parts** (FEAT-115), in the same class as suspension and tires: bought mid-run,
lost on death, and never a different vehicle (SM-INV-15). Each one is a function on the truck
configuration that FEAT-112's load verdicts read.

| Part | What it changes |
|---|---|
| **Extended (long) bed** | longer bed — long loads fit (a DIY bed swap or a bolt-on extension) |
| **Flatbed** | wider deck with no sides — more room for strapped freight; loose haul is a warning and spills |
| **Stake bed** | between the two — a bigger deck with stakes that keep most of a loose load in |
| **Roof rack** | a second space for long, light loads; stacks with any bed |
| **Light bar** | no load effect (§7) |

**Pricing and finding them.** ~~A part costs what the furthest region you have unlocked charges.~~
**A part's price scales with the clock only** (owner, 2026-10-21 — the furthest-region rule is retired;
a region gives better income and rewards). Shops stock a subset, upgrades also come as infrequent
mission rewards, and lower-tier parts stay in the later pools.

**Cargo protection** (FEAT-116) for fragile loads. **Every effect is proportional to the item's own
thresholds** (`shockFloorG`, `breakG`, FEAT-97) — never a flat amount.

| Item | Uses | Works on | Effect |
|---|---|---|---|
| **Bubble wrap** | 1 | any fragile item | high threshold increase — **×2** (owner, 2026-10-21). Flavor: *"Pop, pop, pop"* |
| **Furniture pad** | 3 | `furniture`-tagged items | low threshold increase and low damage reduction — **thresholds ×1.3, 25% less damage** (owner, 2026-10-22). Flavor: *"Covered in fiberglass for some reason"* |
| **Heavy-duty pad** | 3 | any fragile item | medium damage reduction — **50% less damage** (owner, 2026-10-22). Flavor: *"Not very padded"* |

**Straps are not an item.** Rocks and firewood can't be strapped, haul's loose-load chaos is the
point, and an item held at one giver and missing at the next is arbitrary. Straps stay as fiction on
the strapped families. FEAT-110 is closed; the paid-gate-on-fragile idea is in IDEAS.md, unratified.

**A use belongs to one job** (owner, 2026-10-21): it is spent by the job it protects. How you put it
on is open — a choice on the fragile job card when you take the job, or applied to the load once it
is in the bed and spent at delivery. Bubble wrap is sold at the general store and is a reward from work
sites and fragile jobs (A–S).

**Ruled 2026-10-22 (the item setup page):**

- **Both pads spend a use when you take the job** — the item is wrapped for that job. (This leans to
  the job-card option above, but the cross-cutting "how you put it on" question is still open for
  bubble wrap.)
- **Bubble wrap:** under $5; never found.
- **Furniture pad:** $10 at the general store; a B–A reward from farms, work sites, the general
  store, gas stations, the auto shop, and freight jobs; never found.
- **Heavy-duty pad:** **never sold** — a reward only, A–S, from farms, work sites, gas stations, the
  auto shop, the general store, and freight jobs (rare). Worth $10–30; never found.

### 3f. Load-rating parts — what moves the weight limit [owner, 2026-10-16]

Provenance: FEAT-112 rulings. **Weight overload starts at the manufacturer's payload rating**, and
three parts raise the limits. Stock Ranger: **soft limit 570 kg** (the manufacturer's capacity,
the card warns past it), **hard cap 820 kg** (the card refuses past it), **tires poppable from
600 kg**. **The weakest part sets the limits** (owner, 2026-10-16): the truck's soft limit and hard
cap are the minimum over the three, so the package moves them, not one part alone. The soft-limit
card message: *"Warning: this load exceeds the recommended weight limit."*
All three are §3d **Heavy-duty**-character parts: they carry load and drive worse on the road.

| Part | Raises | What the player feels | Past its rating |
|---|---|---|---|
| **Heavy-duty springs** | soft limit and hard cap | higher real spring rates: less squat under load, a harsher, bouncier ride empty | emergent: the truck squats onto the bump stops; spring wear reads those hits (§3a) |
| **Heavy-duty dampers** | soft limit and hard cap | more damping: a loaded truck settles instead of wallowing; a busy ride empty | emergent: wallow and bump-stop hits |
| **LT / load-range-E tires** | tire pop onset | stiffer sidewall, heavier, less peak grip, duller turn-in (§3c's trade) | **pops on a hard hit**: past 600 kg stock, the load caps the condition the worn-tire puncture curve reads (FEAT-112 §6) |

§3c's "heavy-duty off-road suspension" row is now these two separate parts.
Like every part they are bought mid-run and lost on death (SM-INV-8), and never print a number on
the part (SM-INV-10); the card states the verdict in words.

### 3g. Tire types and the lift [owner, 2026-10-17]

*"This is a truck game after all — even if we don't have a lot of off-road driving, we should be
able to lift our truck."* Tires are now a named ladder, and the lift is the first named part in §3d's
**Off-road** family. Supersedes §3b's generic "tire compound/type" row.

**Tire types.** Grip is set per tire type × surface (paved / dirt). The current tire is **Standard**.

| Tire | Family | Pavement | Dirt | Other |
|---|---|---|---|---|
| **Old** | — (worse than OEM) | **−10%** vs standard (2026-10-22) | **−10%** vs standard | the bottom rung |
| **Standard** | OEM — the tire the truck ships on today | baseline | baseline, **a tiny bit below today's** once dirt exists | — |
| **Sport** | Sport | **+10%** (2026-10-22) | **−10%** | lower durability (§3d): **wears ×1.25** |
| **Off-road** (all-terrain, e.g. 31×10.5R15) | Off-road | **same as standard — not a downgrade** | **+15%** (2026-10-22) — better than every other tire | taller, wider, heavier: more clearance, heavier unsprung mass, taller effective gearing. **Fits without the lift** |
| **LT load-range-E** | Heavy-duty (§3f) | §3c's trade | — | raises the tire-pop onset |

The dirt column waits on per-surface grip (FEAT-38). When dirt is built, **every non-off-road tire
loses a tiny bit of dirt grip** against today's single grip value, so the off-road tire's advantage is
partly made by the others dropping, not only by it gaining (owner, 2026-10-17).

**Off-road suspension (lift kit).** Raises ride height and adds wheel travel: more clearance, fewer
bump-stop hits on rough ground. The cost is emergent — a higher centre of gravity, so more body roll
and an earlier rollover. **It lifts 2 in** (owner, 2026-10-22).

All of these are param swaps on values the physics already reads (`wheelRadius`/`wheelWidth`/tire
mass, and a per-type grip table feeding `muScale` in `src/tire.js`; `suspensionBodyOffset*`,
`suspensionTravel*`, `suspensionRestLength*` in `data/ranger.js`). Fitting waits on FEAT-104 like
every other part. ~~Open (owner's call): whether a 31" tire needs the lift to clear the arches.~~
**Ruled 2026-10-22: it does not.**

**Wheels and tires are separate parts** (owner, 2026-10-21, ruled through the parts session). Both are
sold at the auto shop and both are mission rewards. The **steel wheel** is the stock wheel: its own
socket on each corner (30 min to fit), $8, 9 kg; a bent rim is that part's damage. **Tire masses are
tire only:** old 12 kg, standard 12, sport 11.5, off-road 14.4 (standard × 1.2, owner), LT 15. The
spare stays the mounted pair (§1). ~~The wheel and tire reward gates and pools are placeholders (B–A, the
auto shop) until set on the item setup page.~~ **Set 2026-10-22 (the item setup page):**

| Part | Price | Reward gate | Reward from | Sold | Found |
|---|---|---|---|---|---|
| **Old tires** | $5–10 | C–B | auto shop, farm | auto shop | rare roadside find; they show up found or in a junkyard |
| **Standard tires** | $10–30 | B–A | auto shop, stranded motorist, farm | auto shop | rare roadside find |
| **Sport tires** | $10–30 | A–S | auto shop, stranded motorist | auto shop | open |
| **Off-road tires** | $10–30 | A–S | farm, auto shop, work site | auto shop | open |
| **Off-road suspension (lift kit)** | $10–30 | B–A | work site, auto shop, farm | auto shop | never |
| **Steel wheel** | $5–10 | B–A | auto shop, farm, residence | auto shop | rare roadside find |

**A flat needs a spare** (owner, 2026-10-21). The spare, a wheel and a tire are all mission rewards and
all sold at the auto shop — but only the spare, a tire already mounted on a wheel, goes on at the
roadside. A loose tire can't: you have no tools to seat a bead. Loose tires and wheels are mounted at
the service center only (the plug kit still fixes a hole in place). **Their flavor text says so plainly**
— a tire's reads *"Just a tire. Can't drive on it without a rim."*

## 4. Cargo

Not owned — carried, for someone, under a scoring axis. Cargo is the mission type made physical, so
each entry here is really an instance of a type in `missions.md` §3.

| Cargo | Type / axis | Mass | The fear |
|---|---|---|---|
| **Newspapers** | Paper route — **coverage** | Light; a fixed stack that is also the mission's second budget | Running out of daylight with papers left |
| **Milk / small errand goods** | Point-to-point — **margin** | Light | Crashing; earning nothing. *Perishable: dies overnight if you camp mid-job* — **quest fiction, not the §1b spoilage clock**; whether a cooler may assist here is open (§2) |
| **Grandma's vase** | Fragile — **restraint**, strapped (FEAT-97) | Light–medium | Shock through the strap. **The type that makes surface class (FEAT-38) matter** — the paved detour vs. the dirt shortcut |
| **Eggs** | Fragile — **restraint**, strapped | Light | Same. *"Arrive with the eggs unbroken"* is the bible's own phrasing |
| **Glass panes, piano, sculpture, artwork, x-ray machine** | Fragile — **restraint**, strapped | Light to **heavy** | Shock, and for the heavy ones the truck too. A crate or pelican case with flavour-text contents is the catch-all (ASSET-28 / ASSET-39; named items ASSET-40..45) |
| **Pallets / freight** | Freight — **mass does the work**, strapped (FEAT-96) | **Heavy** | The truck. Sustained load on a long grade is what marginal early cooling cannot survive |
| **Firewood bundles** | Haul — loose in the bed (FEAT-88) | 10–15 × 11 kg | Bouncing pieces out |
| **Logs (downed)** | Clearance — main mission | Dragged, not carried | Being pulled sideways above a drop |

> **Cargo is the only category whose "item" is mostly a mass value and a fragility flag.** Adding a
> new cargo is a *content* act; adding a new scoring axis is a *design* act (`missions.md`). Keep the
> two apart when burning these down — a dozen cargo assets is cheap, a fifth axis is not.

**The master cargo list — every carried thing, by delivery type, tiered from early to late game —
is `cargo.md`.** This table stays as the summary of the types.

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

**Fish may also carry timed effects** — owner, 2026-08-18 (§1a). That would give this ledger a
second use, and it **conflicts with *coffee is debt, fish is income***; see §1a for the conflict and
the cooked-at-camp compromise.

**Fish spoil in about four or five hours, and a cooler buys a day or two** [owner-specified
2026-08-22; the clock is §1b, the item is §2; **re-cut 2026-10-21: ~6 h uncooled, ~36 h cooled**]. This is the first hard number the catch category has
ever had, and it does two useful things at once. **Uncooled, the catch is not a resource — it is an
appointment:** cook and eat it where you are, or lose it, so fishing in the morning costs you the
middle of the day. **Cooled, it becomes a thing you carry**, which is the first time anything in this
category touches the world outside *eat it at camp tonight*. That cuts two ways:

- **It unblocks the bottom row of the species table.** Fish-as-cargo is a perishable delivery, and
  without cold a fish cannot leave the valley it came out of. With a cooler that row stops being
  hypothetical.
- ⚠ **It also makes fish bankable, which is the exact greed this ledger exists to punish.** The
  commitment is *distinct waters visited*, with one hole fished repeatedly reading as greed and
  depleting. Stockpiled fish is stored alertness, and stored restoration is a power floor
  (SM-INV-9) — *coffee is debt, fish is income* only stays honest while the income is perishable.
  The cheap guard: **cold slows spoilage, it never stops it**, so a cooler buys *travel*, not
  *storage* — the clock keeps running and the box holds few fish. **Resolved 2026-10-21 (owner): cold
  slows spoilage, never stops it, and the cooler holds 4 fish.**

**Species: named 2026-10-21 (owner) — salmon, rainbow trout, brown trout, catfish — and species carry
different effects.** What each one does, and where it bites, is open on the item setup page; the axes
below are the candidates. *(Before 10-21: unspecified, and that was the burn-down question.)*
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

## 7. The function × form map — item pass 2026-09-30

**The test for an item: it must act on a pressure that already hurts.** Items are thin wherever the
pressure under them is thin, so author items against the systems that press on the player — energy,
damage/wear, fuel, time vs par, haul cargo, camp vibe, navigation — and never add a pressure just so
an item can relieve it (that is why hunger went in as a rate on energy, §1d, not a meter).

**Two axes.** *Form* is how you use it: **consumable** (spent) · **equipable** — *fitted* (parts, the
shop), *carried* (tools, real mass every mile), *worn* (tokens, a slot) · **active** (a §1c quick
slot, charges or a cooldown). *Function* is what it acts on. Empty cells are where to look next.

| Acts on | Consumable | Equipable | Active |
|---|---|---|---|
| **Driver / energy** | coffee, fish, **meals (§1d)** | camp energy gear | coffee, energy drink, snacks |
| **Truck / damage** | spare tire, air filter, **zip ties, duct tape, stop-leak, tire patches** | parts (§3), quick-jack, ~~breaker bar~~, **hi-lift, bike pump (always), compressor** | Host charm |
| **Navigation / info** | — | map, beacon, GPS, shortcut GPS, **light bar**, *CB radio (FEAT-119)* | — |
| **Cargo / mission** | ~~*straps (FEAT-110)*~~ **bubble wrap, furniture pad, heavy-duty pad (§3e)** | cooler, chain, **rubber bed mat, bedliner** | — |
| **Camp / night** | — | camp vibe gear, **backpacks (§2c)** | — |
| **Fuel / time** | emergency gas, jerry can | — | — |

### Accepted (owner, 2026-09-30) — all PROPOSED until figures are set

| Item | Form | What it does | Note |
|---|---|---|---|
| **Zip ties** | Consumable | Field repair: restores **10%** condition on a light component — **headlights, body panels and the radiator** (the `armor*`, `headlight*` and radiator tracks in `src/damage.js`) | Gets you home, not fixed. **Figures set 2026-10-21:** 5 per pack, $5–10 at the general store and auto shop, an auto-shop reward (B–A), a rare roadside find. Flavor: *"A mechanic's best friend"* (owner, 2026-10-22) |
| **Duct tape** | Consumable | Field repair: **20%** on **body panels** (2026-10-21; was ~25%) | The bigger patch, narrower target. **Holds for the run; 15 min per use** (owner, 2026-10-20). **Figures set 2026-10-21:** 3 uses per roll, $5–10 at the general store, a reward from the auto shop, gas station and general store (B–A), a rare roadside find |
| ~~**Coolant jug**~~ | — | **STRUCK (owner, 2026-10-16).** FEAT-51 shipped with no coolant mechanic — radiator condition *is* the cooling capacity — so there is nothing to top up | Replaced by stop-leak, below |
| **Stop-leak** | Consumable | Field repair: restores **15%** radiator condition (owner, 2026-10-16). Under FEAT-51 that is directly cooling capacity — a 35% radiator patched to 50% holds full load again | Aimed at the overheat → power loss → engine wear chain (`missions.md` §3c). Pairs with heavy hauls on long grades. **Figures set 2026-10-21:** one use per bottle; **never patches the radiator past 50%**; $5–10 at the gas station and auto shop, a reward from both (B–A), never found. Flavor: *"Maybe this will keep 'er going"* (owner, 2026-10-22) |
| **Hi-lift jack** | Carried tool (real mass) | **Right a rolled truck** where it lies — Halo's flip, in a truck. Replaces the tow for a rollover that didn't break anything. **Ruled 2026-10-22 (owner):** usable on **any roll the death check did not end**. It **applies a roll torque for a set time (2–5 s)** to a truck that is not on its wheels, in **the direction the player chooses**. **It happens live in the physics** — you watch it — not as a timeskip. **A cooldown** stops abuse, and **it will not flip the truck in every circumstance**. 13 kg (a real 48″ hi-lift). Sold at the auto shop; a reward from the auto shop and stranded motorists | SM-INV-1 is answered by the ruling: the death check runs first, and only a roll it did not end is the jack's. A separate tool from the quick-jack (§2). Open: rank gate, price, roadside find, and the torque and cooldown figures |
| **Light bar** | Fitted part | See further at night | Simple and safe. Pairs with the Night Owl's nocturnal bargain: makes his hours more usable, not safe. Real mass and drag up high, if we want a cost |
| **Tire plug kit** *(was tire patches — renamed 2026-10-21)* | Consumable | **Plugging takes 30 min** (owner, 2026-10-20). **One plug per kit.** Sold at the auto shop, $5–10; a bonus item from the auto shop, gas station and work site (B–A); a rare roadside find (2026-10-21). In the game files as `tirePlugKit`. **Fixes the puncture and nothing else** — the tire keeps whatever condition it had when it popped. Restores **no durability**; a worn tire is still worn | Owner, 2026-09-30 (brought back from the rejected list; no small-vs-large puncture split). A patch alone leaves the tire flat — it still has to be re-inflated (pump or compressor, below); the 30 min is folded into those totals (2026-10-21). The spare trade: the spare is real mass all the time and a fresh tire; the patch is light and puts you back on the same rubber. §1's spare-tire row calls a puncture a hard fail; with patches it is recoverable at the roadside. Kept worth carrying on good tires by FEAT-93 (hazard punctures at any condition). Flavor: *"I hope I don't have to use this"* (owner, 2026-10-22) |
| **Bike pump** | Always in the truck — not bought, not a slot | Re-inflates a patched tire. **Plug + pump is 2 h in all** (owner, 2026-10-21) | Owner, 2026-09-30. The baseline that makes a patch usable at all. The cost is daylight. **The repair card (owner, 2026-10-21):** two confirm buttons — *Pump the tire by hand* (always there, 2 h, a small pump pictogram) and, if you own a compressor, *Inflate tire* with the compressor's icon (30 min). Both are whole-repair times, plugging included. Follows UI-STYLE.md |
| **Compressor** | Carried tool | Re-inflates a patched tire. **Plug + compressor is 30 min in all** (owner, 2026-10-21) | Owner, 2026-09-30 — **brought back** in a different job: not airing down for grip (our tire model has no pressure–grip term), but **turning a 2 h patch stop into a 30 min one**. Worthless without patches; patches are slow without it. In the game files as `compressor` (2026-10-21). No inflation state needed — re-inflation is just a timeskip, and the `flat[]` flag clears at the end of it. **Ruled 2026-10-22:** it also **takes 30 min off the 2 h spare change**, stacking with the quick-jack (§1). It does not need the engine running. 4 kg (12 V portable). **$20** (replaces the shop session's $15 stand-in); sold at the auto shop, rarely; an A–S reward from the auto shop and work sites (rare); never found |
| **Rubber bed mat** | Carried (loose in the bed) | Raises friction between haul cargo and the bed floor. The load stops **sliding** but can still **bounce**, so you still read the road | The cheap, early version. Physically one number — the cargo-to-floor friction coefficient in the bed well. **It is the lesser option** (owner, 2026-09-30). **Ruled 2026-10-22: it grips less than the bedliner — μ 0.30** (today's bed is 0.15). $5–10 at the auto shop; a B–A reward from the firewood yard; never found. **Still needs an in-game visual** |
| **Bedliner** | Fitted part (service shop) | The same friction increase as the mat, done properly: **works well, never wears out** | **The real, desirable upgrade** (owner, 2026-09-30). "Permanent" means for the run — like every part it dies with the run (SM-INV-8). Still only stops sliding, never bouncing, so the FEAT-110 objection doesn't return. **Ruled 2026-10-22: μ 0.60.** $10–30 at the auto shop, very rarely; an A–S reward from the firewood yard (haul jobs); never found. **Still needs an in-game visual** |

### Item setup rulings (owner, 2026-10-20 — the item setup page)

- **Field repairs last the run** and simply add to the part's condition percentage — keep it simple.
  Zip ties, duct tape and stop-leak each cost **15 min**. Patching a tire costs **30 min**. ~~Changing a
  whole tire (the spare) costs **90 min**.~~ *Superseded 2026-10-22: 2 h, less 30 min with the
  compressor and 1 h with the quick-jack (fourth pass, below).*
- **Quick-slot items are a free action** while driving.
- **Bonus items are handed over by the receiver**, as a tip at delivery. The reward pool is a
  **50/50 roll between the giver's pool and the destination's**; a fetch (giver = receiver) uses the
  giver's pool only.
- **Hunger** is a per-food hold (§1d): a standard meal holds ~8 h, the chili dog 10 h; past the hold
  the drain is ×1.25 rising to ×1.5.
- **Vibe assists** cap at +0.3 combined (§2b).
- **Coffee** +5 / −2, $3, sold at the general store, gas station and food vendor, a reward from the
  food vendor and gas station (C–B), never found. **Energy drink** +5 now, −2.5 four hours later, $4,
  general store and gas station (sold and reward, C–B), never found. **Chili dog** a plain meal, holds
  10 h, $5, food vendor only (B–A), never found.
- ~~*Open from the same pass:* whether item prices scale with the furthest region (DESIGN.md (10)) or
  only with the clock.~~ **Settled 2026-10-21: clock only** — DESIGN.md (10) is retired.

**Second pass (owner, 2026-10-21):**

- **A plug repair is 2 h in all with the bike pump, 30 min in all with a compressor.** These are whole-repair
  times: the 30 min plugging is inside them, not added on (confirmed 2026-10-21). The repair card shows
  both as buttons (§7).
- **All food can be eaten while driving** (§1d).
- **Tire patches are renamed the tire plug kit**: one plug per kit, sources in §7. Handed to the parts
  session (feature/parts) to build.
- **Spare tire**: self-contained (the factory jack is always in the truck), full-size only, worn and new
  variants in different pools (§1).
- **Food**: the burger is its own item; the diner meal is renamed the dinner meal; the gas-station snacks
  split into four; the packed lunch is reward-only; the chili dog spoils in 16 h (§1d).
- **Fish**: four species with different effects; ~6 h uncooled, ~36 h in a cooler that holds 4 (§1b, §5).
- **Burger**: spoils in 16 h, $5, a C–B reward from the food vendor, never found (§1d).
- **Groceries**: the cooked meal holds 10 h; cook in the evening or the morning; the cooler slows them;
  cooking them is the kit's whole bonus (§1).
- **The cooler runs on ice**: refill it every 3 days. Ice is a consumable sold at the gas station and the
  general store. The cooler: general store and tackle shop, $10–30, tackle-shop reward A–S, rare find (§2).
- **Spare tire**: signed off as drawn; a later idea is to sell wheels and tires separately (ruled the same day, below).
- **Wheels and tires are separate parts**, both sold at the auto shop and both rewards; the spare is the
  mounted pair and fixes a bent rim when fitted (§3g, built on feature/parts). **A flat needs a spare**: a
  loose tire can't go on at the roadside (no tools to seat a bead), and each one's flavor text says so.
- **Parts go in the inventory, never the bed** — the bed stays open for hauling and freight. Never call
  the inventory "the bed" in UI text (the shop says "In your inventory", "to inventory").
- **New idea, not ruled:** since the item models exist anyway, drop items into the world and give the
  truck a *proximity inventory*: walk or drive up to an item to load it, or drop one where you stand.
  → **FEAT-143** (world items + proximity inventory, in progress on feature/stranded-spare).

**Third pass (owner, 2026-10-21, later):**

- **Potato** (new): bought at the general store, a farm reward; inedible raw, and the only food you can
  cook on the campfire without the kit — a decent meal once cooked (§1).
- **Groceries are also sold at farms** (§1); every grocery figure is now set: one meal a bag, fresh 24 h,
  +30 min to cook, $5, a farm and general-store reward (B–A), never found.
- **Jerry can** (new): a refillable 5 gal can, a top-tier reward. **Emergency gas** is the mid-tier one (B–A):
  parked only, 10 min, single use, $5–10, gas station and stranded motorist (B–A), never found (§1).
- **Snacks**: peanuts 3 h × 3, spicy chips 3 h × 3, candy bar 3 h × 4, gummy worms 2 h × 5 (§1d).
- **Spare air filter**: 15 min to fit; each spare carries its own condition — new from the shop ($10),
  never great from the roadside (§1).
- **Field repairs**: zip ties 10% × 5 and now also the radiator; duct tape 20% × 3; stop-leak one use,
  never past 50% (§7).
- **Bubble wrap** ×2, spent by the job it protects; how it is put on is open (§3e).

**Fourth pass (owner, 2026-10-22):**

- **Changing a whole tire (fitting the spare) is 2 h.** The compressor takes 30 min off and the
  quick-jack 1 h, and they stack: 1 h 30 min, 1 h, or 30 min with both. **This supersedes the 90 min
  of 2026-10-20** (owner: *"New plan. Changing entire takes two hours. Compressor takes 30 minutes off
  for a total of one hour and 30 but can be combined with other items."*). The plug-repair times
  (2 h by hand, 30 min with the compressor) are not part of this ruling and stand as written.
- **Quick-jack** (§2): −1 h off the spare change; $30; auto shop; an A–S reward from the auto shop
  and stranded motorists; never found. **Compressor** (§7): −30 min off the spare change; no engine
  needed; 4 kg; $20; sources in its row.
- **Hi-lift jack** (§7): a live roll torque for 2–5 s on any roll the death check did not end, the
  player picks the direction, with a cooldown; 13 kg; auto shop; a reward from the auto shop and
  stranded motorists.
- **Cut:** the breaker bar (§2), and ABS / traction control as parts — *"these are assists available
  in the settings menu. not parts"* (Rejected, below).
- **Jerry can** (§1): every figure set — 18 kg full, 10 min parked pour, $30, rarely sold at the gas
  station, a gas-station reward (A–S), a very rare find. Both fuel cans pour with a glug (FEAT-120).
- **Potato** (§1): every figure set; fish cooks on the campfire too (§1b). **Ice** (§1): $5, never a
  reward. **Cooler** (§2): every figure set. **Ice King** (the better cooler, renamed, §2): ×1/8,
  ice lasts 5 days, S only.
- **Cargo protection** (§3e): furniture pad ×1.3 / 25%, heavy-duty pad 50% and never sold; both spend
  a use when you take the job.
- **Tires, wheels and the lift** (§3g): grip and wear figures, the off-road tire fits without the
  lift, the lift is 2 in, and every source is set.
- **Rubber bed mat** μ 0.30 and **bedliner** μ 0.60 (§7); both still need an in-game visual.
- **LSD** (§3b): the one already in the game; S only; a barn find. **Power mods** (§3b): +3% a
  rung; the exhaust ladder is stock → sport → open headers → race (§3d); seven more mods added.
- **GPS unit** (§2): "it's a minimap"; strictly per run; uncommon. **Host's charm** (§1c): timed
  damage reduction only. **Shovel** (renamed from camp shovel, §2b): sources set; both shovels can be
  carried. **Fishing gear** (§2): probably three rods (proposed).
- **Flavor text** for nineteen items, on each item's row (§1, §1d, §2, §3e, §7).

**Fifth pass (owner, 2026-10-22, later the same day):**

- **The shop shelf (FEAT-137) — numbers approved:** each empty slot fills at **6% an hour** (about 2.5
  of the 4 slots full on average); a used part is **40–85%** condition; the likelihood words weigh
  **Often 10 · Sometimes 4 · Rarely 1 · Hardly ever 0.25**, in **one table shared by the shelf and the
  mission rewards**. The new-versus-used share is re-asked (the owner answered "???"). Per-item
  likelihoods are being set on the setup page; the parts session folds them into
  `data/stock-weights.js` on feature/parts.
- **Prices (the shop session's stand-ins, now set):** stock engine (used) **$60**; engine rebuild at
  My Vehicle 0 → 80% **$64** — *"it should be more expensive to repair an engine than to swap in a used
  one"*; stock radiator **$22**; radiator weld 0 → 80% **$22**; headlight **$6**; tire plug kit on the
  shelf **$7** (inside §7's $5–10); the shop patching a flat **$5**, 30 min; compressor **$20**.
- **Welded differential replaces the locker** and a **sport suspension tier** is added (§3b).
- **Dinner meal** as a reward is a dinner invitation (§1d).

### Kept, but blocked or needs a mechanism

| Item | Blocker |
|---|---|
| **CB radio** | Hears hazard reports on the Highway's roads (rockslide, washout ahead) — hazard intel only, never mission intel (the Highway's rejected-boon line). **Owner likes it (2026-10-15) → FEAT-119.** Needs a hazard system shipped first (rockslides FEAT-26/27, deer FEAT-111) |
| **Dynamite** | Clears one hazard on one cut — locally, once, what the Shortcut's deep esteem does in bulk. **Blocked on the hazard + Shortcut systems** |
| **Cargo net** | Keeps light items in, lets heavy ones break through. Physics is the problem: a candidate is a **drag field over the bed opening** that removes momentum from a body crossing it, with a break-through above some momentum — so light items are caught and heavy ones aren't, without a mass rule. Tough; kept as an idea |
| **Radio tapes** | **No stat (owner, 2026-10-15).** The energy effect is stripped: a passive buff you leave running would tax players who prefer their own music. If tapes survive, they are story content only — something you play for what is on it |
| **Chainsaw** | **Not as a general item** — clearing roads is a mission type (the log drag). Possible as a **region-2 choice**: logs you can tow *or* chainsaw |

### Rejected (owner, 2026-09-30) — recorded so they aren't re-proposed

- ~~**Tire plug kit.**~~ Brought back 2026-09-30 as **tire patches** (above), without the small-vs-large
  puncture split.
- **Airing down** (the compressor's first proposed job). Our tire model does not give more grip at
  lower pressure, so it would promise a trade the physics doesn't deliver. The compressor itself came
  back 2026-09-30 as the fast re-inflator for patches (above).
- **Winch.** A whole subsystem for self-recovery in a sim that isn't pointing at towing or proper
  off-roading. The hi-lift covers the rollover case.
- **An item that forces a tunnel or reroutes roads.** Thin, and it would have to carry a player edit
  into cold worldgen. Killed.
- **ABS / traction control as parts** (owner, 2026-10-22): *"these are assists available in the
  settings menu. not parts."* Killed as items; the assists stay in settings.
- **Breaker bar** (owner, 2026-10-22): cut.

### Spirit tokens — proposed pattern, not ruled

The Host already has it: favour gives a **passive** boon, and the charm (§1c) is the **active** form
you spend. Generalised: **each spirit's token is the portable form of your standing with it** —
worthless at zero favour, stronger as the relationship warms, like the shortcut GPS. That keeps
*items build on spirits, never arbitrate between them*.

| Spirit | Passive boon | Token (proposed) |
|---|---|---|
| Host | slower wear | charm — timed damage reduction (§1c; the invulnerability window dropped 2026-10-22) |
| Highway | camber deepens with favour | **amulet** (owner's idea): carry your banked camber onto roads for a while. Double-edged — more bank on sweepers invites rollover on a high-CoG truck |
| Confluence | fish as income, fords behave | a lure, or fords held down for a day |
| Night Owl | the nocturnal inversion | open |

⚠ **The Highway amulet reverses §1a-H**, which rejected "an item that increases camber" as a power
floor. The token form answers it (earned through the relationship, and the Highway already owns
camber), but it is a reversal of a written ruling — **owner's call**.

---

## Gaps worth knowing before burning down assets

1. **There is no timed-effect layer** — *narrowed 2026-08-22*. §1a is still a nine-idea dump, not a
   system: no duration model for *effects*, no way to show one is running without a meter
   (SM-INV-10), no ruling on whether food acts on the driver or the truck. **What now exists is the
   other half — §1b's spoilage clock**, a decay timer in hours with the fish figures set. Effects
   remain unspecified; expiry does not, and anything authored later should expire on the same clock.
   **§1d (2026-09-30) gives effects their carrier:** meals, riding a hunger rate on the energy clock.
2. **There is no fishing system.** DESIGN.md mentions fish exactly once, in passing ("no fire, no
   fish, wake half-tired"). The whole catch category, The Confluence, and *coffee-is-debt-fish-is-
   income* rest on a minigame nobody has framed. **This is the single biggest gap in the catalog** —
   and it's upstream of any fish asset work.
3. **[RESOLVED 2026-10-16 — FEAT-122]** The item structure is ruled. Mass counts toward the
   FEAT-112 payload, plus **8 slots** on the stock truck; bed parts add more (figures set per part).
   Tools, camp gear and unfitted parts take a slot each; consumables stack one kind per slot;
   fitted parts and mission cargo take none. §1c's quick slots stand at **4, consumable and
   cooldown**, as shortcuts to owned items, not extra storage. The screen opens on `I` or an icon
   in the right-edge HUD column; the clock runs on the road and pauses at camp. Stowed mass is
   physics only (this also answers §2's carry-cost question and §2b's 23 kg test case). Full
   ruling in FEAT-122.
4. **Consumables-as-real-mass is stated but never quantified.** It's the rule that makes tools
   interesting (§2) and it currently has no numbers behind it.
5. **[RESOLVED 2026-10-22]** The quick-jack is designed (−1 h off the spare change, §2) and the
   breaker bar is cut. *Was:* quick-jack and breaker bar are named but undesigned; they appear in one
   sentence of DESIGN.md as examples of stowed consumables.
6. **The chain may not be an item at all.** If the log drag supplies it, it belongs to the mission,
   not the inventory. Cheap to decide, and it changes whether it needs an asset.

## Adding to this catalog

Before a new item is worth a row:

1. What is it **described** as doing — in a sentence with no number in it (SM-INV-10)?
2. What does it **cost**, in a currency other than the one it pays out in?
3. Does it **enable a harder choice**, or make an easy one safe? (Only the first is legal.)
4. Is it consumed, carried, or fitted — and what does carrying it **weigh**?
5. Does it survive the run? (**It must not** — SM-INV-8/9.)

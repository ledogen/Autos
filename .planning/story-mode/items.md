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

- **Is the budget a hard refusal or a soft one?** Refusing to load is clean; letting you load it and
  watching the truck squat onto the bump stops is more honest and more RangerSim. The middle option —
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
| **Fish, uncooked** | **~4–5 h** | Gone. Cook and eat it on the spot, or lose it |
| **Fish, in a cooler** | **~24 h basic, ~48 h better** | You can carry it, camp on it, and still eat it tomorrow — a two-rung ladder, see below |
| *(everything else)* | unspecified | Cooked fish, bought food and food-as-cargo all want a figure |

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
| **Better cooler** | **×0.1** | **~48 h** | Camp on it and still have it tomorrow |

That reading takes the owner's own *"a day or two"* and treats **24–48 h as the ladder rather than
one item's spread**, which is the cheapest way to honour the headroom ruling. The second tier is also
where §3d's brand logic would naturally land if the shop ever wants it: same object, better
insulation, priced as durability is priced.

**SM-INV-10 is satisfied the same way the sleeping bag satisfies it:** the multiplier is legal as
*internals* — the game is full of them — provided the figure never surfaces in the UI. The player is
told *the fish is still good* or *the fish has turned*, never a percentage or a countdown bar.

Open, and the owner's:

- **Does the clock pause anywhere?** Sleeping advances hours, so an uncooled fish dies overnight by
  simple arithmetic — which is the right answer. But if a *cooled* fish is meant to survive two
  nights, 48 h has to be measured against nights slept, not just hours elapsed.
- **Can you cook away from camp?** The fish rule leans on being able to make a fire and cook. Camping
  is a gated button in campable regions (SM-INV-6, FEAT-45). If cooking is camping, then a morning
  fish forces an early *camp*, not just an early *stop* — a much bigger cost, and possibly the more
  interesting one.
- **What else is on the clock?** The table above has one row filled in. Bought food, cooked fish and
  any perishable freight need figures before this is a system rather than a fish rule.

## 2. Tools

Kept, re-used, and heavy. The distinction from consumables is that a tool's cost is **permanent mass
plus a slot**, paid on every mile you carry it, against a payoff you only occasionally collect.

| Item | What it does | Source | Cost | Status |
|---|---|---|---|---|
| **Quick-jack** | Lifts the truck for roadside work — the thing that makes a spare tire usable away from a shop. | Bought/found | Real mass, always | **IMPLIED** — named in DESIGN.md "The car"; behavior unspecified |
| **Breaker bar** | Roadside wrenching. Paired with the quick-jack in the bible's own list. | Bought/found | Real mass, always | **IMPLIED** — same |
| **Chain** | Chains onto a downed log for the drag. **A one-sided distance constraint** — zero force slack, hard tension taut — and the snatch impulse *is* the damage signal. | Main-mission equipment | The truck, by design | **RATIFIED premise** — `missions.md` "Main missions". *Open: carried item, or supplied by the mission?* |
| **Fishing gear** | Required for the fishing minigame. | ? | ? | **IMPLIED / UNSPECIFIED** — see the gap note below |
| **Cooler** | **A flat rate reduction on the spoilage clock (§1b).** Uncooled, a fish is good for about four or five hours — cook it on the spot or lose it. In the cooler it keeps for a day or two, so you can carry the catch, camp on it, and eat it tomorrow. **Primarily fishing kit** — it is the thing that lets a catch leave the water without being eaten where it was landed. | Bought/found | Cash; a slot; **deliberately trivial mass — which is the problem, see the note below** | **IDEA** — owner, 2026-08-22 |
| **GPS unit** | **Draws the mission route in the 3D world** so you drive it by looking out of the windscreen instead of stopping to read the map — FEAT-39's chevrons + junction arrow boards, already shipped in `src/gps.js`. A **direct convenience upgrade for any player**, and deliberately a common find: it does not make you *faster*, it makes knowing-the-way *free*. A skilled player reads the map and spends the cash elsewhere. **Until you find one, the paper map (FEAT-16, `M`) is all you get** — navigation is map-reading, landmarks, and memory. | Found or bought within a run | Cash; a slot; trivial mass — the real cost is that you had to *earn* legibility | **RATIFIED premise** — owner, 2026-07-31: "GPS should be an item; until you find it you navigate via the map alone." *Open: strictly per-run (SM-INV-8 says items die with the run — you re-find it every run), or does knowing-where-one-sells count as the literacy that persists?* |
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
| **Bedroll (+ campfire)** | **The default camp — no modifier.** Everybody has one; you sleep on the ground beside a fire. It is the baseline the rest of this table is measured against, and the thing that renders when you carry nothing else. | Starting kit | Its own trivial mass | **IDEA** — 2026-07-30 |
| **Sleeping bag** | Multiplies the energy a night buys, by a fixed factor (~1.1×). **Replaces the bedroll** in the rendered camp. | Bought/found | Cash; a slot; small mass | **IDEA** — 2026-07-30 |
| **Tent** | The same multiplier, larger. **Replaces the sleeping bag** in the rendered camp — the campsite visibly becomes a camp rather than a man on the dirt. | Bought/found | Cash; a slot; real mass | **IDEA** — 2026-07-30 |
| **Blanket** | **Energy axis.** The small end of the same multiplier — the cheap first upgrade over the bare bedroll, and the thing you still have when you've sold the tent. | Bought/found | Cash; a slot; trivial mass | **IDEA** — 2026-08-01 |
| **Cot** | **Vibe axis — flatness.** Makes unflat ground sleepable: fills part of the flatness deficit of the site you chose. Inert on ground that is already flat. | Bought/found | Cash; a slot; real mass (it's a folding frame) | **IDEA** — 2026-08-01 |
| **Canopy / tarp** | **Vibe axis — shade.** Makes an exposed site bearable: fills part of the shade deficit. Inert under trees. | Bought/found | Cash; a slot; small mass | **IDEA** — 2026-08-01 |
| **Binoculars** | **Vibe axis — view.** Something to look at from a site with nothing much to look at. Inert on a spot that already has the valley in front of it. **Unblocked:** view is now a real segment — `VIBE_W = { flat .40, view .15, shade .20, water .25 }` in `src/camp.js`, re-ratified 2026-08-01, and the raw score is `skylineView()`'s angular field-of-vision scan. So the deficit this fills is `1 − viewScore`, and it is **the cheapest entry in this table to build** — the only camp-gear row whose whole dependency chain already ships. | Bought/found | Cash; a slot; negligible mass | **IDEA** — 2026-08-01; **owner re-affirmed 2026-08-18** |
| **Backpack** | **Reach — a third axis, not a deficit patch.** Lets you make camp **further from the road**: it raises the tether (`campRoadEdgeM`, 40 m past the shoulder in `src/camp.js`) that currently pins camping to the road corridor. It fills no segment of the vibe score — it **lengthens the candidate ladder the site hunt walks**, so better ground comes into reach. | Bought/found | Cash; a slot; mass — and **the day clock at both ends**: getting out there and getting back | **IDEA** — owner, 2026-08-18 |
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
>   carry your kit in from the parked truck. There is no walking in RangerSim. So either the item is
>   really a *driving* permission ("you can hump the gear in from wherever you got the truck to") and
>   the name is doing fictional work the mechanic doesn't, or it wants an out-of-truck mode, which is
>   a much larger ask. **Owner's call** — the mechanic is clean either way, only the name is at risk.
> - **Cheap to build, and it does not touch determinism.** `campRoadEdgeM` is a `CAMP_PARAMS` key
>   and is explicitly kept out of `routeCacheSig`, so a per-run modifier on the tether re-bakes
>   nothing and cannot move a zone (SM-INV-12 holds for free). It already has a debug slider
>   (5–80 m).

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
| **Heavy-duty off-road suspension** | **No dual-rate damping** — cruder, floatier, less composed on pavement — but it eats bump-stop hits that would degrade a sport damper | suspension condition; bump-stop over-travel |
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

## 4. Cargo

Not owned — carried, for someone, under a scoring axis. Cargo is the mission type made physical, so
each entry here is really an instance of a type in `missions.md` §3.

| Cargo | Type / axis | Mass | The fear |
|---|---|---|---|
| **Newspapers** | Paper route — **coverage** | Light; a fixed stack that is also the mission's second budget | Running out of daylight with papers left |
| **Milk / small errand goods** | Point-to-point — **margin** | Light | Crashing; earning nothing. *Perishable: dies overnight if you camp mid-job* — **quest fiction, not the §1b spoilage clock**; whether a cooler may assist here is open (§2) |
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

**Fish may also carry timed effects** — owner, 2026-08-18 (§1a). That would give this ledger a
second use, and it **conflicts with *coffee is debt, fish is income***; see §1a for the conflict and
the cooked-at-camp compromise.

**Fish spoil in about four or five hours, and a cooler buys a day or two** [owner-specified
2026-08-22; the clock is §1b, the item is §2]. This is the first hard number the catch category has
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
  *storage* — the clock keeps running and the box holds few fish. Owner's call, flagged not resolved.

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

1. **There is no timed-effect layer** — *narrowed 2026-08-22*. §1a is still a nine-idea dump, not a
   system: no duration model for *effects*, no way to show one is running without a meter
   (SM-INV-10), no ruling on whether food acts on the driver or the truck. **What now exists is the
   other half — §1b's spoilage clock**, a decay timer in hours with the fish figures set. Effects
   remain unspecified; expiry does not, and anything authored later should expire on the same clock.
2. **There is no fishing system.** DESIGN.md mentions fish exactly once, in passing ("no fire, no
   fish, wake half-tired"). The whole catch category, The Confluence, and *coffee-is-debt-fish-is-
   income* rest on a minigame nobody has framed. **This is the single biggest gap in the catalog** —
   and it's upstream of any fish asset work.
3. **The item *structure* is deferred** (`IDEAS.md`). No slot model, no weight budget, no
   inventory UI is specified. Every "a slot" cost above is an assumption, not a rule.
4. **Consumables-as-real-mass is stated but never quantified.** It's the rule that makes tools
   interesting (§2) and it currently has no numbers behind it.
5. **Spare tire, air filter, quick-jack, breaker bar are named but undesigned.** They appear in one
   sentence of DESIGN.md as examples of stowed consumables. Whether roadside repair is even a
   player action is unspecified — which is a *mechanic* question, not an asset one.
6. **The chain may not be an item at all.** If the log drag supplies it, it belongs to the mission,
   not the inventory. Cheap to decide, and it changes whether it needs an asset.

## Adding to this catalog

Before a new item is worth a row:

1. What is it **described** as doing — in a sentence with no number in it (SM-INV-10)?
2. What does it **cost**, in a currency other than the one it pays out in?
3. Does it **enable a harder choice**, or make an easy one safe? (Only the first is legal.)
4. Is it consumed, carried, or fitted — and what does carrying it **weigh**?
5. Does it survive the run? (**It must not** — SM-INV-8/9.)

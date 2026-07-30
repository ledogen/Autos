# Autos — Spirits & Pacts

*Working design notes. Status: early concept. **Downstream of `DESIGN.md`** — where this document and
the bible disagree, the bible wins. Companions: `opening.md`, `missions.md`, `run-shape.md`,
`IDEAS.md`.*

**Reconciliation note 2026-07-29 (partial).** This document arrived as the **pre-alignment draft** —
it predates the other companion docs' reconciliation pass and the owner's 2026-07-29 decisions.
Mechanically applied on landing: **terminology aligned to DESIGN.md (*spirits*, not *sprites*** — the
naming itself is still flagged open in `IDEAS.md`), and the companion link repointed to `opening.md`.

**Not applied — four live conflicts with ratified rules, flagged inline below and listed here so
nothing gets built on them by accident.** These are design decisions, not edits I should make:

| # | This doc says | Ratified rule | Where |
|---|---|---|---|
| 1 | Spirits are the **carrier of meta-progression**; "Meta" effect persistence = a spirit "exists in all future worlds as a standing rule change" | **Spirits are DEFERRED** (2026-07-29): meta-progression is **the garage** — unlocked starting vehicles. And under the narrowed **SM-INV-8** the *world* no longer persists across runs, so *nothing* can be a standing addition to future worlds | "What spirits are"; every **Persistence: Meta** line; "Cross-run accumulation" |
| 2 | **Cross-run accumulation** ledgers ("a career total that survives death") | **SM-INV-8** as narrowed: only literacy + the garage survive. A career counter is persistent state — and if it buys a boon, it is a **power floor** (SM-INV-9 litmus) | "Ledger shape"; #03/#04 "Ledger + Meta" |
| 3 | "**camping is a location and not a menu option**" | **SM-INV-6 was REVERSED 2026-07-19** — camping *is* a button, gated by campable regions, with a worldgen-scored quality preview. `missions.md` lists this exact phrasing as superseded | #02 The Innkeeper, Unlock |
| 4 | "a **24–48 minute** day" | **24-minute days RATIFIED 2026-07-29** (~10–15 days per run) | #01 The Night Owl, unlock tuning |

**The good news:** conflicts 1 and 2 are about *persistence*, not about the characters. The taxonomy,
the domains, the ledger *shapes*, the contact moments, the boon/price currencies, and every
cross-domain coupling survive untouched if spirits become **run-layer** — met within a run, shaping
that run. The single-run total and single-run streak ledgers (#01, #02) are **already run-layer and
already legal as written**; it is only the "Meta effect" and cross-run accumulation lines that break.
That's a smaller repair than it looks, and it's the owner's call to make when spirits come off
deferral. **Do not build spirit-unlock plumbing against this document** (amendment §4).

---

## What spirits are

Spirits are the story's recurring cast. They are not quest-givers and they do not hand out
resources. Each one **cares about a single behavior the player is already performing**, watches
how the player performs it, and eventually intervenes — either by offering a bargain or by
making the world less accommodating.

This makes them the natural carrier for meta-progression as it's already defined: discoveries
unlock entities that alter future runs as **rule changes, not resource grants**. A spirit *is* a
rule change with a face on it.

> **⚠ CONFLICT 1 (2026-07-29).** Spirits are **no longer the carrier of meta-progression** — that
> role went to **the garage** (unlocked starting vehicles), and the spirit system is **deferred**
> (`design-amendments-2026-07-29.md` §4, DESIGN.md "The garage"). Separately, "alter future runs"
> is now impossible as stated: SM-INV-8 was narrowed so that **the world does not persist across
> runs**. The rule-changes-not-resource-grants principle (SM-INV-9) is untouched and still exactly
> right — what's gone is the *between-runs* delivery. A run-layer reading ("met during a run,
> reshapes that run") preserves nearly everything in this document; see the reconciliation table
> above.

Two design constraints follow from that:

1. **A spirit must be reachable by ordinary play.** The player never goes looking for a spirit.
   They drive the way they drive, and a spirit turns up because of it. Unlock conditions are
   therefore always *behavioral ledgers*, never fetch quests.
2. **A spirit must contest something scarce.** Time, safety, terrain, wear. If a spirit's boon
   doesn't cost the player something they wanted, it's a perk menu, not a character.

---

## Taxonomy

Five axes. Every entry below fills all five, so the catalog stays comparable as it grows.

### Class

- **Pact spirit** — opt-in. Appears at a contact moment and offers a bargain. Accepting grants a
  persistent playstyle modifier. Pact spirits generally come in **opposed pairs** contesting the
  same domain; siding with one closes the other.
- **Warden spirit** — not opt-in. Once present, it watches whether the player likes it or not.
  It holds a disposition that starts neutral and mostly degrades. It expresses itself through
  world-state changes rather than stat modifiers.
- **Trader spirit** — *(reserved)* one-shot exchanges at discovered locations. Placeholder for
  the fishing/item economy work.

**Unifying rule (proposal):** a spurned pact spirit behaves as a warden until placated. Refusing
the bargain isn't neutral — it's a decision the spirit noticed.

**And its inverse:** a warden sustained in high favor can open into a pact. Class is therefore
not a fixed type but a **relationship state** — Warden and Pact are two positions on one track,
and a spirit can move between them in either direction. Most spirits will sit at one end their
whole lives. The ones that move are the memorable ones.

### Domain

The scarce thing the spirit meters. **Maximum two spirits per domain** (one per side). Current
domains: *fatigue*, *terrain*, *water*. Obvious future domains: wear/repair, speed & par margin,
night, weather, cargo, wildlife.

### Disposition track

- **Two-sided** — favor and disfavor both accumulate; the spirit can be courted or offended.
- **One-sided negative** — starts neutral, only degrades, recovers slowly if at all. Wardens.
- **One-sided positive** — reserved; probably shouldn't exist. A spirit you can't disappoint has
  no teeth.

### Contact moment

*Where* the spirit is allowed to appear. This is the game's vocabulary of non-driving beats, and
it's the axis worth varying most aggressively between spirits: bedtime, the doze, the campfire,
a breakdown, a threshold crossing, first light, the moment the odometer rolls.

### Persistence

Two separate things that were worth pulling apart: how long the *effect* lasts, and what shape
the *counter* takes.

**Effect persistence**
- **Run-scoped** — the boon or penalty lasts the current run. *(The only currently-legal option.)*
- ~~**Meta** — once unlocked, the spirit exists in all future worlds as a standing rule change.~~
  **⚠ CONFLICT 1 — illegal as of 2026-07-29.** The world no longer persists across runs (SM-INV-8
  narrowed), so nothing can stand in "all future worlds." Every **Persistence: Meta** line in the
  catalog below inherits this flag.

**Ledger shape** — this is the real characterization tool. What a spirit asks you to prove says
more about it than what it pays out.
- ~~**Cross-run accumulation** — a career total that survives death.~~ Says: *the world has been
  watching you for a long time.* Suits spirits of place and relationship. **⚠ CONFLICT 2 — illegal
  as of 2026-07-29.** A career total is persistent state (SM-INV-8 narrowed: only literacy + the
  garage survive), and a career total that buys a boon is a **power floor** — SM-INV-9's litmus test
  forbids it outright. *Worth noting what's lost:* this was the shape that said "the world has been
  watching you," and it has no legal equivalent. The nearest surviving thing is **literacy** — the
  player knows, the world doesn't.
- **Single-run total** — a threshold you must reach before you die, resetting to zero every run.
  Says: *you have to have committed, now, in this life.* Suits spirits of excess.
- **Single-run streak** — an unbroken run of correct behavior; one lapse resets it. Says: *you
  have to have been disciplined the whole way.* Suits spirits of restraint.

---

## Catalog

Working handles are placeholders. Recommendation: spirits go **unnamed in-game** on first
contact and are only named later, by the world or by the player. An unnamed thing that knows
your driving habits is doing more horror work than a named one.

---

### 01 — The Night Owl *(renamed 2026-07-29 — was "The Passenger")*

**Class:** Pact · **Domain:** Fatigue (risk side) · **Disposition:** Two-sided
**Contact:** Bedtime on first contact; **the doze** thereafter — and **the passenger seat whenever
he speaks** (see "Where he sits")
**Persistence:** Meta effect, **single-run total** ledger

**What it wants.** For you to keep driving when you shouldn't.

> **Naming note.** *The Passenger* was the working handle; **Night Owl** is the name [owner,
> 2026-07-29]. This also **unifies him with the "deviant / night-owl spirit"** already sketched in
> `IDEAS.md` (2026-07-19) — same character, arrived at twice: rewards staying up dangerously,
> lessens the doze effect, pays more for missions run while sleepy. Treat that entry and this one as
> one spirit. *Passenger* survives as **what he is**, not what he's called — see below. The catalog's
> unnamed-on-first-contact recommendation still applies: he shouldn't introduce himself.

**Where he sits [owner, 2026-07-29].** When the Night Owl talks to you, **he is in your passenger
seat.** That's his manifestation, not merely his contact moment — the spirit of driving-too-late
occupies the seat next to you, in the truck, while you're moving.

Three things this earns for free:

- **It makes the near-miss idea literal.** "An empty passenger seat that wasn't empty a moment ago"
  was written below as an *atmospheric* possibility. Under this rule it's the same object seen twice
  — the seat is his, so the game can play it before he ever arrives, and again after you refuse him.
  The seat becomes a thing the player checks.
- **It gives a spirit the chat pane without breaking SM-INV-11.** The chat pane is the *character*
  channel and deliberately not the world-story channel. A spirit riding shotgun is a **character in
  the car**, so his dialogue can legally take the pane the uncle taught the player to read — which
  is exactly the payoff `opening.md` set up: *"by the time the first spirit makes a bargain, the
  player already understands the grammar of it."* The mundane channel gets used by something that
  isn't.
- **It costs the player something real.** The passenger seat is *cargo space and mass*. If he's
  sitting in it, ask whether it's occupied — a spirit that takes up room in the truck is a price
  paid in the game's own honest currency (DESIGN.md: a load, never a stat), and it would mean the
  fatigue pact quietly narrows what freight work you can take. **Open — don't build it without a
  ruling**, but it's the most interesting version.

**Open, and worth deciding together:** whether he's visible *while driving* (a figure in the seat
you can glance at, and eventually stop glancing at) or only at the moment he speaks. The first is
much stronger and much more expensive — a persistent passenger is a rendered character in the
cab at all times. The doze relationship below argues for at least *sometimes*: eyes closed, and when
they open he has moved, or is closer, or is looking at you.

**Unlock.** ~10 hours driven while tired **within a single run**. The counter resets to zero on
death. He does not meet people who have been mildly irresponsible over a career — he meets
people who are destroying themselves right now.

**Why single-run is the stronger rule.** The counter and the death condition are the same
behavior, which makes the unlock **self-limiting** without any tuning: the only way to reach ten
hours is to survive several in-game days while repeatedly refusing to sleep, and driving tired is
the thing most likely to end the run. Most attempts die at hour seven with nothing to show for
it. That's the achievement — not a number, but a sustained refusal that happened to survive.

Worth checking against real survival rates once the doze is in. Ten is a guess, and it's a guess
about how much tired-time an in-game day actually affords, which depends on where the sleepiness
curve starts biting in a 24–48 minute day. **⚠ CONFLICT 4 — day length is settled: 24 minutes**
[RATIFIED 2026-07-29], ~10–15 days per run (`run-shape.md`). So the guess resolves against the
*short* end of the range assumed here, which makes ten tired hours **harder** than this entry
assumed — worth re-checking once the doze is in, exactly as the paragraph asks.

**Re-summoning.** Once met, he's meta — he exists in every subsequent world. The per-run
threshold drops to ~5 tired hours, still single-run. The world already knows you; you just have
to show him you meant it again.

**Should the near-miss leave a mark?** A player who dies at hour nine has done something
remarkable and gets nothing. No counter should be shown — but the world might. An empty
passenger seat that wasn't empty a moment ago, on the run *after* a near miss. **Sharper now that
the seat is canonically his** (see "Where he sits") — this isn't a random omen, it's *him*, early,
before you've earned him. ⚠ Note this particular mark needs cross-run memory, which
**CONFLICT 2 forbids** (SM-INV-8 narrowed: only literacy and the garage survive). A same-run version
— the seat marked at hour nine of the run you're *in* — is legal and may be better anyway, since the
player is still alive to be unnerved by it.

**The bargain.** A tempo boon: higher speed ceiling, faster throttle response, something that
buys **time**. The price is paid in **safety** — the doze arrives sooner, lasts longer, or takes
more of the visual field.

**Why it matters structurally.** The doze is already the one moment the game controls what the
player sees. The Night Owl should own that moment. First contact happens at bedtime, in the
ordinary way; every contact after that happens *inside the doze*, which means accepting this
pact is what turns the horror layer on. Knowledge and hubris on the same axis, as designed.

**And the doze and the passenger seat are the same shot.** The doze is ~400 ms of eyes closed *in
the driver's seat* — so the frame the game controls is the cab interior, and the seat beside you is
already in it. No new staging is needed for a doze visitation: he's simply there when your eyes
open, in the place he always sits. The two ideas were designed separately and land on the same
camera.

**Escalation.** Tiered offers. The first is small and almost reasonable. Later tiers offer more
and take more, and the player has by then built a run around the earlier ones.

---

### 02 — The Innkeeper *(working handle)*

**Class:** Pact · **Domain:** Fatigue (safety side) · **Disposition:** Two-sided
**Contact:** Campfire / discovered camp, at waking
**Persistence:** Meta effect, **single-run streak** ledger *(proposed — see below)*

**What it wants.** For you to sleep properly, in a real place, more often than is convenient.

**Unlock.** A streak: N consecutive in-game days in one run ending in a full rest at a discovered
camp, without ever crossing into tired driving. One bad night resets it to zero. Because camping
is a location and not a menu option, this is a navigation and planning problem — the unlock cost
is paid in route planning, not in a stat.

> **⚠ CONFLICT 3.** *"Camping is a location and not a menu option"* is superseded phrasing —
> **SM-INV-6 was reversed 2026-07-19**: camping **is** a button, gated by *campable regions*, with a
> worldgen-scored quality preview (shade, flatness, water proximity). **The argument survives the
> correction intact**, because the gating moved rather than vanished: the button is only available
> on campable ground, so "get to good ground before you're dangerous" is still a navigation and
> planning problem, and the streak is still paid for in route planning. Reword, don't rethink.

**Why a streak.** Now that The Night Owl is a single-run total, both fatigue spirits should ask
for commitment inside one run rather than career credit, or the domain feels lopsided. But they
should ask differently, and the shapes fall out naturally:

> **The Night Owl is a total you must reach before you die.
> The Innkeeper is a streak you must not break.**

Excess accumulates. Restraint only exists unbroken. A count of rests would be trivially cleared
by a cautious player; a streak means one late night at hour six of a good run costs the whole
thing, which is precisely the discipline this spirit is asking about.

**The bargain.** Here's the balance note: **this cannot also be "you drive faster."** If both
fatigue spirits sell speed, the domain collapses and the choice is numerical. The two sides need
different *currencies*:

- The Night Owl sells **time**, priced in **safety**.
- The Innkeeper sells **safety and margin**, priced in **time**.

So the Innkeeper's boon should be reduced wear accumulation, reduced damage from contact, better
low-light visibility, or a payout multiplier — things that make each hour worth more, since the
player has fewer of them. Wear is the strongest candidate: it directly offsets the sleep cost in
the economy rather than in the driving.

**Exclusivity (proposal).** You cannot hold both fatigue pacts. Taking one spurns the other, and
per the unifying rule, the spurned one starts behaving like a warden.

---

### 03 — The Verge *(working handle)*

**Class:** Warden · **Domain:** Terrain · **Disposition:** One-sided negative
**Contact:** Threshold crossings; ambient world change · **Persistence:** Ledger + Meta

**What it wants.** For you to stay on the road. It is not offering you anything.

**Why this one is load-bearing.** Off-road shortcutting circumvents the router, and par is
computed from road geometry — so a shortcut doesn't beat par, it *invalidates* it. The Verge is
the fix, and it's a better fix than a rule would be. Instead of hard-walling off-road driving or
silently voiding payouts, the game keeps the shortcut legal and expressive and simply **prices
it**, through a character the player can come to understand. The player who takes the shortcut
isn't cheating; they're borrowing from someone.

**The ledger.** Off-road distance, weighted by terrain fragility. Not all ground is equal:
gravel shoulder and a graded fire road should cost near nothing; meadow and young
growth should cost a great deal. Streambeds and banks belong to The Confluence (#04) and should
drop out of this ledger entirely — see *Cross-spirit dynamics*. This gives the terrain itself a moral texture and rewards
players who learn to read it — which is exactly the kind of world literacy the design already
rewards elsewhere.

**Expression of anger.** Penalties should attack the thing the shortcut was meant to buy, and
should read as the world withdrawing rather than as a fine:

- **Wear multiplier climbs.** The most direct: you saved eight minutes and bought a wheel bearing.
- **Camps refuse you.** Discovered camps stop being usable while disfavor is high. This is the
  interesting one — it couples the terrain domain to the fatigue domain, pushes the player toward
  driving tired, and hands them straight to the Night Owl. Two spirits, one emergent trap.
- **Discoveries hide.** POIs stop appearing, or appear and are found abandoned.

**Recovery.** Should exist, and should be slow and effortful — sustained on-road running, or
something found rather than bought.

**Open question: does it get a counterpart?** The taxonomy allows two spirits per domain, and the
natural pair is a **trailblazer** who *likes* off-road running and pays for it. That would make
off-road a real playstyle branch rather than a taxed behavior. It's a genuine fork, not an
obvious yes: leaving The Verge unpaired keeps off-road as a pure cost, which is cleaner for par
and preserves the warden class as its own thing. Worth deciding before the terrain fragility
weights get built, since a trailblazer would need them inverted.

---

### 04 — The Confluence *(working handle)*

**Class:** Warden → Pact (courtable) · **Domain:** Water · **Disposition:** Two-sided
**Contact:** The moment of the catch · **Persistence:** Ledger + Meta

**What it wants.** For running water to be treated as a place rather than a resource. It watches
three things: how you fish, where you camp relative to water, and what you do to a stream when
you're near one.

**Why it's the first courtable warden.** The Verge can only ever be disappointed — there is no
such thing as respectful trespass. Water is different, because fishing is a *cooperative* act.
The player goes to the river to take something from it, and can do that well or badly. So this
spirit starts hostile-neutral like a warden and can be moved, over a long enough ledger, into a
genuine pact. It's the spirit that proves the class track runs both directions.

**The ledger.** Count **distinct waters visited**, not hours fished or fish landed. That rewards
map literacy and exploration instead of grinding one productive hole, and it's thematically
right — a spirit of *rivers and streams*, plural, cares that you've seen many. Fishing the same
water repeatedly should deplete it and read as greed.

**Favor comes from:** returning fish, fishing waters you haven't worked recently, camping near
water rather than on it, and leaving a bank the way you found it.
**Disfavor comes from:** depleting a single water, fording where a bridge exists, driving the
bank, camping in the streambed itself, and idling or washing the truck in running water.

**The boon — and the best idea in this entry.** Water's currency is **restoration and supply**,
and it should land in the item economy rather than on the car:

> **Coffee is debt. Fish is income.**

Coffee trades alertness across days at interest — you borrow tomorrow's hours and repay them
with a worse tomorrow. A fish eaten at a favored river camp is alertness that *doesn't have to
be repaid*. It's the only honest restoration in the game, and the only way to get it is to have
been decent to the water for a long time.

Secondary boon: rest taken at a favored water clears sleepiness faster per hour. Note that this
**stacks with either fatigue pact rather than competing with them** — it makes water a
cross-domain amplifier, which is exactly what a third domain should be. The Night Owl's player
uses it to survive; the Innkeeper's player uses it to claw back some of the day they gave up.

**Expression of anger.** Water withdraws, and it withdraws *physically*:

- **Waters run empty.** Fishing yields nothing. The direct penalty.
- **Fords rise.** Crossings that were passable become hazards or become impassable. This is the
  strong one: it's a **routing** penalty the router has to respect, so an offended river spirit
  visibly redraws the map and lengthens every route through its country. No other spirit can do
  that.
- **Water camps stop resting you.** Sleep a full night by the river and wake tired.

**Fishing perks (proposal).** Rather than a separate XP-bought perk tree, **the fishing perk tree
*is* this spirit's disposition track.** Perks unlock as favor deepens. One system instead of two,
and it means every perk the player holds is evidence of a relationship rather than a purchase.

**Horror surface.** A river is where the missing people would be. First contact should be
something on the end of the line that isn't a fish — the spirit arrives already having your
attention, in a framing moment the game fully controls, the way the doze works for The Night Owl.

---

## Cross-spirit dynamics

- **Jurisdictions must not overlap.** The Verge and The Confluence both have a claim on the
  streambed. Let them share it and the player can never learn which spirit they offended, which
  kills the legibility the whole system depends on. Recommendation: **hard split** — The Verge
  owns dry ground, The Confluence owns water and the riparian corridor out to some bank width.
  The alternative (both angered, making streambed shortcuts the most expensive ground in the
  game) is tempting and I'd advise against it: double jeopardy that the player can't attribute
  reads as an unfair world rather than a watched one.
- **Domains couple through the world, not through code.** The Verge denying camps is a terrain
  penalty that lands in the fatigue domain. These couplings are the most valuable output of the
  system and should be found deliberately as spirits are added.
- **The player can't serve everyone.** With exclusivity inside domains and wardens punishing
  across them, a run develops a shape. That shape is the closest thing this game has to a build.
- **Spirits are how the horror parameters get motivated.** Leaning trees, an oversized moon, a
  dark afternoon — these read as ambient dread on their own, but attributed to a specific
  offended spirit they become *legible*. The player who knows the world knows whose fault it is.

---

## Adding to this list

Before a new spirit is worth writing down, it should have answers to:

1. What behavior is the player *already* doing that this spirit notices?
2. What scarce thing does it contest, and is that domain already occupied?
3. What does its boon cost, in a currency other than the one it pays out in?
4. Where does it appear, and is that contact moment already spoken for?
5. What does the world look like when it's angry?

---

## Provenance

**Explicit decisions (James):**
- Spirits are the main story cast, revealed through play.
- A spirit rewards tired driving; appears at bedtime; offers a risk/reward playstyle modifier.
- First unlock is achievement-grade (~10 tired hours); subsequent unlocks cheaper (~5).
- An opposing spirit rewards being well-rested, costing daytime hours.
- A conservationist spirit objects to off-road driving; off-road stays available but angering
  the spirit carries penalties elsewhere.
- The conservationist may be an enforcer/gatekeeper rather than a playstyle modifier.
- **Ratified:** rested spirit pays in reduced wear; tired spirit pays in speed.
- **Ratified:** The Night Owl's ~10 tired hours must be reached **within a single run**, not
  accumulated across a career. Meeting him requires active irresponsibility, not eventual drift.
- **Ratified 2026-07-29:** the spirit is named **the Night Owl** (was: *The Passenger*), and he
  **appears in the passenger seat of your car when he speaks to you.** Unifies with the night-owl
  spirit in `IDEAS.md`.
- A Rivers and Streams spirit concerned with the fishing minigame, camp placement relative to
  water, and player behavior near running water.

**Proposals built on top (not ratified):**
- The Pact / Warden / Trader class split, and the five-axis taxonomy.
- Opposed pairs per domain, with a two-spirit cap and pact exclusivity.
- Spurned pact spirits behave as wardens.
- The Night Owl owning the doze as its recurring contact moment — and the doze and the passenger
  seat resolving to the same shot (cab interior, eyes opening, the seat beside you).
- The passenger seat as **real cargo space** he occupies, narrowing what freight work the pact lets
  you take. *(Open — the most interesting version of the price, and the one that needs a ruling.)*
- Whether he is visible while *driving* or only when he speaks.
- Distinct currencies for the fatigue pair — tempo vs. wear/economy — rather than both selling
  speed.
- Terrain-fragility weighting of the off-road ledger.
- Camps refusing the player as The Verge's signature penalty, and the fatigue/terrain coupling
  it creates.
- Spirits unnamed on first contact.
- The open question of whether The Verge gets a trailblazer counterpart.
- Class as a **relationship state** rather than a fixed type — wardens can be courted into pacts,
  pacts can decay into wardens.
- The Confluence as the first courtable warden; ledger counts distinct waters, not fish.
- **Coffee is debt, fish is income** — fish as the only unrepaid alertness in the item economy.
- Water as a cross-domain amplifier that stacks with either fatigue pact rather than competing.
- Rising fords as a routing-level penalty the router must respect.
- The fishing perk tree *being* The Confluence's disposition track rather than an XP purchase.
- Hard jurisdictional split of the streambed between The Verge and The Confluence.
- **Ledger shape** as a characterization axis: cross-run accumulation vs. single-run total vs.
  single-run streak.
- The Innkeeper's ledger becoming a single-run *streak*, for symmetry with The Night Owl's
  single-run *total*.
- The Night Owl's re-summon threshold (~5h) also being single-run.
- A world-side acknowledgement of near misses, with no counter ever shown.

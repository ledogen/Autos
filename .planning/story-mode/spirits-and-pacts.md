# Autos — Spirits & Pacts

*Working design notes. Status: early concept. **Downstream of `DESIGN.md`** — where this document and
the bible disagree, the bible wins. Companions: `opening.md`, `missions.md`, `run-shape.md`,
`IDEAS.md`.*

**Reconciliation note 2026-07-29 (partial).** This document arrived as the **pre-alignment draft** —
it predates the other companion docs' reconciliation pass and the owner's 2026-07-29 decisions.
Mechanically applied on landing: **terminology aligned to DESIGN.md (*spirits*, not *sprites*** — the
naming itself is still flagged open in `IDEAS.md`), and the companion link repointed to `opening.md`.

**All four conflicts RESOLVED by the owner 2026-07-29** (a fifth was found and resolved in the same
pass). The document below has been updated; this table records what changed and why.

| # | Was | Ruling [OWNER 2026-07-29] |
|---|---|---|
| 1 | Spirits are the carrier of meta-progression; "Meta" persistence = a spirit "exists in all future worlds" once unlocked | **Spirits are not meta-persistent — and they don't need to be.** Every spirit is present in **every run including the first**. What persists is only whether the player has *met* them (a **story key** — the one thing SM-INV-8 still lets through). See "The visibility model" below. |
| 2 | Cross-run accumulation ledgers ("a career total that survives death") | **Kept, but moved off the run.** Career totals are an **account-level stats screen**, not the in-run persona's ledger and not a spirit's unlock condition. They may unlock **garage entries** (the garage legally persists), never in-run power. See "Career stats" below. |
| 3 | "camping is a location and not a menu option" | **Superseded phrasing** — SM-INV-6 reversed 2026-07-19: camping is a **button gated by campable ground**. Argument survives, wording corrected. |
| 4 | "a 24–48 minute day" | **24-minute days RATIFIED 2026-07-29** (~10–15 days per run). The ledger is *harder* than this doc assumed. **Superseded 2026-07-31:** the ledger is **10 km tired**, not hours — see #01 "Summoning". |
| 5 | *(found in this pass)* Re-summon threshold halves, once met | **Dropped — the first threshold is the full one in every run.** A permanently cheaper threshold is meta-progression: run 50 would reach the pact in half the tired-hours run 1 needed, which makes late runs comfortable and fails SM-INV-9's litmus test. *(Unit corrected 2026-07-31: 10 km, not 10 h.)* **This reverts a rule the Provenance section records as owner-ratified**, deliberately. |

**Net effect: the characters survive completely intact.** The taxonomy, domains, ledger *shapes*,
contact moments, boon/price currencies and every cross-domain coupling are untouched. Only the
*persistence plumbing* changed, and it got simpler.

## The visibility model [RATIFIED 2026-07-29] — how spirits exist without persisting

The elegant part of the ruling, and the thing to build against:

- **Every spirit is in every world, from run 1.** Nothing is added to the world by playing. This
  satisfies SM-INV-12 (worldgen is meta-free) and SM-INV-8 (the world doesn't persist) for free.
- **Before you have ever met one, it is invisible.** You drive past the whole cast and never know.
- **The first time you meet one, that is a beat** — an authored scene with unique flavor text, fired
  when the run-layer ledger is first satisfied. **Once per profile**, recorded as a **story key** on
  `metaState`. This is exactly the currency SM-INV-8 and the Roamer's economy already deal in.
- **In every subsequent run, the spirit is *present but inert* until that run's ledger is met.** The
  Night Owl sits in your passenger seat whenever you are **tired** — the deep band where the doze
  begins, not merely sleepy (see #01, "Sleepy and tired are two stages") — from the very start of the
  run, every run, forever. He says nothing. He changes nothing. **He is just there.**
- **The pact itself is re-earned every run**, at the full threshold, every time (see #5).

**Why this is better than what it replaces.** The old model bought "the world knows you" with
persistent world state, which is illegal now. This buys the same feeling with *presence* — and it is
strictly more frightening. A silent figure in the seat beside you that you *know* wants something,
that you have to spend ten tired kilometres to make speak again, is a better horror object than a
mechanical unlock. **The dread persists; the power does not.**

> **This is the beat/labor split, used a second time.** `missions.md` splits the log-drag main
> mission into *the beat* (staged scene, once per profile, a story key) and *the labor* (chaining and
> clearing, re-driven every run). The Night Owl is the same shape: **first meeting = the beat; the
> ten tired kilometres and the pact = the labor.** Two independent design problems landed on one pattern —
> treat it as the project's idiom for "authored content that must survive repetition."

**Constraint on the first-meeting scene:** SM-INV-11 permits authored beats but requires them
**staged in the world**, not in an abstract cutscene layer. The cab interior *is* world-space and the
passenger seat is already the contact moment, so this is satisfied by construction — build it in the
truck, not in a separate scene graph.

## How spirits introduce themselves [RATIFIED 2026-08-01]

**The convention, and the reason for it:** a spirit's first appearance must not interrupt driving.
Driving is the game. A beat that seizes the wheel — or demands attention while the player is working a
mountain road — is the one delivery mistake that makes an authored moment feel like an imposition
rather than an event.

So the default venue is **the campsite, on the night after the ledger is filled.**

> **You drive. Later, you stop. Then it is there.** The ledger completes in motion; the visit lands
> at rest. The gap between the two is deliberate — the player has time to notice what they did before
> anything comes of it.

This costs nothing to build. FEAT-45's camping and FEAT-47's day clock already ship, the make-camp
flow already has a dwell the player has committed to, and a campfire is a staged in-world space —
which satisfies SM-INV-11's surviving constraint (**authored beats stay in the world**, never in an
abstract cutscene layer) by construction.

**Three properties worth keeping as the cast grows:**

1. **No spirit is available from the start of a run.** Every one is earned by a behaviour inside that
   run (the visibility model, above: present but invisible until its ledger is met).
2. **The ledger completes while driving; the visit happens at camp.** Never mid-drive by default.
3. **The delay is one night**, not instant. It reads as consequence rather than trigger.

**Camp is also where you go to *ask*** [added 2026-08-01]. The venue is not only for first meetings:
once met, a spirit can be **interviewed** at the fire. The Highway is the first to use this — ask him
and he tells you **the day's road camber**, which is his favour readout delivered in character instead
of as a meter (#05). Generalise it as the cast grows: **camp is where you meet a spirit, and where you
go to ask one something.** The interaction is a single commit-action followed by sequential cards —
never a dialogue tree (the chat-pane rule holds).

**The known exception under discussion is the Night Owl** — he is a *passenger*, so a spirit who turns
up in the seat beside you while you drive is thematically exact. See #01; it is unresolved precisely
because it trades the strongest staging in the cast against the rule above.

---

## Career stats [RATIFIED 2026-07-29]

Career totals survive as an **account-level stats screen** — a player-facing journal, explicitly *not*
the in-run persona's ledger (that persona is fresh every run). Distinct waters fished, nights camped,
distance driven tired, runs ended and how.

**Shown post-run** [owner, 2026-07-29], which gives the screen a job beyond bookkeeping: it is where
the game acknowledges **what you almost did**. Records, not just totals — *"longest distance driven
tired"* is the ratified example — and it now matches the Night Owl's ledger unit exactly (corrected
2026-07-31: **10 km tired**, not hours), so it is literally the same measurement. It is what a player
who died at the ninth kilometre sees instead of a consolation prize from the world (see #01, "Should the near-miss leave a mark?").
Prefer **records and maxima** alongside lifetime sums; a personal best is the honest way to say *you
were close* without the world ever breaking silence.

- **They are never a spirit's unlock condition.** Spirit ledgers stay run-layer (single-run total /
  single-run streak). Career totals only *observe*.
- **They may unlock garage entries.** The garage is the one thing that legally persists (SM-INV-8), so
  career accumulation has a legal home: camp enough nights across a career and a different starting
  vehicle opens up. The SM-INV-9 guardrail is unchanged — garage vehicles are **lateral, never
  upward**; you unlock a *different* truck, never a better one.
- **Stats are not the only garage unlock source** [owner]. See `IDEAS.md` — *the barn find*: a vehicle
  that exists as a rare random spawn in the world, never shown on the map, found only by driving
  somewhere you had no reason to go.
- This also gives the deferred **classes** idea ("unlock by camping 10×, driving 5 km sleepy") a legal
  landing place, if it ever comes back.

---

## What spirits are

Spirits are the story's recurring cast. They are not quest-givers and they do not hand out
resources. Each one **cares about a single behavior the player is already performing**, watches
how the player performs it, and eventually intervenes — either by offering a bargain or by
making the world less accommodating.

This makes them the natural carrier for meta-progression as it's already defined: discoveries
unlock entities that alter future runs as **rule changes, not resource grants**. A spirit *is* a
rule change with a face on it.

> **⚠ AMENDED 2026-07-29 — spirits do not "alter future runs."** They are **present in every run
> from the first**, invisible until met, then present-but-inert until each run's ledger is re-earned
> (see "The visibility model" above). Meta-progression is the **garage**, not spirits, and the spirit
> *system* remains deferred pending its reconciliation with the garage. The
> rule-changes-not-resource-grants principle (SM-INV-9) is untouched and still exactly right — a
> spirit is still a rule change with a face on it, it just reshapes **this** run rather than all
> future ones.

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
  **REPLACED 2026-07-29 by "Met".**
- **Met** — the spirit is in *every* world already; what persists is only whether the player has
  **met** it (a story key). Once met it is **visibly present but mechanically inert** in later runs
  until that run's ledger is satisfied. Effects are always run-scoped. Every **Persistence: Meta**
  line in the catalog below should be read as **Met**.

**Ledger shape** — this is the real characterization tool. What a spirit asks you to prove says
more about it than what it pays out.
- **Cross-run accumulation** — a career total that survives death. Says: *the world has been
  watching you for a long time.* **MOVED 2026-07-29: this is no longer a spirit ledger.** Career
  totals live on the account-level **stats screen** and may unlock **garage entries**; they never
  gate a spirit and never buy in-run power (see "Career stats" above). *Original objection, retained
  because it is why the shape moved:* A career total is persistent state (SM-INV-8 narrowed: only literacy + the
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
**Contact:** The **passenger seat**, from the moment he is summoned — he rides with you, and you
talk to him by **stopping and pulling the handbrake** (see "Summoning" and "How you talk to him")
**Persistence:** Meta effect, **single-run total** ledger

**What it wants.** For you to keep driving when you shouldn't.

**Fleshed out 2026-07-29 (b)** [owner]: appearance, the summon condition, the interaction verb, and
**the bargain rewritten from a tempo boon to a nocturnal inversion**. Those sections are below and
they supersede the earlier sketch; the reasoning about *why he owns the doze* and *why the ledger is
single-run* is unchanged and still load-bearing.

> **Naming note.** *The Passenger* was the working handle; **Night Owl** is the name [owner,
> 2026-07-29]. This also **unifies him with the "deviant / night-owl spirit"** already sketched in
> `IDEAS.md` (2026-07-19) — same character, arrived at twice: rewards staying up dangerously,
> lessens the doze effect, pays more for missions run while tired. Treat that entry and this one as
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

> **RESOLVED 2026-07-29 (b)** [owner]. The old open question — *visible while driving, or only when
> he speaks?* — is answered: **visible while driving.** Once summoned he is simply in the seat,
> continuously, a figure you can glance at and eventually stop glancing at. This is the expensive
> answer and it was chosen deliberately; the cheap answer (a figure who materializes only to talk)
> throws away the entire near-miss / empty-seat vocabulary above.

### What he looks like [RATIFIED 2026-07-29 (b)]

**A man's body and an owl's head.** That is the whole design, and the instruction was to keep it
really simple.

- **Human from the neck down**, seated, dressed like anyone else out here — nothing costumed, nothing
  robed. He reads as a local who got in while you weren't looking.
- **An owl's head**, unmodified and unstylized. Not a mask, not a hybrid, not a beak on a face. The
  join is not explained and should never be lit in a way that invites study.
- **No expression system.** An owl's face doesn't emote, which is the point — the player projects
  everything onto a face that gives them nothing back. This is also why it's cheap.

**Motion budget: one bone.** Head yaw, and nothing else. No idle loop, no gesture, no getting in or
out — he is *there* or he is *not there*, and the transition is never animated. An owl's head turn is
anatomically enormous and completely natural to the animal, so the single cheapest motion available
is also the most unsettling one: he can be looking straight backwards down the bed of the truck and
be doing nothing strange at all.

**One coupling worth building.** Owls blink; so does the doze. Tie them — during a doze, *he doesn't*
— and the eyes-closed frame gets its content for free (SM-INV-11's doze channel), with no new staging
and no new asset. The cab interior is already the doze's camera (see "the doze and the passenger seat
are the same shot" below).

*Production note:* a static seated mesh parented to the cab with a single head bone is well inside
the existing prop/character budget, and it rides the FEAT-04a visual-swap seam rather than needing a
character pipeline. Nothing about this character requires an animation system to exist.

### Summoning [RATIFIED 2026-07-29 (b)]

> **⚠ OPEN 2026-08-01 — where the *first* meeting happens.** The 2026-08-01 convention (see "How
> spirits introduce themselves") makes the **campsite** the default venue for a spirit's introduction,
> so that no authored beat interrupts driving. **The Night Owl is the deliberate exception under
> discussion**, and the owner has not ruled:
>
> - **In the seat, while driving** — thematically exact. He *is* the passenger; the doze is already a
>   cab-interior shot with that seat in frame, so it needs no new staging and it is the strongest
>   image in the cast. Risk: **intrusive.** A character arriving mid-corner on a mountain road, in the
>   exact state where the player is least able to attend to anything, is the one place the convention
>   exists to protect.
> - **At the campsite, like everyone else** — safe, consistent, and it still works: you drove 10 km
>   with your eyes closing, and that night something is at your fire. Cost: it spends the passenger
>   seat, which is his whole identity, on a later beat instead of the first one.
>
> **A middle reading worth considering:** introduce him at the fire, then let him *take the seat* from
> the next night onward — the introduction obeys the rule, the recurring presence keeps the image. The
> beat/labor split already used elsewhere in this document has this shape.

**He appears in the passenger seat once you have driven ~10 km *tired*, within a single run.** One
number, one unit: **distance**. The counter resets to zero on death. He does not meet people who have
been mildly irresponsible over a career — he meets people who are destroying themselves right now.

> **Corrected 2026-07-31 [owner], twice over.** The earlier write-up said *"~10 hours **or** ~10 km
> while **sleepy**"*. Both halves were wrong: **the hours term is dropped — the ledger is kilometres
> only** — and the state it counts is **tired**, not *sleepy*. Those are now two different things
> (below). The document has been swept — **the number is 10 km everywhere**; if a stray "tired hours"
> resurfaces from an older draft, it is stale, not a second rule.

**Sleepy and tired are two stages, not two words** [RATIFIED 2026-07-31]:

| stage | what it is | what it does |
|---|---|---|
| **Sleepy** | the warning band. Yawns, heavy eyelids, the read that says *"I am N km from anywhere I'd want to wake up"* | tells you to start looking for ground (SM-INV-6's last leg of the day) |
| **Tired** | the danger band. Where the **doze actually begins** | this — and only this — is what the Night Owl counts |

**This is the substantive half of the correction.** A ledger that counted the warning band would meet
everyone eventually; sleepy is a state a careful player passes through *every single day* on the way
to camp. Counting only the deeper band means the ledger can only be filled by driving in the state
where your eyes are already closing — so **he cannot meet anyone who hasn't repeatedly chosen the
dangerous thing.** The unlock condition and the death condition are now literally the same behavior,
which is what makes it self-limiting with no tuning at all (see below). FEAT-47 has to define the two
bands for this to exist.

**Why distance and not hours.** Hours are farmable *in safety*: park up, or crawl a meadow at 5 km/h,
and the counter fills at no risk. Kilometres can't be — covering ten of them tired means actually
moving, on real road, in the dark, at a speed that can hurt you. **The ledger should only advance
while the player is exposed to the thing that makes it an achievement**, and distance is the term
that guarantees it. This also keeps a single-number rule with no OR to explain.

**What it costs, in real terms.** At 24-minute days (`run-shape.md`, RATIFIED) the clock runs **60×**
— one real minute is one in-game hour. So 10 km reads very differently depending on the country:

| driving | real time | in-game time |
|---|---|---|
| 60 km/h on open road | ~10 min | ~10 hours tired |
| 25 km/h on tight mountain country | ~24 min | most of a day tired |

**The accepted cost of dropping the hours term:** the player whose region is genuinely slow pays more
for him. That is a real asymmetry and it was chosen anyway, because it errs in the safe direction —
it makes him *harder* to reach on exactly the roads where driving tired is most likely to kill you,
and a spirit that is easiest to summon on the deadliest ground would have been the wrong bug to ship.
If it proves punishing, **the dial is the 10 km, not the reintroduction of an hours term.**

**Nothing is ever displayed.** No counter, no meter, no "8/10" (SM-INV-3). The first evidence the
ledger exists is that the seat isn't empty.

**Reconciling this with "The visibility model."** Two different things are gated and it matters which
is which:

| | first run you ever reach it | every run after | gated by |
|---|---|---|---|
| **He is in the seat** | appears at the threshold — *this is the beat* | present whenever you are **tired**, from run start, **silent and inert** | the story key (once per profile) |
| **He speaks / offers the pact** | at the threshold | at the threshold, **re-earned in full every run** | the run-layer ledger (**10 km tired**) |

So a first-time player's memory is *"I drove too far into the night and something appeared."* A
veteran's is *"he has been sitting there since my eyes started closing and I know exactly what I have
to do to make him talk."* Same character, and the second reading is the more frightening one — which
is the whole argument in "The visibility model." **The 10 km ledger is the price of the offer in
every run; the appearance is only ever bought once.**

*Note the presence rule keys off the **tired** band too* — he does not turn up merely because you
yawned. The seat filling is itself information: it means you have crossed out of the warning band.

**Why single-run is the stronger rule.** The counter and the death condition are the same
behavior, which makes the unlock **self-limiting** without any tuning: the only way to cover ten
kilometres tired is to survive several in-game days while repeatedly refusing to sleep, and driving
tired is the thing most likely to end the run. Most attempts die at the seventh kilometre with
nothing to show for it. That's the achievement — not a number, but a sustained refusal that happened
to survive.

Worth checking against real survival rates once the doze is in. Ten is a guess, and it is a guess
about **how much tired-band driving an in-game day actually affords** — which depends entirely on
where FEAT-47 puts the sleepy→tired boundary. **⚠ RESOLVED (was CONFLICT 4):** day length is settled
at **24 minutes** [RATIFIED 2026-07-29]. **⚠ Arithmetic re-derived 2026-08-01:** a run is **7–8 days**,
not 10–15 (the old figure divided target hours by the sky cycle — see `run-shape.md`). So 10 km is
roughly **1.3 km of tired driving per in-game day**, not 1.0 — the last stretch after dark, most
nights, for the life of a *shorter* run. That makes the ledger **~35% harder than this entry assumed**,
on top of the tired-band narrowing already noted. Still the right shape — a sustained habit, not one
heroic night — but the number is now near the top of its plausible range and is the first thing to
re-check once the doze is playable. Ten may want to become seven or eight.

**The real dependency is the band boundary, not the number.** If FEAT-47 puts the tired band late and
narrow, 10 km is a serious commitment; if the whole evening counts as tired, it's trivial. **Set the
two bands first, then re-derive this number from them** — do not tune them independently.

**Re-summoning.** ~5 km tired, still single-run — **and the within-run reading is the one that
survives** [confirmed 2026-07-29; unit corrected 2026-07-31].

- ❌ **Cross-run halving is DEAD** (resolution #5). The original *"once met he's meta, and the
  per-run threshold drops to half"* would mean run 50 reaches the pact in half the tired kilometres
  run 1 needed — a permanent difficulty reduction, which is the power floor SM-INV-9 forbids. **The
  first threshold is ~10 km in every run, forever.**
- ✅ **Within-run re-acquisition is LEGAL and better.** Refuse him, or lose him, and the seat empties
  — the half-threshold is what it costs to have him back *this run*. It resets with the run like
  everything else, so it prices a refusal instead of rewarding a career. Keep this.

The number ~5 survives; only which axis it sits on changed. Note this makes the pact genuinely
losable, which the escalation ladder below should account for.

**Should the near-miss leave a mark?** A player who dies at the ninth kilometre has done something
remarkable and gets nothing. No counter should be shown — but the world might. An empty
passenger seat that wasn't empty a moment ago, on the run *after* a near miss. **Sharper now that
the seat is canonically his** (see "Where he sits") — this isn't a random omen, it's *him*, early,
before you've earned him.

**RESOLVED 2026-07-29: the near-miss is acknowledged on the post-run stats screen, not in the
world.** [owner] The record is **"longest distance driven tired"** — a career stat, so a player who
died at the ninth kilometre sees their own high-water mark and knows exactly how close they came.

This is a better answer than either option that was on the table:

- **No new persistent state.** The cross-run world mark was rejected precisely because it needed the
  profile to remember a near-miss, and a near-miss is not a "met" story key. The stats screen is
  *already* ratified account-level persistence (see "Career stats"), so this costs nothing new.
- **The world stays silent, which is the point.** An omen in the seat would have the world
  commiserating with you. The stats screen doesn't commiserate — it just shows a number you have to
  interpret yourself. That is the SM-INV-10 discipline (*described, never scored*) pointed at the
  player's own history, and it keeps the seat's emptiness meaning exactly one thing.
- **It gives the stats screen emotional work to do**, rather than leaving it as bookkeeping. The
  place you go to see what you almost did is a different object than a leaderboard.

**Source data:** FEAT-47's tired ledger integrates **distance driven in the tired band** as a
run-layer counter (it is the Night Owl's summon condition). The career stat is just the max of that
counter across runs — no new instrumentation, and distance is the term that resists farming, which is
what makes it the honest thing to record.

*(The same-run mark — the seat changing at the ninth kilometre of the run you're in — remains legal and
optional as foreshadowing. It is not required by this resolution.)*

### How you talk to him [RATIFIED 2026-07-29 (b)]

**Stop the truck and pull the handbrake.** That is the verb. He is riding beside you the whole time
and he will not interrupt your driving to make his offer — you have to *decide to stop*, which means
every conversation with him is something the player went and got.

Three reasons this is the right verb and not a proximity prompt:

- **The handbrake is already the game's commit gesture.** It is how you park, and camping is likewise
  a deliberate button (SM-INV-6). Pulling it to talk to the thing in your passenger seat is the same
  grammar the player already has.
- **It costs the one thing he's selling.** Stopping is time. He is the spirit of not stopping.
- **It is repeatable and it is refusable by inaction.** Never pull it and he never speaks — which is
  a legitimate way to play the whole run with him sitting there, and is a much better silence than a
  dismissed dialog box.

**The offer itself takes the chat pane** (DESIGN.md "Characters and dialog") — sequential cards, no
branching. He rides shotgun, so he is a *character in the car* and the pane is legally his.

> ⚠ **This needs one narrow amendment to a RATIFIED rule, and the owner has made it
> [2026-07-29 (b)]:** the chat pane's *"no dialog options — dialog is received, not negotiated"* now
> carries **one exception: a pact's accept/decline.** The final card of a pact offer carries the
> choice. Scope it exactly that tightly — this licenses a yes/no on a bargain, and **not** dialog
> trees, not reply selection, not branching mission conversations. Logged into DESIGN.md.

### The bargain — the nocturnal inversion [RATIFIED 2026-07-29 (b)]

> *"I'll help you get through the rest of the night, sharp as a tack."*

**He does not make you faster. He does not make the day longer. He gives you the other half of it.**

- **You do not get sleepy at night.** From dusk to dawn you are alert, fully, with a **little
  restfulness bleeding into the shoulders** — a margin either side of true dusk and true dawn, so the
  handover isn't a cliff edge.
- **The day is now hostile.** In daylight, sleepiness accrues *rapidly* — far faster than a normal
  day's baseline. Get caught out past the morning shoulder and you are dozing within the hour.
- **The clock itself is untouched.** [owner, explicit] The day is still 24 real minutes, the sky
  cycle is unchanged, and the pact adds no hours to the run. It is a **phase shift, not an
  extension** — this is the single easiest thing to get wrong about him, and a version that quietly
  lengthens the waking day is a balance-sheet handout of exactly the kind SM-INV-9 forbids.

**Why this is a better bargain than the one it replaces.** The earlier sketch sold a *tempo boon* —
higher speed ceiling, faster throttle. That was a number bolted to the truck, which SM-INV-10 says
parts never get, and a flat capability increase, which SM-INV-9 calls the quiet erosion. The
inversion is a **rule change with no number in it**: the same truck, the same day, the same
sleepiness system, running against a different clock. He still sells *time* — but the time is the
night, not the speedometer.

> **Superseded:** *"Ratified: tired spirit pays in speed"* (Provenance, 2026-07-19). Retired
> 2026-07-29 (b) in favor of the inversion. The Host's half of that line — *rested spirit pays
> in reduced wear* — **stands unchanged.**

**The price** [owner: dark + a hostile day, and nothing else]:

- **You cannot see.** Headlights and a moon. Every road you already know becomes a road you are
  reading three seconds at a time, and the country the game is proudest of — grade, camber, a
  decreasing-radius corner — arrives without warning. **The pact hands the player the same physics
  under a fraction of the information**, which is the honest version of "priced in safety": nothing
  was made more dangerous, the player was made less informed. FEAT-14's cast vehicle lights are
  already the delivery mechanism.
- **The day will kill you if you misjudge it.** Every overrun — a repair that ran long, a haul that
  didn't make it home, a mission that crossed dawn — is now paid in the brutal daytime curve. The
  pact takes away the gentle failure mode: a normal player gets sleepy over hours and gets warned;
  his player gets a sunrise.
- **Explicitly NOT part of the price:** the world does not close at night. Towns, stations and
  mission-givers keep whatever hours they keep [owner ruling, 2026-07-29 (b)] — the cost is contained
  to the character and needs no world-wide nocturnal-economy system.

**The horror moves into daylight, for free.** He owns the doze (below), and under the pact the doze
now happens *at noon* — eyes closing on a bright empty road with a man-shaped thing in the passenger
seat that isn't blinking. Nothing had to be authored to get that; it falls straight out of the
inverted curve. It is also thematically exact: the deal was to be sharp at night, and the bill comes
due in the light.

**Is it even a good deal? — the honest accounting.** Waking hours are roughly conserved, so the pact
is **deliberately thin**, and the gain is not a bigger budget:

- The night is **contiguous productive driving**, where a normal day's tail is spent hunting good
  ground before the light goes (SM-INV-6's "last leg of the day"). His player camps in daylight, at
  leisure, on ground they can actually see.
- The **shoulder restfulness** is the only additive term, and it is small on purpose.
- Set against: no visibility, and a failure mode with no warning shot.

**If playtesting says the trade is a pure downgrade, the shoulder width is the dial** — widen the
dusk/dawn margin. **Do not reach for the day length**; that is the ruled-out lever, and reaching for
it converts a rule change back into a handout.

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
and take more, and the player has by then built a run around the earlier ones. *Proposal, not
ratified — the tiers should escalate along the inversion's own axis rather than introducing new
currencies:* tier 1 is the night as described; a later tier **widens the shoulders** until the only
genuinely safe window is the middle of the day; a later one still offers **a night that costs no
sleep at all** — you simply keep going — and takes the following day whole. Each step is the same
trade at greater depth, each is separately refusable, and none of them is a number on the truck.
The player's own escalation is the story; a purchase ladder would not be.

---

### 02 — The Host *(renamed 2026-08-01 — was "The Innkeeper")*

**Class:** Pact · **Domain:** Fatigue (safety side) · **Disposition:** Two-sided
**Contact:** The campfire, at waking
**Persistence:** Meta effect, **single-run streak** ledger *(proposed — see below)*

**What it wants.** For you to sleep properly, in a real place, more often than is convenient.

> **Renamed and re-grounded 2026-08-01** [owner]. *The Innkeeper* implied commerce — a bed you pay
> for. **The Host** is the forest housing you graciously, which is what the mechanic actually is.
> And with the rename, a scope ruling: **there is no separate class of "discovered" or "developed"
> campsites, and none is planned.** The shipped camping system (FEAT-45 dispersed zones + the vibe
> score) is the only camping there is — a parallel curated-site system would be a second thing to
> generate and maintain for no mechanical gain. Older "discovered camp" phrasing in this entry
> predates that ruling; read it as "camp."

**Unlock.** A streak: N consecutive in-game days in one run ending in a full rest at camp — any
camp, through the one camping system — without ever crossing into tired driving. One bad night
resets it to zero. Because camping is gated on campable ground, this is a navigation and planning
problem — the unlock cost is paid in route planning, not in a stat.

> **⚠ RESOLVED (was CONFLICT 3).** *"Camping is a location and not a menu option"* is superseded
> phrasing —
> **SM-INV-6 was reversed 2026-07-19**: camping **is** a button, gated by *campable regions*, with a
> worldgen-scored quality preview (shade, flatness, water proximity). **The argument survives the
> correction intact**, because the gating moved rather than vanished: the button is only available
> on campable ground, so "get to good ground before you're dangerous" is still a navigation and
> planning problem, and the streak is still paid for in route planning. Reword, don't rethink.

**Why a streak.** Now that The Night Owl is a single-run total, both fatigue spirits should ask
for commitment inside one run rather than career credit, or the domain feels lopsided. But they
should ask differently, and the shapes fall out naturally:

> **The Night Owl is a total you must reach before you die.
> The Host is a streak you must not break.**

Excess accumulates. Restraint only exists unbroken. A count of rests would be trivially cleared
by a cautious player; a streak means one late night at hour six of a good run costs the whole
thing, which is precisely the discipline this spirit is asking about.

**The bargain.** Here's the balance note: **this cannot also be "you drive faster."** If both
fatigue spirits sell speed, the domain collapses and the choice is numerical. The two sides need
different *currencies*:

- The Night Owl sells **the night**, priced in **darkness and a hostile morning**.
  *(Updated 2026-07-29 (b): was "sells time, priced in safety." The shape of the pair is unchanged
  and the point below stands harder than before — the inversion sells hours-of-the-clock, not speed,
  so there is now no way for the two fatigue spirits to collide on a tempo stat at all.)*
- The Host sells **safety and margin**, priced in **time**.

So the Host's boon should be reduced wear accumulation, reduced damage from contact, better
low-light visibility, or a payout multiplier — things that make each hour worth more, since the
player has fewer of them. Wear is the strongest candidate: it directly offsets the sleep cost in
the economy rather than in the driving.

**Exclusivity (proposal).** You cannot hold both fatigue pacts. Taking one spurns the other, and
per the unifying rule, the spurned one starts behaving like a warden.

---

### 03 — The Verge *(working handle)* — **RETIRED 2026-08-01, superseded by #05/#06**

> **⚠ DO NOT BUILD. Retired by the owner 2026-08-01**, superseded by **The Highway and The Shortcut**
> (#05/#06 below). Kept for the reasoning, which was reused rather than discarded.
>
> **Why it went.** Two reasons, both owner-stated. First, its premise was rejected outright: *"a
> conservationist deducting money converts an ethical objection into a toll,"* and a flat fee is
> brutal at hour one and irrelevant by hour five — backwards. Second, its own open question was
> *"does it get a trailblazer counterpart?"* — and the answer arrived from a better angle. The
> Highway/Shortcut pair are **not people with opinions about roads; they are roads**, which gives the
> domain a voice The Verge never had.
>
> **What survived into #05/#06:** the load-bearing observation that off-route travel invalidates
> rather than beats par; terrain-fragility weighting; the coupling of the terrain domain into fatigue;
> and the hard jurisdictional split with The Confluence over the streambed (now the Highway's to
> honour). **What was dropped:** the fine, the ecological framing, and the warden-only posture.
>
> **The deeper reversal:** The Verge assumed shortcutting is a problem to price. The owner's ruling is
> that off-road driving is *already* punishing on this terrain, so on the rare occasion worldgen
> offers a genuine cut, **taking it should be rewarded** — and the interesting design question is who
> resents that, not how to tax it.

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
uses it to survive; the Host's player uses it to claw back some of the day they gave up.

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

## 05 / 06 — The Highway and The Shortcut [owner, 2026-08-01]

**Domain:** Route · **Class:** the Highway is the **default state**, the Shortcut is a **Pact** ·
**Mutually exclusive**, like the fatigue pair.

They aren't people with opinions about roads. **They are roads** — same substance, different fate.
One was surveyed and authorized; the other was just used.

> **The asymmetry is the ruling** [owner, 2026-08-01]. The Highway is **not a pact you take** — it is
> **the default state of the game**. Driving a routed route, graded against par on the maintained
> network, *is* being under the Highway's terms; the player never opts in because they start there.
> What the game offers is **the choice to break it.** That simplifies the pair to one buildable pact
> and makes the Highway's grief a thing you hear *when you leave*, not a system to opt into.

### Cuts — the world substrate (buildable now, spirit-independent)

The cuts are **worldgen**, and they do not need the spirit system. Ticket: **FEAT-52**
(off-network generator — *not* FEAT-49, which is the gauge cluster).

- **Generated in a post-pass outside the router graph**, so routing cost stays frozen and cuts never
  enter pathfinding. **The obfuscation is structural, not cosmetic:** by the router's own cost
  function a cut *is* bad line — tight radii, no banking, bad surface — so the GPS honestly routes
  around it. Nobody is hiding anything; the router simply disagrees with you.
- **Mostly leg-to-leg corner shaves** (adjacent legs, wide interior angle), which is what real social
  trails are — nobody bushwhacks a novel route, they cut the switchback. Occasional longer ones where
  the network detours around terrain: the old ford, the drainage crossing. Those read as history and
  feed the horror layer for free.
- **Seeded with pre-existing cuts** — logging spurs, mining tracks, stock driveways — so using one is
  **following, not founding.** The good line was already there.
- **Not every cut goes through.** Washouts and slides. **Passability is worldgen** [RATIFIED
  2026-08-01], fixed per seed — so knowing which cuts go is **literacy**, the one thing that survives
  death (SM-INV-8), and the Shortcut's pact becomes a *knowledge* gift rather than a lottery. You
  don't know until you're committed, and reversing is expensive: the failure isn't a loss, it's a
  loss plus the time you spent earning it.
- **One generator.** Cuts, spurs, camping areas, logging sites and POIs all come from the single
  off-network generator (DESIGN.md "The off-network layer"). **A track that dead-ends is a spur; a
  track that rejoins the network is a cut.** Topology decides the purpose.

### Why players don't just take them — four costs, three nearly free

**Not a fine.** The Verge's toll model is retired (#03).

1. **Wear**, already ratified as intensity-scaled (SM-INV-5). **Self-gating with no difficulty knob:**
   early, damage is existential; late, repairs are affordable. Same mechanic, opposite feel.
2. **Risk of ruin.** Break down on the road and you get towed. Break down on a cut and the tow costs
   **extra in proportion to your distance from the maintained network** [owner, 2026-08-01]. *Note
   this is deliberately a price, not an impossibility* — DESIGN.md is explicit that a survivable
   breakdown is a **predicament, not a fail state**, and "nobody comes at all" would convert the
   tow-vs-limp decision into a certainty.
3. **Fatigue multiplier on rough surface.** Compounds into the Host, camping-as-navigation, and
   the doze.
4. **Mission incompatibility.** Fragile scores on vertical shock; freight puts real mass through ruts.
   Cuts are viable on margin-axis errands and nowhere else — and this costs **no new code**, it falls
   out of the existing scoring axes.

### 05 — The Highway *(the road that keeps you)* [RATIFIED 2026-08-01]

**Class:** favour track, not a pact · **Domain:** Route · **Disposition:** **two-sided** — favour
banks the corners above baseline, disfavour flattens them below it
**Contact:** the campfire — first to introduce himself, thereafter **on request, any night**
**Ledger:** single-run streak, **broken by completing a cut**
**Boon:** **it banks its corners for you** · **Anger:** **it takes the banking away, and then some**

Vain, bypassed, speaks in the plural. It doesn't watch you from anywhere — **you're standing on it.**
Motif: culverts, drainage, closure signs on routes that no longer exist.

**Its argument isn't ecological.** *I was a shortcut once. Look what they did to me* — straightened,
widened, named, and now it can't go anywhere but where it goes. Real grief, adjacent to the Roamer
without duplicating it: the Roamer lost a range, the Highway lost the ability to wander.

**And its boon is gratitude, not generosity.** He resents what was done to him, but a road wants
traffic. *Look what they did to me — but at least you're still here.* That is why he rewards use
without ever demanding it, and why the loss is withdrawal rather than punishment.

#### The boon: the corners start holding you

**Camber deepens as favour accrues, and flattens when the streak breaks.** A maintained road is
graded, drained, surveyed and **banked** — so the boon is the thing a well-engineered road literally
does for a driver.

> **Stay on the network and the corners start holding you. Leave it, and they go flat.**

**The mechanism (corrected 2026-08-01 — the model changed under an earlier draft).** Camber is a
**saturating superelevation** function, not the old `camberStrength·κ` with a hard clamp
(`camberFromCurvature`, `src/road.js`; params in `data/ranger.js`):

```
camber(κ) = camberMaxAngleDeg · |κ| / (|κ| + 1/camberKneeRadiusM)
```

It is self-bounding — hairpins plateau at `camberMaxAngleDeg`, and effective gain *decreases* with
curvature, so there is **more bank per unit curvature on sweepers than on hairpins**. Shipped defaults
(`maxAngle 20°`, `knee 60 m`) give ~16° at R=15 m, ~11° at R=50 m, ~5.7° at R=150 m.

**`camberKneeRadiusM` is the favour knob** — *"raise to push strong banking out to gentler curves."*
That is exactly the boon: an engineered highway superelevates its **sweepers**, and sweepers are where
a driver actually banks speed. `camberMaxAngleDeg` is the wrong dial to move — tight corners already
sit near the asymptote, so raising it mostly over-banks hairpins, which is the failure the saturating
model was introduced to fix.

**The scale [RATIFIED 2026-08-01]:**

| state | camber | how you get there |
|---|---|---|
| **punished** | **flat — the floor** | one completed cut |
| **baseline** | **the shipped defaults** (`maxAngle 20` / `knee 60`) | where every run starts |
| **full favour** | knee pushed out — strong bank reaching gentler curves | **5 days with no shortcuts** |

**Flat is the floor, deliberately.** Genuinely off-camber was considered and rejected — *"an
interesting idea to keep in mind, but I don't think it would be fun"* [owner]. Parked, not adopted.

> **⚠ Reading to confirm.** *"Whatever we have right now should be the default starting camber params;
> it should take 5 days of no shortcuts to build up to this level."* Written above as **current
> defaults = the day-1 baseline**, with favour climbing *above* them. The alternative parse — current
> defaults are the 5-day *peak*, and a run starts flatter — is a one-line flip if that was the intent.
> The reading here is chosen because it preserves the road feel already tuned and liked as the neutral
> state, and gives both directions somewhere to go.

Five reasons this is the right lever, recorded because three other candidates were rejected first
(see "What this replaces"):

1. **The mechanism already exists and is already a live dial.** Both params are exposed as debug
   sliders and recompute banking without a regen. `IDEAS.md`'s **road-bender spirit** (2026-07-21) is
   this idea, and its 2026-07-29 note reads *"spirits deferred, so a road-bender has no carrier."*
   **The Highway is the carrier.** Two ideas from different months are one thing.
2. **Double-edged**, so SM-INV-9 needs no bolted-on guardrail. Bank is not free speed: on a high-CoG
   truck it **invites rollover**, and pushing strong bank onto sweepers is pushing it onto the corners
   taken *fastest*. `data/ranger.js` warns about over-banking directly.
3. **It is the true mirror of the Shortcut**, and neither moves par:

   | | how you beat par | what it costs |
   |---|---|---|
   | **Shortcut** | a shorter **route** | he tells the client (par tightens) + wear + risk |
   | **Highway** | a faster **road** | rollover exposure + you drove the long way |

4. **SM-INV-10-shaped.** No number ever surfaces. *The corners hold you.* The loss needs no UI either
   — you take a sweeper you have driven thirty times and the truck doesn't sit down in it the way it
   did last week.
5. **It rides SM-INV-11's channel for free.** `runState` advances at day/sleep boundaries, never
   mid-stream, so **the road changes overnight.** You wake and the roads are holding you better; or you
   took a cut yesterday and this morning they are flat. The parameter-state story mechanism doubles as
   the favour readout, with no meter anywhere.

**Tier it, so the relationship progresses instead of flipping a flag:**

| streak depth | what the road does |
|---|---|
| early | **it warns you** — corner markers before the hairpin, a grade sign before the descent. Real signage, appearing as favour deepens. *Geometry* information, never mission information, so it does not touch the strategy layer. Same shape as the GPS: convenience for a driver who doesn't know the region, worthless to one who does. |
| deep (5 days) | **it banks its sweepers for you** — `camberKneeRadiusM` pushed out |

#### The arithmetic of five days — and why the boon lands in the mountains

A run is **7–8 days** (`run-shape.md`), so a 5-day climb is not a minor commitment: **full favour
arrives on day 5–6 and you enjoy it for the last two or three days.** At 6 regions over 7–8 days
(~1.25 days each), day 5 is **region 4 or 5** — deep country, the hardest roads in the run.

**That is the right place for it, and it is worth noticing that it fell out rather than being
designed.** The reward for a run of discipline arrives exactly where the driving is most punishing,
in the mountains, with a truck that is by then worn. A boon that landed on day 2 would be a free
early-game buff; this one is a late-run payoff you had to protect.

**And favour rebuilds more slowly than it built** [RATIFIED 2026-08-01]. He remembers. The consequence
is sharp and should be understood before tuning the rate:

> **Past roughly the midpoint of a run, one cut ends the Highway relationship for that run.** If the
> re-climb is slower than five days and only three remain, there is no recovering it.

So the cost of a shortcut **escalates with run age**, without anything being keyed to run age — it
comes purely from there being fewer days left than the climb needs. That is the same shape as the rest
of the economy's escalation, arriving for free. It also means the mid-run cut decision is the heaviest
one in the domain: early, a cut is cheap and recoverable; late, it is permanent.

*Open: the exact re-climb rate. It must be > 5 days to mean "he remembers", but a rate so slow that
one cut on day 2 is unrecoverable would collapse the choice rather than sharpen it.*

#### Two hard constraints

- **⚠ PAR MUST NEVER READ CAMBER.** It does not today — `src/par.js` integrates **curvature and grade
  only**, against a fixed reference μ, and mentions camber once in a comment about what par cannot
  see. Under this boon camber becomes **run-state dependent**, so a par that read it would scale with
  run state, which **SM-INV-2 forbids outright**. This is dangerous precisely because *"make par more
  accurate by including banking"* is a reasonable-sounding future change that would quietly break the
  game. The invariant is now stated inline in `par.js`; do not remove it.
- **Apply at day boundaries only.** Required by SM-INV-12 (`runState` never advances mid-stream), and
  re-caching profiles mid-drive would hitch anyway.

#### Shape: continuous, not binary — this is what makes the pair work

The two are **deliberately different shapes**, which is what stops the route domain being a reskin of
the fatigue pair:

| | shape | how you get it | how you lose it |
|---|---|---|---|
| **The Shortcut** | **binary** — a door you walk through | opt in, once | you don't |
| **The Highway** | **continuous** — a relationship you are already in | accumulates silently | one cut, instantly |

**So the exclusivity is enforced by driving, not by a menu.** You can hold the Shortcut's pact *and*
keep the Highway's favour — as long as you never actually take a cut. Which is absurd and correct: he
showed you every cut in the region and you are not using any of them, and being the Shortcut, he
would keep cheerfully telling you about them anyway. There is no accept/decline anywhere in this, which
matches the chat pane's no-options rule.

#### Summoning

**The terms are the default; the spirit is not.** Par on the road route and standard grading are just
*the game* — no spirit required, and they apply from minute one. But **the Highway himself is met like
everyone else** (see "How spirits introduce themselves"): a ledger, then a visit at the fire.

His ledger writes itself: **N missions completed with zero off-route travel.** You meet him by having
been loyal without knowing he existed, and he turns up to thank you for something you were not doing
on purpose. *(This resolves a contradiction in the earlier draft, where "the Highway is the default
state" collided with the convention that no spirit is available at the start of a run.)*

**What breaks the streak** and whether it can be rebuilt: see Open, below.

#### What this replaces (rejected boons, recorded so they aren't re-proposed)

- **Cheap tow / subsidised recovery — REJECTED** [owner, 2026-08-01]. *"A tow is something a great run
  doesn't even have."* It is insurance you only claim when you are already losing, so discounting it
  rewards the run that is going badly and is invisible to the run that is going well. Correct call.
- **Network state as knowledge (which stations are open, which givers remain) — REJECTED** [owner,
  2026-08-01]. Mission and service availability belongs to the **player's strategy layer**: the owner
  wants missions visible on the map so the player can do the calculus of *cross the map for the great
  job, or take the near one that ends somewhere useful.* Withholding or granting that is far too
  strong a lever to spend on a spirit. **Nothing in this pair may touch what the player can see of the
  job board.**
- **Reduced wear — REJECTED** (mine). The Innkeeper already sells wear reduction. Two spirits trading
  in one currency is exactly the collapse this document warns about in the fatigue domain.

#### The anger: he takes the banking away, and then some [RATIFIED 2026-08-01]

**Completing a cut breaks the streak** — FEAT-52's traversal event, in one road and out a *different*
road. Unambiguous, already being built, and impossible to trip by accident: parking on grass, using a
shoulder, or sliding off a corner never costs you anything. *(This settles the open question; the
alternative — a distance threshold on off-route travel — is truer to "zero off-route travel" as
written, but needs tuning and could punish one bad corner.)*

**And he does not merely withdraw. He punishes** [owner, 2026-08-01]: a **stark reduction in road
camber**, dropping *below* baseline to **flat**. A mountain road that was holding you last week now
asks you to hold yourself, and it asks on every sweeper until favour is rebuilt — which is **slower
than it was earned.**

**Flat is the floor.** Off-camber was considered and rejected as not fun [owner, 2026-08-01]; it stays
parked in `IDEAS.md` rather than adopted.

*(This reverses my recommendation of withdrawal-only. The owner is right and the reasoning I used was
too cautious: the rejected toll was rejected for being **a fine in money**, an ethical objection
converted into a price tag. Flattening the roads is not a fine — it is the world changing its
behaviour, which is a rule-change and exactly what SM-INV-9 says a spirit is *for*.)*

**The punishment prices itself, for free, via the same invariant the boon relies on.** Par never reads
camber — so a punished player faces **the same par on a worse road.** Ratio suffers, rank drops,
payout falls, points come slower. There is no penalty accounting to write anywhere: the flat corners
*are* the penalty, and the economy registers it automatically.

**SM-INV-1 is intact, by the doze's own logic.** Flat corners make crashing likelier; they never kill.
The Highway hands you a harder road and lets the physics decide, which is precisely what the doze is
already permitted to do. What he must never do is take the wheel or apply a fine.

#### Asking him: the day's camber, from the road's own mouth [RATIFIED 2026-08-01]

**Once met, he can be interviewed at camp on any night, and he will tell you the day's road camber.**

This is the favour readout, and it is delivered **diegetically instead of as a meter** — you do not
open a screen to check your standing with the Highway, you ask the Highway. He is vain and bypassed
and starved of traffic; asking a road about its own condition is the one thing guaranteed to get an
answer, at length.

Three things this earns:

- **It solves legibility without a UI** (SM-INV-3's posture). Camber is otherwise felt but not
  knowable — the player can tell the corners changed, not by how much or why. He closes that gap in
  character.
- **It gives the campsite a *consultation* role, not just an introduction one.** Worth generalising as
  the cast grows: camp is where you meet a spirit **and** where you go to ask one something.
- **It is a reason to camp that isn't sleep.** The day's camber is genuinely worth knowing before you
  plan a run of sweepers.

Interaction shape: a single action at camp, then **sequential cards, no options** — the chat-pane rule
holds (choosing to ask is a commit, like pulling the handbrake to talk to the Night Owl; there is no
dialogue tree inside it).

#### Open

- **Per-mission or continuous across the run?**
- **The exact re-climb rate.** Ratified that it is **slower than the 5-day first ascent** — he
  remembers. The number is open and load-bearing (see "The arithmetic of five days"): too slow and a
  day-2 cut is unrecoverable, which collapses the decision rather than sharpening it.
- ~~How far below baseline does "stark" go?~~ **RESOLVED 2026-08-01 — flat is the floor.** Off-camber
  considered and rejected as not fun; parked in `IDEAS.md`.
- **Fragile and freight cannot use cuts anyway**, so those missions bank Highway favour for free. Is
  "haul the careful cargo, stay legal, get the good corners" a coherent build or a loophole? It reads
  coherent, and it pairs with the durability parts axis.
- **What if you hold the chip and never cut?** You own his rival's knowledge and refuse it. Does the
  Highway care that you *could*? Probably not — he watches what you do, not what you carry.

> **A structural consequence worth confirming in play:** the Highway is strongest exactly where the
> Shortcut is weakest. Long engineered sweepers are where banking pays, and they are also where cuts
> are rare, because the network is not detouring around anything. **The two playstyles sort themselves
> by terrain rather than by player preference** — which is the better outcome, and is the emergent-
> over-injected principle landing on a story system.

### 06 — The Shortcut *(the pact)*

Has no memory of being built, so it **doesn't know where it goes** — only that people use it.
Uncertainty is its actual condition, not a withholding. It speaks with certainty it hasn't earned.

### Summoning [RATIFIED 2026-08-01]

**You do not have the Shortcut at the start of a run.** He arrives only once you have **completed a
cut** — entered from one road and come out on *a different road*. A **through-passage**, not a
poke down a dirt track that you reversed out of.

> **Then he visits you the following night, when you sleep in the forest.** Not mid-drive — the
> campsite (see "How spirits introduce themselves"). You took the shortcut; a night later, the thing
> that *is* the shortcut turns up at your fire.

The ledger is exactly right for this character. He *is* a cut, and he has no memory of being built —
so he cannot know he goes anywhere until **someone proves it by coming out the other side.** The
player performing a successful traversal is literally the event that tells him he connects. That is
why the ledger is completion and not entry, and it is why reversing out earns nothing.

It is also self-selecting in the way the good ledgers are: you cannot fill it without already having
found a cut, committed to it blind, and been right. He only meets people who have done the thing he
is about.

### The pact — and what it costs you

**The pact:** he **reveals which cuts still go** and **routes you through them.** The price is that
**par tightens to assume you took the cut.**

> **The price is not a fine, it is his mouth.** [RATIFIED 2026-08-01] The Shortcut is so clueless and
> so eager that **he brags about you.** He shows you the fast way and then tells the client how fast
> you can now get there. He does not understand that announcing your advantage destroys it — a spirit
> that "speaks with certainty it hasn't earned" would do exactly this, cheerfully, forever.

**So the pact buys tempo, not score.** You cover less ground and less time, which is real — fewer
minutes and less fuel per job, more jobs per day, points faster, and under SM-INV-14 that means
reaching the next region **before the country gets expensive**. What you do *not* get is a better
rank, because par already moved.

**Par itself is never modified — it is always computed over the road route** [clarified 2026-08-01].
This is the correction that makes the pact and the chip different things at all: an earlier draft had
both "recomputing par", which made them the same ability. Par is geometry-only and item-blind
(SM-INV-2); what the pact changes is **the route set the client is quoted against**, which is his
blabbing, not a change to the oracle.

**A run-shaping consequence, and it may be the best thing here.** Par has tightened to assume a cut
you *cannot take* on a fragile run (vertical shock) or a freight run (mass through ruts). So the pact
quietly makes those job types bad for you, and **your run becomes a point-to-point run.** That is
precisely the objective-reshaper SM-INV-9 asks for — *re-weight what is worth doing, don't staple a
bonus onto a normal run* — and nobody authored it.

*Tuning question, not structure:* whether par tightens on every mission or only where a cut is
genuinely usable. All-missions is more characterful (he doesn't know what you're carrying) and
harsher; usable-only is gentler and less like him.

### Versus the chip — and the redundancy, stated plainly

`items.md` §2 carries the **shortcut GPS**: him, distilled onto a dash-mounted chip. **A spirit dumb
enough to be firmware.** The split [RATIFIED 2026-08-01]:

| | reveals + routes cuts | par | acquisition |
|---|---|---|---|
| **The Shortcut** (pact) | ✅ | **tightens** — he talks | early, guaranteed |
| **Shortcut GPS** (chip) | ✅ | **unchanged** — road route | very rare, late |

**The chip is his knowledge with his mouth removed**, so it is strictly more powerful — that is the
owner's intent, not an accident. **Installing the chip ends the pact's par penalty**: you canned him,
he cannot talk anymore. That matters because it means **taking the pact early is never a trap** — the
chip redeems it rather than being wasted by it, so no player has to refuse the pact defensively to
protect a find they might never get.

> **Recorded honestly: once you hold the chip, the pact has zero upside.** Pact ⊂ chip. This is
> tolerated rather than solved, for two reasons. **Ordering** — the pact is early and guaranteed, the
> chip rare and late, so the common path is pact→chip where the pact did real work first; the dead
> case is only the run where you got lucky early. And **the scene** — the Shortcut turning up to offer
> his one trick to a player who has him *installed on the dashboard* is the best beat this character
> has. The Highway was bypassed by a road; the Shortcut got bypassed by a product, and he does not
> know it.
>
> **If it ever stops being tolerable, the principled fix is parked, not built:**
> > **An item can know. Only a spirit can act.**
>
> The chip is a **snapshot** — a dead copy of what he knew when they canned him. He is alive. So the
> pact could hold what a static dataset structurally cannot: cuts the chip's data misses, or making a
> washout passable *this once*. That generalises to the whole cast as the spirit-vs-item rule. **Do
> not build it on speculation** — spirits are deferred and the bad ordering is uncommon; revisit when
> the system comes off deferral and play shows whether it is needed.

**Resolution: none.** The Highway has a position, the truck has wear, the player has a wallet.

### Open

- **Does the Highway's streak have a payoff at all**, or is it purely a thing you can lose? A ledger
  with no boon is a warden wearing a pact's clothes — which may be right for a default state.
- **The streambed jurisdiction** (was The Verge's, per Cross-spirit dynamics) now belongs to the
  Highway. Confirm the hard split with The Confluence still holds under the new framing.
- **Terrain-fragility weighting** survived #03's retirement in principle but has no consumer now that
  there is no off-road ledger to weight. Does it come back as cut *wear* scaling?

---

## Cross-spirit dynamics

- **Jurisdictions must not overlap.** *(2026-08-01: The Verge is retired — read "The Verge" below as
  "The Highway", which inherits the dry-ground claim. The rule is unchanged and is exactly why the
  Verge could not coexist with the Shortcut: two spirits metering the same behaviour in opposite
  directions is the worst case of this.)* The Verge and The Confluence both have a claim on the
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
- First unlock is achievement-grade (~10 tired **km** — was "hours", corrected 2026-07-31); within-run re-acquisition cheaper (~5 km).
- An opposing spirit rewards being well-rested, costing daytime hours.
- A conservationist spirit objects to off-road driving; off-road stays available but angering
  the spirit carries penalties elsewhere.
- The conservationist may be an enforcer/gatekeeper rather than a playstyle modifier.
- **Ratified:** rested spirit pays in reduced wear; ~~tired spirit pays in speed~~ — **the speed half
  was retired 2026-07-29 (b)**, replaced by the nocturnal inversion (see #01 "The bargain"). The
  reduced-wear half stands.
- **Ratified:** The Night Owl's ~10 tired **km** (was "hours") must be reached **within a single run**, not
  accumulated across a career. Meeting him requires active irresponsibility, not eventual drift.
- **Ratified 2026-07-29:** the spirit is named **the Night Owl** (was: *The Passenger*), and he
  **appears in the passenger seat of your car when he speaks to you.** Unifies with the night-owl
  spirit in `IDEAS.md`.
- **Ratified 2026-07-29 (b)** — the Night Owl fleshed out (owner):
  - **Appearance:** a man's body and an owl's head. Deliberately simple; no expression system; head
    yaw is the entire motion budget.
  - **Summon:** ~10 km driven in the **tired** band, single-run — *distance only, and the deep band
    only* [corrected 2026-07-31]. He then rides in the
    passenger seat **continuously and visibly**, closing the old "visible while driving?" question.
  - **Interaction:** stop and **pull the handbrake** to talk to him; the offer takes the chat pane.
  - **A pact's accept/decline is a licensed exception to the chat pane's no-dialog-options rule** —
    scoped to pacts only, logged in DESIGN.md "Characters and dialog".
  - **The bargain is a nocturnal inversion, not a tempo boon:** no sleepiness dusk→dawn (with a small
    restfulness margin at the shoulders), rapid sleepiness in daylight.
  - **The day clock is NOT lengthened** — a phase shift, never an extension. Explicit owner ruling.
  - **The price is darkness and a hostile morning, and nothing else** — the world does not close at
    night; no nocturnal-economy system is implied.
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
- The Host's ledger becoming a single-run *streak*, for symmetry with The Night Owl's
  single-run *total*.
- The Night Owl's re-summon threshold (~5h) also being single-run.
- A world-side acknowledgement of near misses, with no counter ever shown.

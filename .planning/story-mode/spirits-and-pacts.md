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
| 4 | "a 24–48 minute day" | **24-minute days RATIFIED 2026-07-29** (~10–15 days per run). Ten tired hours is *harder* than this doc assumed. |
| 5 | *(found in this pass)* Re-summon threshold halves, ~10 h → ~5 h, once met | **Dropped — it is always ~10 h.** A permanently cheaper threshold is meta-progression: run 50 would reach the pact in half the tired-hours run 1 needed, which makes late runs comfortable and fails SM-INV-9's litmus test. **This reverts a rule the Provenance section records as owner-ratified**, deliberately. |

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
  Night Owl sits in your passenger seat whenever you get sleepy — from the very start of the run,
  every run, forever. He says nothing. He changes nothing. **He is just there.**
- **The pact itself is re-earned every run**, at the full threshold, every time (see #5).

**Why this is better than what it replaces.** The old model bought "the world knows you" with
persistent world state, which is illegal now. This buys the same feeling with *presence* — and it is
strictly more frightening. A silent figure in the seat beside you that you *know* wants something,
that you have to spend ten tired hours to make speak again, is a better horror object than a
mechanical unlock. **The dread persists; the power does not.**

> **This is the beat/labor split, used a second time.** `missions.md` splits the log-drag main
> mission into *the beat* (staged scene, once per profile, a story key) and *the labor* (chaining and
> clearing, re-driven every run). The Night Owl is the same shape: **first meeting = the beat; the
> ten tired hours and the pact = the labor.** Two independent design problems landed on one pattern —
> treat it as the project's idiom for "authored content that must survive repetition."

**Constraint on the first-meeting scene:** SM-INV-11 permits authored beats but requires them
**staged in the world**, not in an abstract cutscene layer. The cab interior *is* world-space and the
passenger seat is already the contact moment, so this is satisfied by construction — build it in the
truck, not in a separate scene graph.

## Career stats [RATIFIED 2026-07-29]

Career totals survive as an **account-level stats screen** — a player-facing journal, explicitly *not*
the in-run persona's ledger (that persona is fresh every run). Distinct waters fished, nights camped,
tired hours driven, runs ended and how.

**Shown post-run** [owner, 2026-07-29], which gives the screen a job beyond bookkeeping: it is where
the game acknowledges **what you almost did**. Records, not just totals — *"longest distance driven
tired"* is the ratified example, and it is what a player who died at hour nine of a ten-hour ledger
sees instead of a consolation prize from the world (see #01, "Should the near-miss leave a mark?").
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

**He appears in the passenger seat once you have driven ~10 hours *or* ~10 km while sleepy, within a
single run.** The counter resets to zero on death. He does not meet people who have been mildly
irresponsible over a career — he meets people who are destroying themselves right now.

**The two thresholds are the same threshold.** At 24-minute days (`run-shape.md`, RATIFIED) the clock
runs **60×**: one real minute is one in-game hour. A truck holding 60 km/h therefore covers 10 km in
exactly the ten real minutes that are ten in-game hours. The OR is not two conditions — it is one
condition measured two ways, and whichever you reach first is a statement about *how* you were being
irresponsible:

| | catches | says |
|---|---|---|
| **10 km tired** | the fast driver | you covered ground you had no business covering |
| **10 tired hours** | the slow, twisty-mountain-road driver | 10 km took you all night, and you stayed out for all of it |

**Why the distance term matters more than it looks.** A pure hours ledger is farmable *in safety* —
crawl a meadow at 5 km/h until the counter fills, at no risk. Distance can't be farmed that way:
covering ten kilometres tired means actually moving, on real road, in the dark. The hours term then
exists to stop the distance term punishing the player whose country is genuinely slow. Neither term
alone is right; the OR is.

**Nothing is ever displayed.** No counter, no meter, no "8/10" (SM-INV-3). The first evidence the
ledger exists is that the seat isn't empty.

**Reconciling this with "The visibility model."** Two different things are gated and it matters which
is which:

| | first run you ever reach it | every run after | gated by |
|---|---|---|---|
| **He is in the seat** | appears at the threshold — *this is the beat* | present whenever you are sleepy, from run start, **silent and inert** | the story key (once per profile) |
| **He speaks / offers the pact** | at the threshold | at the threshold, **re-earned in full every run** | the run-layer ledger (~10 h / ~10 km) |

So a first-time player's memory is *"I drove too long and something appeared."* A veteran's is *"he
has been sitting there since dawn and I know exactly what I have to do to make him talk."* Same
character, and the second reading is the more frightening one — which is the whole argument in "The
visibility model." **The 10 h / 10 km ledger is the price of the offer in every run; the appearance
is only ever bought once.**

**Why single-run is the stronger rule.** The counter and the death condition are the same
behavior, which makes the unlock **self-limiting** without any tuning: the only way to reach ten
hours is to survive several in-game days while repeatedly refusing to sleep, and driving tired is
the thing most likely to end the run. Most attempts die at hour seven with nothing to show for
it. That's the achievement — not a number, but a sustained refusal that happened to survive.

Worth checking against real survival rates once the doze is in. Ten is a guess, and it's a guess
about how much tired-time an in-game day actually affords, which depends on where the sleepiness
curve starts biting. **⚠ RESOLVED (was CONFLICT 4):** day length is settled at **24 minutes**
[RATIFIED 2026-07-29], ~10–15 days per run (`run-shape.md`), which pins the arithmetic — ten tired
hours is **ten real minutes of tired driving**, spread across a 10–15 day run. That is roughly *one
tired hour per in-game day*: an hour past dark, every night, for the life of the run. Demanding but
not absurd, and it is the right shape — a sustained habit, not one heroic night.

**The real dependency is the sleepiness curve, not the number.** If FEAT-47 makes sleepiness bite
late and softly, ten hours is trivial; if it bites early and hard, it's unreachable. Set the curve
first, then re-derive this number from it — do not tune them independently.

**Re-summoning.** ~5 tired hours, still single-run — **and your within-run reading is the one that
survives** [confirmed 2026-07-29].

- ❌ **Cross-run halving is DEAD** (resolution #5). The original *"once met he's meta, and the
  per-run threshold drops to ~5"* would mean run 50 reaches the pact in half the tired-hours run 1
  needed — a permanent difficulty reduction, which is the power floor SM-INV-9 forbids. **The first
  threshold is ~10 h in every run, forever.**
- ✅ **Within-run re-acquisition is LEGAL and better.** Refuse him, or lose him, and the seat empties
  — the half-threshold is what it costs to have him back *this run*. It resets with the run like
  everything else, so it prices a refusal instead of rewarding a career. Keep this.

The number ~5 survives; only which axis it sits on changed. Note this makes the pact genuinely
losable, which the escalation ladder below should account for.

**Should the near-miss leave a mark?** A player who dies at hour nine has done something
remarkable and gets nothing. No counter should be shown — but the world might. An empty
passenger seat that wasn't empty a moment ago, on the run *after* a near miss. **Sharper now that
the seat is canonically his** (see "Where he sits") — this isn't a random omen, it's *him*, early,
before you've earned him.

**RESOLVED 2026-07-29: the near-miss is acknowledged on the post-run stats screen, not in the
world.** [owner] The record is **"longest distance driven tired"** — a career stat, so a player who
died at hour nine sees their own high-water mark and knows exactly how close they came.

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

**Source data:** FEAT-47's tired ledger already integrates **tired hours and tired distance** as
run-layer counters (they are the Night Owl's summon condition). The career stat is just the max of
the distance counter across runs — no new instrumentation, and the distance term is the one that
resists farming, which makes it the honest thing to record.

*(The same-run mark — the seat changing at hour nine of the run you're in — remains legal and
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
> 2026-07-29 (b) in favor of the inversion. The Innkeeper's half of that line — *rested spirit pays
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

### 02 — The Innkeeper *(working handle)*

**Class:** Pact · **Domain:** Fatigue (safety side) · **Disposition:** Two-sided
**Contact:** Campfire / discovered camp, at waking
**Persistence:** Meta effect, **single-run streak** ledger *(proposed — see below)*

**What it wants.** For you to sleep properly, in a real place, more often than is convenient.

**Unlock.** A streak: N consecutive in-game days in one run ending in a full rest at a discovered
camp, without ever crossing into tired driving. One bad night resets it to zero. Because camping
is a location and not a menu option, this is a navigation and planning problem — the unlock cost
is paid in route planning, not in a stat.

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
> The Innkeeper is a streak you must not break.**

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
- **Ratified:** rested spirit pays in reduced wear; ~~tired spirit pays in speed~~ — **the speed half
  was retired 2026-07-29 (b)**, replaced by the nocturnal inversion (see #01 "The bargain"). The
  reduced-wear half stands.
- **Ratified:** The Night Owl's ~10 tired hours must be reached **within a single run**, not
  accumulated across a career. Meeting him requires active irresponsibility, not eventual drift.
- **Ratified 2026-07-29:** the spirit is named **the Night Owl** (was: *The Passenger*), and he
  **appears in the passenger seat of your car when he speaks to you.** Unifies with the night-owl
  spirit in `IDEAS.md`.
- **Ratified 2026-07-29 (b)** — the Night Owl fleshed out (owner):
  - **Appearance:** a man's body and an owl's head. Deliberately simple; no expression system; head
    yaw is the entire motion budget.
  - **Summon:** ~10 hours **or** ~10 km driven while sleepy, single-run. He then rides in the
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
- The Innkeeper's ledger becoming a single-run *streak*, for symmetry with The Night Owl's
  single-run *total*.
- The Night Owl's re-summon threshold (~5h) also being single-run.
- A world-side acknowledgement of near misses, with no counter ever shown.

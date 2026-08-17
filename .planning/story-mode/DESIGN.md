# Story Mode — Design Bible

**Status:** design intent, pre-implementation. This document is the source of truth for *why*
story-mode mechanics exist. Tickets say *what* to build; when an implementation question is
really an intent question ("should this show a timer?", "should this part have a stat?"),
the answer lives here. If an implementation technically satisfies a ticket but violates an
invariant below, the invariant wins — stop and flag it.

**Provenance discipline:** decisions marked **[RATIFIED]** came from the project owner.
Decisions marked **[DEFAULT]** are strong proposals built on in design conversation but never
explicitly ratified — treat them as the plan of record, but surface them for confirmation
before building anything expensive on top of one.

**How to amend this document (living-doc discipline).** This is not a frozen meeting transcript;
it grows. Match the ceremony to the layer you're touching:
- **Mechanics reference sections** (the "day and clock," "economy," "car," etc.) are the
  fleshing-out surface — edit them freely and often, no tags, no log. This is where new detail
  and revised sketches live. Most changes belong here.
- **Open questions** (bottom): when one is answered, delete it there and promote the answer up
  into the relevant mechanics section (or, rarely, into a new invariant).
- **Invariants (`SM-INV-N`)** are load-bearing walls — change them *only* through the ritual:
  edit the invariant, set/date its tag (`[RATIFIED <date>]` when the owner decided it), add a
  dated **Ratification pass** paragraph below logging what changed, and fix any downstream
  references to it. A new hard rule is a new `SM-INV-N` the same way.
- **Provenance tags are mandatory and never silently dropped.** `[RATIFIED]` = the owner
  decided it; `[DEFAULT]` = proposed in conversation, pending confirmation. A future session
  must never overwrite a `[RATIFIED]` rule without a new dated ratification pass.
- **Keep this doc "why," not "what/when."** The moment a mechanic is concrete enough to build,
  it becomes a ticket in `.planning/todos/pending/` or a line in `MILESTONES.md` — not a task
  list here. The stacked **Ratification pass** notes below are this doc's changelog; read them
  top-to-bottom for the evolution.

**Ratification pass 2026-07-16** (project owner): determinism amendment blessed (SM-INV-12);
game-mode split defined (see "Game modes" below); debug lockout in story mode ratified
(ex-open-question 8); timers amended — NOT off the table, just not the universal driver
(SM-INV-3 rewritten, ex-open-question 2); damage/wear model confirmed required and expected
to be hard (see "The economy"); character dialog channel defined — RPG-style chat pane, no
options, sequential cards (see "Characters and dialog"; SM-INV-11 scoped to the world-story).

**Ratification pass 2026-07-19** (project owner): four amendments blessed. (1) **SM-INV-6
reversed** — camping is now an explicit *button* gated by campable regions, with a worldgen-scored
quality preview (shade, flatness, water proximity); was "a place, not a button." (2) **Mid-mission
camping no longer auto-cancels the job** — it's job-dependent: short/perishable missions die
overnight, longer hauls permit next-day delivery (see "The day and the clock"). (3) **Wear rescoped
to time + engine-torque intensity, not abuse-events alone** (SM-INV-5) — hours and torque both
integrated; this is the lever that splits intense mission driving from casual point-to-point
freeroam. (4) **Par may scale with run duration** (SM-INV-2) — a global difficulty ramp keyed off
run age, still blind to the car.

**Ratification pass 2026-07-19 (b)** (project owner): **meta-progression model set — roguelike
breadth, not power floor** (Binding of Isaac / Enter the Gungeon). SM-INV-9 sharpened: replaying
deepens the game by widening the loot/mod pool and unlocking new run archetypes / objective-reshaping
spirits (e.g. a camping spirit that re-points a run toward chasing a good night's sleep instead of
wicked missions), never by raising where the player starts (SM-INV-7 first-run winnability preserved).
Guardrail: objective-reshapers must *re-weight* what's worth doing, not staple a flat bonus onto a
normal run. See "The world: regions, story states, spirits."

**Ratification pass 2026-07-20** (project owner): **story spine set — "The Roamer."** The game's
through-line is now defined: you are subtly guided by a spirit of your own past self, who once roamed
these lands on horseback (working title *The Roamer*). Five decisions blessed. (1) **New section
"The Roamer — the story spine"** added, resolving most of ex-Open-Question 1. (2) **SM-INV-11's
"never scripted events" wall relaxed deliberately** — authored, *in-world* story beats (cutscenes
staged in real world-space, dialogue-over-gameplay, doze visitations) are now permitted at threshold
moments; the *ambient* world-story stays emergent. (3) **Region unlock reframed** as the Roamer's
old trails reopening, and **gated by authored "main missions"** that drive the player to a place
(SM-INV-13 / FEAT-28 unchanged in mechanism). (4) **The Roamer hands out meta-progression unlocks and
story keys only — never resources or run-layer power** (SM-INV-8/9 preserved). (5) **A class system
is adopted** — classes unlocked by meeting spirits and other one-time achievements (camp 10×, drive
5 km sleepy, …), main story beats, and region completions; classes are *breadth, not floor* (SM-INV-9),
with their reconciliation against SM-INV-7 flagged as a new open question. The "car is your horse"
framing is recorded as the thematic keystone that retro-motivates the entire wear/breakdown economy.

**Ratification pass 2026-07-20 (b)** (project owner): **mission endpoints and POIs are arbitrary
points on road edges, never snapped to graph nodes.** Nodes are a routing artifact, not places —
real stores/homes/parking lots are no likelier at an intersection than mid-edge. New section "Where
missions and POIs live" records the rule and its three consequences (par integrates over arc-length
ranges; path search splices endpoints into the graph; arrival is a radius on a point). Also scoped:
the **beta mission generator** (a testing harness for the par economy, not final gameplay) presents
a mission on the 2D map with an **accept** button before its start countdown (*the countdown is now
Quick Job only — a POI job stages instead; amended 2026-08-02, below*), and later a
**regenerate** button that re-rolls start/end. Regenerate is explicitly a *testing* affordance —
**real story mode has no do-overs.**

**Ratification pass 2026-07-29** (project owner): **five amendments, four of which change or revert
`[RATIFIED]` rules.** Folded in from `design-amendments-2026-07-29.md` (kept as the provenance record
and the fuller argument for each). (1) **Worldgen is decoupled from meta-progression** — the
2026-07-16 widening is *reverted*: `metaState` is no longer a worldgen input. Worldgen is
`(worldSeed, coords)`; run-layer world state is `(worldSeed, runState, coords)` where `runState` is
run age + run progress and resets on death (SM-INV-12 rewritten). A new game rolls a random seed;
a custom seed may be entered, and because worldgen is meta-free a seed means the same world for
every player at every stage of progress. (2) **XP is run-layer** — it does not survive death; it is a
within-run head start against the rising cost curve, not meta-progression (new **SM-INV-14**;
SM-INV-8 narrowed accordingly). (3) **Meta-progression is unlocked starting vehicles — a garage, not
a cast**; the roster-of-characters-with-perks model is replaced and the *spirit system is deferred*
(not deleted). (4) **No in-run vehicle purchase** — parts yes, vehicles no; the game is about
maintaining one rig (new **SM-INV-15**). (5) **Run shape fixed** — ~10 regions (*revised to **6
regions, growing with depth**, 2026-08-01/08-02*), 4–6 hours to beat (*now **6 hours***),
24-minute days (~10–15 days per run — *corrected to 7–8 on 2026-08-01, then to **20** on 2026-08-02
once the clock-pause rule fixed what a day actually costs; see "Run shape and saving"*), and
**suspend-and-resume saving** (one slot, written on quit,
*deleted on load*, deleted on death). Downstream: Open Q3 is **resolved** (region unlock is
run-layer); SM-INV-11 is re-keyed to run progress; SM-INV-2's run-duration par clause is flagged for
retirement (see the note there — recommended, not yet ratified).

**Ratification pass 2026-07-31** (project owner): **sleepiness has two bands, not one.** *Sleepy* is
the warning band (yawns, "I am N km from anywhere I'd want to wake up" — the read SM-INV-6's last leg
of the day is built on); **tired** is the danger band, where the doze actually begins. The distinction
is now load-bearing: the Night Owl's ledger counts **only the tired band**, so he can never be reached
by the careful player who passes through *sleepy* on the way to camp every single night. **His ledger
is also distance-only — ~10 km driven tired, single run — the hours term is dropped**, because hours
can be farmed in safety (park, or crawl at 5 km/h) and kilometres cannot. FEAT-47 owns defining the two
bands; the threshold must be re-derived from wherever it puts the boundary. See `spirits-and-pacts.md`
#01 "Summoning."

**Ratification pass 2026-07-29 (b)** (project owner): **The Night Owl fleshed out**, in
`spirits-and-pacts.md` #01 — the spirit *system* stays deferred, but the character is now specified.
One amendment reaches this document: **the chat pane's "no dialog options" rule gains a single narrow
exception — a pact's accept/decline** (see "Characters and dialog"). The rest is companion-doc
detail and is recorded there: a man's body and an owl's head; summoned by **~10 km driven tired** in
one run; talked to by stopping and **pulling the handbrake**; and the bargain
rewritten from a tempo boon (retired — it was a number on the truck, which SM-INV-10 forbids) to a
**nocturnal inversion** — alert dusk-to-dawn, brutally sleepy in daylight, **with the day clock
itself untouched**. Priced in darkness and a hostile morning only; the world does **not** close at
night.

**Ratification pass 2026-08-16** (project owner): **THE PAR RE-ANCHOR — par means "the slowest you
can drive without failing".** Par moves from the middle of the B band to the **C/D boundary**,
reversing the "B contains par" ruling of 2026-08-01 (item 3 below) and the 2026-08-14 confirmation
of it for the paper route; the reversal is game-wide. Six parts: (1) **par the NUMBER grows** —
`par = referenceTime × PAR_SLACK` (1.15), splitting the physics from the judgment so SM-INV-2's
"par is geometric" survives intact; `PAR_REF.mu` 0.90 → 0.80 alongside it. (2) **Thresholds re-cut**
to S 0.72 · A 0.76 · B 0.80 · **C 1.00 pinned on every day** — the ramp squeezes the good letters and
never the pass line. (3) **Break-even moves to the B/C boundary**; par pays half a day's maintenance,
so a bare pass loses money and only B and better funds upgrades (`k` 0.30 → 0.24, re-derived to hold
a break-even day's dollar value fixed). (4) **Par is deleted from the player-facing UI** — a letter
and a number, nothing else. (5) **The paper route's timer becomes par exactly**, so finishing at par
settles no time money. (6) **SM-INV-14's 1/½/0 rule is unchanged in wording but harder in effect** —
flagged at the invariant. *Prompted by a measured bug: the 2026-08-01 mu recalibration had silently
made rank S unreachable — 1 of 20 recorded drives on day 1, 0 of 20 by day 20 — which nobody decided.*

**Ratification pass 2026-08-01** (project owner): **the mission performance model settled, plus five
structural rulings.** (1) **SM-INV-2's run-duration par clause is RETIRED** — there is one par and it
is geometric. The difficulty ramp moves the **rank thresholds**, never par; `parEffective` is deleted
and `parGeometric` becomes simply *par*. (2) **Payout is a continuous linear function of the par
ratio** (SM-INV-4 rewritten) — peanuts at +20% over, one day's maintenance at par, generous at −20%
under. A day driven entirely at par is **break-even**, which turns Open Q4's constraint into a
formula. (3) **Rank (D/C/B/A/S) is the player-facing surface for par** — display only, result-card
only, never live (SM-INV-3 amended). (4) **XP is replaced by mission points** (SM-INV-14 rewritten):
region access is bought with a *count of well-driven missions*, not a scaling quantity — a well-driven
mission is worth 1, a scraped one 0.5, a bad one 0. (5) **Run shape corrected to 6 regions** — ten was
revised to **six** so the player has time to actually learn a place rather than tour it; a region is a
*progression chapter* and the play space is cumulative, so later missions may span several.
*(Days-per-run went 10–15 → 7–8 here, then to **20** on 2026-08-02; the point schedule went
`5·4·4·3·3·2` = 21 → **`6·6·6·4·3·2` = 27** over a day budget of `4·4·4·3·3·2`, and "fewer and longer
chapters, **not bigger regions**" was reversed — regions now **grow with depth on a sparser grid**.
See "Run shape and saving".)* Also ratified: **the Highway is the default state of the game, not a pact**; **cuts, spurs,
camping areas, logging sites and POIs all come from one off-network generator** (see "The off-network
layer"); and **durability-over-sportiness is a sanctioned parts axis** (`items.md`).

**Ratification pass 2026-08-02 — the route domain is rebuilt.** The Highway and the Shortcut were
mutually exclusive (one cut flattened the roads for the run); they are now **co-holdable
relationships, not pacts** — there is no accept/decline anywhere in the domain. **Cuts no longer
offend the Highway**; the offense is an **intentional non-shortcut skip** (leaving the network and
rejoining having saved >~200 m of road distance by a path that wasn't a cut), and the penalty is
**graded by the distance skipped**, cumulative, with flat as a floor it approaches rather than
reaches. He is the Shortcut's **father** — once a shortcut himself, he wants cuts reinforced and hates
bypasses because *a bypass makes a badly-defined shortcut*. His boon gains a second half:
**maintenance**, across three hazard classes — **rockslides** (FEAT-26's event rate keyed to favour;
rigid-body debris, no geometry), **potholes** (`roadQuality` / `potholeAmplitude`, a live dial that
**already ships** — `src/road-quality.js`, D-03/SURF-06), and **washouts** (a stream crossing's
causeway scoured out — the only carved one, and it should ride the existing crossing set because
drainage is his own motif). **None of them may ever block the road**: a road wants traffic, and a
blockage would force a detour that reads as a skip, opening a death spiral. The Shortcut's boon is **intel then clearance** — cuts on the
map, then a visible marker floating over the ones that go, then pass-2 hazards clearing — and his
anger is **being ignored**: esteem decays when you stop taking cuts, and he says it reminds him of his
dad. The **shortcut GPS is a display layer** over that relationship, not a stronger version of it.
Full model: `spirits-and-pacts.md` #05/#06.

**Ratification pass 2026-08-02 (b) — a POI job stages; it does not count down.** Amends the
2026-07-20 (b) scoping note above, which gave the beta generator one start ritual for every job.
There are now **two, and which one you get is decided by whether the job moved you**:

- **Quick Job — teleport, then 3-2-1, handbrake held.** Unchanged. It seats you at a start pin
  already facing the right way, so a count is exactly the right ritual and the handbrake hold is
  honest: there is nothing to decide.
- **A POI job — stage, then cross a threshold.** Accepting does not move you and does not hold you.
  The truck is **free and untimed** on the pad for as long as you like, and the clock starts the
  instant you **cross out of a 25 m radius centred on the marker**. The threshold is one-way —
  driving back inside cannot un-start a run.

The reason is that a POI job starts where *you* parked, which means it can start with the truck
facing the wrong way — and the counted launch made that a penalty the player could only dodge by
declining, turning around, and re-opening the same offer (the single-offer cache guarantees it is
the same job). That is ceremony pretending to be a choice: it costs a menu round-trip and changes
nothing. Untimed staging deletes the dodge by deleting the thing worth dodging.

**The circle is the interface, and its colour is the state.** A marker wears a translucent
**orange** ring at its interaction radius (10 m — "park inside this and you'll be offered a job");
accepting **swaps** that ring for a **green** one at the start threshold ("cross this and you're
running"), and leaving swaps it back. One circle in front of the player at a time. This is a
waypoint toward the marker becoming a **highlighted parking spot you pull into** rather than a
radius you enter — the placeholder cube and the ring both go when that lands.

**This does not touch SM-INV-3.** That invariant forbids rendering *par* as a countdown; the 3-2-1
was a START count, not a par clock. Removing it moves away from rendered timers, not toward them.
Implementation: `src/mission.js` (`'staging'`, `START_ZONE_R`), `HANDOFF-poi-mission-start.md`.

**Companion design notes** (downstream of this bible; where they disagree with it, *it* wins):
[missions.md](missions.md) (mission taxonomy, XP/payout scoring, the log-drag main mission),
[run-shape.md](run-shape.md) (run length, day length, saving), [opening.md](opening.md) (the firing,
the uncle), [items.md](items.md) (the items catalog — consumables, tools, parts, cargo, catch; an
asset burn-down surface), [spirits-and-pacts.md](spirits-and-pacts.md) (the spirit cast —
*deferred; carries four flagged conflicts with rules ratified since, see its header*),
[IDEAS.md](IDEAS.md) (the scratchpad), and
[design-amendments-2026-07-29.md](design-amendments-2026-07-29.md) (provenance for the pass above).

---

## The premise [RATIFIED]

RangerSim becomes a **roguelike**. A **run** is as many in-game days as you survive. You die
by **crashing** or **breaking down** — nothing else. A day is a **24-minute sky cycle** — **16 waking
hours plus 8 hours' sleep**, and the clock **pauses in shops, service stations and camp** — so it
costs **~18 real minutes** to live through (see "Run shape and saving"); a run is **20 days**. Every run
starts in a jalopy with parts randomized from a pool of crap. Missions are hand-authored
types with procedural dressing (mom needs milk; someone's chasing you). The roads are fun
and humans are silly, so everyone drives too fast; the mission system rewards that rather
than fighting it.

Runs end. **The world doesn't reset.**

## Game modes [RATIFIED 2026-07-16]

Story mode does not replace what exists — it **forks** it. A **main menu** selects between:

- **Free Roam** — the game as built to date: infinite streaming world, full debug tooling,
  every slider live. The infinite-world identity lives here, undiminished.
- **Story Mode** — a fork of free roam limited to 1–several regions at first, more unlocking
  with run progression (FEAT-28). Meta progression between runs modifies what elements come
  out in single runs. **Debug tooling is locked out**; sliders are fixed. World-parameter
  manipulation for story purposes (you wake up one morning and all the trees are gone) is
  driven by hard tooling / baked parameter states, not realtime slider access. Regional
  difficulty likewise comes from baked per-region parameters.
- **One-off scenarios** — self-contained set pieces (Dodge the Rocks, Escape the Police,
  etc.), each reusing the same engine with a bespoke frame.

A game-mode seam already exists in code: the teleport feature (merged 2026-07-16) is
mode-gated via `window.__setGameMode` with story-mode restrictions in mind — extend that
seam rather than inventing a second one.

## The organizing problem

> *If the only way to die is crashing, why not drive slow forever?*

Every economy and pressure mechanic below exists to answer this. The answer must make the
player **choose** to send it — the *default* pressure cannot be a countdown, because
shoved hubris isn't hubris, and a procedural world makes universal deadlines hard to tune
fairly. (Hard timers do exist as one authored mission flavor — see SM-INV-3 — they're just
not the answer to *this* problem.) Three moves answer it together:

1. **Par comes from the router, not a designer.** The arc primitives already carry curvature
   and grade; run a fixed-reference point mass on a friction circle over them and you get a
   physics-honest reference time for any route. Free, no per-mission tuning, scales with
   regional difficulty automatically, and inherits the road's character *by construction* —
   the same cost model that made the road prices driving it.
2. **Bare completion pays nothing.** Payout is margin against par. Deliver at 0.6× par and
   you earn a pittance — and your brake pads wore out anyway. Safe driving isn't punished;
   it just doesn't pay.
3. **Wear runs on time and intensity, not distance.** Two hours at 3000 rpm is *not* the same
   two hours at idle-and-coast — both hours and engine torque are tracked and integrated, so
   wear compounds with how hard you drive as well as how long. This is what splits the game
   into two driving modes: intense mission driving (par is a friction-circle deadline, wear be
   damned) and casual point-to-point travel — picking your next mission, exploring, drifting
   into camp — where easing off the throttle is how you protect the truck. Crawling still costs
   *more* per mile than a fast, clean run, but a gentle freeroam leg between missions is cheap.

Together: the safe strategy is a slow bleed. The player does the arithmetic around day three
and starts driving at the limit **by choice** — hard during missions, easy in between. The game
never asked.

## The Roamer — the story spine [RATIFIED 2026-07-20]

Story mode has a spine, and it fills the biggest hole this doc had (most of ex-Open-Question 1).
Working title: **The Roamer**.

**The premise.** Long ago, a version of *you* roamed these same lands — on horseback, before there
were roads. That past self persists as a **spirit**, and reaches forward through the world to guide
the present-day you: where to look, where the good ground is, where the old ways still run. Their
help is real. Their motives are not settled (see below) — the guide may need something from you as
much as you need them.

**The reveal is gradual.** Life starts completely normal. The supernatural unfolds in small ways you
begin to notice, then in larger ones — the escalation *is* the Roamer getting closer to reaching you.
This is exactly the parameter-state escalation SM-INV-11 already describes (leaning trees → dark at
noon → people missing); the Roamer is the *why* beneath it. You do **not** meet your past self
directly in the early phases — for the first stretch the game withholds them entirely, and the
weirdness is ambient before it is ever a face.

**The car is your horse — the thematic keystone.** The Roamer rode these lands; you drive them. The
whole wear / breakdown / mechanical-sympathy economy (SM-INV-5, the damage model, breakdown as the
second death) is retroactively *motivated* by this: breakdown is the horse dying under you, and
learning to **listen** to the truck — the rattle that worsens, the temp needle near its limit, the
pull of an uneven tire set — is the same literacy the Roamer had for their mount. Anything that grows
the player's mechanical sympathy for the vehicle serves the story directly. Literacy-as-what-survives
(SM-INV-8) is the mechanical face of *you are becoming the Roamer*.

**Delivery channels (post-2026-07-20).** The through-line surfaces three ways, now that SM-INV-11's
wall is deliberately relaxed:

- **Parameter states** — the ambient world-story, still emergent and unauthored (SM-INV-11's core):
  the leaning trees, the enormous moon, dark at noon, people missing.
- **The doze** — the beloved channel: *something comes to you when you doze off*. The ~400 ms
  eyes-closed frames are where the Roamer visits. Pushing sleep is still how you learn the story; the
  transgression *is* the looking.
- **Authored in-world beats** — cutscenes, dialogue-over-gameplay, and structured story moments are
  now permitted (SM-INV-11 amended). The surviving constraint: they are **staged in the world**, not
  a separate cutscene layer — carve out empty world-space for a structured camera/subject scene. The
  Roamer need not seize driving control ("we don't have to have the Roamer drive"); a beat can play
  over gameplay or in a staged clearing.

*Canonical setup — the dark-at-8am morning.* Your alarm goes off at 8am but you wake to full dark.
Nothing to do but take the car out; a short drive in, the world itself delivers the encounter as a
staged, in-world beat rather than a bolted-on cutscene. This is the template for a threshold beat set
up diegetically: the world is *wrong* first, and the meeting follows.

**What the Roamer hands out — knowledge and unlocks, never resources.** The Roamer gives
**meta-progression "items" and story unlocks only** — breadth in the deck (SM-INV-9): new run
archetypes, spirits, classes, and story keys that advance the through-line, plus *where to look*. They
**never** hand out currency, parts, or run-layer power (SM-INV-8/9). "Where to look" is literally
literacy transfer (SM-INV-8) — the Roamer is its diegetic embodiment — and is perfectly legal; "here
is a better engine" is forbidden.

**Reciprocity — reopening the old trails.** The Roamer needs something back: the **region unlocks are
the old trails they used to ride**, closed now, and reopening them is both the progression primitive
(FEAT-28 trail-closed barriers, SM-INV-13) and the thing the Roamer wants of you. **Region expansion
is gated by "main missions"** — authored beats that drive the player to a place — so the story pulls
you outward through the world rather than an abstract XP wall doing it. Motivation and mechanic are
the same object.

**Motives — deliberately unsettled [OPEN].** Whether the Roamer is a purely benevolent, Nintendo-style
spirit guide (BoTW's Zelda) or carries self-interested, not-fully-noble motives that add tension is
**not decided** (see Open Questions). SM-INV-9 already blesses ambiguity — "ambiguous benefit is still
benefit" — so a guide whose help might not *be* help is supported by the architecture, not fighting it.
This choice colors tone, the doze frames, and whether reopening the trails is a gift or a mistake; it
is flagged, not resolved. The knife the with-teeth version buys: if the horse-that-is-your-car can be
*ridden to death* by a guide who needs you more than they love you, the wear economy gains stakes no
timer could give it.

## Invariants

These are the load-bearing walls. Cite them in tickets and code comments as `SM-INV-N`.

- **SM-INV-1 — Death is crash or breakdown only.** No other fail states. Dozing is not a
  fail state; it hands a mountain road to a driver with their eyes shut and lets the
  physics decide. [RATIFIED]
- **SM-INV-2 — Par never scales with the car.** Fixed reference friction, road geometry
  only. If a better build raises par, every upgrade quietly hands back its own reward and
  the flywheel stalls. A better car raises *payout*, not lowers *risk* — the player drives
  at their own limit regardless of what's underneath, which is where crashes live. Godlike
  runs stay lethal. **There is exactly ONE par**, derived from route geometry. It scales with nothing
  — not the car, not run age. [DEFAULT — load-bearing]

  > **Run-duration scaling clause RETIRED [RATIFIED 2026-07-29].** *Struck: "Par MAY scale with run
  > duration — it tightens the longer a run survives, a global difficulty ramp keyed off run age."*
  > (That clause was itself RATIFIED 2026-07-19; this supersedes it.) **In-run cost escalation
  > (Q9A) is the difficulty ramp**, with XP as position against that curve (SM-INV-14), which made
  > the par ramp redundant — Q9 anticipated exactly this. Retiring it **collapses `parGeometric` and
  > `parEffective` into a single par** and deletes a class of bookkeeping. Par is now a pure
  > function of road geometry and nothing else, which is a stronger and more explicable rule than
  > the one it replaces.
  >
  > *Boundary for later (owner flagged 2026-07-29 that a spirit might modify cost escalation):*
  > re-**shaping** the curve is a legal rule-change (steeper early / flatter late — a trade), but
  > **lowering** it is a power floor and SM-INV-9 forbids it. Whatever touches the escalation curve
  > must cost something, because that curve is now the only difficulty ramp in the game.
  >
  > **Amendment [RATIFIED 2026-08-01] — the difficulty ramp on the *performance* side lives in the
  > rank thresholds, never in par.** The owner wanted what the retired clause was reaching for: a
  > standard that tightens as a run matures, so a maturing run must either drive better or keep a
  > better-maintained truck. That is now expressed as **the ratio bands moving, not the par moving** —
  > S needs ratio ≤ 0.80 on day 1 and something tighter deep into the run *(the shipped ramp saturates
  > on day 8 — `economy.js rankTightenDays`; at 20 days that must stretch, see `run-shape.md` "Code
  > deltas")*. Identical felt effect; par stays a
  > pure physical quantity (a duration derived from a road), there is no second par in the code, and
  > `parGeometric` is simply **par**. This is *not* a reinstatement of the retired clause: the clause
  > changed the number the economy multiplies against, this changes only where the letters fall.

  > **Why this does not double-count with Q9A.** Cost escalation raises what a day *costs* and the
  > day tier raises what a mission *pays* (see "The economy"), so the two run in opposite directions
  > and the threshold ramp is the brake on the rising reward — not a second squeeze. An earlier
  > analysis in this project argued the par ramp was redundant *with* Q9A; that argument assumed the
  > ramp reduced income as the run aged. Under the 2026-08-01 model income *rises* with run age, and
  > the tightening thresholds are what stop that from being free.
- **SM-INV-3 — Par is never rendered as a countdown; timers are a flavor, not the driver.**
  [RATIFIED as amended 2026-07-16] The par economy is a payout curve, felt as *how hard am I
  willing to push*, never *3:41 remaining* — putting par on the HUD makes the whole game a
  time trial. BUT hard timers are not banned: **some mission types** carry an explicit,
  visible, diegetic timer (running out reduces or eliminates the reward). The constraint is
  that timers must never become the main driver of all missions — they're one authored
  flavor among the mission types, and the default mission has no clock.

  > **Amendment [RATIFIED 2026-08-01] — rank is par's player-facing surface.** The player never sees
  > par and never needs to: they see **a letter and a number** — how they did, and what they earned.
  > Ranks are **D · C · B · A · S** (`gradeRun()` in `src/par.js` already computes them), coloured
  > **red · orange · yellow · white · blue**. ~~**B is the band that contains par**, deliberately — the
  > rank that just meets the cost curve should be a B~~ *(superseded 2026-08-16 — see below)*, because
  > getting an A has to feel like
  > something. Two hard constraints: the rank is **result-card only, never live** (a live rank is a
  > countdown by proxy and re-breaks this invariant), and the rank is **display only** — payout is
  > continuous (SM-INV-4), so the letters are a legible skin over a smooth curve, not bins.
  >
  > This *strengthens* the invariant rather than straining it. It also licenses the one legal way to
  > put a target in front of the player before a drive: a mission-giver offering **"a little extra if
  > you finish with an A"** states a standard with no clock attached — see "The economy".

  > **Amendment [RATIFIED 2026-08-16] — PAR IS THE C/D BOUNDARY. It is the slowest drive that is
  > still a pass, not the middle of the scale.** This **reverses** the 2026-08-01 "B contains par"
  > ruling above, and with it the 2026-08-14 owner confirmation that the paper route keeps par-in-B
  > (`missions.md`). The reversal is **game-wide** — one par convention, every mission type.
  >
  > *Why.* "Par" on a scorecard means the standard you must meet, and the owner wanted the word to
  > mean that: **the slowest you can drive without failing.** Under the old arrangement par was the
  > *expected* drive, which made the bottom half of the scale unreachable-by-construction and left
  > the word doing something no player would guess.
  >
  > *What actually moved.* Par the NUMBER grew, rather than the letters merely being relabelled —
  > `par = referenceTime × PAR_SLACK` (1.15), a split of the physics from the judgment. `par.js`
  > holds the reference physics; `PAR_SLACK` holds "how much slower than a committed drive is still
  > a pass". SM-INV-2 is untouched: par still scales with route geometry and nothing a run can
  > change. Thresholds became **S 0.72 · A 0.76 · B 0.80 · C 1.00**, and **C is pinned at 1.0 on
  > every day of the run** — the day ramp squeezes S/A/B only, because a C that drifted below 1.0
  > would make a drive exactly at par start failing and un-say the whole amendment.
  >
  > *The bug that forced it.* The 2026-08-01 recalibration to mu 0.90 quietly killed S: of the 20
  > recorded drives in `runs/`, **one** made S on day 1 and **none** could on day 20 (the ramp
  > tightened S to 0.74; the best drive ever recorded is 0.778). Nobody decided that — it was
  > collateral from a mu change. Gated now: `test/economy.mjs` pins day-20 S at or above the best
  > recorded human drive, so the letter cannot go extinct silently a second time.
  >
  > *And par is now invisible.* The result card shows a letter and a number — how you did and what
  > you earned. It no longer prints par or "±0:12 vs par". Par-as-the-failing-line is exactly the
  > thing that would invite a stopwatch relationship with the road if you could see it.
- **SM-INV-4 — Payout is continuous margin against par; bare completion pays ~nothing.**
  [RATIFIED 2026-08-01 — was DEFAULT] Payout is a **continuous linear function of the par ratio**,
  not a set of bins. ~~Three anchors fix the line: **+20% over par pays ~nothing · par pays one day's
  maintenance · −20% under par pays generously (2×)**.~~ *(anchors re-set 2026-08-16 — see below)*

  > ~~**The anchor, stated exactly: a day driven entirely at par is break-even.**~~ Below par you profit,
  > above it you bleed. That turns Open Q4's constraint
  > ("negative on a lazy day, positive on a brave one") from a tuning goal into an identity, and it
  > collapses the whole payout economy to **one tunable number** — maintenance cost per second of
  > par-driving. Safe driving still isn't punished; it just doesn't pay.
  >
  > **Payout floors at zero.** A disastrous run earns nothing; it never charges you. The loss is the
  > day and the wear, which is a real enough loss that it needs no arithmetic on top.

  > **Amendment [RATIFIED 2026-08-16] — break-even moves to the B/C boundary; PAR LOSES MONEY.**
  > The shape is unchanged (continuous, linear in the ratio, floored at zero); the three anchors
  > moved with par's new meaning:
  >
  > | ratio | pays | meaning |
  > |---|---|---|
  > | **0.80** (B/C boundary) | **one day's maintenance** | break-even — you keep going |
  > | **1.00** (par, C/D) | **half a day's maintenance** | a bare pass does not cover the day |
  > | **1.20** | nothing | well past par, margin money is gone |
  >
  > *The owner's framing, verbatim in intent:* B/C **meets the growing cost of maintenance so the
  > player can keep going. It does not pay for upgrades. You need to be hitting B's for that.**
  > So the ladder is: below par you are losing ground, at par you are surviving badly, at B/C you
  > are level, and at B and better you are actually building something.
  >
  > *`k` re-derived, value preserved.* `k_new = k_old × breakEven = 0.30 × 0.80 = 0.24`, then a flat ×0.1 currency rescale on 2026-08-17 → **k = 0.024** (scale only; every ratio, letter and relative price is unchanged). This holds
  > the dollar value of a break-even day fixed across the re-anchor, so the ~$130-190 region-1 day
  > and the repair bills authored against it stay valid even though par grew and mu dropped.
  >
  > *The payout line does NOT follow the day ramp*, even though the rank thresholds do — money must
  > never be a function of the letter (rank is display only). Past day 1 the tightening B/C boundary
  > drifts slightly off the fixed break-even point, and the rising `dayTier` is what compensates.
- **SM-INV-5 — Wear accrues on time + intensity, never distance.** Hours and engine torque
  are both integrated; wear compounds with how hard you drive, not just how long. This is
  the lever that separates intense mission driving from casual point-to-point freeroam
  between missions — easing off the throttle on the way to the next job is how the player
  protects the truck. [RATIFIED 2026-07-19]
- **SM-INV-6 — Camping is a button, but the place decides the quality.** You commit to
  sleep with an explicit action, and the game previews the campsite's quality where you
  stand — scored from shade, flatness, proximity to streams and lakes, and other worldgen
  factors. Some regions are campable and some are not, so the button is gated by where you
  are, not always available. The night you get is the place you chose: a good spot means a
  good night; a bad one (or the last campable ground far behind you) means waking half-tired.
  The first yawn still means "I am N km from anywhere I'd want to wake up" — the last leg of
  the day is finding good ground before you camp, not the press itself. [RATIFIED 2026-07-19]
- **SM-INV-7 — Every run starts in a randomized jalopy, and every run is technically
  capable of beating the game.** No meta power curve that makes early runs uncompletable
  or late runs comfortable. The randomized bad car forces the player to re-read the truck
  at minute one and makes a mid-run part find land as an *event*. [RATIFIED]
- **SM-INV-8 — What survives death is literacy and the garage.** Not parts, not money, not
  the car — **and, as of 2026-07-29, not the world and not XP.** What persists is **player
  literacy** (reading the truck, reading the weirdness) and **the garage** (unlocked starting
  vehicles and story keys). A returning player isn't stronger, they're *fluent*.
  [RATIFIED premise; scope narrowed 2026-07-29]
  > Struck 2026-07-29: *"World state (permanent unlocks, generator parameter states) persists."*
  > Permanent unlocks persist as **garage entries, not as terrain.**

  **Consequence:** the rare campsite is in every world from run 1, reachable by anyone. Finding it
  buys **knowing where it is**. Under the old model the world changed for you; now only you changed.
  **Cost recorded honestly:** the line *"the player accumulated the weirdness voluntarily by going
  too far; there is no button to put it back"* is no longer literally true of the world — the
  accumulation moves into the player's reading of it. Something real was given up here.
- **SM-INV-9 — Spirits/permanent unlocks change rules, never balance sheets.** The moment
  an unlock hands out resources, SM-INV-7 softens into "late runs are comfortable" and the
  jalopy pool stops mattering. The fire keeps burning while you sleep; you dream something;
  it moves your truck. Ambiguous benefit is still benefit. This is the most likely invariant
  to erode quietly, one reasonable-seeming buff at a time — watch it. **The sanctioned axis of
  meta-progression is *breadth*, not *floor*** (Binding of Isaac / Enter the Gungeon model):
  replaying the game deepens it by widening what a run can *be* — more mods in the loot pool,
  more spirits, more unlockable run archetypes — never by raising where the player *starts*.
  A first run must stay technically winnable (SM-INV-7); a hundredth run is not stronger, it's
  *deeper* — more variety in the deck, more shapes a run can take. A spirit that reshapes the
  run's objective (e.g. "good camping matters more than wicked missions this run") is a legal
  rule-change; a spirit that just pays out more currency for the same actions is a balance-sheet
  handout and is forbidden. Litmus test for any unlock: *does it raise the floor / make late
  runs comfortable?* If yes, it's illegal regardless of how it's dressed. [DEFAULT — load-bearing;
  breadth-not-floor / roguelike-unlock model RATIFIED 2026-07-19]
- **SM-INV-10 — Parts are described, never scored.** No number on a part, ever. An LSD
  doesn't grant +5 handling; it changes what the truck does when you get greedy mid-corner.
  Power mods on an open-diff RWD truck are a *worse car* for a driver without the literacy —
  that's a cursed item nobody had to author, and it only works because nothing is hidden.
  [DEFAULT]
- **SM-INV-11 — The *ambient* world-story is emergent (parameter states + the doze); authored
  story beats are permitted, but stay in-world.** *Re-keyed 2026-07-29: parameter states are driven
  by **run progress** (`runState`), not `metaState` — the mechanism is unchanged, the input moved
  when worldgen was decoupled from meta-progression (SM-INV-12). Escalation now happens **within a
  run** and resets with it; the ambient/authored split below is untouched.* The leaning trees, the
  enormous moon, dark at
  noon, people missing — parameter states, several already reachable with what's in the game. The
  doze (eyes closed for ~400 ms) is a moment the game controls what the player sees — a frame
  of *something*. Pushing sleep is how you learn the story; the transgression *is* the
  looking. [RATIFIED premise / DEFAULT mechanism; wall relaxed 2026-07-20] *Scope (2026-07-16): this
  governs the surreal world-story — atmosphere, the through-line, what is happening TO the world. It
  does NOT forbid characters speaking to the player; that rides a separate channel, the **chat
  pane** (see "Characters and dialog"). The world doesn't stop to narrate itself moment-to-moment,
  but a mission-giver can tell you the milk's at the store.* **Relaxation (2026-07-20, RATIFIED):
  the old "never scripted events" absolute is lifted. The Roamer through-line (see "The Roamer") may
  surface through authored beats — cutscenes, dialogue-over-gameplay, doze visitations — at deliberate
  threshold moments (e.g. the region-gating main missions). Three constraints survive: (1) authored
  beats are *staged in the world*, not an abstract cutscene layer — carve out real world-space for a
  structured camera/subject scene; the beat need not seize driving control; (2) the *ambient*
  world-story — the surreal texture and the through-line's atmosphere — stays emergent (parameter
  states + doze); the world still doesn't narrate itself moment-to-moment; (3) the doze remains the
  everyday channel. Authored beats are the exception at gates, not the texture.*
- **SM-INV-12 — Determinism discipline: worldgen is meta-free.**
  **[RATIFIED 2026-07-29, superseding the 2026-07-16 widening]** Three layers, not two:
  - **Worldgen is a pure function of `(worldSeed, coords)`.** Terrain, router output, POI
    placement and the road network are identical for every player on a given seed, forever,
    regardless of unlocks. **No meta-progression input reaches worldgen.**
  - **Run-layer world state is a pure function of `(worldSeed, runState, coords)`**, where
    `runState` carries **run age and run progress** only. This is where escalation lives —
    parameter states, consumed POIs, story-tier weirdness. It **resets completely on run reset**.
    Same discipline as before: `runState` advances at day/sleep/mission boundaries, **never
    mid-stream, never per-frame.**
  - **Run-layer randomness stays free**: mission dressing, jalopy rolls, ambush timing.

  `metaState` still exists and is still versioned. It holds **unlocked starting vehicles and story
  keys** (see "The garage") and **never touches generation**.

  **Seed policy [RATIFIED 2026-07-29]:** a new game rolls a **random seed** by default; the player
  may **enter a custom seed** to replay a specific world. Because worldgen is meta-free, a given seed
  generates identically for every player at every stage of progress — which is what makes seed
  sharing and daily seeds meaningful at all.

  Headless gates pin a default `runState` exactly as they previously pinned `metaState`;
  live-reactive systems (doze, ambush timing) stay flag-gated off (FEAT-26 precedent). Determinism
  is *stronger* under this rule, not weaker.
- **SM-INV-13 — Progression gates are diegetic.** Region locks are trail-closed barriers a
  ranger reopens (FEAT-28), not menu walls. XP-gating harder country needs an in-world
  frame or it fights the world premise. [DEFAULT]
- **SM-INV-14 — Region access is bought with mission *points*, not XP, and they are run-layer.**
  [RATIFIED 2026-08-01, replacing the XP formulation of 2026-07-29] Progress toward the next region
  is a **count of well-driven missions**, not an accumulating quantity:

  > **1 point** for a mission finished at **rank B or better** · **½ point** at **C** · **0** at D.

  Each region needs N points (see "Run shape and saving" for the schedule). Points reset with the run
  along with the map, the truck and the money — persistent progress would let run 50 clear region 1's
  gate instantly, which is a power floor SM-INV-9's litmus test forbids.

  > ⚠ **Unchanged in wording, CHANGED in economics [2026-08-16].** The 1/½/0 rule survives the par
  > re-anchor untouched — but what it costs the player did not. Under the old anchoring a drive at
  > par was a **B**, worth a **full point**. Par is now the C/D boundary, so the same drive is a
  > **C**, worth **half**. Progress toward the next region got materially harder, and *nothing in
  > this invariant's text says so* — which is exactly why it is flagged here.
  >
  > The concrete casualty is the **27-point / 20-day budget** in `run-shape.md`, which was counted
  > against the old mapping. Against the re-cut letters the recorded corpus grades S 2 · A 9 · B 6 ·
  > C 0 · D 3 on day 1 — i.e. **17 of 20 drives still earn a full point**, so the budget is probably
  > close to intact for a competent player and materially harsher for a weak one. That is a
  > modelling estimate from 20 drives, not a verified recount: **re-count the schedule before
  > treating the 27 as ratified.** [owner decision: keep 1/½/0 as-is]

  > **Why a count and not XP.** An XP quantity that scales per day only forces the *requirement* to
  > scale with it; the treadmill nets to nothing and you have traded a legible number for a hidden
  > one. A count is legible, is impossible to inflate, and makes the real design question the one
  > that actually matters — **missions per day per region** — instead of curve-fitting.
  >
  > **The half-point exists so weak players don't strand.** A run of C-grade drives still advances,
  > just at half speed. That preserves SM-INV-7's "every run is technically capable of beating the
  > game" without making a C feel like an A.
  >
  > **Quality is the gate, so the count can stay flat.** Bare completion is not progress; a competent
  > drive is. This is also what stops the count being farmed by crawling — and it means **the one
  > hard constraint survives the rename: progress must never increase with time taken.**

  A strong early run still buys the next region sooner, and because costs escalate with run age
  (Q9A), arriving early means arriving **before the country gets expensive**. Points are not progress
  so much as **a head start against the cost curve** — with no rendered clock anywhere (SM-INV-3).
- **SM-INV-15 — No in-run vehicle purchase.** [RATIFIED 2026-07-29] **You cannot buy a different car
  during a run.** Parts, yes — deeply. Vehicles, no. Three reasons, all owner-stated, and worth
  keeping in the code comment that will inevitably ask *"why not just add a dealership"*:
  1. **It doesn't survive its own economy.** A new vehicle's price is impossible to justify against
     a player who can barely keep the current one running.
  2. **It would dilute the default car.** A purchasable upgrade path pulls hard enough that everyone
     chases it, and the starting rig — the identity of the entire project — becomes the thing you
     escape rather than the thing you keep alive.
  3. **The game is about maintaining a rig, not acquiring one.** This is the *car is your horse*
     keystone stated as a rule. You do not trade horses; you keep one alive.

  **What replaces it as aspiration:** deep parts customization within one vehicle (a crappy jalopy
  becomes a sweet rig), and unlocked *starting* vehicles at the meta layer (see "The garage") —
  chosen before the run, never bought during it.

## Mechanics reference

### The day and the clock: sleepiness + doze [RATIFIED]

Sleepiness is the per-run clock — soft, diegetic, no arrival deadlines. It runs in **two bands**
[RATIFIED 2026-07-31]:

- **Sleepy** — the warning band. Yawns and heavy eyelids; no doze yet. This is the read the whole
  day-shape below is built on: *"I am N km from anywhere I'd want to wake up."* A careful player
  enters this band **every day**, on purpose, as the signal to go find ground.
- **Tired** — the danger band. This is where **dozing begins**: eyes close, controls drop, periods
  lengthen. Not a fail state (SM-INV-1); the physics does the rest.

The split exists because the two states have to mean different things to the rest of the design —
sleepy is *information*, tired is *exposure* — and because anything metering irresponsibility (the
Night Owl's ledger, career records, any future "driven tired" stat) must count only the second, or it
counts a state that responsible play passes through nightly. **Where the boundary sits is FEAT-47's
central tuning decision**, and every threshold keyed to "tired" has to be re-derived from it.

Coffee is a loan: alert now, sleepy earlier tomorrow.

Camping commits you to sleep where you stand, and the place sets the night's quality
(SM-INV-6). The day's shape: work → read your eyelids → break off → hunt good ground in
a campable region → camp before you're dangerous. Accepting a mission is a bet against
remaining alertness. Camping mid-mission doesn't automatically kill the job — it depends on
the job. Short, perishable ones die overnight (the milk spoils, the guy gets away; the fiction
supplies the penalty, no payout math needed); longer hauls permit the delivery to be made the
next day, so camping is a legitimate rest stop on a multi-day run. The mission's own fiction
says which it is. Sleep somewhere bad → bad night:
no fire, no fish, wake half-tired, tomorrow's budget already in debt — a run ending in
slow motion, legible the whole way down.

### The economy: par, payout, wear [DEFAULT]

- **Par oracle:** fixed-reference point mass on a friction circle, integrated over the
  route's arc primitives (curvature + grade already there). Physics-honest, free, scales
  with region difficulty. See ticket FEAT-29.
- **Payout = continuous margin against par** (SM-INV-4). Currency rates must net **negative on a lazy
  day, positive on a brave one** — that's the whole balance problem in one line, and the
  break-even-at-par anchor below makes it true by construction rather than by tuning.

#### The performance model [RATIFIED 2026-08-01]

Three dials, deliberately separated. Each keys off a different thing, so none of them can quietly do
another's job.

| dial | keyed off | direction | what it decides |
|---|---|---|---|
| **par** | route geometry, nothing else | fixed | what a road is *worth* |
| **rank thresholds** | run day | tighten | how hard the good letters get |
| **day tier** | run day, **locked at mission start** | rise | how much a mission pays |

*(Re-anchored 2026-08-16 — SM-INV-3 and SM-INV-4 amendments.)*

```
par    = referenceTime × PAR_SLACK          PAR_SLACK 1.15 — the standard; referenceTime is physics
ratio  = elapsed / par                      ratio 1.0 IS the C/D boundary, by construction
payout = parBase × dayTier × clamp((payoutZero − ratio) / (payoutZero − breakEven), 0, cap)
                                            breakEven 0.80 · payoutZero 1.20 · k 0.024 · cap 3.0
```

- **`parBase = k × par`.** The base scales with the road, so a twelve-minute haul at par pays more
  than a sixty-second errand at par. **This is load-bearing** — it is what stops the player farming a
  loop of tiny jobs, and it is the reason payout could not simply be the rank letter. `k` is the one
  tunable number in the economy: *maintenance cost per second of par-driving.*
- **`clamp(…)` gives 1.0 at ratio 0.80 (break-even), 0.5 at par, 0 at 1.20** — the linear payout
  line. `cap` (~3×) is insurance: a route the oracle mis-prices should not become a payday. Under
  this line it is unreachable in practice — insurance, not a dial.
- **`PAR_SLACK` is the design knob; `PAR_REF` is the physics.** Par used to be one number doing both
  jobs, which is why the word drifted away from its meaning. Move the *standard* with `PAR_SLACK`;
  move the *reference drive* with `PAR_REF`. Never fake one with the other.
- **`dayTier` is a step function of the run day**, not a smooth curve, and it is **fixed at the moment
  the mission is accepted**. Deliberate consequence: **starting a job just before the day rolls over
  buys tomorrow's rate.** That is a feature — see below.
- **Rank is display only** (SM-INV-3 as amended): D/C/B/A/S over a continuous payout, **C containing
  par** — and C is pinned at 1.0 on every day, so the ramp never moves the pass line itself.

**Why the payout tier rises with the run.** Maintenance costs escalate with run age (Q9A). If payout
did not rise with it, a maturing run would simply starve. Instead both climb: *number go up* feels
good, and the fact that a repair bill now costs what three missions used to feels bad, at the same
time. The stakes rise on both sides of the ledger. The **tightening rank thresholds are the brake** —
you earn more per job, but earning the top of the curve demands either a better-driven line or a
better-maintained truck. Get neither and the rising payout does not save you.

**The 1 a.m. start is a feature, not an exploit.** Locking the tier at accept time with hard day
cutoffs means the economy itself makes it rational to take a job late and drive it into the night —
which is to say **the reward structure seduces the player into driving tired.** That is exactly what
the fatigue domain was designed to sell, arriving for free from the economy instead of from a spirit.
Nobody authored it; do not "fix" it.

**Bonus objectives are the one legal pre-drive target.** A mission-giver may offer *"a little extra if
you finish with an A"*, gating an **item** reward whose identity is not stated up front (a spare tire,
a cooking kit). This is legal precisely because it names a standard without naming a time (SM-INV-3),
and it is the only place a rank boundary has mechanical teeth rather than cosmetic meaning. Item
rewards die with the run like everything else (SM-INV-8).

**Not every mission type is scored on margin.** Coverage (the paper route), restraint (fragile cargo)
and clearance (main missions) are separate axes; **rank is computed per-axis** so the letter — and
therefore the bonus objective — works on any job. Freight's flat-rate payout deliberately bends
SM-INV-4 and is flagged in `missions.md` for explicit ratification.

**Non-timed missions are still governed by the clock, indirectly.** A fragile run has no margin
scoring, but costs escalate with run age and the day is finite, so dawdling is still expensive. The
economy supplies the pressure; the mission does not have to.
- **Wear = f(time, intensity)** (SM-INV-5): hours driven and engine torque are both tracked
  and integrated over the run — rpm-hours, redline time, hard impacts, curb strikes,
  over-temp all feed the condition model. Breakdown is the second death. There is no damage
  model today — this is a new, cheap, out-of-hot-loop subsystem. It is **ONE framework** (one
  condition-tracking system, shared with hazard impacts — FEAT-26 "what does a rock hit do"
  resolves here) but **multiple per-component condition tracks**, not a single scalar: tires,
  engine, air filter, suspension, brakes, radiator each carry their own 0–100% condition and
  read their own honest physics signal. See **Damage, wear & repair** below for the full model.
  Practically, this is the mechanism behind the two driving modes: mission legs run hot against
  a par deadline and eat wear; the freeroam legs picking the next mission or exploring between
  jobs are where a player who wants to protect the truck backs off the throttle and drives
  casually.
- **Damage/wear is confirmed required and expected to be hard to get right** [RATIFIED
  2026-07-16]. Two owner-stated calibration anchors:
  - **Severity thresholds, not linear accumulation.** Hitting the bump stops lightly should
    NOT damage the suspension; hitting them hard should. Damage keys off impact magnitude
    with a no-harm floor — the physics already produces honest bump-stop forces, so the
    model reads them rather than inventing proxy events (emergent-over-injected applies
    here too).
  - **Tire wear runs accelerated relative to realism**, deliberately — it's an economic
    driver that pushes the player to chase good mission rewards. Honest *mechanism*,
    tuned *rate*.

### Where missions and POIs live: anywhere on a road, not at nodes [RATIFIED 2026-07-20]

**A mission start, a mission end, and every POI is an arbitrary point on a road edge — a
`(runKey, arcS)` pair — never "the nearest graph node."** Graph nodes are a *routing* artifact
(blue-noise anchor sites, ~640 m apart, mostly junctions); they are not places. In the real world,
a store, a house, a trailhead, a parking lot is no more likely to sit at an intersection than
halfway down a stretch of road, and snapping destinations to junctions would make every mission
start and end at a T — a tell the player would read within three missions.

The architecture already supports this and nothing needs to change to allow it: a routed edge is a
`Centerline` with exact `pointAt(s)` / `tangentAt(s)` / `curvatureAt(s)`, so a point mid-edge is as
well-defined as an endpoint. The consequences that *do* need honoring:

- **Par integrates over arc-length ranges, not whole edges.** The first and last edge of a
  mission route are partial: par is the integral from `arcS_start` to the edge end (and from the
  edge start to `arcS_end`). Whole-edge par is just the special case where the range is the whole
  edge. FEAT-29's oracle must take `(centerline, s0, s1)`, not `(edge)`.
- **Path search runs over a graph with the two endpoints spliced in.** A mid-edge endpoint splits
  its edge into two virtual half-edges joining both of that edge's nodes; the degenerate case
  (start and end on the same edge) is a single arc-range with no node in it at all.
- **Arrival is a radius on the point, not "reached node X."**
- **POIs (FEAT-21) place mid-edge by the same rule**, and mission endpoints should eventually *be*
  POIs — the random-point generator is the stand-in until FEAT-21 gives the world real destinations
  worth naming ("the milk's at the store" needs a store).

### Damage, wear & repair [DEFAULT — owner brain-dump 2026-07-19, mechanism proposals mine]

The second death (breakdown) lives here. **One framework, per-component condition tracks** (see the
economy note above): each component below carries an independent 0–100% condition, integrated cheaply
out of the physics hot loop, and every track reads an **honest signal the sim already produces**
(rpm, load, bump-stop force, brake torque, coolant temp, impact magnitude) rather than an invented
proxy — emergent-over-injected ([[feedback_emergent_over_injected]]) applied to the damage model.
Nothing here persists across runs (SM-INV-8) — condition is per-run state on the current truck. All
tracks obey SM-INV-5 (time + intensity, never distance).

**Tires — four independent tracks.**
- **Gradual wear lowers peak grip**, applied by directly scaling the per-wheel friction coefficient
  (this rides the same per-contact-patch μ plumbing FEAT-38 introduces for dirt: `frictionCoeff ×
  surfaceMuScale × tireWearScale`). Wear runs **accelerated vs realism** on purpose (ratified economic
  anchor — pushes the player to chase good mission rewards).
- **Independent per corner** → the player manages grip *balance* (keep the fresher rubber where they
  want bite — e.g. front). Because each wheel's grip feeds the physics directly, an uneven set changes
  the truck's handling honestly, no bookkeeping.
- **Puncture = binary, probability on a wear→fragility curve** (owner-set, 2026-07-19): the insult
  needed to pop a tire shrinks as it wears. Below ~15% condition a tire can blow **on a smooth road**
  (spontaneous); below ~50% a *moderate* bump *could* pop it but very unlikely; fresh rubber only goes
  on a real hazard. Hazards (landslide/debris — FEAT-26/09) always carry puncture risk, scaled up by
  wear.
- **Repair = roadside self-change.** Pull over and swap the tire — **not a minigame**, it just burns
  ~1–2 in-game hours (OEM kit) and **requires a spare/replacement tire in inventory**. A found/bought
  **quick-jack or breaker-bar item cuts the time** (you still need a tire ready).
- **Inventory weight is real load** (honest physics): carried spare tires and the quick-change tool have
  mass, shifting the truck's CoG and handling while stowed — a load, never a stat (SM-INV-10).

**Engine.**
- **Wear = f(rpm, load, time)** — gentle cruising costs far less than aggressive driving; both integrate
  over time (SM-INV-5). rpm-hours + load are the signals.
- **Air filter condition** is its own track and the one the player must *watch*: it does ~nothing until
  ~20%, then **sharply accelerates engine wear**. **Dusty / dirt roads degrade it faster** — the direct
  FEAT-38 tie (dust exposure feeds filter degradation). It's a cheap consumable to replace; letting it
  bottom out silently kills the engine. The diagnostic screen (below) exists largely to flag this.
- **Overheating** (see radiator) causes temporary power loss **and** heavy engine wear; prolonged or
  repeated overheat blows the head gasket (a hard engine failure).

**Suspension.**
- Wear primarily degrades **shock damping** (the damper coefficient drops → floatier, worse-controlled
  truck). Ratified anchor: **severity-thresholded, no-harm floor** — light bump-stop contact is
  harmless; hard hits damage. Trigger reads an honest signal — either **bump-stop over-travel past a
  distance** or a **suspension-velocity component threshold** (open sub-question, both are honest;
  probably the bump-stop force the physics already computes).

**Brakes — front pair + rear pair (two tracks, deliberately coarse).**
- Wear = **∫(brake torque × time)** (N·m·time). Worn pads = less stopping power. Simple.
- Pairs (not four corners) so the player can **mix pad grades front vs rear** (standard / sport / race)
  to tune **brake bias** — a big handling lever (bias shifts lock-up and rotation). Pads are
  *described, never scored* (SM-INV-10): a race pad changes what the truck does under braking, it
  isn't "+10 braking."

**Radiator — a swappable mod, not just a wear item.**
- **Early-game cooling is deliberately marginal**: the starting radiators barely keep up, so the engine
  runs near its thermal limit under sustained load. This is an intended early-run pressure — a lever to
  balance the game around, not a bug.
- **Overheat → temp power loss + engine wear**; repeated/long overheat → **blown head gasket**.
  *Proposed gasket metric (mine, needs owner OK):* an **overheat integral** — accumulate time-above-
  threshold weighted by how far over the limit (severity), a hidden meter; crossing it blows the gasket.
  Emergent from the honest temp signal, same shape as the other severity-integrated tracks.
- **Front-end collisions damage radiator condition** → worse cooling; a **strong front hit punctures it**
  → drastically reduced cooling and a fast overheat spiral. Reads collision magnitude from the contact
  pipeline (FEAT-09).

**Death & the tow decision (SM-INV-1 — still exactly two fail states).**
- You die **one of two ways**: (1) a **crash impact hard enough to be fatal** — "You died"; or (2) you
  **break down and can't recover** — if the truck can't continue and you **can't afford a tow**, the run
  auto-ends ("you crashed" / "you broke down" per circumstance).
- **A survivable crash or breakdown is NOT a fail state — it's a *predicament*.** The moment-to-moment
  tension the owner wants: *call a tow (time + money) or try to limp it to a shop and eat more damage?*
  The **tow fast-travels to the nearest town** but is priced **near-prohibitively** — usually the
  economically run-ending choice, a genuine last resort — so the player is forced to weigh limping vs.
  paying. Can't afford it → automatic run-end.
- **Fatal-crash threshold:** a deceleration / G threshold (e.g. Δv ≈ 60 mph shed in ~0.1 s). Acknowledged
  hard to tune and dependent on the collision model (FEAT-09/26); a raw Δv-over-Δt threshold is the
  fallback. This is the **crash** death — SM-INV-1 is unchanged, no new fail state.

**Repair & maintenance venues.**
- **Roadside self-service** for tires (and likely the filter): burn hours, need the part on hand.
- **Service station in town** for the heavy repairs (engine, suspension, brakes, radiator, gasket) — costs
  money + time; reached by driving or by tow.
- **Gas stations** — see below.
- **Diagnostic screen:** a condition panel — the **FEAT-34 instrument cluster is its natural home** —
  surfaces every track, with the **air-filter warning** the critical, can't-miss one.

### Fuel and gas stations [RATIFIED 2026-08-01]

**Fuel exists, and so do gas stations.** This reverses `items.md`'s standing "Fuel? Not in the
design" line, which is struck. Ticket: **FEAT-50** (tank + burn model), gauge already shipped in the
FEAT-49 cluster.

**Why it fits rather than bolts on — fuel is the distance term the rest of the economy refuses.**
SM-INV-5 is emphatic that wear accrues on **time and intensity, never distance**. That is right for
wear, but it leaves the game with no cost for *going far*, which is strange in a driving game. Fuel is
exactly that missing axis:

> **Wear prices how hard and how long you drove. Fuel prices how far.** Between them both axes are
> covered, and neither has to lie about the other.

**Burn is honest, like everything else** — a function of rpm and load off the drivetrain, so a
par-beating drive costs fuel *and* wear while a gentle freeroam leg is cheap in both. That sharpens
the two-driving-modes split (see "The organizing problem") rather than complicating it.

**Running dry is not a new fail state.** It is the existing **breakdown predicament** (SM-INV-1) with
an unusually cheap fix: you are immobilised and must get fuel to the truck — a jerry can if you carry
one, a tow if you can afford it, and the run ends only under the rule that already exists (*can't
continue and can't afford recovery*). No invariant moves. **Do not implement running dry as a direct
kill.**

**Gas stations are a POI type**, and a *service* venue distinct from the town service station: cheap,
common, and quick, where the service station is expensive, rare, and costs hours. Consequences:
- Fuel price is a natural carrier for **Q9A cost escalation** — pennies-per-gallon rising with run
  age is the most legible possible version of "the world is thinning out," and it needs no fiction
  invented for it.
- It sharpens **Q9B** (the advancing front consuming POIs): losing the local gas station is worse
  than losing a job-giver, because it lengthens every route you have left.
- It gives the **early game a service venue that isn't punishing**, which the repair economy
  currently lacks.

**It is also the tutorial gauge.** The fuel needle is perfectly legible and always true — the exact
opposite of the air filter, which does nothing until it does. Fuel teaches the player to read the
cluster *before* the subtle tracks start mattering. Keep that contrast; it is doing free work.

**Open:** tank capacity as a jalopy/part difference (a bigger tank is described-not-scored territory,
SM-INV-10); whether a **jerry can** is a stowed tool with real mass (`items.md` §2 rules say it would
be); and whether fuel price varies by station or only by run age.

### The car: jalopy + parts [RATIFIED premise, DEFAULT details]

Run start: parts randomized from a pool of crap (SM-INV-7). Parts are architecture choices,
not stat sticks (SM-INV-10) — open vs LSD diff, power, tires, plus the wear-model parts:
brake-pad grades per axle (bias), radiator (cooling headroom), and starting condition on every
track (a jalopy rolls in already half-worn). Consumables/tools ride here too — spare tires, air
filters, a quick-jack/breaker-bar — and, stowed, they are **real mass** that shifts CoG and
handling (honest physics, not a stat). FEAT-23's drivetrain architecture + parts-selector phases
are the substrate; the jalopy generator is a seeded roll over that same architecture space, now
including starting wear. Mid-run finds (an LSD in a barn, a better radiator) are events.

**You cannot buy a different vehicle during a run (SM-INV-15).** Parts are the whole upgrade path;
the rig you start in is the rig you finish in or die in. Which vehicle you *start* in is the meta
layer's business — see "The garage" below.

### The garage: meta-progression is starting vehicles [RATIFIED 2026-07-29]

**What you unlock between runs is a starting vehicle.** You pick one and run the whole game in it.
The roster is a **garage, not a cast** — this replaces the previous roster-of-characters-with-perks
model as the *mechanism* of meta-progression.

**Guardrail — lateral, never upward.** Unlocked vehicles must be **different, not better**
(SM-INV-10: described, never scored; SM-INV-9: breadth, never floor). Each is a trade — a van with
cargo room and poor cooling; something light and quick with no bed for freight; something durable
and slow. The litmus test is unchanged: *does it raise the floor / make late runs comfortable?* If a
vehicle is simply stronger than the starting Ranger it is illegal regardless of framing, and
SM-INV-7's first-run winnability is what it breaks.

This is a **simplification**, and it is much easier to keep honest: a vehicle's differences are
physical and visible, where a perk's are numerical and quiet.

**How a garage entry unlocks** [RATIFIED 2026-07-29] — two sources, deliberately different in kind:

- **Career accumulation.** An **account-level stats screen** (distinct waters fished, nights camped,
  distance driven tired, runs ended and how) tracks totals across the profile. Crossing a total can open
  a starting vehicle. This is the legal home for cross-run accumulation: the garage is the one thing
  that persists (SM-INV-8), so career counters are fine *here* and nowhere else — they must never
  gate a spirit or buy in-run power. Stats belong to the **account**, not to the run's persona, which
  is fresh every time.
- **Discovery — the barn find.** A vehicle that exists as a **rare random spawn in the world, never
  shown on the map**. Its position is deterministic from `(worldSeed, coords)` like everything else
  (SM-INV-12); only *whether you have found it* persists. Rewards curiosity rather than accumulation
  — the one unlock that pays for leaving the road you were on. See `IDEAS.md`.
  **You cannot drive it in the run you find it** [RATIFIED 2026-07-29] — finding unlocks it as a
  *starting* vehicle for later runs. This keeps SM-INV-15 intact (no in-run vehicle change) and
  honours the keystone: you do not trade horses mid-journey. You find it, you can't have it, and you
  finish the run knowing it's there.

Both are bound by lateral-never-upward above. A hidden car that is also the strongest car is a power
floor wearing a mystery costume.

*Status of spirits:* the spirit system below is **not deleted — it is deferred**, but its
*persistence* question is now settled — see "How spirits exist without persisting" below. The roster
mechanism is vehicles; how spirits and classes relate to it still needs its own pass. **Do not build
spirit-unlock plumbing yet.**

### How spirits introduce themselves [RATIFIED 2026-08-01]

**A spirit's first appearance must not interrupt driving.** Driving is the game; a beat that arrives
mid-corner is the one delivery mistake that turns an authored moment into an imposition. So:

> **The ledger completes in motion. The visit lands at rest.** You drive; later you make camp; then
> it is there — **the night after** the condition is met, not the instant it is met.

The campsite is the default venue for every introduction. It costs nothing to build (FEAT-45 camping
and FEAT-47's clock already ship, and the player has already committed to the dwell), and a campfire
is staged world-space, which satisfies SM-INV-11's surviving constraint by construction.

Three properties to keep as the cast grows: **no spirit is available from the start of a run**;
**the ledger fills while driving but the visit happens at camp**; and **the delay is one night**, so
it reads as consequence rather than trigger.

**Camp is also the consultation venue**, not only the introduction one: once met, a spirit can be
*asked* something at the fire. The Highway answers with the **day's road camber** — a favour readout
delivered in character rather than as a meter (SM-INV-3's posture). A single commit-action, then
sequential cards; never a dialogue tree.

*Known exception under discussion:* the **Night Owl** is a passenger, so the seat beside you is his
natural staging and the doze already frames it. Whether his *first* meeting may break the rule is
**open** — see `spirits-and-pacts.md` #01.

### How spirits exist without persisting [RATIFIED 2026-07-29]

Spirits do not need meta-persistence, and do not get it. The model, in four lines:

1. **Every spirit is in every world, from run 1.** Nothing is added to the world by playing —
   SM-INV-12 (worldgen is meta-free) and SM-INV-8 (the world doesn't persist) hold for free.
2. **Until you have met one, it is invisible.**
3. **The first meeting is an authored beat** with unique flavour text, fired when the run-layer
   ledger is first satisfied. **Once per profile, recorded as a story key** — precisely the currency
   SM-INV-8 and the Roamer's economy already deal in.
4. **Thereafter the spirit is present but inert** until each run re-earns its ledger. The Night Owl
   rides in your passenger seat whenever you are *tired*, every run, saying nothing — until you drive
   the ten tired kilometres again. **The pact is re-earned at full price, every run** (no cheaper re-unlock;
   that would be a floor).

This buys "the world knows you" with **presence instead of power**, and it is the better horror
object: a silent figure you must drive ten tired kilometres to make speak. **The dread persists; the
power does not.**

*Note the shape:* this is the **beat/labor split** the log-drag main mission already uses (`missions
.md`) — authored scene once per profile as a story key, the labor re-done every run. Two independent
problems landed on one pattern; treat it as the idiom for authored content that must survive
repetition. Full model and the cast: `spirits-and-pacts.md`.

### Run shape and saving [RATIFIED 2026-07-29]

Full working-through in [run-shape.md](run-shape.md); the ratified numbers:

- **6 regions**, region 1 at 2500 m (~12 min to cross) and **growing with depth on a sparser grid** ·
  **6 hours** to beat · **24-minute sky cycle** = **16 waking h + 8 h sleep** ·
  **~18 real minutes per day** · **20 days per run** [region count 2026-08-01; the clock, the day cost,
  days-per-run and region growth all 2026-08-02]. The full trail chain must be completable
  in **one run** (SM-INV-7), since clearance is run-layer and resets on death — so region count is
  bounded by what one surviving run can reopen. That is a hard content constraint.

  > **Days-per-run was wrong twice, and both errors are worth naming.** **10–15** came from dividing
  > the target hours by the **sky cycle**, which counts only driving. The **7–8** correction then
  > over-swung, pricing a day at ~40–45 real minutes by charging camping, repairs, shopping *and
  > travel between jobs* as wall-clock overhead — but **travel between jobs is driving and already runs
  > at 1:1**, and the rest now **pauses the clock** outright (2026-08-02). Genuine off-clock time is
  > ~2 real minutes a day. **16 waking hours at 1 real min = 1 in-game hour, +2 min paused, sleep
  > skipped = ~18 real min a day**, and 360 ÷ 18 = **20**. The 24-minute sky cycle never changed.

- **The clock runs, pauses, or skips** [RATIFIED 2026-08-02]. Driving and travel run at 1:1. **Shops,
  service stations and camp pause it** — those screens are the planning surface, and **the map must be
  reachable from each of them.** Sleep, making camp, and an accepted repair **skip** it. Repairs cost
  **money and hours** — *engine to 50% for $1000 and 10 hours* — charged as an immediate skip, which
  makes a service stop a real commitment against the day rather than a wallet transaction.
  **Energy drains across the skip — including when you pay someone else to do the work**; ten hours at
  a station is ten hours awake, so a big repair accepted in the morning effectively ends the day.
  **Sleep is the only skip that credits energy** instead of draining it. *(This resolves the standing
  open question on repair duration and the cost of a day at the shop.)*

- **A region is a progression *chapter*, not a bounded play space** [RATIFIED 2026-08-01]. Regions
  **unlock, they do not replace** — by chapter 6 the player has six regions of drivable, validated
  world, and **a chapter's gameplay need not happen inside its own region.** A late mission may start
  in region 1 and end in region 4; **driving between regions is content, not overhead.**

  > **Regions grow with depth** [REVERSED 2026-08-02 — this bullet previously said they need not].
  > `REGION_RADIUS_M = 2500` is **region 1**; later regions get physically larger on a **sparser
  > road/POI grid**, because a 12-hour mission needs somewhere to happen that isn't a lap of the same
  > network. Cost tracks *density × area*, not area, so a bigger region on a thinner grid is roughly
  > cost-neutral — and `REGION_RADIUS_M` is a story-layer value **deliberately outside `routeCacheSig`**
  > (`src/story.js:35`), so growing it does **not** force a route-bundle re-bake.
  > `test/region-radius-curve.mjs` prices the curve; run it before committing radii. *Open: the ladder
  > itself, which should be derived from the mission par bands in `run-shape.md`, not picked as a shape.*
  >
  > Chapter 6 needing only 2 points is not thinness — those are **two whole-day hauls** (~12 h par
  > each), and late missions may span regions, so their par is large and they pay more (`parBase ∝ par`).
  >
  > **Two build consequences.** The play space grows monotonically, so streaming and validated-network
  > coverage scale with **regions unlocked** (FEAT-28's bill, not a region-sizing one) — and because
  > unlocks are run-layer, that bill is paid **every run**. Ruled 2026-08-01: the next region is
  > **warmed on the worker the moment the player accepts the region-unlock main mission**, so the
  > barrier lifts with no loading screen. See FEAT-28. And mission
  > planning must path over the **union of unlocked regions** — `src/mission.js`'s `_roll()` currently
  > confines both endpoints to the single active region (FEAT-43), which has to become "inside the
  > unlocked set" before cross-region missions work at all.

- **Days and points are authored per region** [RATIFIED 2026-08-02, supersedes the 2026-08-01
  falling schedule]:

  > **days**   4 · 4 · 4 · 3 · 3 · 2 = **20**
  > **points** 6 · 6 · 6 · 4 · 3 · 2 = **27**

  **Days-per-region is a pace, not a gate** — the point count is the gate; falling behind costs days,
  and the cost curve charges for them.

  **The ramp is mission *length*, not mission count.** Points per day stay nearly flat (1.5 → 1.0);
  what changes is what a point costs. Region 1's missions are **~5–7 h par**, so two fit in a 16 h day
  and a good player clears **~8 against a requirement of 6** — deliberate slack, the budget for failing
  and for building the jalopy up. Region 3's are **7–12 h par**, where two no longer comfortably fit
  and the day becomes the binding constraint. Region 6's are **~12 h par plus ~2 h to fishable ground
  and ~2 h to the next job — exactly one day**, with **no room for a service stop or an upgrade.**

  *(An earlier draft authored a falling point schedule on the theory that deep country is emptier.
  Right instinct, wrong axis: the emptiness should show up as longer missions, not fewer of them.)*
  Because points come in halves (a C is ½ — SM-INV-14), the real counts are finer than the integers
  suggest — and that half-point is the only give in region 3's band, which is the tightest number in
  the run. **Per-region counts are authored numbers, one per region** — a content dial, not a curve to
  fit. Full derivation and the per-region table: `run-shape.md`.

- **Long missions may need checkpoints.** A 12 h par job across a sparse late region has no vocabulary
  in `missions.md` today — missions are point-to-point with endpoints mid-edge. **Multi-checkpoint
  missions are a new structure**, not a tuning value, and they gate regions 3–6. No ticket yet.

- **The cost escalation is a soft asymptote, not a wall** [RATIFIED 2026-08-02]. Day 20 is where a
  paced run finishes; **a good player who is not motivated to end the run can stretch to 25–30 days.**
  It must never announce itself — SM-INV-3 forbids a countdown, and a hard cliff at day 20 would be a
  timer wearing a price tag. You do not run out of days, you run out of money.

- **Difficulty is a run-start setting, never a worldgen input** [2026-08-01]. A difficulty selection
  may scale the point thresholds, the cost-escalation curve, and `k` in the payout formula. It must
  **not** reach worldgen: SM-INV-12 makes a seed mean the same world for every player, and a
  difficulty that changed terrain or roads would break seed sharing outright. If difficulty ever must
  affect generation, it has to become part of the seed's identity rather than a separate dial.
- **Saving is suspend-and-resume, not checkpointing.** One slot per profile; written on quit;
  **loading a save deletes it**; death deletes it. Resuming is not restoring — it's picking the run
  back up. Standard roguelike practice (Spelunky, FTL, Slay the Spire), and SM-INV-1 is intact:
  death is still permanent, the save is a pause that survives closing the browser.
- **The save is cheap because worldgen is meta-free** (SM-INV-12) — the world never needs
  serializing. A save is seed + `runState` + truck condition + inventory + position + time of day +
  sleepiness + currency + active missions + cleared logs. Kilobytes. The worldgen decoupling paid
  for the save system as a side effect.
- **Production consequence:** most players will die repeatedly and never finish a run, which is
  intended — but it means **the first two regions get played fifty times more than the last two.**
  Authoring effort and polish weight toward the early game, and the early game must survive dozens
  of repetitions without becoming a chore.

### The world: regions, story states, spirits

- **Region unlock = FEAT-28.** The connectivity-validation gate and the progression gate are
  the same mechanism and the same in-world object (trail-closed barrier). Story beats/XP
  trigger unlock; unlock triggers validation. Bounded-but-expanding is an accepted trade
  (recorded in FEAT-28) — it buys "every unlocked area is fully drivable," which infinite
  streaming can never promise. **Story frame (2026-07-20):** the closed region barriers are the
  **Roamer's old trails**, shut since they last rode them; reopening one is what the Roamer wants of
  you (see "The Roamer"). Expansion is **gated by authored "main missions"** that drive the player to
  a place — the story pulls you outward, rather than a bare XP threshold. Mechanism is unchanged
  (FEAT-28 barrier, SM-INV-13); this is the diegetic frame on top of it.
- **Story = parameter states** (SM-INV-11), keyed off **run progress** (`runState`, SM-INV-12 as
  amended 2026-07-29 — *was* metaState; escalation happens within a run and resets with it). Sky/time-of-day
  (src/sky.js), prop palette params, terrain params, prop history states (FEAT-32 logged
  forest), and **road surface class** (FEAT-38 dirt-road prevalence) are the delivery surface —
  a region reading civilised-and-paved vs. wild-and-dirt is a baked per-region parameter, not
  authored text.
- **The off-network layer — ONE generator [RATIFIED 2026-08-01].** Everything that lives off the
  routed road network comes from a single generator: **dirt spurs, dispersed-camping areas, logging
  sites, POIs, and cuts**. Previously these were four tickets (FEAT-38 mode B, FEAT-45, FEAT-32,
  FEAT-21/46) each growing their own tracks into the same empty back-country, competing for the same
  space and the same crossing cull. They are one system with several *purposes* tagged onto its
  output, and the topology decides the purpose:

  > **A track that dead-ends is a spur. A track that rejoins the network is a cut.** Same generator,
  > same determinism, different fate — which is also exactly the fiction of the Highway/Shortcut pair.

  Hard constraints, inherited from FEAT-46's shipped discipline:
  - **Strictly downstream of routing.** Nothing in this layer may enter `routeCacheSig`, the abstract
    graph, the router cost model, or the crossing cull. Road centerlines must be **bit-identical**
    with and without it — the same parity gate FEAT-46 already ships.
  - **Pure `(worldSeed, coords)`, window-invariant** (SM-INV-12) — for **placement**. *(Amended
    2026-08-02: passability is a function of **(seed, favour)**, not seed alone. **Where** a hazard
    sits is worldgen and fixed forever; **whether it has been cleared** is run-layer, moving only at
    day boundaries as the Shortcut's esteem deepens. **Literacy survives and improves** — you learn
    "that one has a slide two thirds in," true on that seed every run; what changes is whether you can
    get past it.)*
  - **Two passes** [RATIFIED 2026-08-02]. **Pass 1 is inherent difficulty** — tight radii, no banking,
    bad surface — which is free, is what an unengineered route *is*, and is why the router honestly
    costs a cut as bad line. **Pass 2 is discrete hazards** — rockslide, ford, ruts, sharp rock —
    which must be **carved**, because a hazard that is drivable, punishing at the right level and
    rewarding at the right level cannot be left to whatever the terrain happened to do. Only pass 2 is
    favour-gated, which keeps the invalidation surface to short local carves on specific segments.
    Keep hazard carves ~20 m and favour tiers coarse (4–5, day-boundary only).
  - **One shared "good ground" score** — flatness, shade (tree density), water proximity, and
    possibly view (terrain visible from the site). Camp areas, POI pads and logging sites all read
    it; see the three-layer camping model below.

  **Camping is three layers, not one** [RATIFIED 2026-08-01], which resolves a long-standing muddle
  about who owns campable ground:
  1. **Region campable flag** — some regions permit camping and some do not (SM-INV-6's gate).
  2. **Valid camp locations (FEAT-45)** — areas where the button is legal at all, gated by **hard
     rejects**: in water, not flat enough.
  3. **Site quality** — a *score*, not a gate: flatness, shade, water proximity, view. This is what
     the pre-camp preview shows and what decides the night you get.

  Spurs, logging landings and POI pads **feed candidates** into layer 3; none of them gates. FEAT-45
  owns the gate.

  **GPS routes the road, not the cut.** Navigation (FEAT-39) prefers the maintained network and will
  only route over a cut when there is no road way to the destination. The obfuscation is structural
  rather than cosmetic: by the router's own cost function a cut *is* bad line — tight radii, no
  banking, bad surface — so honest routing avoids it without anyone hiding anything.
- **Spirits — DEFERRED 2026-07-29.** *Meta-progression is now the garage (see "The garage"); spirits
  are no longer the roster mechanism. The system is not deleted, but how it relates to the garage
  needs its own pass — don't build spirit-unlock plumbing yet. The description below is retained as
  the design of record for whenever it resumes, with one correction: under the narrowed SM-INV-8,
  **spirits can no longer be permanent world additions** — the world no longer persists across runs.*
  Spirits are player-earned rule-changes, not resources (SM-INV-9). **The Roamer is the meta-spirit
  that unifies them** — the source the individual spirits read as facets of — and *meeting* spirits
  is one of the ways a **class** unlocks (see "Classes" below).
- **Meta-progression is roguelike breadth, not a power curve** (SM-INV-9, Isaac / Gungeon
  model). Replaying deepens the game by widening the pool of things a run can contain and the
  *shapes* a run can take — never by making you start stronger (SM-INV-7 keeps the first run
  winnable). **The carrier of this, as of 2026-07-29, is the garage** — unlocked starting vehicles,
  lateral not upward (see "The garage"). The three pools below are the older framing; the loot/mod
  pool survives unchanged, while run-archetypes/spirits and classes are deferred pending the pass
  that reconciles them with the garage. Three expanding pools:
  - **Loot / mod pool.** Unlocks add new parts, hazards, mission dressings, and spirits to the
    randomized pool a run draws from. More replays → a richer, weirder deck — more variety, not
    a higher floor. An unlocked part is *another option in the jalopy roll*, not a strictly
    better one (SM-INV-10: it changes what the truck does, it isn't scored).
  - **Run archetypes / objective-reshapers.** Some unlocks are spirits that, when they show up
    in a run and the player finds them, *re-point what the run is about*. Example: unlock the
    camping spirit, and on runs where he appears, finding good sleep is worth chasing — the run
    optimizes toward a good night rather than the most wicked missions. The player's optimal
    play *changes shape* run to run instead of accreting power. **Design guardrail:** an
    objective-reshaper must genuinely re-weight what's worth doing (a trade — this over that),
    not staple a flat bonus onto an otherwise-normal run; "same run, +20% payout when the spirit
    is present" is the balance-sheet erosion SM-INV-9 forbids. The spirit changes the *question*
    the run poses, not your bank balance.
  - **Classes.** [RATIFIED 2026-07-20] A class is another *shape* a run can take — an RPG-style role
    the player unlocks into the roster and can bring into a run. Classes unlock through **one-time
    achievements**: *meeting spirits* (each spirit met is an unlock), milestone feats (camp 10×,
    drive 5 km sleepy, and the like), **main story beats**, and **region completions**. Like the
    other pools, classes are **breadth, not floor** (SM-INV-9): more classes means more ways to play,
    never a higher starting power, and the first available class must keep run 1 winnable (SM-INV-7).
    *Open (see Open Questions):* whether a class is chosen at run start, exactly what it changes
    (objective framing? the jalopy roll-space it draws from? which spirits appear?), and how it is
    kept strictly breadth so no class is simply stronger than another — flagged, not resolved.

### Characters and dialog: the chat pane [RATIFIED 2026-07-16]

Characters speak to the player through an **RPG-style chat pane** — a card surface, not a
conversation tree.

- **No dialog options.** The player never picks a reply. Dialog is *received*, not negotiated.
  **One exception [RATIFIED 2026-07-29 (b)]: a pact's accept/decline.** A pact is a bargain and a
  bargain is a yes or a no, so the final card of a pact offer carries that single choice. **Scope it
  exactly this tightly** — this licenses a binary answer to a spirit's bargain and *nothing else*: no
  dialog trees, no reply selection, no branching mission conversations, no "options" on any card that
  is not a pact's last one. Everything the player is *told* is still received. Worked example and the
  interaction verb that reaches it (stop, pull the handbrake): `spirits-and-pacts.md` #01 The Night
  Owl, "How you talk to him."
- **Sequential cards.** A line of dialog is a sequence of cards advanced one at a time (tap /
  key to continue), each a beat of what the character says. The card order is the whole content
  — no branching, so no per-choice state to author or balance.

This posture is deliberate and on-tone: receiving a line and moving on is the same passive
stance as the doze (SM-INV-11) and the same low-interaction ethos as the single-action commit
of camping (SM-INV-6) and the no-countdown HUD (SM-INV-3). The player drives; they don't manage
conversations.

**What the chat pane carries — and what it doesn't.** The chat pane is the **character** channel:
mission-givers, people you meet, whoever spawns at a place (e.g. a logging site, FEAT-32). It is
deliberately distinct from the **world-story** channel, which stays parameter states + the doze
(SM-INV-11). The trees leaning, the moon, dark at noon are never chat cards. The chat pane is who
is talking to you; the world is what is happening to it.

**Boundary to confirm (owner) — flagged, not resolved:** how much *story* (versus mission framing
and character banter) the cards may carry. Note (2026-07-20): SM-INV-11's "never scripted events"
absolute is now relaxed, but the relaxation licenses **staged in-world beats**, not the chat pane —
the *ambient* through-line still stays out of the cards. Default read: cards frame missions and give
characters a voice; the surreal through-line lives in parameter states, the doze, and authored
in-world Roamer beats. If a story beat wants a *card* to carry the world-story itself, stop and
escalate rather than assuming the pane is licensed for it.

## Failure modes to watch (from the design conversation)

- **Par-scoring eats the tone.** If every mission is the same number, this is a time trial
  with charming skins. Need mission types where par isn't the axis — arrive with the eggs
  unbroken, don't spook the horses.
- **Spirits leak into balance** (SM-INV-9) — the most likely quiet erosion.
- **Region gating reads as a wall** — SM-INV-13's diegetic frame is the mitigation.

## Open questions (do NOT resolve unilaterally in a ticket — escalate)

1. **The Roamer's motives, and the concrete endgame beat.** *(Mostly resolved 2026-07-20 — the story
   spine is set; see "The Roamer.")* The through-line now has a direction and "beating the game" has a
   shape — completing the Roamer's arc: reopening the old trails, some reunion or release. Residual
   and still owner-only: (a) whether the Roamer is a benevolent guide or self-interested/not-fully-noble
   (colors tone, the doze frames, and whether reopening the trails is a gift or a mistake); (b) what
   the concrete *final* beat actually is. Do not invent the ending in a ticket.
2. ~~XP → region unlock: unit, curve, radius vs discrete regions.~~ **RESOLVED 2026-08-01.** The
   unit is **mission points**, not XP (SM-INV-14): 1 for a B or better, ½ for a C, 0 for a D. There
   is no curve — per-region counts are **authored** (**6·6·6·4·3·2 = 27** over six regions, against a
   day budget of 4·4·4·3·3·2; *was 5·4·4·3·3·2 until 2026-08-02*). Regions
   are **discrete macro tiles**, as FEAT-28 already assumed. Residual: whether the log drag counts
   toward its own region's total or sits on top of it.
3. ~~Whether region unlocks persist across runs.~~ **RESOLVED 2026-07-29 — they do not.** Trail
   clearance and region access are **run-layer**: logs stay cleared for the current run, death puts
   them back. Persistent map access would be *floor* and fails SM-INV-9's litmus test outright —
   **the deck widens, the map doesn't.** This resolves the tension on the SM-INV-7 side: every run
   genuinely re-earns its country, and the full chain must therefore fit in one surviving run (which
   is what bounds region count — see "Run shape and saving"). Consequence for authored content: the
   log-drag main mission splits into **the beat** (staged scene, once per profile, a story key on
   metaState) and **the labor** (chaining and clearing, every run) — see `missions.md`.
4. ~~Currency rates (lazy-day-negative / brave-day-positive is the constraint, not the tuning).~~
   **RESOLVED 2026-08-01 as a formula** — see "The performance model". The constraint became an
   identity: *a day driven entirely at par is break-even*, so below par profits and above par bleeds
   by construction. What remains is **one number to tune** (`k`, maintenance cost per second of
   par-driving), plus the day-tier steps and the threshold ramp. Tuning, not structure.
5. Camp quality: dimensions (water, fire, flat, shelter, *weirdness*?) and what they modify.
6. Mission failure currently costs nothing but opportunity. May be right (the fiction does
   the work) — or means there's no reason not to accept every job and bail. Unresolved.
   (Timed mission types partially answer this — their reward decays/zeroes — but the
   no-clock default mission still has no bail cost.)
7. ~~**Maintenance time + the day-cost of waiting**~~ **RESOLVED 2026-08-02.** A repair is priced in
   **money and in-game hours**, and accepting one is an **immediate time skip** — *engine to 50% for
   $1000 and 10 hours*, which eats most of a 16 h day. The clock is **paused** while you stand in the
   station deciding, so the cost is purely the daylight you commit, not wall-clock dithering. That
   makes the tow-vs-limp-vs-repair decision real without being run-ending on its own, and it is what
   gives "build the jalopy up in region 1, when days are cheap" its teeth. See `run-shape.md` → "The
   clock". **Energy drains across the skip, and paying someone else to do the work changes nothing** —
   ten hours at a station is ten hours awake. A morning repair therefore leaves ~6 h of energy and
   effectively ends the day, which is the point: a big repair *is* a day. **Sleep is the only skip that
   credits energy** rather than draining it. No residual.
8. **Two damage-model mechanisms flagged for owner OK** (proposals in "Damage, wear & repair"):
   the **head-gasket metric** (proposed: an overheat integral — time-above-threshold × severity)
   and the **suspension-damage trigger** (bump-stop over-travel distance vs. suspension-velocity
   threshold). Both read honest signals; pick at SM-3 planning.
9. **Forced progression: what pushes the player out of the easy early zones?** (owner, 2026-07-19,
   UNDECIDED — two live options, not mutually exclusive.) **Status 2026-07-29: (A) is the operative
   difficulty ramp** — SM-INV-14 makes XP *position against A's cost curve*, so A is now load-bearing
   for more than forced progression, and the cost-escalation curve and the XP curve are the same
   balance problem seen from two sides (tune them together or neither means anything). (B) is
   unaffected and gains a second argument: it is also a **supply-thinning mechanic** — an advancing
   front that consumes POIs shrinks the job board directly, so A and B squeeze from two sides (costs
   rise while available work falls). See `run-shape.md`. The problem: with a good car a player
   could grind zone 1 forever and never climb. Funds exist primarily to repair wear, secondarily
   for upgrade parts, so the lever is the repair economy. Two approaches on the table:
   - **(A) Cost-function escalation.** Service/parts costs climb over run-time (fiction: shortage /
     fuel prices / the world thinning out), while higher zones pay proportionally more — so zone 1
     goes net-negative and the mountains are where income outruns the rising floor. Number-go-*up*;
     old zones stay *accessible but unprofitable to grind*, preserving a rare reason to return (a
     specific mission item only found back down low). Owner likes this.
   - **(B) Spreading miasma / "storm."** A run-layer advancing front *consumes POIs*, pulling them
     out of the mission-producing and service-providing pools — the cheap early stations go out of
     business and the starter mission-givers go *missing* as it reaches them. This makes SM-INV-11's
     "people missing" the literal cause of A's effects (service effectively costlier because the
     cheap garage is gone; easy jobs dry because the giver is gone). Forced progression = fleeing
     the front. Could be the spatial *cause* behind (A) rather than an alternative to it.
   - **Shared constraints either way:** escalation is *within a run* (resets each run — SM-INV-7/8),
     not a meta power curve; it must **never be a direct kill** (SM-INV-1 — pressure routes through
     breakdown [no affordable/reachable service] or crash [in-storm hazard], never fog-instadeath);
     it must **not be a rendered countdown** (SM-INV-3 — the squeeze/front is chosen pressure, the
     economy can *be* the "quota" un-obfuscated without a meter); if built as a live front it's a
     **run-layer, flag-gated system** (SM-INV-12, doze/ambush precedent — POI positions stay
     deterministic, only alive/consumed status is run-layer); and old zones must stay reachable for
     the return-visit hook. **Resolving this likely retires the SM-INV-2 run-duration par clause** —
     escalation would move onto the cost/POI side (which has a story) off the par side (which has
     none). See also Q7 (day-cost of waiting).

10. **Classes vs SM-INV-7 first-run winnability** (owner, 2026-07-20). A class system is ratified
    (breadth, not floor — see "Classes"). Unresolved: is a class chosen at run start, or does it
    apply some other way? What does a class actually change — the objective it frames, the jalopy
    roll-space it draws from, which spirits/missions appear — and how is it kept *strictly breadth*
    so no class is simply stronger than another and the first available class keeps run 1 winnable
    (SM-INV-7)? And do classes gate content or only reshape play? Structure, not tuning — resolve at
    SM-4/SM-5 planning; escalate rather than deciding in a ticket.

**Resolved 2026-07-16:** timers (ex-Q2 → SM-INV-3 as amended); debug-panel ownership
(ex-Q8 → "Game modes": story mode locks out debug tooling, sliders fixed, story/difficulty
parameter states come from hard tooling, not realtime slider manipulation).

## Tensions with existing tenets — and their resolutions

| Existing tenet / decision | Tension | Resolution |
|---|---|---|
| HARD RULE: generators are pure fns of `(worldSeed, coords)` | Persistent world modifiers, story states | **RATIFIED 2026-07-29, reverting the 2026-07-16 widening**: the original hard rule stands — worldgen is `(worldSeed, coords)` and **no meta input reaches it**. Story escalation moves to a run layer, `(worldSeed, runState, coords)`, which resets on death; run-layer randomness (missions, jalopy, ambushes) is still free (SM-INV-12 as rewritten). *Superseded: "widen to `(worldSeed, metaState, coords)` for worldgen."* |
| Infinite free-roam world | Regions/bounded | **RESOLVED 2026-07-16 by mode split**: infinite world lives on in Free Roam mode; Story Mode is a region-bounded fork behind a main menu (see "Game modes") |
| Headless gate determinism | Doze, ambush timing, live mission state | Flag-gated live systems (FEAT-26 precedent); gates pin a default **`runState`** (2026-07-29 — was `metaState`) |
| Meta-progression = breadth, not floor (SM-INV-9) | The roster mechanism was spirits/characters-with-perks | **RATIFIED 2026-07-29**: the roster is a **garage** — unlocked *starting vehicles*, lateral not upward. Easier to keep honest than perks, because a vehicle's differences are physical and visible. Spirits/classes **deferred**, not deleted (see "The garage") |
| Parts are the upgrade path (SM-INV-10) | An obvious dealership/"buy a better truck" affordance | **RATIFIED 2026-07-29**: no in-run vehicle purchase (SM-INV-15). Aspiration is deep parts customization within one rig, plus unlocked *starting* vehicles chosen before the run |
| SM-INV-1 death is permanent | A 6-hour run needs saving, and a reloadable save destroys the loss economy | **RATIFIED 2026-07-29**: suspend-and-resume — one slot, written on quit, **deleted on load**, deleted on death. A pause button that survives closing the browser, not a checkpoint (see "Run shape and saving") |
| SM-INV-8 "the world persists" | Region/trail clearance persisting is a power *floor* (SM-INV-9) | **RATIFIED 2026-07-29**: clearance and region access are **run-layer**; SM-INV-8 narrowed to literacy + garage. The deck widens, the map doesn't. Resolves Open Q3 |
| USER-OWNED debug sliders (FEAT-06 etc.) | Story mode drives world params | **RATIFIED 2026-07-16**: story mode locks out debug tooling; sliders fixed; story/difficulty states baked via hard tooling |
| `feedback_emergent_over_injected` | — | **Alignment, not tension**: par derived from the router, cursed items emerging from honest physics, story as parameter states, damage read from real bump-stop forces — all this tenet applied to game design |
| Core value "physics that feel honest" | — | Alignment: missions reward driving at the limit; parts change behavior, not numbers |
| No damage model exists (noted in FEAT-26) | Breakdown death needs one | Build ONE wear/condition model (SM milestone 3) shared by economy wear and hazard impacts; **confirmed required 2026-07-16**, expected hard |
| Timers impossible to tune fairly in procedural world | Some missions want hard timers | **RATIFIED as amended 2026-07-16**: timed mission types allowed (reward decays/zeroes); timers must never drive ALL missions; par itself is never a clock (SM-INV-3) |
| `SM-INV-11` world-story = parameter states + doze, never scripted events | Character dialog is authored text | **RATIFIED 2026-07-16**: character/mission dialog rides a distinct **chat pane** (sequential cards, no options — see "Characters and dialog"); the world-story channel stays parameter states + doze. Boundary — how much story cards may carry — flagged for owner, not resolved |
| `SM-INV-11` "never scripted events" (absolute) | The Roamer through-line wants authored beats (cutscenes, dialogue-over-gameplay, doze visitations) | **RATIFIED 2026-07-20**: wall relaxed — authored beats permitted at deliberate threshold moments (e.g. region-gating main missions), **staged in-world** (carved world-space, not a separate cutscene layer); ambient world-story stays emergent. See "The Roamer" and amended SM-INV-11 |
| Meta-progression = breadth, not floor (SM-INV-9) | New **class system** (RPG-style roles unlocked by spirits/achievements/story/regions) | **RATIFIED 2026-07-20** in principle: classes are breadth (more shapes a run can take), never a power floor; first class keeps run 1 winnable (SM-INV-7). *How* a class stays strictly breadth is Open Question 10 |
| Region unlock = abstract gate (FEAT-28/SM-INV-13) | Story wants motivated, diegetic expansion | **RATIFIED 2026-07-20**: region barriers are the Roamer's **old trails**; expansion gated by authored **main missions**; FEAT-28 mechanism unchanged, story frame added |

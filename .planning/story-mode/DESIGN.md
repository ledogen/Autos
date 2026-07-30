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
a mission on the 2D map with an **accept** button before its start countdown, and later a
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
maintaining one rig (new **SM-INV-15**). (5) **Run shape fixed** — ~10 regions, 4–6 hours to beat,
24-minute days (~10–15 days per run), and **suspend-and-resume saving** (one slot, written on quit,
*deleted on load*, deleted on death). Downstream: Open Q3 is **resolved** (region unlock is
run-layer); SM-INV-11 is re-keyed to run progress; SM-INV-2's run-duration par clause is flagged for
retirement (see the note there — recommended, not yet ratified).

**Companion design notes** (downstream of this bible; where they disagree with it, *it* wins):
[missions.md](missions.md) (mission taxonomy, XP/payout scoring, the log-drag main mission),
[run-shape.md](run-shape.md) (run length, day length, saving), [opening.md](opening.md) (the day job,
the uncle), [items.md](items.md) (the items catalog — consumables, tools, parts, cargo, catch; an
asset burn-down surface), [spirits-and-pacts.md](spirits-and-pacts.md) (the spirit cast —
*deferred; carries four flagged conflicts with rules ratified since, see its header*),
[IDEAS.md](IDEAS.md) (the scratchpad), and
[design-amendments-2026-07-29.md](design-amendments-2026-07-29.md) (provenance for the pass above).

---

## The premise [RATIFIED]

RangerSim becomes a **roguelike**. A **run** is as many in-game days as you survive. You die
by **crashing** or **breaking down** — nothing else. Days are 24–48 real minutes. Every run
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
  runs stay lethal. *Par MAY scale with run duration* — it tightens ("gets lower") the longer
  a run survives, a global difficulty ramp keyed off run age, not the build. That's the sanctioned
  scaling axis: it pushes a maturing run harder without ever handing an upgrade back its own
  reward, because it's blind to what the player is driving. [DEFAULT — load-bearing; run-duration
  scaling clause RATIFIED 2026-07-19] **Flagged for retirement (2026-07-29 — recommended, NOT
  ratified):** with in-run cost escalation (Q9A) carrying the difficulty ramp and XP being position
  against that curve (SM-INV-14), the run-duration clause is redundant; Q9 already anticipated
  retiring it. Retiring it collapses `parGeometric` and `parEffective` into a single par and deletes
  a class of bookkeeping. **Until the owner rules, assume one par** (that is what `missions.md`
  assumes) — but do not delete the clause here without a dated ratification pass.
- **SM-INV-3 — Par is never rendered as a countdown; timers are a flavor, not the driver.**
  [RATIFIED as amended 2026-07-16] The par economy is a payout curve, felt as *how hard am I
  willing to push*, never *3:41 remaining* — putting par on the HUD makes the whole game a
  time trial. BUT hard timers are not banned: **some mission types** carry an explicit,
  visible, diegetic timer (running out reduces or eliminates the reward). The constraint is
  that timers must never become the main driver of all missions — they're one authored
  flavor among the mission types, and the default mission has no clock.
- **SM-INV-4 — Payout is margin against par; bare completion pays ~nothing.** [DEFAULT]
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
- **SM-INV-14 — XP is run-layer; it does not survive death.** [RATIFIED 2026-07-29] XP resets with
  the run, along with the map, the truck and the money. Persistent XP would let run 50 clear region
  1's gate instantly — that is a power floor and SM-INV-9's litmus test forbids it. XP is not
  meta-progression; it is a **within-run pacing resource** whose real function is *positional*:
  > A strong day one buys region 2 on day two. Because service and parts costs escalate with run
  > age (Q9A), arriving early means arriving **before the country gets expensive** — a wider margin
  > for something to go wrong. **XP is not progress. It is a head start against the cost curve.**

  This is what makes fast driving matter for *survival* rather than only for cash, and it does so
  with no rendered clock anywhere (SM-INV-3 intact). **The one hard constraint: XP must never
  increase with time taken** — any formulation where slow driving earns more XP reopens gate-farming.
  Scoring (`XP = parGeometric × (1 + k·marginRatio)`, `payout = absoluteSecondsUnderPar`) is
  **PROPOSED, not ratified** — see `missions.md` "Experience and payout".
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

Sleepiness is the per-run clock — soft, diegetic, no arrival deadlines. Get sleepy and you
start **dozing**: eyes close, controls drop, periods lengthen. Not a fail state (SM-INV-1);
the physics does the rest. Coffee is a loan: alert now, sleepy earlier tomorrow.

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
- **Payout = margin against par** (SM-INV-4). Currency rates must net **negative on a lazy
  day, positive on a brave one** — that's the whole balance problem in one line.
- **Two currencies off two inputs (2026-07-29).** **XP buys time; money buys parts.** XP is
  run-layer (SM-INV-14) and gates *when a region's main mission becomes available*; payout is cash.
  The scoring shapes — XP based on par and multiplied by margin *ratio*, payout scaled by
  **absolute seconds under par** — are worked through in `missions.md` and are **PROPOSED, not
  ratified**. The one settled constraint is that XP must never increase with time taken. Note also
  that **not every mission type is scored on margin**: coverage (the paper route), restraint
  (fragile cargo) and clearance (main missions) are separate axes, and freight's flat-rate payout
  deliberately bends SM-INV-4 — flagged there for explicit ratification.
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
- **Diagnostic screen:** a condition panel — the **FEAT-34 instrument cluster is its natural home** —
  surfaces every track, with the **air-filter warning** the critical, can't-miss one.

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

*Status of spirits:* the spirit system below is **not deleted — it is deferred.** The roster
mechanism is now vehicles; how spirits and classes relate to it needs its own pass. **Do not build
spirit-unlock plumbing against this section.**

### Run shape and saving [RATIFIED 2026-07-29]

Full working-through in [run-shape.md](run-shape.md); the ratified numbers:

- **~10 regions** at current region size · **4–6 hours** to beat · **24-minute days** (~10–15 days
  per run). The full trail chain must be completable in **one run** (SM-INV-7), since clearance is
  run-layer and resets on death — so region count is bounded by what one surviving run can reopen.
  That is a hard content constraint.
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
- **Dispersed-camping spurs (FEAT-38)** are a diegetic campsite feeder. Dirt tracks grow off the
  network into the empty back-country and peter out at scored clearings — the worldgen designating
  campable ground (SM-INV-6), with the dirt spur *being* the access. Prefer a spur-endpoint score
  that shares the camp-quality signal (flat, shade, water proximity) so FEAT-38 and the SM-1
  campsite placer / FEAT-21 siting rules read the same "good ground" field.
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
2. XP → region unlock: unit, curve, radius vs discrete regions (FEAT-28 assumes discrete
   macro-tile regions — the likely answer).
3. ~~Whether region unlocks persist across runs.~~ **RESOLVED 2026-07-29 — they do not.** Trail
   clearance and region access are **run-layer**: logs stay cleared for the current run, death puts
   them back. Persistent map access would be *floor* and fails SM-INV-9's litmus test outright —
   **the deck widens, the map doesn't.** This resolves the tension on the SM-INV-7 side: every run
   genuinely re-earns its country, and the full chain must therefore fit in one surviving run (which
   is what bounds region count — see "Run shape and saving"). Consequence for authored content: the
   log-drag main mission splits into **the beat** (staged scene, once per profile, a story key on
   metaState) and **the labor** (chaining and clearing, every run) — see `missions.md`.
4. Currency rates (lazy-day-negative / brave-day-positive is the constraint, not the tuning).
5. Camp quality: dimensions (water, fire, flat, shelter, *weirdness*?) and what they modify.
6. Mission failure currently costs nothing but opportunity. May be right (the fiction does
   the work) — or means there's no reason not to accept every job and bail. Unresolved.
   (Timed mission types partially answer this — their reward decays/zeroes — but the
   no-clock default mission still has no bail cost.)
7. **Maintenance time + the day-cost of waiting** (owner, 2026-07-19). How long does a station
   repair take — especially a busted engine — in in-game hours, and what does burning a day (or
   part of one) actually cost the run? The day-cost isn't just the clock: par may tighten with
   run age (SM-INV-2), sleepiness accrues, and missions expire — so "wait a day at the shop" has
   to hurt enough to make the tow-vs-limp-vs-repair decision real without being run-ending on its
   own. Tuning, not structure; log until the economy is being balanced.
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
| SM-INV-1 death is permanent | A 4–6 hour run needs saving, and a reloadable save destroys the loss economy | **RATIFIED 2026-07-29**: suspend-and-resume — one slot, written on quit, **deleted on load**, deleted on death. A pause button that survives closing the browser, not a checkpoint (see "Run shape and saving") |
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

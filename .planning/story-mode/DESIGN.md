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
  scaling clause RATIFIED 2026-07-19]
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
- **SM-INV-8 — What survives death is literacy and the world.** Not parts, not money, not
  the car. World state (permanent unlocks, generator parameter states) persists; a
  returning player isn't stronger, they're *fluent*. [RATIFIED]
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
- **SM-INV-11 — The world-story is delivered through generator parameter states and the doze,
  never scripted events.** The leaning trees, the enormous moon, dark at noon, people missing —
  parameter states, several already reachable with what's in the game. The doze (eyes
  closed for ~400 ms) is the only moment the game controls what the player sees — a frame
  of *something*. Pushing sleep is how you learn the story; the transgression *is* the
  looking. [RATIFIED premise / DEFAULT mechanism] *Scope (2026-07-16): this governs the
  surreal world-story — atmosphere, the through-line, what is happening TO the world. It does
  NOT forbid characters speaking to the player; that rides a separate channel, the **chat
  pane** (see "Characters and dialog"). "Never scripted events" means the world doesn't stop
  to narrate itself, not that a mission-giver can't tell you the milk's at the store.*
- **SM-INV-12 — Determinism discipline extends, not breaks.** [RATIFIED 2026-07-16] The
  split: **world, seed, terrain, and router generation stay deterministic** — pure functions
  of `(worldSeed, metaState, coords)` where `metaState` (unlocks, story parameter states) is
  an explicit versioned input that changes only at run/sleep/unlock boundaries — never
  mid-stream, never per-frame. **Runs have randomness and progression sprinkled in**: mission
  dressing, jalopy rolls, ambush timing, and story events may be freely random at the run
  layer. The line is worldgen vs run-layer — worldgen never gets visit-dependent. Headless
  gates pin a default `metaState` and stay deterministic; live-reactive systems (doze, ambush
  timing) are flag-gated off in gates (FEAT-26 already sets this precedent).
- **SM-INV-13 — Progression gates are diegetic.** Region locks are trail-closed barriers a
  ranger reopens (FEAT-28), not menu walls. XP-gating harder country needs an in-world
  frame or it fights the world premise. [DEFAULT]

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
- **Wear = f(time, intensity)** (SM-INV-5): hours driven and engine torque are both tracked
  and integrated over the run — rpm-hours, redline time, hard impacts, curb strikes,
  over-temp all feed the same accumulator. Breakdown (wear floor) is the second death. There
  is no damage model today — this is a new, cheap, out-of-hot-loop subsystem, and it should
  be ONE model shared with hazard impacts (FEAT-26 asks "what does a rock hit do" — same
  answer). Practically, this is the mechanism behind the two driving modes: mission legs run
  hot against a par deadline and eat wear; the freeroam legs picking the next mission or
  exploring between jobs are where a player who wants to protect the truck backs off the
  throttle and drives casually.
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

### The car: jalopy + parts [RATIFIED premise, DEFAULT details]

Run start: parts randomized from a pool of crap (SM-INV-7). Parts are architecture choices,
not stat sticks (SM-INV-10) — open vs LSD diff, power, tires. FEAT-23's drivetrain
architecture + parts-selector phases are the substrate; the jalopy generator is a seeded
roll over that same architecture space. Mid-run finds (an LSD in a barn) are events.

### The world: regions, story states, spirits

- **Region unlock = FEAT-28.** The connectivity-validation gate and the progression gate are
  the same mechanism and the same in-world object (trail-closed barrier). Story beats/XP
  trigger unlock; unlock triggers validation. Bounded-but-expanding is an accepted trade
  (recorded in FEAT-28) — it buys "every unlocked area is fully drivable," which infinite
  streaming can never promise.
- **Story = parameter states** (SM-INV-11), keyed off metaState (SM-INV-12). Sky/time-of-day
  (src/sky.js), prop palette params, terrain params, prop history states (FEAT-32 logged
  forest), and **road surface class** (FEAT-38 dirt-road prevalence) are the delivery surface —
  a region reading civilised-and-paved vs. wild-and-dirt is a baked per-region parameter, not
  authored text.
- **Dispersed-camping spurs (FEAT-38)** are a diegetic campsite feeder. Dirt tracks grow off the
  network into the empty back-country and peter out at scored clearings — the worldgen designating
  campable ground (SM-INV-6), with the dirt spur *being* the access. Prefer a spur-endpoint score
  that shares the camp-quality signal (flat, shade, water proximity) so FEAT-38 and the SM-1
  campsite placer / FEAT-21 siting rules read the same "good ground" field.
- **Spirits** are permanent, unremovable, player-earned world additions (found the rare
  campsite once → the camping spirit is in every run, forever). Rules, not resources
  (SM-INV-9). The player accumulated the weirdness voluntarily by going too far; there is
  no button to put it back.
- **Meta-progression is roguelike breadth, not a power curve** (SM-INV-9, Isaac / Gungeon
  model). Replaying deepens the game by widening the pool of things a run can contain and the
  *shapes* a run can take — never by making you start stronger (SM-INV-7 keeps the first run
  winnable). Two expanding pools:
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
and character banter) the cards may carry before they become the "scripted events" SM-INV-11
forbids. Default read: cards frame missions and give characters a voice; the surreal through-line
stays in parameter states and the doze. If a story beat wants a card to carry the world-story
itself, stop and escalate rather than assuming the pane is licensed for it.

## Failure modes to watch (from the design conversation)

- **Par-scoring eats the tone.** If every mission is the same number, this is a time trial
  with charming skins. Need mission types where par isn't the axis — arrive with the eggs
  unbroken, don't spook the horses.
- **Spirits leak into balance** (SM-INV-9) — the most likely quiet erosion.
- **Region gating reads as a wall** — SM-INV-13's diegetic frame is the mitigation.

## Open questions (do NOT resolve unilaterally in a ticket — escalate)

1. Where the story actually goes; whether "beating the game" means anything concrete.
2. XP → region unlock: unit, curve, radius vs discrete regions (FEAT-28 assumes discrete
   macro-tile regions — the likely answer).
3. Whether region unlocks persist across runs. SM-INV-8 says the world persists; SM-INV-7
   says every run can beat the game. If "beating" requires deep regions, a fresh profile's
   run 1 must still be able to get there (long run) — reconcile when the endgame is defined.
4. Currency rates (lazy-day-negative / brave-day-positive is the constraint, not the tuning).
5. Camp quality: dimensions (water, fire, flat, shelter, *weirdness*?) and what they modify.
6. Mission failure currently costs nothing but opportunity. May be right (the fiction does
   the work) — or means there's no reason not to accept every job and bail. Unresolved.
   (Timed mission types partially answer this — their reward decays/zeroes — but the
   no-clock default mission still has no bail cost.)

**Resolved 2026-07-16:** timers (ex-Q2 → SM-INV-3 as amended); debug-panel ownership
(ex-Q8 → "Game modes": story mode locks out debug tooling, sliders fixed, story/difficulty
parameter states come from hard tooling, not realtime slider manipulation).

## Tensions with existing tenets — and their resolutions

| Existing tenet / decision | Tension | Resolution |
|---|---|---|
| HARD RULE: generators are pure fns of `(worldSeed, coords)` | Persistent world modifiers, story states | **RATIFIED 2026-07-16**: widen to `(worldSeed, metaState, coords)` for worldgen; run-layer randomness (missions, jalopy, ambushes) is free (SM-INV-12) |
| Infinite free-roam world | Regions/bounded | **RESOLVED 2026-07-16 by mode split**: infinite world lives on in Free Roam mode; Story Mode is a region-bounded fork behind a main menu (see "Game modes") |
| Headless gate determinism | Doze, ambush timing, live mission state | Flag-gated live systems (FEAT-26 precedent); gates pin default metaState |
| USER-OWNED debug sliders (FEAT-06 etc.) | Story mode drives world params | **RATIFIED 2026-07-16**: story mode locks out debug tooling; sliders fixed; story/difficulty states baked via hard tooling |
| `feedback_emergent_over_injected` | — | **Alignment, not tension**: par derived from the router, cursed items emerging from honest physics, story as parameter states, damage read from real bump-stop forces — all this tenet applied to game design |
| Core value "physics that feel honest" | — | Alignment: missions reward driving at the limit; parts change behavior, not numbers |
| No damage model exists (noted in FEAT-26) | Breakdown death needs one | Build ONE wear/condition model (SM milestone 3) shared by economy wear and hazard impacts; **confirmed required 2026-07-16**, expected hard |
| Timers impossible to tune fairly in procedural world | Some missions want hard timers | **RATIFIED as amended 2026-07-16**: timed mission types allowed (reward decays/zeroes); timers must never drive ALL missions; par itself is never a clock (SM-INV-3) |
| `SM-INV-11` world-story = parameter states + doze, never scripted events | Character dialog is authored text | **RATIFIED 2026-07-16**: character/mission dialog rides a distinct **chat pane** (sequential cards, no options — see "Characters and dialog"); the world-story channel stays parameter states + doze. Boundary — how much story cards may carry — flagged for owner, not resolved |

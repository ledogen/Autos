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

**Ratification pass 2026-07-16** (project owner): determinism amendment blessed (SM-INV-12);
game-mode split defined (see "Game modes" below); debug lockout in story mode ratified
(ex-open-question 8); timers amended — NOT off the table, just not the universal driver
(SM-INV-3 rewritten, ex-open-question 2); damage/wear model confirmed required and expected
to be hard (see "The economy").

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
3. **Wear runs on time and abuse, not distance.** Two hours at 3000 rpm is two hours on the
   engine whether you covered 40 km or 90. Honest, and it means crawling costs *more* per mile.

Together: the safe strategy is a slow bleed. The player does the arithmetic around day three
and starts driving at the limit **by choice**. The game never asked.

## Invariants

These are the load-bearing walls. Cite them in tickets and code comments as `SM-INV-N`.

- **SM-INV-1 — Death is crash or breakdown only.** No other fail states. Dozing is not a
  fail state; it hands a mountain road to a driver with their eyes shut and lets the
  physics decide. [RATIFIED]
- **SM-INV-2 — Par never scales with the car.** Fixed reference friction, road geometry
  only. If a better build raises par, every upgrade quietly hands back its own reward and
  the flywheel stalls. A better car raises *payout*, not lowers *risk* — the player drives
  at their own limit regardless of what's underneath, which is where crashes live. Godlike
  runs stay lethal. [DEFAULT — load-bearing]
- **SM-INV-3 — Par is never rendered as a countdown; timers are a flavor, not the driver.**
  [RATIFIED as amended 2026-07-16] The par economy is a payout curve, felt as *how hard am I
  willing to push*, never *3:41 remaining* — putting par on the HUD makes the whole game a
  time trial. BUT hard timers are not banned: **some mission types** carry an explicit,
  visible, diegetic timer (running out reduces or eliminates the reward). The constraint is
  that timers must never become the main driver of all missions — they're one authored
  flavor among the mission types, and the default mission has no clock.
- **SM-INV-4 — Payout is margin against par; bare completion pays ~nothing.** [DEFAULT]
- **SM-INV-5 — Wear accrues on time + abuse, never distance.** [DEFAULT]
- **SM-INV-6 — Camping is a place, not a button.** You sleep only at sites the worldgen
  made (lakes, meadows, flat ground). The first yawn must mean "I am N km from anywhere
  I'd want to wake up," not a menu prompt. The last leg of the day is the game. [DEFAULT]
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
  to erode quietly, one reasonable-seeming buff at a time — watch it. [DEFAULT — load-bearing]
- **SM-INV-10 — Parts are described, never scored.** No number on a part, ever. An LSD
  doesn't grant +5 handling; it changes what the truck does when you get greedy mid-corner.
  Power mods on an open-diff RWD truck are a *worse car* for a driver without the literacy —
  that's a cursed item nobody had to author, and it only works because nothing is hidden.
  [DEFAULT]
- **SM-INV-11 — Story is delivered through generator parameter states and the doze, never
  scripted events.** The leaning trees, the enormous moon, dark at noon, people missing —
  parameter states, several already reachable with what's in the game. The doze (eyes
  closed for ~400 ms) is the only moment the game controls what the player sees — a frame
  of *something*. Pushing sleep is how you learn the story; the transgression *is* the
  looking. [RATIFIED premise / DEFAULT mechanism]
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

Camping is a place (SM-INV-6). The day's shape: work → read your eyelids → break off →
hunt a site → arrive before you're dangerous. Accepting a mission is a bet against
remaining alertness. Camping mid-mission kills the job — milk spoils, the guy gets away;
the fiction supplies the penalty, no payout math needed. Sleep somewhere bad → bad night:
no fire, no fish, wake half-tired, tomorrow's budget already in debt — a run ending in
slow motion, legible the whole way down.

### The economy: par, payout, wear [DEFAULT]

- **Par oracle:** fixed-reference point mass on a friction circle, integrated over the
  route's arc primitives (curvature + grade already there). Physics-honest, free, scales
  with region difficulty. See ticket FEAT-29.
- **Payout = margin against par** (SM-INV-4). Currency rates must net **negative on a lazy
  day, positive on a brave one** — that's the whole balance problem in one line.
- **Wear = f(time, abuse)** (SM-INV-5): rpm-hours, redline time, hard impacts, curb strikes,
  over-temp. Breakdown (wear floor) is the second death. There is no damage model today —
  this is a new, cheap, out-of-hot-loop subsystem, and it should be ONE model shared with
  hazard impacts (FEAT-26 asks "what does a rock hit do" — same answer).
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
  (src/sky.js), prop palette params, terrain params are the delivery surface.
- **Spirits** are permanent, unremovable, player-earned world additions (found the rare
  campsite once → the camping spirit is in every run, forever). Rules, not resources
  (SM-INV-9). The player accumulated the weirdness voluntarily by going too far; there is
  no button to put it back.

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

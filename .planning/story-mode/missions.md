# Autos — Missions

*Working design notes. **Downstream of `DESIGN.md`** — where this document and the bible disagree,
the bible wins. Invariant citations below are `SM-INV-N` per DESIGN.md.
Companions: `opening.md`, `spirits-and-pacts.md`, `items.md`, `IDEAS.md`.*

**Reconciled against DESIGN.md 2026-07-29**, then updated with the owner decisions of the same date.
Where DESIGN.md has not yet absorbed those decisions, see `design-amendments-2026-07-29.md` — it is
newer than the bible.

### Status board

| Decided | Open |
|---|---|
| Four scoring axes; three delivery types (§1, §3a, §3b) | Job discovery + expiry model (§"The job board") |
| XP run-layer, base-from-par × margin bonus | Exact `k` in the XP margin term |
| Payout on absolute seconds under par | Restraint ceiling: hard-fail vs graded (§3b) |
| Time trials live in-run | Comparability between players — parked |
| Main mission = log drag; beat/labor split | Whether the final drag must be unsurvivable |
| Clearance is run-layer | — |

---

## What a mission is

Missions are **hand-authored types with procedural dressing**. The world is procedural; the mission
*shapes* are not. A type defines a scoring axis and a failure mode; the dressing supplies who asked,
what for, and where.

Mission-giver speech rides the **chat pane** — sequential cards, no options, dialog received rather
than negotiated. That is the character channel and it is *not* the world-story channel (SM-INV-11).
A giver can tell you the milk's at the store; a giver never tells you why the trees lean.

---

## The scoring axes

Mission types are not flavors of the same activity. They differ in **what is being measured**.

| Axis | Measures | Pays in | Fails when |
|---|---|---|---|
| **Margin** | Time against par | Currency, scaling with seconds saved | Never hard-fails; bare completion pays ~nothing (SM-INV-4) |
| **Coverage** | How much of a fixed inventory you place before the budget runs out | Currency per unit delivered | Budget expires with stock unplaced |
| **Restraint** | Shock and impulse into the cargo | Flat rate; the cost is time | Cargo is broken |
| **Clearance** | Objects removed from a blocked trail | Region access | Never — progress is world state |

DESIGN.md's own failure-mode list names the risk this table exists to manage: *par-scoring eats the
tone.* If every mission resolves to the same number, this is a time trial with charming skins. The
bible asks for types where par isn't the axis — "arrive with the eggs unbroken, don't spook the
horses." Coverage, restraint, and clearance are the answer to that ask.

Adding a fifth axis is a design act. Adding a fifth *dressing* is a content act.

---

## Experience and payout

Two currencies off two inputs.

**XP is run-layer.** It resets on death with everything else (amendment §3). It is not
meta-progression — it is a **head start**:

> A strong day one buys region 2 on day two. Because service and parts costs escalate with run age
> (Q9A), unlocking early means arriving in expensive country **before it gets expensive**. That's a
> wider margin for something to go wrong later. **XP is not progress. It is position on the cost
> curve.**

This is what makes fast driving matter for *survival* and not only for cash — and it does it with no
rendered clock anywhere (SM-INV-3 intact).

**Scoring:**

```
XP     = parGeometric × (1 + k · marginRatio)
payout = absoluteSecondsUnderPar
```

**Base from par.** Par is a duration derived from route geometry, so it already contains length *and*
difficulty — a long mountain route out-pars a short valley one for both reasons. No separate distance
term is needed, and the number of jobs required per region falls out on its own (see `run-shape.md`).

**Margin multiplies it**, because driving a fast route should unlock the next region sooner. The
ratio form (not absolute) keeps long roads worth more than short ones at equal skill.

> **The one hard constraint: XP must never increase with time taken.** Any formulation where slow
> driving earns more XP reopens gate-farming, which is the exploit this whole scheme exists to close.

**Payout is absolute seconds saved, not a ratio.** Ratio payout makes short missions the most
profitable thing in the game — ten seconds off a sixty-second errand is an enormous ratio; ten
seconds off a ten-minute haul is noise, and the player optimizes into a loop of tiny jobs. Absolute
seconds inverts it: **same driving quality, more road, more money.** It also serves the balance
constraint directly (Q4): lazy day net-negative, brave day net-positive.

> **XP buys time. Money buys parts.**

**Interaction with the night-owl spirit.** *(Spirits are deferred — see amendment §4. Retained
because the interaction is instructive.)* A spirit paying more for missions run while sleepy,
conditioned on the dangerous state (SM-INV-9), compounds against absolute-seconds payout: the largest
single payday in the game becomes **a long haul driven tired**. The seduction becomes a specific,
nameable temptation rather than a percentage.

**Note on SM-INV-2.** Its run-duration par ramp appears redundant now that cost escalation carries
the difficulty ramp. If it retires (Q9 anticipates this), `parGeometric` and `parEffective` collapse
into one par. Assume one par until told otherwise.

---

## Catalog

### 1. Point-to-point errand — **margin**

The canonical type. Someone needs a thing taken somewhere. Mom needs milk.

Governed by SM-INV-2 (par never scales with the car), SM-INV-3 (par is never a rendered countdown),
SM-INV-4 (payout is margin; bare completion pays ~nothing).

*Open (bible Q6):* this type has no bail cost. Nothing stops the player accepting every job and
abandoning the ones going badly. Unresolved in the bible; not resolved here.

### 2. The paper route — **coverage**

The first real mission type. Given by the uncle (see `opening.md`).

**Shape:** a fixed stack of papers, a wide fan of delivery POIs, and roughly half a day to place as
many as possible. Payout per paper delivered.

- **Genre heritage** — the classic driving-game onboarding, descendant of *Paperboy*.
- **Teaches quietly** — reading the map, planning a route, hitting precise targets, working a budget.
- **Low stakes** — a missed throw costs a tip, not a mission failure. A tutorial that isn't one.
- **Freedom contrast** — actual movement, and better money than standing at a register.

**The budget is a day-fraction, not a clock.** The route ends when the light goes. Zero per-mission
tuning. The paper stack supplies a second, harder cap, so the mission self-limits by inventory as
well as by daylight. Note this doesn't *need* the SM-INV-3 timer allowance — it isn't a timer, it's
an inventory and a sunset.

**Route selection** improves as the player proves themselves, granted by the uncle rather than a
skill bar. See `opening.md`.

*Open:* this is a **second progression axis** alongside XP → region unlock. Worth deciding
deliberately rather than inheriting, and probably shouldn't generalize past the uncle.

### 3. The three delivery types [RATIFIED 2026-07-29]

Delivery is not one mission with variants. It's three, separated by **what the cargo does to the
truck and what the truck does to the cargo**.

| | mass | scored on | payout shape | the fear |
|---|---|---|---|---|
| **3a. Point-to-point** | light | time vs par | absolute seconds under par | crashing; earning nothing |
| **3b. Fragile** | light to medium | shock / impulse events | flat rate; slowness is the cost | grandma's vase |
| **3c. Freight** | **heavy** | delivery, plus what it cost you | flat rate by mass × distance | the truck |

#### 3a. Point-to-point — **margin**

Light, fast, all about time. Higher risk and higher reward than the other two. This is the canonical
margin mission (see §1) with an explicit "carries nothing that limits you" framing.

#### 3b. Fragile — **restraint**

Cargo that breaks. Not necessarily heavy. Graded against **impacts, bumps, and rough impulse from
driving quickly over rough surfaces** — *you broke grandma's vase.* **Slowness is the downside**;
there is no additional authored penalty.

**The signal is vertical shock, not lateral g.** An earlier draft specified a cornering g-ceiling.
Corrected: the honest signals are **bump-stop over-travel** and **suspension-velocity / vertical
acceleration spikes** — exactly what the damage model already reads for suspension wear
(emergent-over-injected; same plumbing, different consumer).

**This is the mission type that makes surface class matter.** Under FEAT-38, dirt-road prevalence is
a baked per-region parameter. Fragile cargo punishes speed on rough surfaces specifically, so route
choice becomes real: **the paved detour versus the dirt shortcut** is a decision the player makes
*because of the cargo*, not because a rule said so. No other mission type exercises FEAT-38 this
directly.

**Why the slowness needs no penalty attached.** Time is already the scarce resource — the cost curve
rises with run age and XP velocity is position against it (see Experience and payout). A slow mission
costs you the cost curve. The economy supplies the downside for free.

*Open:* whether breakage is **binary** (broke / didn't, a hard fail like a puncture) or **graded**
(condition on arrival scales payout). Binary keeps restraint a real constraint; graded lets a bad
pothole cost rather than end. Binary is the recommendation — a graded ceiling collapses the axis back
onto margin, since the player pushes hard and eats the penalty.

#### 3c. Freight — **heavy, and mass does the work**

Heavy cargo that **damages the vehicle by being heavy**. The restraint isn't imposed by a rule — a
loaded truck *cannot* corner hard, and if you try, it rolls. **Emergent over injected: the load is
the reason you drive carefully.**

**No new wear plumbing.** Mass is already real load that shifts CoG (bible: *"a load, never a
stat"*). Everything follows from turning that number up:

| Track | Effect | Why |
|---|---|---|
| Engine | **heavy cost** | more torque-hours at the same speed and grade (SM-INV-5) |
| Brakes | **heavy cost** | more kinetic energy → larger ∫(brake torque × time) |
| Suspension | **heavy cost** | sitting nearer the stops, bumps that were harmless now cross the no-harm floor |
| Radiator | **the interesting one** | sustained load on a long grade is what marginal early-game cooling cannot survive |

That last row is worth building for deliberately. Early cooling is *designed* marginal, and the
overheat → power loss → engine wear → blown head gasket chain is fully specified and currently
exercised by **nothing** in the mission catalog. A heavy load on a long climb is the chain's natural
trigger.

**Payout must be a flat rate scaled by mass and distance**, paid on delivery. A slow mission has no
margin, so SM-INV-4's "bare completion pays ~nothing" cannot govern it. *This is the one place these
mission types bend a stated invariant* — flagged deliberately rather than slipped in. The bible's own
failure-mode list asks for types where par isn't the axis, so the bend is licensed in spirit; it
should still be ratified explicitly.

**Freight is training for the boss.** It teaches what the truck does under load — heat, brakes,
weight transfer — before the Roamer asks the player to destroy it doing exactly that. And a pallet in
the bed and a log on a chain are close enough that building one makes the other cheaper.

**Watch:** if the load is too light this is the most boring mission in the game. What saves it is the
truck being *audibly* near its limit — needle climbing, note dropping on the grade, a gear you didn't
want. If a freight run ever feels like slow driving rather than a struggling animal, the load is
wrong.

### 4. Timed types — **licensed, undesigned**

SM-INV-3 as amended already permits them: **some mission types carry an explicit, visible, diegetic
timer**, where running out reduces or zeroes the reward. The surviving constraints are that timers
must never drive *all* missions, and that **par itself is never put on the HUD** — a rendered par is
what turns the whole game into a time trial.

The bible also notes (Q6) that timed types partially answer the bail-cost problem, since their
reward decays. That makes them worth more than flavor.

### 5. Time trial — **margin, undressed** [RATIFIED 2026-07-29: in-run]

A stretch of road, versus par, with nothing on top. No cargo, no client, no fiction. **Lives inside a
run**, as another earner. Needs no invariant exception — SM-INV-3 already licenses visible timers on
specific types; the only rule it must respect is that its clock is its own and the general par HUD
stays off.

Its structural property is that it's the **only repeatable type**: every other mission is
procedurally dressed onto a fresh route, while a time trial is a fixed piece of geometry. Whether that repeatability is ever
used for comparison between players is open — see leaderboards below.

### 6. Cargo integrity — **folded into 3b**

"Arrive with the eggs unbroken. Don't spook the horses." Named in DESIGN.md's failure-mode list as the
mitigation for par-scoring eating the tone. **The fragile delivery type (§3b) is now this**, with a
concrete signal attached. No separate type needed.

"Don't spook the horses" is doing quiet thematic work now that the car is the horse.

### 7. The pursuit — **margin**, undesigned

Someone is chasing you and you have to outrun them. Named in the premise as core dressing; the
scoring shape has never been specified. Probably margin against a pursuer rather than against par,
which would make it the first type where the reference is dynamic rather than geometric — a real
deviation from the par philosophy if it goes that way.

---

## Main missions: region unlock (the boss)

### Placement in the bible

Region unlock is FEAT-28's trail-closed barrier, framed as **the Roamer's old trails** and **gated by
authored main missions that drive the player to a place** (SM-INV-13, ratified 2026-07-20). The
mission below is a candidate main mission — an **authored in-world beat at a threshold moment**,
which is precisely the case SM-INV-11's relaxation was written for. No new category is needed.

**Gating chain:** XP gates *when the main mission becomes available*; the main mission gates *the
region*. The bible is explicit that the story should pull the player outward rather than a bare XP
threshold doing it, so XP is the pacing floor, not the gate itself. Roughly five or six jobs before
the first one.

### Shape

Logs are down across the trail. The player chains onto them and drags them clear. Snatching a log —
running the chain slack, accelerating, taking the load hard — is the core interaction, and it
repeatedly damages the vehicle.

**The chain is why this works mechanically.** A chain is a one-sided distance constraint: zero force
while slack, hard tension when taut. Cheap on the existing rigid-body solver, and it produces the
feel directly. The impulse transmitted into the chassis on each snatch **is** the damage signal —
read by the same condition model that reads bump-stop force and collision magnitude. Emergent over
injected; no authored damage values.

It also hits the tracks the rest of the game doesn't. Snatch loads read as driveline shock, hard
suspension travel, and clutch/engine strain — not tire wear or brake heat. The boss is expensive in a
*different* currency than the missions that funded it.

### Three rules

**1. Logs on graded, sloped sections.** High wear alone is a chore, not a boss — wear is slow and
legible and doesn't threaten. Put the logs on shelf road and a bad snatch pulls the truck sideways
above a drop, where the existing physics does the rest. Crash remains the only death (SM-INV-1) and
the boss becomes genuinely capable of delivering one. Log placement is also a difficulty dial the
router hands you for free.

**2. Clearance is run state. It resets when the run resets.** [RATIFIED 2026-07-29]

Logs stay cleared for the current run; death puts them back. Progress within a run is preserved, so a
failed attempt never strands you — spend the truck, limp to town, repair, come back to a
partly-opened trail. Death wipes it alongside the truck and the money, which is symmetric with
everything else the run loses.

**This is SM-INV-9 enforcing itself.** Persistent map access would be *floor* — it makes late runs
comfortable and fails the litmus test outright. Spirits, classes, and story keys are *breadth* and
must persist. The line falls exactly where the invariant already put it: **the deck widens, the map
doesn't.**

*Bearing on Open Q3:* if the trail barrier is the region gate (FEAT-28), region access is per-run
too. That resolves Q3 on the SM-INV-7 side — every run genuinely re-earns its country.

**Consequence — the beat and the labor must split.** If clearance resets, **every run re-drives the
log drag.** Authored beats do not survive repetition; the dark-at-8am morning is devastating once and
tedious on run five. So the mission is two things on two layers:

| | layer | persistence | legality |
|---|---|---|---|
| **The beat** — the staged in-world scene, the Roamer's first word on this trail | metaState | once per profile; it's a **story key** | SM-INV-8/9 — exactly what the Roamer's economy deals in |
| **The labor** — chaining on, snatching, clearing | run-layer | every run | SM-INV-7 / SM-INV-12 |

Second run, same trail: no beat, just logs. That reads as an improvement rather than a compromise —
the road is *silent* the second time. The Roamer already said his piece, and now you just do the work.

**Consequence — the drag must be short.** A once-per-profile ordeal can be long. A once-per-run gate
cannot, or it becomes the chore standing between run 40 and the interesting country. Scale by **log
count and slope**: the first region is two or three pulls on gentle grade; later trails are longer and
steeper.

**Consequence — the whole chain must fit in one run.** SM-INV-7 requires a single run to be able to
beat the game, and every run reopens every trail. So the number of regions is bounded by what one
surviving run can plausibly reopen. That is a hard content constraint and it is worth knowing before
regions get authored.

**3. It fails soft or not at all.** There is no failure state, only a truck that can't take another
pull today.

### The Roamer

The Roamer is a spirit of the player's own past self, who rode these lands on horseback before there
were roads. The region barriers are **their** old trails. Reopening them is what the Roamer wants.

**This fixes the motive ordering.** The player already knows shortages come from closed roads and
doesn't act, because knowing a thing is broken isn't the same as it being yours. What the Roamer
supplies is not information and not duty — it's **recognition**. The road was yours.

Which sharpens the pair at the front of the game, and the pair maps cleanly onto the two delivery
channels:

| | gives you | channel |
|---|---|---|
| **The uncle** | someone else's route | chat pane — sequential cards, mundane, a guy with a van |
| **The Roamer** | your own | staged in-world beats, the doze, parameter states |

The uncle is the *only* early character, and he is deliberately not supernatural. That matters more
now: the chat pane and the staged beat are different channels, and the player learns the first one
from someone entirely ordinary before the second one ever opens.

**Economy compliance.** The Roamer trades in knowledge, unlocks, and story keys — never resources or
run-layer power (SM-INV-8/9). The boss pays in **region access** and nothing else. No parts, no cash,
no wear relief. Access is the only clean payment.

**The wear cost is thematically load-bearing.** The car is the horse. Chaining onto a log and
snatching it is what wears a horse out. The bible already names the knife this buys: *if the
horse-that-is-your-car can be ridden to death by a guide who needs you more than they love you, the
wear economy gains stakes no timer could give it.* This mission is the most concrete instance of that
sentence in the design — it is the Roamer asking you, specifically, to spend your truck.

**Open Q1 is owner-only and not touched here.** Flagging only that this mission is unusually good
evidence for the with-teeth reading, and that it plays fine under the benevolent reading too. The
mission doesn't force the answer, which is the right property for it to have.

### Thematic note

Expansion by **maintenance rather than conquest** — and under the Roamer frame, not maintenance of
the world's roads but **restoration of the player's own range**. Every region reachable is a trail
the player reopened by hand, at the cost of the machine they reopened it with. The game never once
said the trail was closed for a bad reason.

---

## Community times / leaderboards *(deferred — requires a server)*

An ambition, not a plan. Two things are worth recording because they're cheap now and expensive later;
the third is explicitly unresolved.

**1. Worldgen is meta-free, so a seed is a shared world.** An earlier draft had `metaState` in a board
key, because SM-INV-12 then made worldgen a function of it — two players with different story progress
generated different terrain. The 2026-07-29 ruling removes that: a seed means the same thing for
everyone. This is what makes **daily seeds** possible at all, and it's the main reason boards are
tractable in principle.

**2. The replay system is already the anti-cheat.** Deterministic physics plus input replay — built for
regression testing — means a submitted time is a submitted *input trace*, re-simulated headless
server-side and verified. That matters regardless of how comparison is eventually framed, because
Free Roam has every slider live: a time can never be trusted for *where* it ran, only because a trace
re-simulates to it. Same data is ghost data.

*Flag (see `run-shape.md`):* traces should be **per-route, not per-run**, so a mid-run save boundary
never breaks a submission.

**3. Comparability is unresolved and parked.** [2026-07-29] Two players' times on the same road aren't
comparable while their trucks differ, and the fix is downstream of a question that hasn't been
answered: **how much the vehicle is player-customizable at all.** "You drive what you find" and "you
build a truck" are different games and they imply different answers here. A route+build sharing hash
was sketched and **set aside** as premature. Don't rebuild it until the customization question lands.

## The job board — discovery and expiry *(OPEN — owner wants more discussion)*

Not settled. Recorded because the shape of the question matters more than any answer proposed so far.

**Two owner leanings, 2026-07-29:**

1. **Missions expire and re-roll.** You can't hoard a good board.
2. **Missions are not visible from the map.** You learn what a POI is offering by **driving there**.

**Why (2) is the strong idea.** It converts the choice from *optimization* to *exploration under
uncertainty*. A browsable board with visible timers makes the player compare rows in a list — that's
spreadsheet play, and the game is not about spreadsheets. Hidden missions make the question:

> *Do I take this one, or spend driving time finding something better?*

**And the cost of searching is driving**, which is the only thing this game is actually about. That's
the argument: it converts deliberation into gameplay rather than into UI.

**The risk** is tedium — five minutes to a POI to find a job you don't want, repeatedly.

**Proposed mitigation (unratified): partial information via POI identity.** The POI *type* is visible
on the map and telegraphs the mission *family*, while the specifics stay hidden until you arrive. A
sawmill means freight. A house means an errand. A shop means a delivery. So the player is never
blind — they're choosing which *kind* of uncertainty to drive toward. That keeps informed routing
without restoring the browsable list.

**Interactions to resolve alongside it:**

- **Supply is now POI density, not a job count** (see `run-shape.md`). Overprovisioning means enough
  live POIs in reach, not enough rows on a screen.
- **Expiry plus hidden state means you cannot plan a day, only a direction.** That is probably the
  desired feel, and it should be confirmed rather than discovered.
- **It changes what the uncle is.** He's a fixed, known giver with a known job type — under a hidden
  board he becomes the one reliable thing on the map, which strengthens him considerably (see
  `opening.md`).
- **Q6 (no bail cost)** softens on its own here: with supply exceeding demand and hidden contents,
  abandoning a job costs the hours and wear spent with nothing to show, against a rising cost floor
  and a 24-minute day. Not a resolution — Q6 is owner-only — but the pressure is real.

## Early escalation ladder

1. Paper route
2. Pizza / food delivery
3. Courier runs
4. Taxi
5. *(later)* higher-stakes / dangerous driving jobs

This is a **fiction** ladder, not an axis ladder — steps 2–4 are all point-to-point margin missions
with different dressing. Fine for onboarding, but axis variety has to come from elsewhere: the paper
route (coverage), fragile (restraint), freight (mass), and the main missions (clearance).

---

## Gap: the world as antagonist

Every job type is a contract with a person. The main missions come closest — the trail is blocked
whether or not anyone asks — but the Roamer still supplies the motive.

The world-as-subject channels that exist (parameter states, the doze) all sit *outside* the mission
system by design, and SM-INV-11 keeps them there. So this may not be a gap so much as a boundary. But
the miasma/storm option in Open Q9 would create world-as-antagonist pressure without any mission type
carrying it — worth watching whether that fills the hole or makes it more obvious.

---

## Change log

**2026-07-29 — reconciliation against DESIGN.md.** Wear language corrected to *time + engine
intensity* (SM-INV-5). Timer "exception" for time trials withdrawn — SM-INV-3 as amended already
licenses timed types. XP/par split added for SM-INV-2's ramp. Cargo integrity reinstated from
DESIGN.md's failure-mode list. Leaderboard key corrected, then largely parked.

**2026-07-29 — owner decisions.** XP is run-layer and gains a margin term (was: pure function of par).
Delivery split into three ratified types; the "careful haul" is superseded by **fragile**, and its
signal corrected from lateral g to **vertical shock**. Clearance confirmed run-layer. Time trials
confirmed in-run; the route+build sharing hash **parked** pending the vehicle-customization question.
Job board discovery/expiry opened as a live design question.

**Superseded phrasing — do not reuse.** *"Camping is a place, not a button"* (SM-INV-6 was reversed
2026-07-19; camping is a **button**, gated by campable regions, with a worldgen-scored quality
preview). *"The careful haul"* (now fragile, §3b). *"Metaprogression is spirits/characters"* (now the
garage — see amendment §4).

## Provenance

**Inherited from DESIGN.md — do not re-litigate here:** the premise; SM-INV-1…13; the Roamer spine
and its three delivery channels; region unlock as the Roamer's trails gated by main missions; the
chat pane; the mode split; the per-component damage model; breadth-not-floor.

**Superseding DESIGN.md as of 2026-07-29** — see `design-amendments-2026-07-29.md`: worldgen is
meta-free; XP is run-layer; meta-progression is the garage; no in-run vehicle purchase; run shape
fixed.

**Owner-only, untouched:** the Roamer's motives and the final beat (Q1); forced progression (Q9);
mission bail cost (Q6).

**Ratified by the owner in conversation, not yet in the bible:** the paper route and the uncle as its
giver and route gate; the three delivery types and their scoring; the log-drag main mission and its
high-wear premise; XP run-layer with a margin bonus; time trials in-run; the escalation ladder; the
Roamer as motivator rather than informant.

**Proposed here, not ratified:** the axis taxonomy; `XP = parGeometric × (1 + k·marginRatio)`; payout
on absolute seconds; binary rather than graded fragile breakage; freight's flat-rate payout (bends
SM-INV-4 — flagged); logs on graded sections; the beat/labor split and its consequences; POI-type
partial information on the job board; the uncle/Roamer channel pairing.


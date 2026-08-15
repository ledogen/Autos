# Autos — Missions

*Working design notes. **Downstream of `DESIGN.md`** — where this document and the bible disagree,
the bible wins. Invariant citations below are `SM-INV-N` per DESIGN.md.
Companions: `opening.md`, `spirits-and-pacts.md`, `items.md`, `IDEAS.md`.*

**Reconciled against DESIGN.md 2026-08-01.** The performance model below (points, continuous payout,
rank, day tier) is folded into the bible as its "Ratification pass 2026-08-01" — **DESIGN.md is
current and wins.** `design-amendments-2026-07-29.md` is a historical provenance record only.

### Status board

| Decided | Open |
|---|---|
| Five scoring axes; three delivery types (§1, §3a, §3b) | Job discovery + expiry model (§"The job board") |
| Points not XP; continuous payout; rank as surface | Exact `k` (maintenance cost per par-second) |
| Payout continuous on par ratio, base × par | Restraint ceiling: hard-fail vs graded (§3b) |
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
| **Margin** | Time against par | Currency, continuous in the par ratio, base scaled by par | Never hard-fails; bare completion pays ~nothing (SM-INV-4) |
| **Coverage** | How much of a fixed inventory you place before the budget runs out | Currency per unit delivered | Budget expires with stock unplaced |
| **Restraint** | Shock and impulse into the cargo | Flat rate; the cost is time | Cargo is broken |
| **Clearance** | Objects removed from a blocked trail | Region access | Never — progress is world state |
| **Accuracy** | Where the thing you threw landed | Continuous in distance from the target, scaling the per-unit rate | Never hard-fails; a miss is one unit unpaid |

> **[AMENDED 2026-08-14, owner] Accuracy scales the RATE and no longer sets the rank.** It stays a
> fifth axis and stays in this table; what it lost is the letter. The paper route's rank is the par
> ratio now — see §2's scoring block for the amendment and the arithmetic behind it.

**Accuracy is a fifth axis [RATIFIED 2026-08-05].** This table used to say four, and this file says
plainly that *adding a fifth axis is a design act* — so this is that act, made deliberately rather
than smuggled in as dressing on coverage. It earns its place by measuring something no other axis can
see: coverage asks *did you get there*, accuracy asks *how well did you place it*, and the paper route
needs both or throwing is a formality. It rides **with** another axis, never alone — accuracy scales a
per-unit rate, so it has no meaning without units to deliver.

DESIGN.md's own failure-mode list names the risk this table exists to manage: *par-scoring eats the
tone.* If every mission resolves to the same number, this is a time trial with charming skins. The
bible asks for types where par isn't the axis — "arrive with the eggs unbroken, don't spook the
horses." Coverage, restraint, and clearance are the answer to that ask.

Adding a fifth axis is a design act. Adding a fifth *dressing* is a content act.

---

## Performance, points and payout [RATIFIED 2026-08-01]

Two currencies off one drive. **Points buy access. Money buys parts.**

### Progress is a count, not a quantity

**XP is retired** (SM-INV-14 as rewritten 2026-08-01). Region access is bought with **mission
points**:

> **1 point** at rank **B or better** · **½ point** at **C** · **0** at **D**.

Per-region counts are authored — `6 · 6 · 6 · 4 · 3 · 2`, **27 points across six regions** against a
day budget of `4 · 4 · 4 · 3 · 3 · 2` in a **20-day** run (`run-shape.md`). Points are run-layer and
reset on death.

**Difficulty rides mission *length*, not mission count** [RATIFIED 2026-08-02]. Points per day stay
nearly flat (1.5 → 1.0); what changes is what one point costs of a 16-hour day:

| Region | Mission par | A day holds | Feel |
|---|---|---|---|
| 1 | **~5–7 h** | two, comfortably (~8 possible vs 6 required) | chill — room to fail and to wrench |
| 3 | **7–12 h** | two, barely | the day becomes the binding constraint |
| 6 | **~12 h** + 2 h to fishable ground + 2 h to the next job | **one, exactly** | no budget for a service stop or an upgrade |

> ⚠ **Region 3 is the tightest number in the run.** At the long end of its par band a cycle is ~14 h
> and four days buy ~4.6 missions against a requirement of 6 — it only works if the band's short end
> is typical, and a single C (½ point) costs a whole extra cycle. **Tune the par band before touching
> the point count.**

> **Long missions may need checkpoints.** A 12 h par job across a sparse late region has no vocabulary
> here — §3's types are point-to-point with endpoints mid-edge (never node-snapped). **Multi-checkpoint
> missions are a new structure**, not a tuning value, and they gate regions 3–6. No ticket yet.

*Why the change:* an XP quantity that scales per day only forces the requirement to scale with it —
a treadmill that nets to nothing while hiding the number that actually matters. A count makes the
real design question visible: **missions per day per region.** The half-point for a C is the one
concession to weaker players, and it exists so a run of scrappy drives still advances rather than
stranding (SM-INV-7).

> **The one hard constraint survives the rename: progress must never increase with time taken.**
> Any formulation where slow driving earns more reopens gate-farming.

### Payout is continuous

```
ratio  = elapsed / par
payout = parBase × dayTier × clamp((1.2 − ratio) / 0.2, 0, cap)
```

- **`parBase = k × par`** — the base scales with the road. This is load-bearing: it is what keeps
  *same driving quality, more road, more money* true, and it is why payout could not simply be the
  rank letter. A discrete rank would flatten a twelve-minute haul onto a sixty-second errand and
  hand the player back the tiny-job farming loop that absolute-seconds payout was chosen to close.
- **The line:** 0 at ratio 1.2 · **1.0 at par** · 2.0 at ratio 0.8. Peanuts for being 20% over,
  generous for being 20% under, linear between.
- **The anchor:** *a day driven entirely at par is break-even.* Below par you profit, above it you
  bleed. This resolves Q4 as an identity rather than a tuning target, and reduces the economy to one
  number — `k`, maintenance cost per second of par-driving.
- **`dayTier`** is a step function of run day, **locked at mission accept**, rising as the run ages so
  payouts keep pace with escalating maintenance (Q9A). See DESIGN.md "The performance model" for why
  the rising tier does not double-count with the tightening rank thresholds.
- **Payout floors at zero.** A bad run earns nothing; it never charges you. The day and the wear are
  the loss.

### Rank is the surface

The player never sees par. They see **a letter and a number.** Ranks are **D · C · B · A · S**
(already implemented — `gradeRun()` in `src/par.js`), coloured **red · orange · yellow · white ·
blue**, with **B containing par** so that the grade which merely meets the cost curve is a B and an A
feels earned.

Rank is **display only** — a legible skin over the continuous payout, not a set of bins — and
**result-card only, never live**, because a live rank is a countdown by proxy (SM-INV-3).

**Rank is computed per axis**, so the letter means something on every mission type: margin grades on
time vs par, restraint on accumulated shock, coverage on fraction placed, freight on delivery plus
truck condition, clearance pass/fail. That uniformity is what lets bonus objectives work everywhere.

### Bonus objectives — the one legal pre-drive target

A giver may offer **"a little extra if you finish with an A"**, gating an **item** whose identity is
not stated up front — a spare tire, a cooking kit. Legal because it names a *standard* without naming
a *time* (SM-INV-3), and it is the only place a rank boundary carries mechanical weight rather than
cosmetic. The reward is an item, never cash and never persistent (SM-INV-8).

*Open: does a bonus objective also raise the mission's point value, or only its loot? Loot-only is the
recommendation — points are a measure of competence, not of the offer you happened to be given.*

**Interaction with the night-owl spirit.** *(Spirits are deferred — see amendment §4. Retained
because the interaction is instructive.)* A spirit paying more for missions run while sleepy,
conditioned on the dangerous state (SM-INV-9), compounds against a par-scaled payout base: the largest
single payday in the game becomes **a long haul driven tired**. *(The 2026-08-01 day tier makes this
sharper still — accepting at 1 a.m. buys tomorrow's rate, so the economy already seduces the player
into the Night Owl's territory without him.)* The seduction becomes a specific,
nameable temptation rather than a percentage.

**Note on SM-INV-2 — settled.** The run-duration par ramp is **RETIRED**, and `parGeometric` /
`parEffective` have collapsed into a single **par**. The tightening the clause was reaching for now
lives in the **rank thresholds** (they move with run day; par does not), and the rising side of the
economy lives in the **payout day tier**. There is one par, derived from road geometry, scaling with
nothing.

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
- **Freedom contrast** — actual movement, after a job that was neither.

**It is the income floor** [RATIFIED 2026-08-05]. The day job does not survive the opening beat — the
player is fired from the burger joint and can never earn there again (`opening.md`), so the route is
the *only* thing playing this role. It must therefore be reliably available and reliably poor: the
floor under *bare completion pays nothing*, guaranteeing a run can't dead-end into zero while paying
badly enough that leaning on it always reads as an admission of a bad day. Tuning consequence: the
route's payout can never be balanced purely as an onboarding mission — it is also the economy's
backstop, and FEAT-53's k-curve has to hold both jobs at once.

**The route has a deadline** [RATIFIED 2026-08-05, FEAT-61]. *Struck: "The budget is a day-fraction,
not a clock. The route ends when the light goes… this doesn't need the SM-INV-3 timer allowance — it
isn't a timer, it's an inventory and a sunset."* It is a timer, and it should be: papers have to land
before people have their morning coffee. That is the one deadline in this game the player already
understands without being taught, and a route with only a sunset behind it has no shape in the hour
you actually drive it.

- **Derived from par, shown as a clock.** `deadline = par(tour) × PAPER_TOLERANCE`. This is legal
  under SM-INV-3's timer-flavor allowance, and the *diegetic* framing is what qualifies it — the
  player reads "before the coffee", not "1.2 × par".
- **The inventory cap survives.** The paper stack is still the second, harder budget.
- **The bell is soft, by construction.** Under flat-rate-per-delivery (below) running out of time
  costs only the papers you hadn't thrown yet. Nothing already earned is clawed back — which is what
  an income floor requires.

**Scoring: flat rate per delivery, scaled by accuracy** [RATIFIED 2026-08-05, FEAT-61] — with the
rank moved onto the clock [AMENDED 2026-08-14, owner].

    q(d)    = 1 − (1 − ACC_FLOOR) × (d / TARGET_R)   inside the circle, else not a delivery
    payout  = FLAT × Σ q(dᵢ)  +  FLAT × n × expedite(ratio)
    rank    = gradeRun(ratio)                        (the par ratio, gated on full coverage)

**ACCURACY PAYS, THE CLOCK GRADES [AMENDED 2026-08-14, owner].** The rank used to be
`coverage × meanAccuracy`. It is now the par ratio, and accuracy is confined to what it is actually
good at — the money for the paper in front of you. This is a simplification with a shape behind it:
*slow and careful* and *fast and ragged* should pay about the same, so the two ways to drive the
route become a real choice instead of one dominating. Accuracy is still the fifth axis in the table
above; what changed is that it scales the per-unit rate **only**, which is what that table already
said it did.

The arithmetic that pins it: a rim-scraper (mean q = 0.30) who blasts the round must earn what a
methodical driver (mean q = 1.0) earns at par. So the bonus is worth **0.70 of a perfect route's
paper money**, and it applies to the FULL flat (`n × FLAT`) rather than to the accuracy-scaled sum —
on the scaled sum the same equivalence needs a 233% bonus, which is not a tunable number.

**Par is a B, and B contains par** [CONFIRMED 2026-08-14, owner]. SM-INV-3's amendment holds for
this mission type too: driving the route the way par assumes is a B, and dawdling is a C. An earlier
reading — that par should be a C here — was withdrawn.

**Par prices the STOPS** [FIXED 2026-08-14, FEAT-61]. `par.js` caps the speed envelope at every
customer and adds `stopDwell` seconds there, because the reference driver pulls up, throws and sets
off again. Before this it priced a fifteen-porch round as one uninterrupted blast — measured at 73
km/h average with 2 of ~1150 profile samples below 3 m/s, and those two were the first and the last
— which is why point-to-point missions felt right while this one was unbeatable and the expediency
bonus was unreachable by construction. A porch the route passes twice is charged once.

A dead-centre throw is worth a whole paper, the worst throw that still counts is worth 0.30 of one,
and **partial routes pay for what they delivered** — one of nine is a D that still puts money in the
wallet. The *expediency* bonus is the only place time enters the payout, and it requires a completed
route: you cannot finish early without finishing. `FLAT` is anchored to par so the floor survives the
20-day cost ramp rather than decaying into irrelevance.

**Route selection** improves as the player proves themselves, granted by the uncle rather than a
skill bar. See `opening.md`.

*Open:* this is a **second progression axis** alongside points → region unlock. Worth deciding
deliberately rather than inheriting, and probably shouldn't generalize past the uncle.

### 3. The three delivery types [RATIFIED 2026-07-29]

Delivery is not one mission with variants. It's three, separated by **what the cargo does to the
truck and what the truck does to the cargo**.

| | mass | scored on | payout shape | the fear |
|---|---|---|---|---|
| **3a. Point-to-point** | light | time vs par | continuous in the par ratio, base ∝ par | crashing; earning nothing |
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
rises with run age and point velocity is position against it (see Performance, points and payout). A slow mission
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

**Gating chain:** **mission points** gate *when the main mission becomes available*; the main mission
gates *the region*. The bible is explicit that the story should pull the player outward rather than a
bare threshold doing it, so points are the pacing floor, not the gate itself. Region 1 needs **5
points** — five well-driven jobs, or more scrappy ones (`run-shape.md`).

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

**2026-08-01 — owner decisions: the performance model.** SM-INV-2's par ramp **retired**;
`parGeometric`/`parEffective` collapsed into one **par**. Payout became **continuous and linear in
the par ratio** with the base scaled by par (absolute-seconds-under-par retired, its *intent*
preserved by the par-scaled base), anchored so **a day at par is break-even** — which resolves Q4.
A **day tier** locked at mission accept raises payouts as the run ages; the **rank thresholds** tighten
as the brake. *(Both shipped tables saturate on day 8 and must stretch to a 20-day run — see
`run-shape.md` → "Code deltas".)* **XP replaced by mission points** (1 / ½ / 0 for B+ / C / D),
authored per-region counts. **Rank (D·C·B·A·S) became par's player-facing surface** — display only,
result-card only. **Bonus objectives** ("an A gets you a little extra") added as the one legal
pre-drive target, paying in items.

**Superseded phrasing — do not reuse.** *"Camping is a place, not a button"* (SM-INV-6 was reversed
2026-07-19; camping is a **button**, gated by campable regions, with a worldgen-scored quality
preview). *"The careful haul"* (now fragile, §3b). *"Metaprogression is spirits/characters"* (now the
garage — see amendment §4).

## Provenance

**Inherited from DESIGN.md — do not re-litigate here:** the premise; SM-INV-1…13; the Roamer spine
and its three delivery channels; region unlock as the Roamer's trails gated by main missions; the
chat pane; the mode split; the per-component damage model; breadth-not-floor.

**Superseding DESIGN.md as of 2026-07-29** — see `design-amendments-2026-07-29.md`: worldgen is
meta-free; meta-progression is the garage; no in-run vehicle purchase; run shape fixed. **As of
2026-08-01** DESIGN.md is current again and supersedes that file: par ramp retired, continuous
payout, mission points, rank as surface. **As of 2026-08-02**: **20-day runs**, 27 points, the
clock-pause rule, and regions that grow with depth (`run-shape.md`).

**Owner-only, untouched:** the Roamer's motives and the final beat (Q1); forced progression (Q9);
mission bail cost (Q6).

**Ratified by the owner in conversation, not yet in the bible:** the paper route and the uncle as its
giver and route gate; the three delivery types and their scoring; the log-drag main mission and its
high-wear premise; time trials in-run; the escalation ladder; the Roamer as motivator rather than
informant. **2026-08-01:** the whole performance model above — points not XP, continuous payout,
break-even-at-par, day tier, tightening thresholds, rank as the surface, bonus objectives.
**2026-08-05:** the paper route is **the income floor** — the burger-joint day job is destroyed in
the opening beat (fired, never rehireable, no income from it ever) and no longer backstops anything.

**Proposed here, not ratified:** the axis taxonomy; binary rather than graded fragile breakage; freight's flat-rate payout (bends
SM-INV-4 — flagged); logs on graded sections; the beat/labor split and its consequences; POI-type
partial information on the job board; the uncle/Roamer channel pairing.


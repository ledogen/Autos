# Autos — Run shape and saving

*Working design notes, 2026-07-29. Downstream of `DESIGN.md`. Candidate for promotion into a
DESIGN.md mechanics-reference section once the save model is settled.*

---

## The target [RATIFIED 2026-08-02 — supersedes the 2026-07-29 and 2026-08-01 figures]

- **6 regions**, starting at the current 2500 m radius and **growing with depth on a sparser grid**
  (below) — a region is a progression *chapter*; the play space is cumulative and later missions may
  span regions.
- **6 hours** to beat the game (the old band was 4–6; 6 is the number every figure below derives from).
- **24-minute sky cycle** · **16 waking hours + 8 hours' sleep** · **the clock pauses in shops,
  service stations and camp** → a day costs **~18 real minutes** → **20 days per run**.
- **27 points per run**, schedule **6 · 6 · 6 · 4 · 3 · 2** over a day budget of **4 · 4 · 4 · 3 · 3 · 2**.
- **Saving is suspend-and-resume** (below).
- **Progress is mission points, run-layer** — they reset with the run (SM-INV-14 as rewritten
  2026-08-01; the XP formulation is retired).
- The full trail chain must be completable in **one run** (SM-INV-7), since road clearance is
  run-layer and resets on death.

> ### The arithmetic, and the two errors it replaces
>
> **The day, in full:**
>
> | | in-game hours | real minutes |
> |---|---|---|
> | Waking, clock running (driving, missions, travel) | **16** | **16** |
> | Shops, service stations, camp — **clock paused** | 0 | ~2 |
> | Sleep — a time skip, near-free in wall-clock | **8** | ~0 |
> | **A day** | **24** | **~18** |
>
> 360 real minutes ÷ 18 = **20 days**, and the authored day schedule sums to exactly that:
> 4 + 4 + 4 + 3 + 3 + 2 = **20**.
>
> **16 + 8 = 24 closes the day.** The shipped ladder is an 18 h tank against an 8 h night, which is
> 26 — so dawn drifted two hours later every night, ~40 hours of drift across a run. Setting the tank
> to **16 h** is a fix, not just a retune (`day.js:26 fullEnergyH`, see "Code deltas").
>
> **Two earlier figures were wrong, and both errors are worth naming so nobody re-derives them.**
> **10–15 days** divided target hours by the *sky cycle*, which counts only driving. The **7–8 day**
> correction then over-swung: it priced a day at ~40–45 real minutes by charging camping, repair
> trips, shopping *and travel between jobs* as wall-clock overhead — but **travel between jobs is
> driving and already runs at 1:1**, and everything else on that list now pauses the clock outright.
> Genuine off-clock time is ~2 minutes a day, not ~25.
>
> Three independent derivations agree on ~20: the day clock (18 min/day), the authored region day
> budget (4·4·4·3·3·2), and the per-region minute budget (36–72 min × 6 = 360).

## Why progress velocity is the real currency

Mission points do not survive death. Their function is **positional**: a strong day one buys region 2
on day two, and because service and parts costs escalate with run age (Q9A), unlocking early means
arriving in expensive country **before it gets expensive**. The head start becomes margin for
something to go wrong later.

*(Terminology: this was "XP" until 2026-08-01. The unit is now a **count of well-driven missions** —
1 point for rank B or better, ½ for a C, 0 for a D — because an XP quantity that scales per day only
forces the requirement to scale with it. See SM-INV-14.)*

This is what makes driving fast matter for *survival* rather than only for cash, and it is the reason
the game needs no countdown anywhere (SM-INV-3). The pressure is a cost curve the player is racing,
and the race is entirely diegetic.

**Corollary for tuning:** the cost-escalation curve, the payout day-tier and the rank-threshold ramp
are one balance problem seen from three sides. Tune them together or none of them means anything.

---

## What the arithmetic says [recomputed 2026-08-02]

The run is authored per region, in **days**, and the day is worth ~18 real minutes:

| Region | Days | Real min | Points | Points/day | Mission par band |
|---|---|---|---|---|---|
| 1 | 4 | 72 | 6 | 1.5 | **5–7 h** |
| 2 | 4 | 72 | 6 | 1.5 | ~6–9 h |
| 3 | 4 | 72 | 6 | 1.5 | **7–12 h** |
| 4 | 3 | 54 | 4 | 1.33 | ~9–14 h |
| 5 | 3 | 54 | 3 | 1.0 | ~10–16 h |
| 6 | 2 | 36 | 2 | 1.0 | **~12 h — a whole day** |
| | **20** | **360** | **27** | | |

**Regions 2, 4 and 5 are interpolations** between the three authored points (1, 3 and 6) and are the
softest numbers here.

> **Days-per-region is a *pace*, not a gate.** The hard gate is the point count; the day budget is
> what a player on target spends clearing it. Fall behind and you don't fail — you spend more days,
> and the cost curve (below) charges you for them. That is the entire difficulty system, and it is why
> the schedule can be tight without being unfair.

> **Why six and not ten** [RATIFIED 2026-08-01]. Ten regions at 24–36 minutes each is a *tour*: the
> player passes through, never learns the ground, and every region has to re-teach itself. At six, a
> region gets **36–72 minutes** — several crossings of ground that already takes ~12 minutes to
> drive across. Long enough to know a road, recognise a junction, remember where the good camp was.
> **The unit of the game is a place you come to know**, not a checkpoint you clear.
>
> *(The band was 40–60 min under the flat schedule; the authored day counts spread it to 36–72. Region
> 6 at 36 min sits just above the 24–36 min "tour" floor this argument rejects — deliberately, because
> by chapter 6 the play space is cumulative and the player is not learning new ground, they are
> committing to one long haul on ground they know.)*
>
> Three consequences fall out of it, all good:
> - **The one-run constraint gets easier.** SM-INV-7 requires the whole trail chain to be reopenable
>   in a single surviving run; six chains is a materially softer content constraint than ten.
> - **Six unlock loads per run instead of ten** — a direct 40% cut to the FEAT-28 validation cost
>   that Open Q3's run-layer ruling made recurring.
> - **Authoring concentrates.** Six regions with identity beats ten that blur.

### The mission-length ladder — what actually makes late regions hard [RATIFIED 2026-08-02]

**The difficulty ramp is mission *length*, not mission count.** Points per day barely move across the
run (1.5 → 1.0); what moves is how much of a day one point costs. **A day is not mission after
mission** — at minimum you drive from a finished job to the next POI; at most you also gas up, hit a
service station, and shop.

**Region 1 — chill, with room to fail.** Missions are **~5–7 h par**. Add ~2 h to reach the next POI
and a mission cycle is ~8 h, so **two fit in a 16 h day** and a good player can squeeze **~8 missions
into the 4 days** against a requirement of 6. That ~25% slack is deliberate and is what the early game
is *for*: failing a job, and building the jalopy up into something that can survive the long missions
later. Nothing here should feel like time pressure.

**Region 3 — the crunch.** Missions are **7–12 h par**. A cycle is ~11–13 h, so **two no longer
comfortably fit in a day**, and 6 points in 4 days now demands real budgeting: which jobs, in which
order, and whether you can afford the service stop. This is the first region where the day is the
binding constraint rather than the wallet.

> ⚠ **Watch this one — it is the tightest number in the run.** At the *long* end of the par band
> (12 h) a cycle is ~14 h and you clear ~4.6 missions in 4 days against a requirement of 6. It only
> works if the band's *short* end is typical, and a single C-grade (½ point, SM-INV-14) costs a whole
> extra cycle. Region 3 is where a middling player first falls off pace — intended, but it is a sharp
> step and the half-point rule is the only give in it. **Tune the par band before tuning the point
> count.**

**Region 6 — one mission is one day.** ~12 h par, ~2 h to find ground that is campable *and*
fishable, ~2 h to reach the next job: **16 h, exactly a day**, and 2 days buys exactly the 2 points.
**There is no room for a service stop or an upgrade in that budget** — whatever the truck is by
region 6 is what finishes the run. That is the intended shape of the endgame and it should not be
softened by adding slack; if the finale reads as a formality, raise the *quality* bar (require an A),
per the note at the end of this section.

### Region size grows with depth, on a sparser grid [RATIFIED 2026-08-02]

`REGION_RADIUS_M = 2500` (`src/story.js`) is the **region 1** size and takes ~12 min to drive across.
Later regions get **physically bigger with a sparser road/POI grid**, so a 12 h mission has somewhere
to happen without being a lap of the same network.

Two things make this cheap rather than expensive:

- **`REGION_RADIUS_M` is a story-layer value and is deliberately NOT in `routeCacheSig`**
  (`src/story.js:35`) — growing it does **not** invalidate the baked route bundle. This is the
  gotcha that bites every `road*` param and it does not apply here.
- **Sparser grid offsets larger area.** Cost tracks *network density × area*, not area alone, so a
  region that doubles in radius on a half-density grid is roughly cost-neutral to route and validate.
  `test/region-radius-curve.mjs` already exists to price the curve — **run it before committing radii.**

*Open: the actual radius ladder.* Unspecified. It should be derived from the par bands above (a
region must hold its own missions without repetition), not picked as a shape.

> **Consequence for missions: long missions may need checkpoints.** A 12 h par job across a sparse
> region is a scale `missions.md` has no vocabulary for — today's missions are point-to-point with
> endpoints mid-edge. **Multi-checkpoint missions are a new mission structure**, not a tuning value,
> and they are the enabling work for regions 3–6. Flagged in `missions.md`; no ticket yet.

**The play space is cumulative.** Progression regions unlock, they do not *replace* — so by chapter 6
the player has six regions of drivable, validated world, and **not all of a chapter's gameplay has to
happen inside its own region.** Later missions can start in region 1 and finish in region 4; driving
*between* regions is content, not overhead.

That resolves several things at once, which is the sign it is the right model:

- **It re-explains the falling point schedule, better than "deep country is emptier" did.** Late
  missions span regions, so their par is large — and since `parBase ∝ par`, they pay more and take
  longer. Needing only 2 points in chapter 6 isn't thinness; it's two multi-region hauls.
- **It grows supply for free.** The job board draws from every unlocked POI, so the pool widens as the
  run matures even while the *deep* country stays sparse.
- **It defuses the region-1-exhaustion problem** (see Production consequence). Region 1 doesn't get
  abandoned after chapter 1 — it keeps being driven, as part of longer routes, with a worse truck and
  a tighter grading curve. Familiar ground, new stakes.
- **It gives the map a reason to exist late.** A route that crosses four regions is a route worth
  planning, which is exactly when navigation items (`items.md` §2) start earning their slot.

> **What this does cost, honestly.** The *play space* grows monotonically, so streaming, routing
> coverage and the validated network all scale with **regions unlocked** — and now, since 2026-08-02,
> with region *size* as well. That is FEAT-28's bill, and it is why the per-unlock budget on that
> ticket matters. The sparser grid is the mitigation (see "Region size grows with depth"); six unlocks
> is also 40% fewer than ten.
>
> A second-order one worth watching: **mission planning across region boundaries** needs the router to
> path over the union of unlocked regions, not just the current one. `src/mission.js`'s `_roll()`
> currently confines both endpoints inside the single active region (FEAT-43). That confinement has to
> become "inside the unlocked set" rather than "inside the current region" before cross-region
> missions work at all.

Rough allocation of a **day** (16 clock-running hours), which is now the unit rather than the region:

| | region 1 | region 6 |
|---|---|---|
| Mission driving (par) | ~12 h (2 × 5–7 h) | **12 h (1 mission)** |
| Travel from a finished job to the next POI | ~4 h (2 × 2 h) | ~2 h |
| Finding campable — and fishable — ground | folded into the above | ~2 h |
| Fuel, service, shopping | **clock paused**, ~2 real min | **none — no budget for it** |
| **Total** | **16 h** | **16 h** |

The log drag (main mission) is **4–8 min, longer trails deeper in**, and comes out of the region's day
budget like any other job.

### The mission count

20 days at 1.0–1.5 points/day ≈ **27 points per run** — the ratified total, authored per region
against the day budget:

> ⚠ **NEEDS A RECOUNT [2026-08-16].** This total was counted when a drive at par was a **B** worth a
> full point. After the par re-anchor (DESIGN.md, "Ratification pass 2026-08-16") par is a **C**,
> worth **half** — SM-INV-14's 1/½/0 wording is unchanged but its economics are not. First-order
> estimate against the 20-run corpus under the re-cut letters: 17 of 20 drives still earn a full
> point on day 1 (S 2 · A 9 · B 6 · C 0 · D 3), so 27 is probably close to right for a competent
> player and harsher for a weak one. **That is a model from 20 drives, not a recount — treat the 27
> as provisional until it has been re-derived.**

> **days**  4 · 4 · 4 · 3 · 3 · 2 = **20**
> **points** 6 · 6 · 6 · 4 · 3 · 2 = **27**

Because a C-grade drive pays **½ a point** (SM-INV-14), the true counts are finer than the integers:
a region needing 6 might take six clean drives or twelve scrappy ones. That half-point is what stops a
struggling player stranding, and it is the only difficulty give in the progression system — which is
why region 3's tight par band (above) leans on it hardest.

**The texture is not a falling mission count — it is a rising mission length.** An earlier draft
authored a *falling* point schedule (`5·4·4·3·3·2`) on the theory that deep regions are emptier. That
was the right instinct expressed on the wrong axis: points per day stay nearly flat (1.5 → 1.0) and
what changes is that **one point costs a fifth of a day in region 1 and a whole day in region 6.**
Region 1 is eight short errands with room to fail; region 6 is two commitments with no room for
anything. Same shape, honest mechanism.

**Offered ≠ required.** [clarified 2026-07-29] A region presents a **job board**; the player clears a
point threshold. They never have to do everything on the board. Two separate numbers:

| | what it is | where it comes from |
|---|---|---|
| **Consumption** | how many jobs a player actually runs to clear the region | the authored point count, ÷ how well they drive |
| **Supply** | how many the board offers | a deliberate content dial |

**Supply is the dial that matters, and it should overprovision.** If a region offers six jobs and
needs four, it's a checklist with a rounding error. At **two to three times** consumption, choosing
becomes real. *Note:* if missions become hidden until a POI is visited (see `missions.md` → "The job
board", OPEN), supply means **live POIs within reach**, not rows on a screen — the ratio still
applies, the unit changes — and choosing is where the whole mission taxonomy finally pays off:

> tires near the puncture curve → take the fragile run and keep it slow. Cooling healthy and cash
> needed → take the freight. Rested, flush, good rubber → take the long point-to-point and send it.
> Half a day of light left → run papers.

Without overprovisioning, the axes are just variety. With it, they're a decision made against the
truck's actual condition.

> **Superseded 2026-08-01:** *"Tune time-per-region, not jobs-per-region — the XP threshold should
> rise across regions but more slowly than par does; one curve, not ten hand-set counts."* The owner
> ruled the other way, and the reasoning inverted with it: a scaling threshold against a scaling XP
> yield is a treadmill that nets to nothing, and the honest question was always **missions per day per
> region**. It is now **six hand-set counts** — legible, un-inflatable, and tunable one region at a
> time. *(2026-08-02: "falling with depth" no longer describes them — see "The mission count". The
> hand-set-counts ruling stands; the shape of the counts changed.)*

**The board thins as the jobs grow.** Later regions offer fewer, longer, more consequential jobs —
deep country is emptier, and that's thematically right as well as mechanically necessary. The texture
across a run: early game is a busy board of small choices with a healthy truck; late game is a handful
of serious commitments with a wrecked one. Each late job is a bet in a way no early job is.

*Connection to Open Q9:* the miasma/storm option (Q9B) **is a supply-thinning mechanic** — an
advancing front that consumes POIs pulls givers out of the pool and shrinks the board directly. So
Q9A and Q9B squeeze from two sides: costs rise while available work falls. The bible already notes B
may be the spatial cause behind A; this is a second way that's true.

*Nudge at Open Q6 (no bail cost):* once supply exceeds demand, abandoning a job stops being free.
You were never going to run them all, so the cost of bailing isn't a lost opportunity — it's the
hours and the wear spent with **no point to show**, against a rising cost floor and a finite day. Not
a resolution (Q6 is owner-only), but the overprovisioned board makes time the thing you actually
spend.

Sanity check on the far end: region 6 needs **2 points across 2 days** — two well-driven missions, each
one filling its day. That is deliberate, and it is the region with the least give in the run. If the
finale reads as a formality rather than a gauntlet, **the fix is the *quality* bar (require an A, not
a B, in deep country), not more jobs** — the day budget has no room for more jobs.

## The clock: what runs it, what pauses it, what skips it [RATIFIED 2026-08-02]

Three distinct states, and keeping them distinct is what makes the day budget mean anything:

| | in-game clock | wall clock |
|---|---|---|
| **Driving, missions, travel** | runs at **1 real min = 1 in-game hour** | runs |
| **Shops, service stations, camp** (until you take an action) | **paused** | runs |
| **Sleep; an accepted repair; making camp** | **skips forward** by the action's cost | ~free |

**Stopping is where you plan.** Because the clock pauses at a shop, a service station or a pitched
camp, those screens are the game's planning surface — **and the map must be viewable from any of them
via a button.** No time passes while you decide. That is the whole justification for a 16 h day being
worth only 16 real minutes, and it is why "menus" cost ~2 real minutes a day rather than in-game hours.

**Repairs cost money *and* time, and accepting one is an immediate time skip.** *Fixing your engine 50%
costs $1000 and 10 hours* — accept it and the clock jumps ten hours, eating most of a 16 h day. This
makes the service station a genuine strategic commitment rather than a wallet transaction, and it is
what gives "build the jalopy up in region 1, when days are cheap" its teeth.

**Energy drains across every skip except sleep** [RATIFIED 2026-08-02] — **including when you pay
someone else to do the work.** Ten hours at a service station is ten hours awake whether you are under
the truck or sitting in the waiting room. So a 10 h repair accepted in the morning leaves ~6 h of
energy and effectively ends the day: you get the truck back and you are already looking for ground.

That is the correct and interesting outcome. It means **a big repair is a whole day**, not a cash
transaction with a progress bar, and it forces the real decision — *fix it properly now and lose the
day, or limp on and hope.* It also couples the money economy to the sleep economy without a new
mechanic: the shop spends the one resource coffee can only borrow against.

> **This resolves the standing open question** in DESIGN.md — *"how long does a repair take in in-game
> hours, and what does burning a day at the shop cost?"* Answer: hours are priced per repair, the cost
> is the daylight, and it is charged as a skip that drains energy. The machinery already exists —
> `day.js`'s `makeCamp()` is exactly this: a time skip that docks energy by the hours skipped
> (`this._energyH = Math.max(0, this._energyH - dH)`). A repair reuses it unchanged.
>
> **Sleep is the sole exception**, because sleep is the thing that *pays* energy back — `sleep(hours,
> vibe)` credits `r(vibe)` hours per hour slept rather than draining.

## Implication for day length

| real min / day | days per run at 6 h | |
|---|---|---|
| 24 (sky cycle = day — **error 1**) | 15 | divides by the sky cycle; counts only driving |
| 40–45 (**error 2**, 2026-08-01) | 8 | charges travel as off-clock overhead; predates the pause rule |
| **~18 [RATIFIED 2026-08-02]** | **20** | 16 waking h at 1:1, +~2 min paused, sleep skipped |

The clean mental model is no longer "a region a day" — it is **a region every three or four days**,
authored per region (4·4·4·3·3·2). That is a better tuning unit anyway, because it lets the ramp live
in mission length rather than in the calendar.

**What 20 days buys, recorded honestly** — both worries the 7–8 figure carried dissolve:

- **The debt spiral gets ~20 nights to become legible**, not seven. Coffee as a loan, camp quality
  carrying into the morning, the slow slide — these need iterations to be *felt*, and 20 is enough
  that a bad camp on night 3 can still be hurting on night 8.
- **The cost curve gets ~20 steps, not seven.** The earlier note argued 7 steps forced *bigger, coarser*
  per-day cutoffs over a smooth ramp. **That conclusion reverses**: 20 steps supports the smooth
  asymptote the escalation now calls for (below).

**The escalation is a soft asymptote, not a wall** [RATIFIED 2026-08-02]. Costs rise so that day 20 is
where a paced run finishes and **a good player who is not motivated to end the run can drag it to
25, maybe 30 days**. It must never announce itself: SM-INV-3 forbids a countdown anywhere, and a hard
cliff at day 20 would be a timer wearing a price tag. An asymptote produces the same pressure and stays
diegetic — you don't run out of days, you run out of money.

## Saving

**A 6-hour run makes saving mandatory, and saving is what can kill the roguelike.** If a save can
be reloaded, the player reloads before a crash, and the entire loss-condition economy — the thing
every invariant in the bible is built around — evaporates.

**Model: suspend-and-resume, not checkpointing.** [RATIFIED 2026-07-29]

- One save slot per profile.
- Writing a save happens on quit.
- **Loading a save deletes it.** Resuming is not restoring; it's picking the run back up.
- Death deletes the save.

Standard roguelike practice (Spelunky, FTL, Slay the Spire), and it preserves SM-INV-1
exactly: death is still permanent, the save is only a pause button that survives closing the browser.

**The save is cheap, thanks to the worldgen ruling.** Because worldgen is now meta-free and purely
`(worldSeed, coords)` plus `runState`, **the world doesn't need serializing at all.** A save is:

```
worldSeed, runState (age + progress), metaState version,
truck condition tracks, inventory, position/orientation,
time of day, sleepiness, currency, active missions, cleared logs
```

That's kilobytes. The 2026-07-29 worldgen decoupling paid for the save system as a side effect.

*Flag:* input-trace replay for leaderboard validation needs to survive a save boundary — either
traces are per-route rather than per-run, or a resume records a trace discontinuity. Per-route is
almost certainly right, since boarded runs are single time trials anyway.

## Production consequence

Six hours is long for the genre — Isaac and Spelunky runs are well under an hour, FTL around two.
Most players will die repeatedly and **never finish a run**, which is correct and intended.

But it means **the first two regions will be played fifty times more than the last two.** Authoring
effort, mission-dressing variety, and polish should be weighted accordingly, and the early game has
to survive dozens of repetitions without becoming a chore. This is also the strongest argument for
keeping the first log drag to two or three pulls.

**Six regions sharpens this both ways** [2026-08-01]. Region 1 is now **a sixth of the game rather
than a tenth**, and it is 72 minutes rather than 24–36 — so the most-replayed content is both a
larger share of the run *and* individually longer. **Regions 1 and 2 together are 144 minutes, 40% of
a completed run**, and they are the part almost every player sees almost every time. That raises the
bar on them considerably.

It also puts the region-1 slack in its proper light: **~8 missions' worth of room against a
requirement of 6** is not generosity, it is the budget for failing, wrenching, and learning the ground
— in the region that has to survive fifty replays.

The mitigation is the same thing that motivated six regions in the first place: **a region the player
comes to know survives repetition better than one they merely pass through.** Familiarity is a
feature on replay — knowing the road, the camp, the shortcut is exactly the literacy SM-INV-8 says is
the real progression. The risk is not that region 1 becomes familiar; it is that it becomes
*exhausted*, which is a question of how much the **procedural dressing** varies on top of fixed
ground. That is where the early-game authoring budget should go.

---

## Code deltas owed to the 2026-08-02 ruling

Shipped values derived from the retired 7–8 day figure. **No ticket yet** — capture before tuning.

| Where | Now | Should be | Why |
|---|---|---|---|
| `day.js:26` `fullEnergyH` | 18 | **16** | 16 + 8 = 24 closes the day; 18 + 8 = 26 drifts dawn 2 h/night |
| `day.js:27` `sleepyAtH` | 4 (⇒ 14 h awake) | re-derive | at a 16 h tank, 4 remaining is 12 h awake — confirm the band still sits where FEAT-47 intended |
| `day.js:42–43` `sleepRateWorstH/BestH` | 1.5 / 3.0 (mean 2.25) | mean **2.0** | 8 h × rate must fill the tank: 8 × 2.25 = 18, needs to be 16 |
| `economy.js:57` `dayTierTable` | 8 entries, saturates day 8 at 2.66 | **~30 entries**, soft asymptote | escalation currently dies 40% into the run; must stay live to day 25–30 |
| `economy.js:53` `rankTightenDays` | 8 | **20** | the difficulty ramp otherwise stops on day 8 |
| `economy.js:34–35` `k` commentary | illustrated with "a 2.7-job day ≈ $170" | re-illustrate | `k` itself still balances by definition; only the worked example is stale |
| `sky.js:107` `dayLengthSec` | 120 | — | pre-existing disagreement with `day.js`'s 1440 (the ratified 24 min). **`day.js` is the authority**; this predates the ruling |
| `story.js:40` `REGION_RADIUS_M` | flat 2500 | **per-region ladder** | see "Region size grows with depth"; NOT in `routeCacheSig`, so no re-bake |

Also owed, and not a value: **repairs need a time cost alongside the money cost**, applied as a skip
(see "The clock"), and the **map must be reachable from the shop / service / camp screens**.

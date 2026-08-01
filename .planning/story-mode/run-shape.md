# Autos — Run shape and saving

*Working design notes, 2026-07-29. Downstream of `DESIGN.md`. Candidate for promotion into a
DESIGN.md mechanics-reference section once the save model is settled.*

---

## The target [RATIFIED 2026-07-29, days-per-run corrected 2026-08-01]

- **6 regions at the current 2500 m radius** (~12 min to cross) — a region is a progression
  *chapter*; the play space is cumulative and later missions may span regions (see below).
- **4–6 hours** to beat the game.
- **24-minute sky cycle**, and a day costs **~40–45 real minutes** to live through → **7–8 days per
  run**.
- **20–23 points per run**, on a falling per-region schedule (below).
- **Saving is suspend-and-resume** (below).
- **Progress is mission points, run-layer** — they reset with the run (SM-INV-14 as rewritten
  2026-08-01; the XP formulation is retired).
- The full trail chain must be completable in **one run** (SM-INV-7), since road clearance is
  run-layer and resets on death.

> ### The correction, and why it matters
>
> This document originally said **10–15 days**, derived by dividing 240–360 minutes by the 24-minute
> day. **That division was wrong**: it equates the *sky cycle* with the *wall-clock cost of a day*,
> which silently assumes a day is nothing but driving — no camping, no repair trips, no shopping, no
> dialogue, no travel between jobs. Counting those, a day runs **~40–45 real minutes**, and 10–15
> days is a **9–11 hour** run, not a 4–6 hour one.
>
> **The 24-minute sky cycle is unchanged.** What changed is that two different numbers had been
> sharing one name. Every downstream figure keyed to days-per-run — mission counts, the cost curve's
> step resolution, the sleep economy's iteration count — has to be re-derived from **7–8**.

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

## What the arithmetic says [recomputed 2026-08-01]

240–360 minutes ÷ **6 regions** = **40–60 minutes per region**, inclusive of everything: jobs,
travel, camping, repair trips, and the main mission.

> **Why six and not ten** [RATIFIED 2026-08-01]. Ten regions at 24–36 minutes each is a *tour*: the
> player passes through, never learns the ground, and every region has to re-teach itself. At six, a
> region gets **40–60 minutes** — three to five crossings of ground that already takes ~12 minutes to
> drive across. Long enough to know a road, recognise a junction, remember where the good camp was.
> **The unit of the game is a place you come to know**, not a checkpoint you clear.
>
> Note this is **fewer and longer, not physically bigger** — the region stays 2500 m (below).
>
> Three consequences fall out of it, all good:
> - **The one-run constraint gets easier.** SM-INV-7 requires the whole trail chain to be reopenable
>   in a single surviving run; six chains is a materially softer content constraint than ten.
> - **Six unlock loads per run instead of ten** — a direct 40% cut to the FEAT-28 validation cost
>   that Open Q3's run-layer ruling made recurring.
> - **Authoring concentrates.** Six regions with identity beats ten that blur.

### Region size stays as-is — and a region is a chapter, not a play space

**No growth needed** [owner, 2026-08-01]. `REGION_RADIUS_M = 2500` (`src/story.js`) already takes
**~12 minutes to drive across** on this terrain — a 40–60 minute chapter is three to five crossings,
which is plenty of ground to get lost in and more than enough to learn. An earlier draft of this
section argued regions must scale with the mission budget; that was wrong, because it reasoned about
area on a map instead of minutes behind the wheel. **The relevant unit is drive time, and 2500 m
already buys it.**

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

> **What this does cost, honestly.** The *play space* grows monotonically even though the region does
> not, so streaming, routing coverage and the validated network all scale with **regions unlocked**,
> not with region size. That is FEAT-28's bill rather than a region-sizing one — and it is why the
> per-unlock budget on that ticket matters. Six unlocks is also 40% fewer than ten.
>
> A second-order one worth watching: **mission planning across region boundaries** needs the router to
> path over the union of unlocked regions, not just the current one. `src/mission.js`'s `_roll()`
> currently confines both endpoints inside the single active region (FEAT-43). That confinement has to
> become "inside the unlocked set" rather than "inside the current region" before cross-region
> missions work at all.

Rough allocation per region:

| | budget |
|---|---|
| Travel, camping, repair, driving to the trail | ~35% → **14–21 min** |
| The log drag (main mission) | **4–8 min** (longer trails deeper in) |
| Missions | **~20–32 min** |

Cross-check against the schedule: region 1 spends ~20–32 min on **5** missions ≈ **4–6 min each** —
short errands, which is what an opening region should be. Region 6 spends the same budget on **2**
≈ **10–16 min each** — two serious commitments. Both ends land where they should, which is the
sanity check that six regions and this schedule are the same decision.

### The mission count

7–8 days × ~2.7 missions/day ≈ **20–23 points per run** — the ratified band. Over six regions that
averages **3.5**, and the schedule falls with depth:

> **5 · 4 · 4 · 3 · 3 · 2** = **21 points**

Because a C-grade drive pays **½ a point** (SM-INV-14), the true counts are finer than the integers:
a region needing 3 might take three clean drives or six scrappy ones. That half-point is what stops a
struggling player stranding, and it is the only difficulty give in the progression system.

**This is the texture this document already predicted**, now authored rather than emergent: *region 1
gets cleared in five or six short errands and the last in one or two long hauls.* At six regions the
schedule lands on that sentence almost literally — region 1 needs **5**, region 6 needs **2**. Under the retired
XP formula that fell out of `XP = f(par)`; under a flat count it would have inverted (deep regions
needing the same count of far longer missions, blowing the per-region minute budget). The falling
schedule restores the intended shape and costs one authored number per region.

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
> region**. It is now **six hand-set counts**, falling with depth — legible, un-inflatable, and
> tunable one region at a time.

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

Sanity check on the far end: the deepest regions need **1 point**, i.e. a single well-driven mission.
That is deliberate — a late job is 8–10 minutes of committed driving in a wrecked truck — but it is
also the thinnest the schedule gets, and if the final region reads as a formality rather than a gauntlet,
the fix is the *quality* bar (require an A, not a B, in deep country), not more jobs.

## Implication for day length

The 24-minute sky cycle is ratified. What the arithmetic actually keys off is the **wall-clock cost
of a day** (~40–45 min including camping, repairs, shopping and travel):

| real min / day | days per run at 4–6 h |
|---|---|
| 24 (driving only — **the old error**) | 10–15 |
| **40–45 [RATIFIED 2026-08-01]** | **7–8** |

At 7–8 days the cadence lands near **one region per in-game day** with a little slack — still the
clean mental model for the player and the clean tuning unit for the designer, and now it is true of
the wall clock rather than only of the sky.

**What 7–8 costs, recorded honestly.** The sleep economy — coffee as a loan against tomorrow, camp
quality carrying into the next morning, the debt spiral — needs iterations to be *felt*, and seven
nights is fewer than ten. Two things to watch once it is playable:

- **The debt spiral has ~7 nights to become legible.** If a bad camp on night 3 doesn't visibly still
  hurt on night 5, the mechanic is decoration. Shorter runs mean each night has to carry more.
- **The cost curve has ~7 steps, not 15.** An escalating repair economy at 7 steps needs *bigger*
  steps to be felt, which argues for the hard per-day cutoffs the payout tier already uses rather than
  a smooth ramp. Coarser and more legible is the right direction here anyway.

Both are arguments for making each day matter more, not for lengthening the run.

## Saving

**A 4–6 hour run makes saving mandatory, and saving is what can kill the roguelike.** If a save can
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

4–6 hours is long for the genre — Isaac and Spelunky runs are well under an hour, FTL around two.
Most players will die repeatedly and **never finish a run**, which is correct and intended.

But it means **the first two regions will be played fifty times more than the last two.** Authoring
effort, mission-dressing variety, and polish should be weighted accordingly, and the early game has
to survive dozens of repetitions without becoming a chore. This is also the strongest argument for
keeping the first log drag to two or three pulls.

**Six regions sharpens this both ways** [2026-08-01]. Region 1 is now **a sixth of the game rather
than a tenth**, and it is 40–60 minutes rather than 24–36 — so the most-replayed content is both a
larger share of the run *and* individually longer. That raises the bar on it considerably.

The mitigation is the same thing that motivated six regions in the first place: **a region the player
comes to know survives repetition better than one they merely pass through.** Familiarity is a
feature on replay — knowing the road, the camp, the shortcut is exactly the literacy SM-INV-8 says is
the real progression. The risk is not that region 1 becomes familiar; it is that it becomes
*exhausted*, which is a question of how much the **procedural dressing** varies on top of fixed
ground. That is where the early-game authoring budget should go.

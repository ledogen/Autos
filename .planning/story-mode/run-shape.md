# Autos — Run shape and saving

*Working design notes, 2026-07-29. Downstream of `DESIGN.md`. Candidate for promotion into a
DESIGN.md mechanics-reference section once the save model is settled.*

---

## The target [RATIFIED 2026-07-29]

- **~10 regions** at current region size.
- **4–6 hours** to beat the game.
- **24-minute days** → ~10–15 days per run.
- **Saving is suspend-and-resume** (below).
- **XP is run-layer** — it resets with the run (amendment §3).
- The full trail chain must be completable in **one run** (SM-INV-7), since road clearance is
  run-layer and resets on death.

## Why XP velocity is the real currency

XP does not survive death. Its function is **positional**: a strong day one buys region 2 on day two,
and because service and parts costs escalate with run age (Q9A), unlocking early means arriving in
expensive country **before it gets expensive**. The head start becomes margin for something to go
wrong later.

This is what makes driving fast matter for *survival* rather than only for cash, and it is the reason
the game needs no countdown anywhere (SM-INV-3). The pressure is a cost curve the player is racing,
and the race is entirely diegetic.

**Corollary for tuning:** the cost-escalation curve and the XP curve are the same balance problem
seen from two sides. Tune them together or neither means anything.

---

## What the arithmetic says

240–360 minutes ÷ 10 regions = **24–36 minutes per region**, inclusive of everything: jobs, travel,
camping, repair trips, and the main mission.

Rough allocation per region:

| | budget |
|---|---|
| Travel, camping, repair, driving to the trail | ~35% |
| The log drag (main mission) | 3–5 min |
| Missions | **~12–19 min** |

**Offered ≠ required.** [clarified 2026-07-29] A region presents a **job board**; the player clears an
XP threshold. They never have to do everything on the board. So there are two separate numbers and
only one of them was computed above:

| | what it is | where it comes from |
|---|---|---|
| **Consumption** | how many jobs a player actually runs to clear the region | falls out of `XP = f(par)` — no tuning |
| **Supply** | how many the board offers | a deliberate content dial |

The 12–19 minutes of mission time per region is a **consumption** budget. It says region 1 gets
cleared in five or six short errands and region 10 in one or two long hauls — the count falls on its
own, because par grows with regional difficulty and each deep mission is worth more XP.

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

> **Tune time-per-region, not jobs-per-region.** The XP threshold should rise across regions, but
> *more slowly than par does*. That's one curve, not ten hand-set counts.

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
hours and the wear spent with no XP to show, against a rising cost floor and a finite day. Not a
resolution (Q6 is owner-only), but the overprovisioned board makes time the thing you actually spend.

Sanity check on the far end: if the threshold is flat and par grows steeply, deep regions could
resolve in a single mission, which reads as thin. Rising-but-lagging is the shape.

## Implication for day length

Days are 24–48 real minutes, giving:

| day length | days per run |
|---|---|
| **24 min [RATIFIED]** | **10–15** |
| 48 min | 5–7.5 |

The sleep economy — coffee as a loan against tomorrow, camp quality carrying into the next morning,
the debt spiral — needs iterations to be felt at all. Ten to fifteen nights gives those mechanics
room; five to seven barely lets a spiral start. **24 minutes is the ratified setting**, and the arithmetic is
why: at 24-minute days the cadence lands near *one region per in-game day*, which is a clean
mental model for the player and a clean tuning unit for the designer.

The rising-cost curve (Open Q9A) also wants steps: 10–15 days is a usable resolution for an
escalating repair economy; 5 is not.

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

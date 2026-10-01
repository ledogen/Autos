---
id: FEAT-92
type: feature
status: closed
severity: major
opened: 2026-09-30
source: owner, 2026-09-30 — "if you finish two average length missions a day slowly you'll be fine.
  But it starts to get hard to finish two in a day without driving kinda fast anyway. We want the
  player to have to fill approximately 80% of their day working and then fit in shopping and other
  stuff in the other 20%." + a headless measurement the same day showing the planner rolls jobs
  half as long as that needs.
relates: FEAT-53 (economy spine), FEAT-67 (offer board), FEAT-43 (region confinement — the 1500 m
  wall the route must fit inside), FEAT-54 (16 h waking day)
invariants: SM-INV-2 (par is priced by geometry, never scaled to fit), SM-INV-4 (as amended
  2026-09-30 — base/tip, break-even is a day), SM-INV-12 (worldgen meta-free)
design: DESIGN.md SM-INV-4 amendment 2026-09-30 ("the day, in plain words"); run-shape.md "The
  mission-length ladder" (RATIFIED 2026-08-02: region 1 ~5–7 h par, two fit a 16 h day)
---

> **WITHDRAWN 2026-09-30 — owner: "i think we're actually ok since you're not considering the time
> taken between routes and the occasional need to stop for food or items."** Mission length stays.
> The measurement below stands as the record of what the planner rolls. The one consequence that
> was mine to fix — the dollar anchor assumed a 6 h job — is fixed the other way: `k` is now
> anchored to the measured 3 h average (`10/180`), so an average day-1 job completes for $5.

# FEAT-92: Region-1 jobs are half the ratified length — two a day fill 47% of the day, not ~80%

## The gap, measured

Headless, 2026-09-30: two story regions (seed 6 and seed 90, 1600 m window), every roster POI,
12 anchored rolls each — 303 jobs through the real planner (`MissionSystem._roll`).

| | rolled today | ratified (run-shape.md) |
|---|---|---|
| par, mean / median | **182 s = 3.0 game hours** | ~5–7 h (300–420 s) |
| par, p10 – p90 | 2.1 – 4.0 h | |
| route length, median | 3.1 km (p90 4.3 km) | ~6 km at the same par speed |

One game hour is 60 s real (`dayLengthSec` 1440); the waking day is 16 h (`fullEnergyH`).

| two average jobs driven at | driving time | share of the 16 h day |
|---|---|---|
| S pace (ratio 0.77) | 4.7 h | 29% |
| par | 6.1 h | 38% |
| slow (ratio 1.23, tip gone) | 7.5 h | 47% |

So today three or four jobs fit a day without hurrying. The owner's rule needs two to be a squeeze.

## Why it matters twice

1. **The clock.** "Hard to finish two in a day without driving kinda fast" is false today. At the
   ratified ~6 h par it is true by construction: two at par = 12 h = 75% of the day, two driven
   slowly (ratio 1.23) = 14.8 h = 92%, before the drive to the next giver.
2. **The money.** `ECONOMY_PARAMS.k` is anchored to the owner's day-1 numbers on a 360 s job
   (D $5 · par $7.50 · S $10). Pay scales with par, so today's average 182 s job pays half of that:
   D $2.53 · S $5.06. The RULES still hold at any length (two poor jobs or one excellent one clear
   a day of 1.5 base pays; one poor job does not) — only the dollar figures are off. Do NOT fix
   this by re-anchoring k to 182 s: the end-of-run targets and the region ladder are authored
   against the ratified lengths.

## Levers — the owner's to pick

- **Longer routes** (recommended; it is what run-shape.md already ratified). `LEG_MIN` / `LEG_MAX`
  in `src/mission.js` are 1500 / 4000 m; ~6 h par needs ~5–7 km. Unknown until tried: whether a
  1500 m-radius region (3 km across) supplies 6 km routes often enough, and whether `MAX_EDGES` 9
  has to rise (each edge costs tens of ms to route on a cache miss).
- **Shorter day** (`dayLengthSec`, RATIFIED 24 min) — halving it would fit the clock without
  touching routes, but re-prices sleep, fuel and the sky, and leaves the money half-size.
- **Count the commute.** If "working" includes driving to the next giver, measure that leg too
  before sizing the route — it may already be worth 1–2 h a job.

## Acceptance

- [ ] A headless roll over ≥ 2 regions reports mean region-1 par inside the ratified 5–7 h, or the
      owner re-ratifies a different figure in run-shape.md.
- [ ] Two average jobs at par fill 70–85% of the waking day (drive time, stated with or without
      the commute — say which).
- [ ] An average day-1 job completes for ~$5 and maxes at ~$10 with `k` unchanged.
- [ ] No-route rate at the roster POIs does not get worse (story-poi / mission-network gates green).

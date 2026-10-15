---
id: FEAT-113
type: feature
status: open
severity: major
opened: 2026-10-14
source: owner, 2026-10-12 / 2026-10-14 — "Missions should also have a timer, on the order of several
  days down to several hours, that lets a player know if they can camp out with a load and still get
  paid." 2026-10-14: "build expiration for all jobs. Some are lax 1–3 days (freight), most are chill
  6 h–1 d, some are stringent 1 h–4 h (takeout)." And: "mission clock should keep counting through
  the night, linked to world time. Camping doesn't automatically forfeit your tip, it just burns time
  and challenges it."
relates: FEAT-67 (offer board, the lock rule), FEAT-118 (the camp pause — the clock holds there),
  src/mission.js (`elapsed`), src/day.js (the world clock), src/offer-board.js (taken slots never
  expire today), DESIGN.md "The day and the clock" (job-dependent camping, 2026-07-19)
invariants: SM-INV-3 (the card states a deadline; no live countdown while driving), SM-INV-12
design: design-amendments-2026-10-14.md §5–6
---

# FEAT-113: Delivery deadlines for every job, and a mission clock on world time

## Two changes

**1. Every job gets a delivery deadline.** It starts at accept and comes from the cargo: a `windowH`
on each thing in `data/offers.js`, with family defaults, rolled per offer from the seed.

| Band | Window | Default for |
|---|---|---|
| Lax | 1–3 days | freight |
| Chill | 6 h – 1 day | most jobs |
| Stringent | 1–4 h | takeout, perishables |

The card shows the deadline next to the board expiry (they are different clocks: board expiry is
when the offer leaves the board). A job still in hand when its deadline passes is cancelled through
the existing cancel path, and the giver's slot locks under the lock rule. Today a taken slot never
expires (`offer-board.js`, `taken` → `Infinity`).

**2. The mission clock runs on world time.** `elapsed` becomes world-clock time since the start,
so sleep and time skips (repairs, clean-up) count. Today it adds only driving frames, so a tip
survives a night untouched. After this, camping spends time against the tip: on an average
region-1 job (par 180 s = 3 game hours) an 8 h night takes the ratio past 2.7 and the tip is gone,
while a long job can keep some. Pauses (shops, FEAT-118's camp) hold the world clock, so they hold
`elapsed` too.

## Open

- A strapped load whose deadline passes: does it clear like "clean up cargo" (which costs 1 h), or
  for free?
- The card's "fits a night's sleep" mark: shown when the deadline reaches past the next morning?

## Acceptance

- [ ] Every posted thing has a window (own or family default); the gate fails on a missing one.
- [ ] The card shows the deadline; the HUD shows no countdown while driving (SM-INV-3).
- [ ] A deadline passing with the job in hand cancels it and locks the slot.
- [ ] `elapsed` includes sleep and time skips; a headless gate settles a job across a sleep and gets
      the world-time ratio.
- [ ] Same seed and inputs → the same windows and results (SM-INV-12).

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

## Handoff (2026-10-15) — read before starting

**Where things stand.** SM-3's build order (MILESTONES.md "Next up") is down to this ticket.
FEAT-97 fragile and FEAT-118 camp pause are done and on main. BUG-87 (the board advertised
offers it couldn't plan) is fixed; the owner ruled a giver with no reachable job may stay empty all
run.

**Unmerged work.** Worktree `CarGame-sm3-abandon`, branch `feature/sm3-abandon`, is committed but
NOT merged (b68ba88: abandon needs a park and ends on an "Abandoned" $0 card; the blue P badge; plus
the FEAT-97 close). Merge only when the owner says "merge": `npm run test:all` first (known reds:
road-tunnel, road-clearance), then `bash ~/.claude/skills/worktree/scripts/wt.sh merge sm3-abandon`,
`clean`, and `title.sh --clear`. Main may hold another session's uncommitted edits (seen: LAYOUT.md,
CLAUDE.md, tools/dashboard for FEAT-120); if the merge touches one, stash just that file, merge, and
pop it back.

**What this ticket touches that just changed.**
- `missionSystem.cancel(cargo)` (src/mission.js) no longer idles: it ends on the result card with
  `result = { abandoned: true, payout: 0, cargo, … }`, and "continue" exits. The paper route's
  `cancel()` does the same. The deadline-passed cancel this ticket adds will reuse that path, so as
  built it would read **"Abandoned"**. Ask the owner whether an expired job should say "Expired"
  (or similar) instead; it is one field on the result and one branch in main.js `_abandonedCard`.
- The abandon button needs the truck parked (main.js `_jobCancelLabel`, the click handler). A
  deadline expiry is not a button press, so it must not wait for a park.
- The camp pause (FEAT-118) holds `daySystem.update` while a camp face is up (main.js frame loop,
  `if (!_campUi || _campUi.mode === 'confirm')`). A world-time `elapsed` inherits that hold for free
  if it reads `daySystem`'s clock rather than summing frames.
- Fragile's tip reads condition, not the clock, and fragile and haul show no rank bar
  (`_rankTimerSource`). Freight and courier tips still read `elapsed`, so world time hits them.
- Clean-up costs 1 h (`CLEANUP_H`, main.js) through `daySystem.advanceMinutes`. Under world time it
  will now count against the clock.

**The two Open questions above are still the owner's.** Don't pick defaults for them silently.

**Working rules for this owner** (from memory): engineer, not programmer — gloss code and platform
terms inline in one clause; commit only when asked, `git commit -- <paths>`; no retuning from one
run; when docs or decisions conflict, ask; never kill caffeinate. Ticket IDs: check every open
worktree before minting (BUG-86 collided this session).

## Acceptance

- [ ] Every posted thing has a window (own or family default); the gate fails on a missing one.
- [ ] The card shows the deadline; the HUD shows no countdown while driving (SM-INV-3).
- [ ] A deadline passing with the job in hand cancels it and locks the slot.
- [ ] `elapsed` includes sleep and time skips; a headless gate settles a job across a sleep and gets
      the world-time ratio.
- [ ] Same seed and inputs → the same windows and results (SM-INV-12).

---
id: FEAT-113
type: feature
status: closed
closed: 2026-10-16
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

**1. Every job gets a delivery deadline.** It starts at accept and is **par × (1 + slack)**, with the
slack set by the cargo: a `deadlineSlack` on a thing in `data/offers.js`, else its family's default
(`DEADLINE_SLACK`). Owner, 2026-10-15, replacing the 10-14 fixed bands: *"more robust to have deadlines
be par +20% for takeout, par +100% for freight and fragile, par +50% for other courier."* Second
pass the same day: *"+50% for takeout (should still be generous for noobs), +100% for other courier,
+300% for freight."* Third pass: haul and fragile +200 %.

| Slack | Applies to |
|---|---|
| +50 % | takeout |
| +100 % | other courier (delivery), papers\*, demolition\* |
| +200 % | haul, fragile |
| +300 % | freight |

\* not ruled; picked when building, open to change.

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

- ~~A strapped load whose deadline passes~~ — owner, 2026-10-15: no auto-cancel and no card while
  driving. The cancel button turns into **"mission expired"**, pressable only when parked, and the
  expired card shows after it. The HUD shows the deadline as a fixed time ("due Day 3, 2 am"), never
  a countdown, and "Day N" stays (no weekday names). A strapped load still costs the 1 h clean-up
  when signed off (owner, 2026-10-15).
- ~~"Fits a night's sleep" mark~~ — owner, 2026-10-15: no. The deadline line alone is enough.
- ~~Camping with a job in hand~~ — owner, 2026-10-15: allowed. Checked: making camp digs the bench
  at the graded site beside the truck, and sleeping only jumps the clock and turns the ignition off.
  Nothing teleports or reseats the truck, so a parked load stays put. A truck parked on a slope too
  steep to hold is the player's own cargo loss (owner).

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

## Progress (2026-10-15)

Built:
- **Slacks.** `data/offers.js` has `DEADLINE_SLACK` (the family defaults); `takeout` carries
  `deadlineSlack: 0.5`.
- **The board** (`offer-board.js`):
  - `take(id, nowH, parS)` stamps `dueH = nowH + deadlineH(offer, parS)`, where `deadlineH` is
    par in game hours (60 real s each) × (1 + slack). No par → no deadline.
  - A taken slot locks lazily AT `dueH`, budget slots included.
  - The card adds "deliver within …".
- **World-time elapsed** (`mission.js`, `paper-route.js`). `elapsed` is the world clock since the
  start line, through a `getClockH` dep. Without the dep it falls back to summing steps, which is
  what the headless gates use.
- **Expiry.** Past `dueH` the job is `expired`: no arrival and no scoring. `expire()` closes it
  unpaid.
- **`main.js`.**
  - The "mission expired" button (single click, disabled until parked).
  - "· due Day N, h am" on the running and staging HUD.
  - The expired card, for POI jobs and Larry's route.
  - Camping and mom's house are allowed with a job in hand (only an offer panel or a result
    card still refuses).
  - The day clock now steps inside the fixed physics step (PHYSICS_DT), so the mission clocks
    read a world clock that has moved exactly this step, and a PERF-32 overload never bills world
    time for road the truck didn't drive.
- **Planning docs amended (2026-10-15):** SM-INV-3 (every job has a deadline; still no countdown)
  and SM-INV-4 (slow still pays base; past the deadline pays nothing) in DESIGN.md, plus DESIGN.md
  "The day and the clock", missions.md, cargo.md, pois.md (Larry) and the MILESTONES row.
- **Review pass** (repo review, feature/repo-review-2): the game-hour unit is read at use
  (`dayLengthSec` is a live slider); `formatDue` rounds minutes first; an expired paper round
  spends no stock, scores no landing, has no export, and shows no rank bar (POI jobs too).

Gates green: offer-board (new §16) and story-poi (new §7d: sleep mid-job → world-time ratio; past
the deadline → no settle, `expire()` unpaid, slot already locked), plus every other affected gate.
Not yet checked in the browser.

## Resolution (2026-10-16)

Owner played it on feature/sm3-abandon: the seven live checks (expiry flow, camping with cargo, a
job across a night, the readouts, an ordinary delivery, a strapped load expiring, the paper route)
all pass. Playtest follow-ups, same pass:
- The cancel button reads "abandon job" on a strapped load unless it is wrecked ("cargo destroyed ·
  clean up"); the clean-up hour still applies.
- The wallet clock reads "Day 2, 11:07 am", the same notation as a due time, and the wallet card
  stays over the map, where offers are weighed.
- The due time left the top bar: "DUE: Day 2, 3:30 pm" sits under the rank tile (#job-stack), from
  accept, on every job type.
- The top bar dropped elapsed time; the rank bar reads time against par.

Built on top of FEAT-97's abandon flow; papers slack (+100 %) stays unruled.

---
id: BUG-117
type: bug
status: closed
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed by the orchestrator, verbatim) — "Mom's tutorial mission is able to hard expire. Which means the player will never end up at Larry's house to get the final tutorial cards. This first mission must not be able to expire and needs to block the progression of the story mode upon the player arriving at Larry's. I also don't really like how this first mission can have a variable amount of pay depending on how long the route is so I think I'm considering making this part of the skippable tutorial and for it to not reward the player. Maybe just a letter reward."
relates: FEAT-147 (the first job), FEAT-170 (the opening / skip), FEAT-113 (deadlines)
---
lane: A

# BUG-117: mom's casserole can expire, so the player never reaches Larry's welcome

**Waiting on the owner (2026-11-07):** the pay call (`bug117-pay`: no pay and a letter, recommended). Everything else is on main (0a0e25a4); BUG-124 (7fb41583) made sure the casserole always plans.

Mom's casserole (FEAT-147, `data/offers.js FIRST_JOB`) was an ordinary courier job, so it had the ordinary deadline
(FEAT-113, par × (1 + slack) from accept). Once past it, the job is dead in hand. Larry's welcome and his
expedition-camp intro (`_checkOpeningEnd`) then play wherever the player happens to be, or the player never goes
to Larry's at all. The tutorial's last cards were tied to an end that could happen anywhere.

## Built (Lane A, 2026-11-06)

- **No deadline.** `offer-board.js take()` gives the first job `dueH = Infinity`, as it already does for a
  requisition line, so it can never expire. Its card shows no "time limit" (the card now also hides it on a line,
  which has never had one either).
- **No abandon.** The abandon button (`#job-cancel`), its J key and the pad's B-menu entry all stay hidden while it
  is in hand (`main.js _syncJobCancel`, `firstState() === 'taken'`). Abandoning was the same hole as expiry: an end
  away from Larry's. *(Lane A's call, the owner did not say: if abandon should stay, the alternative is a line's
  rule, where an abandoned casserole goes back on mom's board and every other job waits until it is delivered.)*
- **So the story waits for Larry's.** Delivery at Larry's is now the casserole's only end in a run. One job at a
  time holds every other job back until then, and his welcome plays on that delivery's result card.
- A save/resume keeps it: the board replays its `take()` (no deadline again), and the mission's saved `dueH`
  comes back as `null`, which mission.js already reads as "no deadline".
- Gates: `test/offer-board.mjs` (no time limit, `dueH` Infinity, still in hand 200 h on). cdp-smoke: the story,
  endings and pad steps deliver the casserole (`deliverFirst`) instead of abandoning it. The pad step's B-menu
  abandon test moved to a job taken at the giver.

## Owed: the owner's call on the pay

The owner is "considering" taking pay off this job. Today it pays like any courier job, scaled by its route's par,
so the amount varies by seed. **Recommended: no pay, a letter only.** It reads as the tutorial's grade and nothing
else, and every seed starts with the same wallet. Today the delivery is also a good deed; under the
recommendation it would give none, so the deeds gate counts only real jobs. Alternatives: a fixed pay on every seed
(say the day-1 par, $7.50), or keep it as it is.

## Acceptance

- [x] The first job never expires (gate: offer-board).
- [x] It cannot be abandoned; it ends only at Larry's, where his welcome plays (smoke: story, endings, pad).
- [ ] The owner's pay call, then built.

## Resolution — the owner's pay call, built (Lane A, 2026-11-07)

**Owner, bug117-pay: "1 — a letter, no pay".** Mom's casserole pays nothing and earns no deed. It is the tutorial's
grade and nothing else, so every seed starts on the same wallet and the deeds count real jobs only.

- **The card** (`src/offer-board.js` `card`): no pay line and no deed line on mom's offer. It still shows no time
  limit.
- **The settle** (`src/main.js` onSettle): `mission.first` (set in `_planOne` from the spec, so a resumed job keeps it)
  settles with $0 and no deed, and completes the offer, so Larry's welcome follows as before.
- **The result card**: its letter and its time, the paper route's form, with no money rows and no deed row.
- Gate: `test/offer-board.mjs` checks the card has no pay and no deed. The smoke's `story`, `endings` and `pad` steps
  deliver the casserole and read Larry's welcome after its card.

Every acceptance line above was already ticked; this closes the last owed call.

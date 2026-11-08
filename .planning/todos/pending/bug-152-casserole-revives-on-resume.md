---
id: BUG-152
type: bug
status: open
severity: major
opened: 2026-11-08
source: Lane A, the run-soak's save & resume check (eating soak, 2026-11-08)
relates: FEAT-184 (the skip lands at Larry's, casserole delivered — c87e78ac), FEAT-147 (the first job), FEAT-42 (the run save; save.js logBoard)
---
lane: A

# BUG-152: after a save & resume, mom's casserole comes back 'live' and her door offers it instead of the bed

A run that skipped the opening has the first job 'done' (FEAT-184). After a save & exit → Continue, it was 'live'
again on two soak seeds: 3523619642 at day 10, and 2782385833 on night 2. Money and clock came back exactly.
There were no console errors. Mom's pad then answers like a giver: parking there opens the casserole card,
not the sleep card, so a night at mom's soft-locks. It is intermittent: 2782385833 replayed clean on a rerun.

## The mechanism (what can and cannot do it)

- The board is a pure function of seed + roster + its call log. `logBoard` (save.js) logs every mutator call that
  returned truthy, and `_restoreRun` replays the log onto a fresh board.
- `openFirst` acts only on 'closed', so 'done' can never become 'live' directly. The replay must have left the first
  job 'closed' or 'live'. A 'closed' first job is re-posted at once by the HUD poll (`_eveningLeg` → `_endEvening`).
- `_slotOf` finds the first job only when the offer id's POI part equals `this._first.poiId` (mom's id). That id is
  `poi:<nodeA>|<nodeB>@<n>`, built from road-node keys, and a promoted (T) node's key is its millimetre-quantised
  world XZ. If mom's id differs between the saving session and the resumed one, the replayed take/complete find no
  slot, they are dropped from the new log, and every later save carries the loss.

## Status

Hypothesis above: unconfirmed until a captured save shows mom's id before vs after.
The soak writes `wip/run-soak/resume-<seed>-day<N>.json` when a resume changes the first job.

## Acceptance

- Root cause named and fixed where it lives.
- A gate resumes a skipped run's save and checks the first job stays 'done'.
- The soak's resume check (first job unchanged) holds over a multi-seed soak.

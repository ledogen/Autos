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

## Status (2026-11-08, on hold by owner — resume here)

**Confirmed: a resumed session sometimes builds a DIFFERENT POI roster, not just a different mom id.**
Every POI's id changed at once, with the same count of 27. Seed 2782385833: new run → teleport to a gas pump →
save & resume, and the roster changed completely (mom `poi:-1,0,2|-2,0,1@1` → `poi:0,-1,1|1037088,-503982,-1@0`).
The next resume changed it again. The replayed take/complete then miss mom's slot, and the casserole goes live.

- **Not c87e78ac's logic.** The skip only logs ordinary board ops. Any board event keyed on a POI id (a taken
  job, a line) is lost the same way when the roster changes. The first job is just the one a soak notices.
- **Intermittent and timing-dependent**, not a function of the save. 20 idle resumes at Larry's and 30 fresh starts
  were all identical. Probes with teleports caught 1 odd session in about 10. The soak caught 2 in about 90 resumes.
  A resume after an odd session came back normal.
- **Normal sessions agree exactly.** Same centre to 1 cm, same main-piece size (2782385833: centre (−24.52, −331.6),
  74 nodes; 3523619642: (367.11, −129.94), 56; 673506946: (−95.19, 365.54), 60).
- **Ruled out:**
  - the save's regex rename;
  - a swallowed `_restoreRun` throw (0 console errors);
  - a second onRegionLive (the clock is kept);
  - stale network replies (the client checks instance + seed + epoch);
  - pond discs (analytic).
- **Next step:** catch an odd session with its build inputs. `test/zz-probe-resume.mjs` (UNTRACKED scratch copy of
  run-soak, never commit) wraps `poiSystem.build` and records centre, radius, main-piece size,
  `__roadSys()._network.size`, `_proto.radius` and `_lastBandSig` in `window.__ctr`. Its `--first` mode loops
  new run → teleport → one resume and prints SAME/ODD with both sets of stats. Run it as
  `tools/chrome-slot.sh node test/zz-probe-resume.mjs --first --seeds=2782385833 --loops=12`.
  Its multi-resume mode can't reseat after the 2nd reload (the sim stays held), so use `--first`.
- **Suspects to test against that capture:**
  - (a) `RoadNetworkClient.buildNow` queues as reason `'move'`. A queued 'move' is coalesced by overwriting its
    x/z/radius, so a per-frame move could shrink a queued region build, and the waiter still resolves true.
  - (b) the region centre (`story._beginWarm` reads the truck position) is taken before the story seed's seat lands.
    For example, the boot reseat's `resolveSpawn` is still in flight when Continue is clicked: it resumes against
    the new global `roadSystem`. Continue is clicked earlier after boot than New → Start, which may be why resumes
    are the odd ones.
- Bisect: a detached 968cd1a4 worktree is at `../CarGame-run-shape-val`. Its probe ran clean, but most of its
  teleports failed, so that result is weak. The soak still writes `wip/run-soak/resume-<seed>-day<N>.json` when a
  resume changes the first job.

## Acceptance

- Root cause named and fixed where it lives.
- A gate resumes a skipped run's save and checks the first job stays 'done'.
- The soak's resume check (first job unchanged) holds over a multi-seed soak.

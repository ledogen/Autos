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

## Status (2026-11-08, on hold by owner — fixes 1–4 committed as desk edits, unrun; resume at "Owed when the hold lifts")

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
  - pond discs (analytic). WRONG — see Root cause 2: the discs were analytic but from the wrong world.
- Bisect: a detached 968cd1a4 worktree is at `../CarGame-run-shape-val`. Its probe ran clean, but most of its
  teleports failed, so that result is weak. The soak still writes `wip/run-soak/resume-<seed>-day<N>.json` when a
  resume changes the first job.

## Root cause (desk read, 2026-11-08, low-power mode — no browser runs)

### What the odd roster is

The roster is a pure function of (region centre, radius, main piece, road network, POI params, seed). `poi.js`
has no unseeded randomness. The odd roster on 2782385833 reuses the normal roster's PADS: the same edges, and the
same promoted-T ids such as `1356263,-197501`. But it puts different TYPES on them. For example,
`poi:1,0,1|1356263,-197501,-1@0` is a gas pump in the normal roster and an auto shop in the odd one.

So the network was the same and the SITING moved. Siting reads the centre directly: nearSpawn is a 1000 m ring
around the centre (mom, Larry), and the coverage picks measure from it. It also reads the main piece.

### The two named suspects, ruled out by reading

- **(a) 'move' coalescing cannot fire during entry.** During 'warming' nothing else sends a 'play' request while
  the region build is queued:
  - the frame-loop stream is off (`story.js:126` `isRoadStreamSuspended`, `main.js:10239`);
  - resolveSpawn has already finished, because the warm only starts after the settle;
  - every other `roadSystem.update()` caller is the 'params' adopt hook, `releaseRegion` (exit) or a debug slider.

  It is still a latent trap for a future caller: `road-network-client.js:109` lets a later 'move' overwrite a queued
  `buildNow` entry's window, and that entry's waiter still resolves `true`. Not this bug.
- **(b) as written, the boot reseat still in flight at Continue, is impossible.** The boot awaits its seat at top
  level (`main.js:7933`) before `__rsReady` is set.
- Also out:
  - a validator throw or a warm timeout: both log `[story]` warnings, and the probe captured none in the odd
    sessions;
  - the worker's warm-fail or timeout path: it builds the same pure routes synchronously;
  - a shared `_rebuildPending`: only the debug sliders call `rebuildTerrainFull`.

### What is left: the centre is read from the truck, after a settle that does not prove the truck was seated

- `story._beginWarm` (`story.js:196`) takes the region centre from `getVehiclePosition()`. It runs when `applySeed`'s
  promise settles.
- That promise resolves EVEN WHEN the rebuild or its seat failed. `debouncedRebuildFull` does
  `.catch(warn).finally(resolve)` (`main.js:816`), and `story.enter` adds `.catch(warn).then(_beginWarm)`
  (`story.js:185`).
- If anything in `_rebuildFullNow` or the story seed's `_reseatTruckAtSpawn` throws, the truck is still at the menu
  world's spawn when `_beginWarm` reads it. The menu world is a random seed.
- Every seed's spawn is within about 600 m of the origin: `_spawnProbeBase` (`main.js:598`) puts the base at
  ±100 m, and the spawn is the nearest road within 544 m.
- So the region gets built for the right seed, shifted a few hundred metres. That gives the same network and pads
  with reshuffled siting, which is exactly the signature above.
- The only trace is a `console.warn('[main] full rebuild failed')`. The soak counts only errors, and the probe's
  warning filter (`/story|save|board/`) did not match it.
- **Confidence:** the "siting moved, network didn't" part is high: it comes from the ids. "The centre came from a
  stale truck after a swallowed failure" is probable but NOT proven, because what throws is unknown.
  The remaining alternative is the main piece differing. The `--first` probe's `__ctr` (centre, main-piece size,
  network size) decides it in one odd session.

## Proposed fix

1. **The region centre is a function of the seed, never of the truck.**
   - `_beginWarm` takes the centre from a new `spawnCentre()` dependency: main.js's `resolveSpawn(worldSeed)`, which
     is memoised and computed on the seed's own network.
   - Main then seats the truck there. Normally it is already there, so this is a no-op.
   - This implements the 2026-08-11 ruling ("the seed decides where the world is built, and nothing else") at its
     source. The truck-position proxy is the leak. It closes the class whatever the failing step turns out to be.
2. **A failed settle must not enter silently.**
   - `debouncedRebuildFull` currently swallows the error for story entry. Return the failure instead.
   - `story.enter` then retries the settle once, else shows the seed card.
   - Log it with `console.error`, so cdp-smoke and the soak go red instead of building a shifted world.
3. **Defence on resume.** `logBoard`'s replay (`save.js:66`) counts events that no longer apply (the call returned
   falsy). If any did, it logs `console.error('[save] board replay dropped N of M events')`. Any future roster drift
   then fails a gate loudly instead of reviving the casserole quietly. This is an integrity check at load, not
   per-frame plumbing.
4. **The gate owed to the orchestrator.** cdp-smoke's `save` step already does a save & exit and Continue. Add two
   checks there:
   - the first job's state is unchanged across the resume (the opening step leaves it 'done');
   - every `__poi().list()` id is unchanged.

   One resume can't catch a 1-in-10 race. It pins the contract, and the soak's resume check (on this branch) is the
   statistical net. Together with fix 2, a swallowed settle failure turns any smoke red.
5. **Proof, when power allows.** Widen the probe's warning filter to every warning, then run
   `tools/chrome-slot.sh node test/zz-probe-resume.mjs --first --seeds=2782385833 --loops=12`. It needs Chrome and
   Vite, so not in low-power mode.
   - Expected for an odd session: `__ctr`'s centre ≠ the normal centre, with a `[main] full rebuild failed` warning
     next to it.
   - If the centre matches but the main piece differs, fix 1 is the wrong place and the network or main-piece path
     needs the next read.

`test/zz-probe-resume.mjs` (UNTRACKED scratch copy of run-soak, never commit) wraps `poiSystem.build` and records
centre, radius, main-piece size, `__roadSys()._network.size`, `_proto.radius` and `_lastBandSig` in
`window.__ctr`. Its `--first` mode loops new run → teleport → one resume and prints SAME/ODD with both sets of
stats. Its multi-resume mode can't reseat after the 2nd reload (the sim stays held), so use `--first`.

## Fixes 1–4 on feature/run-shape (desk edits, 2026-11-08 — NOT YET RUN, low-power hold)

### The orchestrator's check: today's centre is NOT exactly `resolveSpawn`'s point

- Story's seat is `_seatOnGroundPlane(spawn.x, spawn.z, heading, eq, 0)` (`main.js:1078`). It lifts the body
  centre off the road along the plane NORMAL: `x = cx + n.x × 0.6 m`, `z = cz + n.z × 0.6 m` (`eq.bodyY` = 0.600 m).
- Nothing else moves the truck before `_beginWarm`. `story.enter` raises the stage load first, which sets
  `_simHeld`, and the frame loop zeroes the accumulator while held (`main.js:9830`).
- So today's centre is the spawn point shifted downhill-normal by 0.6 m × sin(grade): **1.2 cm at 2 %, 6 cm at
  10 %, 14 cm at the 24 % cap.** It is deterministic (normal sessions agree to 1 cm), but it is not `resolveSpawn`.
- This is very likely the 0.06–0.12 m "game vs replica" gap recorded in `world-determinism.mjs` 1b.
- **Consequence: fix 1 moves every seed's live centre by those few cm.** A POI pick changes only where a ranking
  or the 1000 m near-spawn ring sits within centimetres of a tie. That should be rare, but it is every seed's
  roster in principle. So it needs a proof run plus the orchestrator's look before landing.
  - `fingerprint-world.mjs` does not drive story entry, so it should come back IDENTICAL and proves little here.
  - The meaningful proof is a browser roster compare: about 10 random seeds, main vs this branch, new run only,
    `__poi().list()` ids. It reports which seeds' rosters changed.
  - **A save made on main for an affected seed would resume onto the shifted roster.** Fix 3 now reports that
    loudly (`[save] board replay dropped …`) instead of reviving the casserole quietly. It is still a broken resume
    for that run.
  - **Ruled (orchestrator, 2026-11-08): no `RUN_SAVE_VERSION` bump by default.** A bump wipes every save, including
    the many that would resume fine, and fix 3 makes the rare re-sited resume loud. If the roster compare shows
    changes on 2 or more of about 10 seeds, it goes back to the orchestrator for an owner ask.
- **Ruled (orchestrator, 2026-11-08): the centre stays `resolveSpawn`'s raw point.** Every headless story gate already
  centres on `spawnDecision`, the replica of that point, so the gates finally measure the region the game builds.
  The roster compare decides the rest. (The alternative was the seat transform of the spawn, which keeps today's
  centre to the bit.)

### What changed

1. **Centre from the seed** (4a7f7dd0).
   - main.js has a new `spawnCentre` dependency. It returns `resolveSpawn(worldSeed)`'s point, which is memoised,
     so it is a hit right after the settle.
   - `story._beginWarm(c)` centres on it.
   - The truck is only checked against the centre: more than 1 m off gives `console.error('[story] the truck is
     not at the seed's spawn')`. That line is also probe 5's discriminator.
   - A source-text check in `world-determinism.mjs` section 4 pins the centre to `spawnCentre()`.
2. **A failed settle is loud and never enters** (4a7f7dd0).
   - `debouncedRebuildFull` now resolves `true`/`false` and never rejects, because other callers ignore the promise.
     A failure logs with `console.error`.
   - `story.enter` retries a failed settle once, then `_settleFailed` refuses the entry like an unplayable seed:
     a fresh run re-rolls (BUG-100's path), and a resume gets the plain seed card with no "start anyway".
   - **A second leak of the same class:** the 20 s `SETTLE_MAX_MS` timeout used to start the warm "with the current
     position as center". It now starts the warm on `spawnCentre()` instead, with no behaviour change. It still enters
     and never refuses. A first cut made it refuse (4a7f7dd0). The orchestrator ruled that out: a slow laptop at
     cpu ×4 takes about 23 s cold to driving, so a re-roll would be just as slow and would loop.
     - `spawnCentre` queues behind `_reseatChain`. `_rebuildFullNow` has no await before its reseat, so the seat is
       queued 150 ms after `applySeed`. A mid-settle call therefore waits for the seat and hits the memo. It never runs
       a second `resolveSpawn` across the seat's `setRadius`/`buildNow`, or on the old seed's `RoadSystem`.
     - Only a settle that actually reports failure is refused.
3. **Replay drops are reported** (b33070eb).
   - `logBoard` counts events that no longer take and logs `console.error('[save] board replay dropped N of M
     events')`.
   - The `run-save` gate gains two checks: a faithful replay stays quiet, and a replay onto a re-sited roster
     reports every event dropped.
4. **Smoke contract** (13480b31). cdp-smoke's `save` step checks two things across the save & exit → Continue:
   - every POI id survives;
   - the first job's state is unchanged.

### Owed when the hold lifts

- **Probe 5:**
  - widen the probe's warning filter to all warnings and errors;
  - run `tools/chrome-slot.sh node test/zz-probe-resume.mjs --first --seeds=2782385833 --loops=12` on this branch;
  - expect 12 SAME. Any ODD must now carry a console error naming its cause.
  - On a pre-fix checkout, the same probe should show the odd session's centre away from the normal one.
- **Gates:** `node test/run-all.mjs --serial --changed=src/story.js,src/main.js,src/save.js,test/run-save.mjs,test/world-determinism.mjs`,
  then the smoke (`--browser`).
- **The roster compare** above, then the orchestrator's look, before landing.

## Run results (2026-11-09, after the hold lifted; branch head 0db6eade, main merged at e5098117)

- **Probe 5:** 12/12 SAME on seed 2782385833. The centre was identical on the new and the resumed run every time, with zero warnings or errors.
- **Roster compare:** 10 random seeds, one new run each, on main (b9b32a6c) and the branch. 10/10 rosters are identical (27 POIs each, same id hashes).
  - The centre moved 0–21 cm. The worst was seed 474840339, at 0.20 m in x and 0.05 m in z.
  - That is more than the 14 cm the seat-lift estimate allows, so the lift is not the whole offset. No roster changed, so there is no RUN_SAVE_VERSION bump (ruling 3).
- **Gates:** 17/17 affected gates green.
- **Smoke:** 26/26 steps, zero console errors. The 'save' step's roster check held across the resume.
- **Still open:** the acceptance's multi-seed soak (the soak's resume check over several seeds).

## Root cause 2 (2026-11-09, Lane A): a build request carried the live seed beside the old world's ponds

Fixes 1–4 closed the shifted-centre roster. The next soak still found an odd resume (seed 336086702, night 6: the
food vendor gone, the camp re-sited, "board replay dropped 16 of 26 events"; night 7 normal). This one is a
DIFFERENT mechanism: the road network itself differed, not just the siting.

### How it was caught

- A reload probe (`zz-probe-resume.mjs --reloads`: one new run, then save → reload → Continue, 40–80 times) dumps
  everything `poiSystem.build` reads. It caught 1 odd session in 41, then 1 in 45 with scratch instrumentation in
  the network Worker that logs every build it runs.
- The odd network: 8 edges with the same endpoints routed up to 250 m apart, a different T layout (63 nodes, not
  62), 166 runs, not 167. Not ULP noise: whole re-routes.
- The Worker's log of that session shows the cause directly (`wip/run-soak/bug152-ODD-reload2-44.json`):
  - the menu world (random seed 1707064627) built twice, then a third build at the menu truck's spot went stale
    when Continue switched the seed;
  - the story seed's Worker instance was then BORN from a request for that same spot, with seed 336086702 but
    pond discs hashing equal to the menu world's 110 discs there;
  - every later story build added its own discs to that instance (store 247 → 333 discs, against 137 → 223 in a
    normal session).

### The mechanism

1. Story entry sets `worldSeed` at once, but `_rebuildFullNow` runs after the 150 ms debounce. In that gap the
   menu world's road is still registered and keeps streaming at the menu truck's position.
2. The network client's `_pump` read the seed LIVE (`this._getSeed()`) and the pond discs from whatever water was
   on hand. A request queued for the menu road posted as "story seed + menu ponds".
3. The Worker keys its instance by (client, epoch, seed, params), so that request created the story seed's
   instance. Its pond store only grows (BUG-106), so the 110 phantom discs stayed for every later build: the spawn
   builds and the 2800 m region warm all routed round ponds that are not in the story world.
4. Route around phantom ponds → different routes → different T promotions → different pads → a different roster.
   Rare because it needs the menu road to re-request in the debounce gap while a build is in flight.

So it was the REQUEST, not the reply: the reply checks (instance + seed + epoch) were right. The pre-fix client
also let the old road ADOPT a reply built for the new seed (its seed matched the live one).

### The fix (b7867f4b)

- `road-network-client.js` `_pump`: the request's seed is the entry's road's own `_worldSeed`, and the discs are
  asked for THAT seed. If the water on hand is another world's, the entry is stale: its waiters get `false`, it is
  never posted, and the road re-requests once the world is whole.
- `main.js` `_pondDiscs(…, seed)` returns `null` when the water is not that seed's. The main-thread routers'
  4-argument calls are unchanged.
- In the debounce gap the menu road now posts menu-seed builds with menu ponds (coherent, and dropped on reply
  because the live seed moved on). The story instance is born clean.

### Proof

- **Gate `network-client-world`** (new, fast, fake Worker): drives the reseed race and the road-swapped-before-
  water gap. Pre-fix: 6 wrong (the live seed posted beside the old ponds, a stale reply adopted, the gap request
  posted). Post-fix: PASS.
- **Headless replay** (`zz-bug152-poison.mjs`, scratch): the odd session's logged requests replayed with
  `buildNetworkSnapshot` give a run-key set EQUAL to the browser's odd network (166 runs). The same requests with
  the stale one removed give 167 runs and the normal headless hash (a2136423).
- **The race forced in the real app** (probe `--reloads --race`: right after Continue, the menu road asks for four
  far windows inside the 150 ms debounce, so a request lands in the gap most sessions):
  - pre-fix: **4 of 6 sessions odd**, each a different roster (the menu seed is random). Every odd one is exactly a
    session whose gap build went out under the STORY seed. One also logged `[save] board replay dropped 2 of 3`.
  - post-fix (b7867f4b): **12 of 12 normal**. 11 of them had a gap build, and every one went out under the menu
    seed (dropped on reply).
  - natural rate, unforced: pre-fix 2 odd in 90 reloads (both in the race); post-fix 39 of 39 normal.
- Affected gates: 10/10 green (cdp-smoke held back for the orchestrator).
- Not the culprit (measured): centre (robust to 10 m), adopt/profile history, Worker warm history (deterministic
  and random prior windows), async route arrival order, route-cache key collisions (0 multi-spec keys), pond order.

### Second findings (not fixed)

1. **The board cascade is real.** Budget slots `b${i}` each pick a uniformly random eligible giver from the sorted
   giver list (`rngFor('budget:${seed}:${slot}:${k+1}:place')`), and offer ids are `${poiId}#b${i}#${k}`. So ANY
   roster change re-places every budget offer and the replay drops most events (16 of 26 here). It is downstream of
   a roster change, which the fixes remove, so it is noted, not fixed.
2. **The region network is chaotic under ULP noise.** A 1-ulp `Math.pow` perturbation moves 26 runs by up to 2 m
   and changes 6 pool pads. The roster survived it, but this is why any input leak at all re-sites POIs.
3. **The browser's network differs from node's on 3 runs**, Y only, up to 0.5 m, the same in every session (one
   is the food vendor's edge `g:0,2,2:0,3,2`). The headless gates' world is not the browser's at the decimetre
   level on fragile runs. Probably a V8 version difference in a `Math.*` function. Worth its own ticket if a gate
   ever needs browser-exact geometry.
4. **Latent, never observed:** the Worker's nested route pool is shared by every instance, and a fresh instance's
   route epoch restarts at the same value. A job left queued by a replaced instance (only after the 60 s warm
   deadline) would be accepted by its successor. Instrumented: 0 cross-instance deliveries in ~50 sessions.

## Acceptance

- Root cause named and fixed where it lives.
- A gate resumes a skipped run's save and checks the first job stays 'done'.
- The soak's resume check (first job unchanged) holds over a multi-seed soak.

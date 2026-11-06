---
id: FEAT-62
type: feature
status: open
severity: major
opened: 2026-08-10
source: owner — "I like it so much I wanna make it a scenario, accessible mission ready to go from the main menu"
relates: FEAT-41, FEAT-61, FEAT-43, FEAT-42, BUG-45
simplified: 2026-08-10 — seed-only; worldgen measured seed-pure (test/world-determinism.mjs)
invariants: SM-INV-3, SM-INV-12
---

# FEAT-62: Scenarios — a curated mission, ready to play from the main menu

## Build state — the frame + first occupant SHIPPED 2026-10-02 (main, uncommitted at time of writing)

The owner picked a different first scenario from the paper route this ticket drafted: **"the
descent"**, a downhill time trial on seed `381142870` (capture `autos-capture-1791011156662.json`).
Owner's spec: spawn at the local maximum, end at the bottom, simple timer, pause menu with reset,
finish card with the time, leaderboard machinery (local; hook details if no save file), main menu →
scenarios, restart; white light columns at the start, 5 cyan gates, red finish.

- **Route** (extracted headless from the real routed road): crest 57 m above the node where the
  marked run begins → 1.49 km, 163 m of drop → 25 m short of the bottom junction (a local minimum —
  every road out of it climbs). Gate 5 is the capture mark.
- `data/scenarios.js` — seed + world-coordinate poses (spawn, start, gates, finish). Seed-only world
  as this ticket settled; the poses are re-checked against the road by **`test/scenario-route.mjs`**
  (registered gate, heavy) — re-extract if it fails, never loosen it.
- `src/scenario.js` — pure rules: Quick-Job 3-2-1 countdown holding the truck, fixed-step clock,
  gates in any order (forwards only, gateHalfWidth + 3 m), finish always ends the run, a missed gate
  = a time with no board entry.
- `src/leaderboard.js` — fastest-first, top 10, behind a `{load, save}` store hook. **Session memory
  only** until FEAT-42's save file; the one-line hook and the adapter rules are in its header.
- main.js: main menu → scenarios page; staged entry (seat, wait for road + ground, reseat); light
  columns (POI curtain material); run HUD in `#mission-hud`; finish card `#scenario-panel`
  (restart / main menu); pause menu really pauses inside a scenario and gets **restart**; **R =
  restart**; teleport off and debug panel locked out. A restart from far away re-runs the staged load.
- It runs in the ordinary free-roam world, NOT through `StorySystem.enter()` — a time trial has no
  region, day, wallet or tier, so the "run-layer state from the definition" item below does not apply
  to it. It still applies to a paper-route scenario.

**Still open:** owner tuning of start/end/gate poses; the paper-route scenario and its run-layer
state; the world-determinism acceptance item for the scenario entry path.

**Persistence — done 2026-11-01 (Spare).** Best times live in localStorage via `localStore()`, one
key per scenario (`autos-scenario-times/1:<id>`), beside `autos-settings/1` and FEAT-42's run slot.
They are deliberately NOT inside the run slot, which a new game clears and a death deletes, while
best times outlive every run. scenario-route checks a reload round trip, junk text, and blocked
storage.

## Request

> we have a working mission now. it's pretty hard lol — very challenging in a good way hard. I like
> it so much I wanna make it a scenario: accessible mission ready to go from the main menu.
> **remember it's fresh load and default spawn location is important for the world generation.**

The paper route (FEAT-61) is the first candidate. It is the first mission that is fully playable end
to end, and the owner rates its difficulty as good — so it is worth being able to hand someone in one
click, and worth being able to replay identically.

## What a scenario is

DESIGN.md's game-mode split already ratifies the third mode:

> **One-off scenarios** — self-contained set pieces (Dodge the Rocks, Escape the Police, etc.), each
> reusing the same engine with a bespoke frame.

So this ticket is not inventing a mode; it is building the first one and the frame that carries it. A
scenario is: **a pinned world, a pinned start, one mission, and a result.** No run, no day ladder to
manage, no meta progression — you press play and you are driving the thing.

## The world is pinned by the SEED ALONE [settled 2026-08-10, by measurement]

This was drafted as the hard part of the ticket, on the belief that a scenario would have to store a
region centre because the centre is "wherever the truck is standing" and the spawn probe reads the
streamed network. **Measured, that belief was wrong, and the ticket gets simpler.**

`test/world-determinism.mjs` (added 2026-08-10) pins all three links — **and finding the one live
hole in them, 2026-08-11, is what made the claim true rather than merely measured**: a free-roam
teleport left a spawn override that `_reseatTruckAtSpawnInner` consults ahead of `resolveSpawn`, so
the region centre followed the player across a mode switch and every POI moved. Story entry now
clears it, and §4 of the gate is a source-text check on that wiring.

1. **The spawn is a pure function of the seed** — identical across 10 seeds × 4 prior streaming
   histories (cold boot, idled at spawn, drove 3 km away, a warmed 2500 m story region, a wide
   off-centre stream), position and heading exact.
2. **The region centre IS the spawn.** Story entry reseats on *both* branches before capturing it —
   `applySeed` on a seed change, `reseat` when the seed is already loaded — so where the player was
   standing when they opened the menu cannot reach world generation.
3. **What the region contains is a pure function of (seed, centre)** — the registered graph, the POI
   candidate pool, the roster and the newspaper customers are byte-identical from any history.

So a scenario definition needs **the seed and nothing else about the world**. No stored centre, no
"must be started from a cold load" caveat, no capture step before a scenario can be authored. Pick a
seed, and the world — the roads, Larry's house, the fifteen customers, the route through them — is
already the same for everyone, every time.

The gate is the reason to trust that going forward: it is the thing that fails if a future change to
the spawn probe, the story entry path or the crossing cull quietly reintroduces a dependency on where
the player was.

## Scope

- **`data/scenarios.js`** — authored definitions, data only, the `data/dialogue.js` pattern. Each
  entry holds: `id`, display `name` + one-line `blurb`, **`seed`**, the initial run-layer state, and
  the mission to arm. **No centre, no radius** — the seed fixes those (see above).
- **A scenario entry path** — a sibling of `StorySystem.enter()`, or a mode inside it, that takes a
  definition instead of a seed prompt: apply the seed, let the ordinary reseat put the truck at the
  seed's spawn, warm the region on it, go live, arm the mission. This is `enter()` with the seed
  modal replaced by a definition; it should not need a second world-setup path.
- **Initial run-layer state, authored not inherited.** Day, energy, wallet and the paper-route tier
  are all run-layer (SM-INV-12) and all change the difficulty, so a scenario states them. Tier 1 on
  day 1 with a full tank of energy is the obvious default for the paper route, and it must be a
  choice in the file rather than whatever `resetPaperRun()` happens to do later.
- **Menu seam** — FEAT-41 owns what the main menu looks like; this ticket owns the entry point behind
  it and should not redesign the menu. A list of scenarios with a play button is enough.
- **The result, and leaving.** A scenario ends when its mission settles: show the existing result
  card, then offer replay / back to menu. No wallet carries out — a scenario is not a run.
- **Debug lockout on**, exactly as story mode does it (`DEBUG_LOCKOUT`). A scenario with the sliders
  live is not a comparable challenge.

## The first scenario: the paper route

Seed **90** is the owner's candidate world (captures 2026-08-09/10) — and the seed is the whole
definition of it.

Open question worth settling early: **does the scenario start at the spawn or at Larry's?** Starting
at the spawn is the honest story-mode experience and needs nothing new; starting at Larry's makes
"press play" land you at the thing rather than at a drive to the thing, and needs a seeded start
override (the POI's position is derivable from the seed, so this stays seed-only either way).

Tier 1 (four customers) is the right rung: it is the one the owner has driven and rated, and on seed
90 it is ~2.8 km / par 2:32.

## Open questions for the owner

- **Does a scenario keep the briefing?** Larry's two cards are a tutorial. Fine the first time, noise
  on a replay — but the dialogue `seen` set is run-layer, so a fresh scenario replays them by default.
- **Is there a leaderboard?** "Very challenging in a good way" invites a best-time / best-rank record.
  That is local persistence and belongs to FEAT-42 (its meta store), not here — but if scenarios are
  meant to be scored, this ticket should stop at recording the result and let FEAT-42 keep it.
- **Do scenarios unlock, or are they all available?** DESIGN.md does not say. All-available is the
  simpler default and fits "accessible from the main menu".
- **Is the paper-route scenario a fixed tier, or a ladder in itself?** Four customers is the rated
  difficulty; fifteen is a different, longer challenge on the same world.

## Acceptance

- A scenario is playable from the main menu in one click, with no seed prompt.
- **The world is identical every time** — entering from a cold boot and from a warm session (free
  roam → scenario, story mode → exit → scenario) gives the same region, roster, customers and route.
  `test/world-determinism.mjs` already asserts the worldgen half of this; what this ticket must add
  is that the scenario's own entry path does not reintroduce a dependency, plus the ROUTE (which that
  gate does not yet cover).
- Run-layer state (day, energy, wallet, tier) comes from the definition, not from whatever the last
  session left behind.
- Debug tooling is locked out inside a scenario, as in story mode.
- Finishing settles the mission and shows the result card; leaving carries nothing into free roam.
- `npm run test:all` green.

## Out of scope

- The main-menu visual design (FEAT-41).
- Persisting scores or unlocks (FEAT-42).
- Any second scenario. Dodge the Rocks and Escape the Police are named in DESIGN.md and need
  mechanics that do not exist; this ticket builds the frame and one occupant.
- Storing a region centre, a radius, or any world state beyond the seed — measured unnecessary, and
  made true in the live path by `2806718` (story entry drops the free-roam teleport spawn).
- Recording the region centre in captures. Still worth doing for diagnosing story-mode bug reports
  (three this week were chased by guessing it), but it is no longer a prerequisite for authoring a
  scenario, so it belongs in its own small infra ticket rather than blocking this one.

## RULED — owner, 2026-11-01

- (a) Start point: the owner answered about the main-game opening — tutorial beats first (fired
  cutscene → drive home, sleep, eat → dropped into the world, pointed at Larry's, but free to do any
  mission; the tutorial's end must line up with 100 % free will for a roguelike run). The scenario
  start was not ruled; **assumption: the paper-route scenario starts at the spawn**, like the main
  game. Flag if that proves awkward.
- (b) Larry's briefing plays on the FIRST paper run taken per playthrough → the scenario plays it.
- (c) The first round is 4; the ladder runs all the way to 15. The scenario starts a fresh ladder.
- (d) All scenarios open.
- Pose tuning for the two descents is the owner's; if world-gen tuning moves the roads, the owner
  will find new places. So: re-extract poses after BUG-67 lands, do not wait on the owner.
- Best-time persistence landed 11-01 (5f650a47).

## RULED — owner, 2026-11-06 (via the orchestrator, verbatim)

> "if you're asking for scenarios gameplay: start at larry's, briefing should go over the controls for papers but we
> dont need the expedition camp stuff. all customer counts from the ladder are open from the start. should follow story
> par for now (which i just ruled an adjustment on)"

- **Start at Larry's.** This supersedes 11-01's assumption that the scenario starts at the spawn.
- **The briefing covers the paper controls**, without the expedition-camp material.
- **Every customer count on the ladder (4 … 15) is open from the start**: the player picks the rung.
- **Par = story par**: main's rank spread (FEAT-69: S +10 %, par +30 %, A/B interpolated).

## Plan — the paper-route scenario (Spare, 2026-11-06; awaiting the orchestrator's sign-off)

**What the code says** (mapped 11-06; `main` = `src/main.js`):
- The ladder is four rungs, `PAPER_PARAMS.tiers = [4, 9, 12, 15]` (`paper-route.js:76`). "Every count open" means
  `runPaper.tier = 3`, with all four rungs on Larry's existing size buttons (`main:6834`).
- A paper run cannot live outside story mode the way the descent does:
  - Larry, the customers and the planner exist only after the story region warms (`onRegionLive`, `main:8315`);
  - the reach, throw, HUD and rank timer are gated on `storySystem.isActive()`;
  - the paper clock is the day clock.
- **The danger is the player's real run.** Inside `storySystem.enter()`:
  - `_autosave` overwrites the run save every second (`main:8855`);
  - a crash calls `_endRun`, which runs `_discardRunSave()` and deletes it (`main:9517`, `8899`);
  - `_startStory` calls `clearRun()` (`main:8586`).
  A scenario must touch none of these.
- Story par is free: `planTour` + `computePar`, and `economySystem.terms()` carries FEAT-69's rank spread.

**Build:**
1. **Definition** (`data/scenarios.js`): `{ id: 'paper-90', kind: 'paper', seed: '90', name, blurb }`. The descent gets
   `kind: 'trial'` (the default). The scenario list, `_startScenario` and `scenario-route.mjs` part B branch on `kind`.
2. **Entry** (`_startPaperScenario`): set a `scenarioRun` flag, then `storySystem.enter('90')`. Under the flag:
   - `_autosave`, `_discardRunSave` and `clearRun` are no-ops, so the player's real save is never read, written
     or deleted;
   - RUN_INTRO, LARRY_WELCOME and `tut-camp` are skipped (the owner's "no expedition camp stuff");
   - debug and teleport stay locked out.
3. **`onRegionLive` scenario branch:**
   - day 1, 07:00; a fresh economy and inventory; `dialogueSystem.start()` and `resetPaperRun()`;
   - `runPaper.tier = 3`;
   - seat at Larry's (`_seatAt(larry)`);
   - `paperRouteSystem.open(larry, null)`: no board offer, so no deadline and no save snapshot.
   - The offer card opens on the **4-customer rung** (the owner's rated difficulty), with 9, 12 and 15 one tap away.
4. **Briefing:** `PAPER_ROUTE_INTRO` already covers only the papers, but names only the keyboard's F. Add the pad's
   aim-and-throw line (FEAT-133 bindings) to it. It plays on the first paper run of the scenario, not on a restart
   (ruling (b) 11-01, with one scenario entry = one playthrough).
5. **Finish:** the scenario card shows the time, the letter and par for the rung, plus the best time per rung
   (`Leaderboard` id `paper-90:<count>`; times only, so no schema bump; the letter is derived from the run).
   Buttons: restart (re-seat at Larry's, same rung, no briefing) and main menu.
6. **Crash, dead truck, or R:** inside the scenario these lead to the finish card's restart, never `_endRun`.
   R re-seats at Larry's, not at the region centre.
7. **Exit:** leave story mode for the main menu. Nothing carries into free roam, and the player's story save is
   byte-identical (asserted).

**Proof:**
- A headless gate pins seed 90's route per rung (customers, km, par).
- `scenario-route.mjs` gets a `kind` branch.
- `cdp-smoke` gains a step: menu → paper scenario → seated at Larry's → offer shows four rungs → exit, with a
  pre-seeded run save checked identical afterwards.
- `world-determinism` keeps `clearSpawnOverride` before `applySeed` on the new path.
- `npm run test:all -- --browser` green.

**Open, defaulted (flag if wrong):**
- The rung is chosen on Larry's card, not on the scenarios page.
- The default rung is 4.
- There is no deadline (par and rank only).
- The best-times board keeps times per rung.

**Signed off (orchestrator, 2026-11-06).** The defaults stand: the rung is picked on Larry's card, default 4, no
deadline, the board keeps times only. Seed 90 is a curated scenario's world by design, not a default seed. Two notes:
1. Best times go through `src/leaderboard.js` `localStore()`, the descent's board (one key per scenario). If that
   cannot hold a list per rung, extend it; do not fork it.
2. The save guard matters most. Beyond the byte-identical check, the smoke must:
   - start a real run and save it;
   - play the scenario, crash, and restart in it;
   - quit to the menu;
   - and then **Continue must still resume the original run**.

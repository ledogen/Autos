# HANDOFF — The Paper Route (FEAT-61) — 2026-08-04

> **Provenance.** This plan was written and approved in plan mode on **2026-08-04 ~04:00** and was
> never written to disk before the machine crashed. It was recovered verbatim from the session
> transcript (`ed8d5e94-851d-4871-b28c-e7bec6c63c49`) on 2026-08-04 and is reproduced below
> unchanged. Nothing was implemented — see "State" — so it is a plan, not a record.

## State (verified 2026-08-04)

- **Worktree exists and is untouched:** `/Users/ledogen/CodeShit/CarGame-paper-route`, branch
  `feature/paper-route`, fast-forwarded to `b93afbb` (= `main`). No commits, no dirty files.
- **Nothing from the plan is built.** Phase A (docs) has not been done either — `missions.md` §2 still
  carries the "not a timer, it's an inventory and a sunset" line the plan strikes.
- **FEAT-61 minted** at `.planning/todos/pending/feat-paper-route.md` as the implementation ticket.
- **Base carries FEAT-59** (`src/model-service.js`, `data/prop-models.js`, `news-roll.glb` + its
  Blender generator) and the FEAT-60 POI-marker ticket — both landed on `main` the same night.

---

# The plan, as approved (verbatim)


## Context

`missions.md` calls the paper route *"the first real mission type"* and the coverage axis's carrier;
`opening.md` makes Uncle Larry the person who hands it over and the gate on better routes. SM-2 is
open and its spine (FEAT-53: par → ratio → payout → wallet → points) is built and owner-verified, so
the economy this mission scores into already exists. What is missing is everything that makes the
route *a different activity* from the point-to-point errand: a way for a character to talk, a way to
throw something, houses to throw at, and a score with more than one term in it.

Outcome: from Larry's POI near the spawn you take a route, hear him explain it once, drive a loop of
4 houses landing rolls on their targets before the morning-coffee deadline, and get paid on how fast,
how accurate and how complete you were. Run it clean and he gives you a bigger route.

Work happens in the worktree `/Users/ledogen/CodeShit/CarGame-paper-route` on `feature/paper-route`.

---

## Two ratified design amendments (do these first, in the docs)

Both came out of the scoping conversation and both contradict a doc currently on main. Recording them
as amendments keeps `missions.md` the source of truth instead of letting code quietly diverge.

1. **The paper route has a deadline.** `missions.md` §2 currently says *"The budget is a day-fraction,
   not a clock… it isn't a timer, it's an inventory and a sunset."* Owner ruling 2026-08-03: it is a
   **par-derived timer** — the papers have to land before people have their morning coffee. This is
   legal under SM-INV-3 as amended (*"some mission types carry an explicit, visible, diegetic
   timer"*), and the diegetic framing is what makes it so. §2's budget paragraph gets struck and
   replaced; the inventory cap survives.
2. **Accuracy is a fifth scoring axis.** `missions.md` states *"adding a fifth axis is a design act."*
   Owner ruling: accuracy is a real axis, not a dressing. The scoring-axes table gains a row —
   **Accuracy · measures where the thing you threw landed · pays continuous in distance from the
   target · never hard-fails.**

Also mint **FEAT-61** in `.planning/todos/pending/` as the implementation ticket, citing SM-INV-3/4/12
and both amendments, and update MILESTONES' SM-2 paragraph when it lands. (FEAT-60 is taken — it was
minted on main today for modelled POI markers.)

---

## The scoring model — one effective ratio carries all three axes

The mission scores on time-vs-par, accuracy, and completion. Rather than bolt three multipliers onto
the payout (which would break the SM-INV-4 anchor), all three collapse into a single **effective
ratio** that flows through the *existing, unmodified* `payoutFor()` and `gradeRun()`:

```
ratio     = elapsed / parRoute
coverage  = delivered / stock                       (0..1)
accuracy  = mean(clamp(1 − dist_i / TARGET_R, 0, 1)) over delivered papers
quality   = coverage × (0.5 + 0.5 × accuracy)       (0..1, = 1 only on a perfect route)
ratioEff  = ratio / quality
payout    = payoutFor(parRoute, ratioEff, terms.dayTier)     // src/economy.js, untouched
letter    = gradeRun(…, ratioEff, terms.thresholds).letter   // src/par.js, untouched
```

Why this shape: a **perfect route driven at par gives `quality = 1`, `ratioEff = 1.0`** — identical to
today's point-to-point line, so *break-even-at-par* (SM-INV-4) and *B contains par* (SM-INV-3) both
hold by construction, and no economy constant moves. Sloppy throws and skipped houses read as *a
slower run*, which is exactly how the player already understands the payout curve.

**parRoute** is `computePar()` (`src/par.js`) over the planned tour through every customer — the same
oracle, the same one par, no second par (SM-INV-2). **Deadline = `parRoute × PAPER_TOLERANCE`**, and
I recommend **1.2** so the bell falls exactly where payout already reaches zero: past that the player
is driving for nothing anyway, and one line means one thing. When it rings the route ends; papers
already landed pay, undelivered stock is forfeit.

**Progression:** a route counts as *perfect* when every customer got a paper inside its circle before
the bell. One perfect route unlocks the next tier from Larry — **4 → 9 → 12 → 15 houses**, radius
1.0 → 1.5 km. The tier lives in `runState` (owner ruling), so it re-earns each run.

**SM-INV-12 safety:** all 15 houses are generated **always**. The tier only chooses how many are
*customers on this route*. Nothing in the run layer ever changes what worldgen builds.

---

## What gets built

### 1. `src/dialogue.js` + `#dialogue-panel` in `index.html` — the character channel

`opening.md` already ratifies the shape: sequential cards, **no dialogue options**, dialogue received
rather than negotiated. RPG layout — a square icon slot on the left (empty placeholder, sized for the
portraits that come later), speaker name, body copy. Advance on **any key**; a queue of cards, a
`onDone` callback, and a `seen` set so a keyed sequence plays once.

- Control glyphs get their own colour via `<span class="dlg-key">` — the two cards mark **F** and
  **release F**. The `.dlg-key` class is the whole mechanism; no parser.
- The seen-flags live on the **run layer** beside the route tier, so a new run hears the briefing
  again (consistent with everything else resetting on death).
- Styling docks onto the existing panel chrome — `index.html:176` already shares
  `#mission-panel, #camp-panel` by selector, so this is a third selector on that rule, not a copy.
- Larry's two cards, verbatim from the brief.

### 2. `src/throw.js` — aim and projectile

Aim state and a gravity-only projectile, kept out of the mission so the box-physics upgrade later has
one obvious place to land (the ticket's own note: the arc lives in mission-adjacent code, not in
FEAT-59's loader).

- **Hold F** → aim mode: a 20 px reticle at screen centre, and the chase camera's drag-orbit goes
  live without a mouse button held. `src/camera.js` already owns `orbitTheta` / `orbitPhi`
  (clamped ±1.2 rad) and mutates them from `mousemove` when `isDragging` — this needs a small
  exported seam (`setAimMode(on)` + `getAimDir()`), *not* a second look system.
- **Release F** → launch. Velocity = `dir(orbitTheta, orbitPhi) × THROW_SPEED` **plus the vehicle's
  current velocity vector**, per the brief.
- Flight: `v += g·dt`, `p += v·dt`, gravity only — no drag, no bounce, no rotation, per the ruling.
  Terminate on the first step whose Y falls below the ground; the landing point is the
  segment/ground intersection, resolved against `RoadSystem.sampleRoadTopY` where there is road and
  `terrain.analyticHeight` otherwise (the same pairing `poi.js:312/337` already uses).
- Visual: **`spawnModel('newsRoll')`** — FEAT-59's model service is merged into the worktree, the
  registry entry exists (`data/prop-models.js`), and `src/main.js:1896` already proves the spawn with
  a debug button whose comment reads *"the real consumer is the newspaper-delivery mission (throw arc
  lives there, not here)"*. No placeholder needed; the roll is the shipped asset from frame one. The
  group returns synchronously and backfills, so the throw never waits on a load.

### 3. Paper-route POIs — `src/poi.js` extension

- POI records gain `kind: 'job' | 'house' | 'larry'`. Existing POIs are `'job'`; nothing about their
  siting, hashing or pads changes, so the FEAT-46 determinism rule and the `story-poi` gate hold.
- New `buildPaperRoute(center, radius)`: walks graph edges within 1.5 km of the region centre in the
  same canonical sorted order `build()` uses, runs the same `_evaluate()` reject battery, and takes
  the first **15** that pass, nearest-first. Deterministic, window-invariant, downstream of routing —
  it reuses the existing machinery rather than inventing a second siting path.
- **Larry's POI** is the qualifying house nearest the spawn, re-tagged `'larry'`. Mom's house already
  exists at the region centre (`camp.js:315`) — the route keys off that same point, and mom is one of
  the customers.
- Called from `onRegionLive` in `src/main.js:3441`, beside `poiSystem.build()` / `campSystem.build()`.

### 4. Target circles — `src/main.js`

`main.js:2080-2130` already builds ring meshes per POI from a shared `_ringGeo` with per-purpose
materials (`_poiRingMat` orange). A green ring material and a 10 m-diameter (**`TARGET_R = 5 m`**)
ring on every `kind: 'house'` POI that is a customer on the active route — same pool, same visibility
pattern, no new rendering path.

Houses keep the placeholder orange cube as their body for now. **FEAT-60** (minted on main today)
owns giving POIs modelled bodies, and its ticket already names *"a newspaper customer's mailbox"* as a
target — so this plan deliberately stops at the target ring and leaves the house models to it.

### 5. `src/paper-route.js` — the mission

A sibling of `MissionSystem`, not a mode inside it. `src/mission.js` is 871 lines shaped end-to-end
around one start, one end and one arrival radius, and it carries the FEAT-53 settle path that four
gates pin — a second mission type belongs beside it, not threaded through it.

- State: `idle → offer → briefing → running → done`.
- **Tour + par:** reuse `mission.js`'s graph adjacency + Dijkstra approach to build legs between
  consecutive customers (nearest-neighbour tour from Larry's POI), concatenate the segments, and call
  `computePar()` once over the whole thing. In a FEAT-43 region routing is frozen and pre-warmed, so
  every `edgeParData` is a cache hit — but the tour is far longer than a Quick Job's `MAX_EDGES = 9`,
  so **measure the build cost and cap it** (see Risks).
- **Delivery:** on each landing, find the nearest customer circle; inside `TARGET_R` it is a
  delivery with its distance recorded, otherwise the paper is spent. Stock = customers + 20% spares
  (assumption — flagged below).
- **Deadline:** `elapsed > parRoute × PAPER_TOLERANCE` ends the route. Visible, diegetic, and the
  only mission type in the game with a clock.
- **Settlement:** builds a `result` in the same shape `mission.js` produces and calls the *existing*
  `EconomySystem.settle()` — the wallet, points and terms-frozen-at-accept machinery is reused whole.
- **Tier state:** `paperRouteTier` on the run layer, advanced on a perfect route.

---

## Phases

Each phase is separately runnable in the browser, in this order:

- **A — Docs.** The two amendments in `missions.md`, FEAT-60 minted. No code.
- **B — Dialogue.** `src/dialogue.js` + panel + Larry's two cards, fired from a debug hook. Verifiable
  on its own: cards advance, keys are coloured, the icon slot is reserved, replay is suppressed.
- **C — Houses.** `poi.js` `kind` + `buildPaperRoute` + green rings. Verifiable: 15 houses ringed
  around spawn, identical across two different stream windows.
- **D — Throw.** `src/throw.js` + camera aim seam + reticle, with a debug key to throw anywhere.
  Verifiable: aim rotates the view, the roll leaves on the camera heading, inherits truck velocity,
  and lands where it looks like it should.
- **E — The mission.** `src/paper-route.js`, tour par, deadline, scoring, settle, tier advance.
- **F — Gates + housekeeping.** New gates, slider/HUD audit, MILESTONES update.

---

## Verification

- **New gates** (`test/gates.mjs`, subsystem `story`):
  - `paper-route.mjs` — scoring algebra without a world: perfect route at par ⇒ `ratioEff === 1.0`,
    payout identical to `payoutFor(par, 1.0, tier)` and letter `B` (the SM-INV-4/3 anchors); coverage
    and accuracy are monotone; `quality → 0` cannot produce a negative or NaN payout; the deadline is
    exactly `par × tolerance`; tiers step 4→9→12→15 and only a perfect route advances one.
  - `paper-poi.mjs` (heavy, live `RoadSystem`) — 15 houses are placed, the set is **identical from two
    different stream centres** (the window-invariance property `story-poi` already asserts for job
    POIs), houses never land on a junction pad or in water, and **the tier does not change which
    houses exist** — the SM-INV-12 check.
  - `throw.mjs` — pure ballistics: known launch state lands at the closed-form point; vehicle velocity
    is added, not replaced; the ground-crossing solve is exact at the boundary.
- **Existing gates must stay green** — `story-poi`, `mission-network`, `economy`, `par-oracle`,
  `day-clock`. Run `npm run test:all` before the merge back.
- **Live**, on the worktree's own port (`npm run dev -- --port <p> --strictPort`): enter story mode,
  drive to Larry, take the route, hear the two cards once, throw a roll from a moving truck into a
  circle, watch the result card, then take a second route and confirm the briefing does not replay.

---

## Assumptions I've made (say if any are wrong)

- **"10 metre circle" = 10 m diameter**, so `TARGET_R = 5 m` and a dead-centre hit is 0 m.
- **A thrown paper is spent** whether or not it lands in a circle; stock is customers + 20% spares, so
  a couple of misses are survivable but a perfect route still demands real aim.
- **Papers are unlimited-range** — no minimum standoff. Driving up and dropping one at 2 m is legal
  and boring, which is its own tax on a route you're timed on.
- **The route is a loop back to Larry** only in fiction; arrival at the last customer ends it.
- **Larry's POI is placed for now, not authored** — the burger-joint spawn and the tutorial that walks
  the player to his house are a later ticket. This plan puts him at the nearest qualifying pad to
  spawn so the mission has a source today.

## Risks

- **Tour routing cost is the one real unknown.** A 15-stop tour is an order of magnitude more edges
  than a Quick Job's 9-edge cap. It should be cache-warm inside a frozen region, but if the build
  blows past a frame budget the fallback is to compute the tour once at accept, behind the briefing
  cards — which is free cover, since the player is reading two cards while it runs.
- **`ratioEff` divides by `quality`.** A route with one delivery out of nine produces a huge effective
  ratio; the payout clamp already floors it at zero, but the letter path needs the same guard so the
  card can't show a garbage grade.
- **Three amendments to ratified docs in one feature** (timer, fifth axis, and a mission type whose
  progression is voiced by a character rather than a bar). All three are owner rulings from this
  session — Phase A records them so the next session inherits decisions, not drift.

## Base state

The worktree is fast-forwarded to `b93afbb` and now carries **FEAT-59** (`src/model-service.js`,
`data/prop-models.js`, the news-roll GLB and its Blender generator) plus the FEAT-60 POI-marker
ticket. The one thing still uncommitted in your main checkout is my BUG-41 / FEAT-49 doc work and the
drift alarm in `test/mission-network.mjs` — nothing in this plan touches those files, so they'll merge
cleanly whenever you commit them.


# Story Mode — Milestones

Companion to [DESIGN.md](DESIGN.md) (intent + invariants — read it first). This file maps the design
onto buildable milestones so tickets can be minted and burned down. Each milestone is a **playable
slice** — the game is better at the end of each one even if story mode never finishes.

**Rebuilt 2026-07-29** around *prerequisites* rather than list order, so the ordering is checkable
instead of remembered. What changed: a **Where we are** section that records real build state, an
explicit **free lane** of order-independent work, and a `Requires:` line on every milestone.

## The rule

> **Don't open a milestone whose `Requires:` aren't met. Anything in the free lane is always fair
> game.** That's the whole discipline — everything else is detail.

Most apparent "order violations" are one of two harmless things: building free-lane work (always
fine), or finishing a *harness* for a later milestone (also fine — see FEAT-29 below). A real
violation is starting a milestone whose prerequisites are missing, and the `Requires:` lines make
that visible before you start rather than after.

Tickets get minted into `.planning/todos/pending/` **at milestone entry, not all up front** — the
design has open questions (DESIGN.md §Open questions) and minting everything now would freeze answers
we haven't earned.

---

## Where we are — build state 2026-08-03

Keep this honest; it is the thing that makes the rule checkable.

**Shipped:**
- **SM-1 — THE DAY IS IN** (FEAT-47 + FEAT-45, both closed 2026-07-30; the owner ratified the
  concrete mechanics in-session — the closed tickets carry the full spec):
  - `src/day.js` — the 24-min day on a quantized sky-push ladder; `runState = { day }` (the
    SM-INV-12 run-layer object, introduced here); **energy** (18 h tank, 1 h/h drain) with the
    sleepy/tired/exhausted ladder at 14/16/18 h awake; eyelid blinks escalating into 200–600 /
    400–1000 ms control-loss dozes (flag-gated off by default — the `day-clock.mjs` gate proves
    inertness); coffee +5 h now / −3 h at wake (net positive).
  - `src/camp.js` — dispersed-camping zones (~20% global density, ~1 km discs, window-invariant,
    `camp-zones.mjs` gate) rendered as BLM-style yellow road casings on the map, camping tethered
    to ≤ 20 m of the road edge; park-to-make-camp on the FEAT-46 brake-latch edge; the **vibe**
    bar (flat 50 / shade 30 / water 20); a 30-min make-camp that digs a 6 m pad through the
    unified pad carve; sleep = energy meter + integer-hour timer, `r(vibe)` avg-full-in-8-h /
    best 2× worst; mom's house at the spawn (fixed average vibe). **Superseded 2026-08-05 (FEAT-60):
    mom's house is a POI on a lay-by pad from the region roster, not a point at the spawn, and it is
    not a camp — it borrows camp.js's sleep path only.**
  - Deliberately unbuilt: doze *content* (the Roamer — SM-5, owner-gated), coffee as an item
    (SM-2/3), tent/campfire visuals (deferred), wear coupling (SM-3).
  - **Re-shaped 2026-08-02** to the ratified 20-day run: **FEAT-54** (`3fadbea`, ticket open for its
    remainder) applied the mechanical deltas — 16 h tank, ladder onsets at 12/14/16 h awake, sleep
    rates 4/3 & 8/3, `rankTightenDays` 8 → 20, `dayTierTable` extended to 30 entries on the ~5×
    asymptote. **FEAT-55** (closed) added **sleep debt** — energy runs to a −8 floor and the night
    repays it — plus the RoR2-style energy ticker with hour ticks and stage colours.
- **FEAT-29 par oracle** (`src/par.js`) — built early **by design**: pure math, order-independent,
  and it de-risks the most load-bearing `[DEFAULT]` in the economy (physics-honest par). Its
  `gradeRun()` already computes the **D/C/B/A/S ranks** the 2026-08-01 performance model adopted as
  par's player-facing surface. *(No longer "the only completed story-mode ticket" — FEAT-45 and
  FEAT-47 closed 2026-07-30.)*
- **Beta mission harness** (`src/mission.js`) — point-to-point missions with accept/regenerate,
  scored against par. **This is a test rig for FEAT-29, not SM-2 delivery** — DESIGN.md
  (2026-07-20 b) calls it *"a testing harness for the par economy, not final gameplay"*, and
  regenerate is explicitly a testing affordance: **real story mode has no do-overs.**
- **Story sandbox** (`src/story.js`, FEAT-43) — routing-frozen bounded region, debug lockout seam.
  Ticket still open; the region-confinement half is in.
- **POI substrate** — `src/poi.js`, FEAT-46 lay-by pads (merged; **ticket closed 2026-08-02**).
  Extended the same day (`dd5bcb5`): a POI job **stages** rather than counting down — a 25 m start
  threshold with orange↔green rings, the ratified *"a job stages; it does not count down"* rule.
- **Cab instrumentation** — `src/cluster.js` (**FEAT-49 gauge cluster — ticket closed 2026-08-03**;
  the merge was `54cc10d`, the ticket had simply been left in `pending/`). Two open tickets hang
  off it that are really **SM-3 wear-model work arriving early**: **FEAT-51 coolant temp** (the
  radiator/overheat → power-loss → head-gasket chain DESIGN.md already specifies) and **FEAT-50 fuel**
  (**ratified 2026-08-01** — fuel and gas stations are in; see the note under SM-3).

**SM-2 IS OPEN — the economy spine is in** [2026-08-01]. **FEAT-53** (ticket in `todos/pending/`,
phases A–C built the same day the milestone opened) implements the ratified performance model on the
existing point-to-point missions: `src/economy.js` (payout line, dayTier, day-tightened rank
thresholds, `runEconomy` wallet + mission points — displayed as **"good deeds"**, owner theming),
terms frozen at accept (tier AND thresholds — owner ruled lock both), settle-once on arrival, the
**single-offer rule** (one cached job per POI per day; accept consumes it), the do-over lockout
(regenerate/retry inert on paid jobs, alive on the unpaid Quick Job rig), result-card rank colours +
payout, the `#run-hud` wallet, and gates (`economy.mjs`, story-poi §7–8). Phases A–C are **owner-verified**
by a live drive-through.

**Phase D landed as the par re-anchor; FEAT-53 CLOSED 2026-08-18.** Item 1 (`k`) was re-derived
twice — 0.35 → 0.30 against the recalibrated par scale, then 0.30 → 0.24 when break-even moved to
the B/C boundary, then ×0.1 → **0.024** on the owner's currency rescale. Item 2 arrived as a change
of *meaning* rather than a tuning pass: par became the C/D boundary (the slowest passing drive),
thresholds were re-cut and fitted to owner-labelled drives, `rankDayLate` softened 7% → 3% to stop
rank S going mathematically extinct mid-run, and a **per-region payout multiplier** was added as the
progression dial — because `dayTier` rises with maintenance and so nets to nothing on its own.
`dayTierTable` itself was deliberately NOT touched: it has to balance against SM-3's repair costs,
which still do not exist. That, plus the 27-point recount SM-INV-14's shifted economics forces, is
**FEAT-69**.

**The paper route is planned and ticketed, not built** [2026-08-04]. **FEAT-61**
(`todos/pending/feat-paper-route.md`) is SM-2's first real mission type; the approved plan is
`.planning/handoffs/HANDOFF-2026-08-04-paper-route.md`. It carries **two amendments to ratified
docs** that land before any code (Phase A): the paper route gets a **par-derived, diegetic deadline**
(striking §2's "not a timer, it's an inventory and a sunset" in `missions.md`), and **accuracy becomes
a fifth scoring axis**. Coverage, accuracy and time collapse into one *effective ratio* through the
unmodified FEAT-53 payout line, so SM-INV-3/4 hold by construction and no economy constant moves.
Progression is voiced by Uncle Larry (4 → 9 → 12 → 15 houses), on the run layer. Nothing is
implemented — the worktree `feature/paper-route` is untouched.

**The elevation question under the economy is SETTLED: BUG-41 closed WONTFIX** [owner,
2026-08-03 — *"par feels good as is"*]. Par prices grade off the *routed* polyline, not the
`runProfile().gradeY` the world is carved to, and it stays that way. Measured directly, the two
series agree to **centimetres through every run's interior** and diverge only in the junction end
bands (median 36 m wide, peak up to 30 m) — where par has already clamped the reference truck to a
junction speed cap, which is why re-pricing moves par only 0.61% median. Par has no
vertical-curvature term, so the finer series carries nothing par can express; and FEAT-30 fitted
`PAR_REF` through this same sampler, so the basis is calibrated, not approximate. A **drift alarm**
(`test/mission-network.mjs` §7) now pins that shape, so the ruling fails loudly if a future carve
stage widens those bands into the interior. **Phase D item 2 is therefore unblocked** — it waits
only on SM-3 costs.

**Road-feel work landed alongside** and is why the drive under all of this is smoother: BUG-40
(deg-2 connector hump — the hidden launch ramp at tight kinks) and **QUAL-24** (deg-2 chain merge —
a deg-2 join now *is* one road, one centerline object, rather than two roads plus an overlay; the
connector overlay survives only as the frontier fallback). Both closed.

*(Prerequisite audit, retained: SM-1 ✓ shipped 2026-07-30; POI anchors ✓ via FEAT-46, which
supersedes FEAT-21's core — FEAT-21 retains only the variety pass and never blocked SM-2. The
2026-08-01 performance model settled payout/progression/rank before implementation began, exactly as
intended.)*

**Consequence worth stating:** the day now exists for the par economy to press against — the SM-1
"gap in the build" note from 2026-07-29 is resolved. What money buys and costs is still SM-2's to
answer; the feel targets (dozing terrifying, site-hunting real) are the owner's drive to judge.

---

## The free lane — always safe to build

Order-independent work. **Building any of this is never out of order**, and none of it needs
story-mode go-ahead. Listed so that picking one up never feels like a detour.

| Ticket | Story-mode role |
|---|---|
| **FEAT-28** region-gated connectivity | THE progression primitive. Connectivity gate == region unlock == trail-closed barrier (SM-INV-13). SM-4 wires **mission points**/story beats to its unlock trigger. **Its recurring-load problem is RESOLVED** [2026-08-01]: unlocks are run-layer (Open Q3) so validation recurs ~6× per run, and the fix is to **hide it, not budget it** — warm the next region on the worker the moment the player **accepts the region-unlock main mission**. See the ticket's "The unlock load is HIDDEN, not budgeted". |
| **FEAT-09** contact pipeline / debris | Physics substrate for hazards and (later) camp-prop interaction. |
| **FEAT-26/27** rockslides (ambush/static) | Risk content — the procedural dressing that makes "drive at the limit" a bet. FEAT-26's flag-gated-nondeterminism pattern is the template for SM-INV-12. Its "what does a hit do" question resolves in SM-3's wear model. |
| **FEAT-23** drivetrain architecture P2–P5 | Parts-as-cars substrate (SM-INV-10). The parts-selector phase becomes the jalopy generator's roll-space in SM-3. |
| **FEAT-04a** visual vehicle swap | Jalopy variety reads visually — and, post-2026-07-29, the garage's roster is *starting vehicles*, so this carries more weight than it used to. |
| **FEAT-21** POI scatter | **Variety pass only** — FEAT-46 shipped the anchors and FEAT-52 owns off-network siting. What is left is POI *types*, names and differing mission flavours. |
| **FEAT-52** off-network generator | ONE generator for spurs, cuts, camping areas, logging sites and POI candidates (DESIGN.md "The off-network layer"). Absorbs FEAT-38 mode B and FEAT-32's siting. Substrate for the deferred Highway/Shortcut pair. **Two passes as of 2026-08-02** — inherent difficulty (free), then discrete **carved** hazards that the Shortcut's esteem clears; hazard *placement* stays worldgen, *removal* is run-layer. Also owes #05 the **intentional-non-shortcut-skip detector** (>~200 m of road distance saved off-network, penalty scaled by magnitude). |
| **FEAT-48** physics engine adapter | Backend migration behind a swappable seam. Long lead time, blocks FEAT-36/35 and the log-drag chain. Phase 0 is a go/no-go determinism test — do that early regardless of story progress. |
| **FEAT-41** game menus + UI | The shell every player-facing feature docks into, including the mode split SM-1 needs. |

*(This table was formerly "SM-0 — Enablers". Same content, named for what it is. `SM-0` remains a
valid cite for it.)*

---

## SM-1 — The Day (sleep is the clock) ✅ **SHIPPED 2026-07-30**

**Requires:** nothing.
**Tickets:** FEAT-47 (day clock, sleepiness, doze) · FEAT-45 (dispersed camping areas) — **both
closed**; see `todos/completed/` for the as-built spec, and "Where we are" above for the summary.
The scope below is the plan as written; where it and the closed tickets differ, **the tickets are
what exists.**

**Goal:** the work → read your eyelids → break off → hunt a site → arrive loop is *felt*, with no
economy attached. The last leg of the day is the game (SM-INV-6).

- **Game-mode shell** (ratified 2026-07-16): main menu selecting Free Roam / Story Mode (/ one-off
  scenarios later). Story mode boots region-limited with **debug tooling locked out** and sliders
  fixed. Extend the existing `window.__setGameMode` seam — do not invent a second mode mechanism.
  Free Roam remains exactly the game built to date. *(FEAT-41 is the fuller version of this.)*
- Run clock: **24-minute in-game day** [RATIFIED 2026-07-29] mapped onto sky time-of-day
  (`SKY_CYCLE` in `src/sky.js` already exists); day counter. **16 waking hours + 8 hours' sleep**, and
  the clock **pauses in shops, service stations and camp** → a day costs **~18 real minutes** →
  **20 days per run** [RATIFIED 2026-08-02; the 24-min cycle itself is unchanged. Successively
  corrected from 10–15 (divided by the sky cycle) and 7–8 (charged travel as off-clock overhead)].
  **Shipped `day.js` needs `fullEnergyH` 18 → 16** and its sleep-rate mean 2.25 → 2.0; see
  `run-shape.md` → "Code deltas".
- Sleepiness state: accrues over the waking day; coffee = loan (alert now, sleepier tomorrow).
- **Doze**: eyes-close overlay + control attenuation, periods lengthen with sleepiness. Not a fail
  state (SM-INV-1). Flag-gated for headless gates (SM-INV-12).
- **Camping**: seeded, window-invariant campable-ground detection from worldgen (flat ground,
  lake/stream adjacency, meadows — water + flat-ground data all exist). Camping is a **button gated
  by campable ground** (SM-INV-6 as reversed 2026-07-19), with a worldgen-scored quality preview.
  Site-quality stub (good/bad night) is enough to close the milestone; full dimensions are an open
  question. **FEAT-45** is the ticket; if **FEAT-38** dispersed-camping spurs exist by then, their
  scored clearings are ready-made candidates — share one "good ground" score.
- **Exit:** a player naturally plans their day around getting somewhere sleepable; dozing on a
  mountain road is terrifying; no HUD countdown anywhere (SM-INV-3).

## SM-2 — The Wager (par, missions, payout)

**Requires:** SM-1 (the day is the budget every mission type spends) — **MET 2026-07-30**;
POI anchors — **MET** by FEAT-46 (shipped), which superseded FEAT-21's core.
**Already in hand:** FEAT-29 par oracle; `gradeRun()` already computes the D/C/B/A/S ranks; the beta
mission harness to test against.

**Goal:** money exists and the arithmetic says: lazy day nets negative, brave day nets positive —
which the performance model makes true **by construction** (a day at the **B/C boundary** is
break-even — re-anchored 2026-08-16, was "a day at par").

**The performance model is RATIFIED and specified** (DESIGN.md "The performance model",
`missions.md` "Performance, points and payout") — this milestone implements it, it does not design it.
**Re-anchored 2026-08-16** (DESIGN.md "Ratification pass 2026-08-16"): par became the C/D boundary.
This rebalance IS Phase D item 2, plus a re-do of item 1 (`k` 0.30 → 0.24, then ×0.1 → 0.024):

```
par    = referenceTime × PAR_SLACK   PAR_SLACK 1.15 — the standard; PAR_REF stays the physics
ratio  = elapsed / par               payout = parBase × dayTier × clamp((1.20 − ratio)/0.40, 0, cap)
                                     break-even 0.80 · par 1.0 pays half · zero at 1.20 · k 0.024
```
- **`parBase = k × par`** — base scales with the road (stops tiny-job farming). `k` is the one
  economy tunable: maintenance cost per second of par-driving.
- **`dayTier`** — step function of run day, **locked at mission accept**; rising payouts track
  escalating maintenance. The 1 a.m. accept buying tomorrow's rate is a **feature**.
- **Rank thresholds tighten with run day** — the brake on the rising tier. **Par never moves**
  (SM-INV-2 as amended 2026-08-01). Since 2026-08-16 only **S/A/B** tighten: **C is pinned at 1.0**
  on every day, because par IS the pass line and a drifting C would make a drive at par start failing.
  Thresholds **S 0.72 · A 0.76 · B 0.80 · C 1.00**; day-20 S must stay reachable (gated).
- **Rank is display only, result-card only, never live** (SM-INV-3 as amended).
- **Progress = mission points**, not XP: 1 at B+, ½ at C, 0 at D; authored per-region counts
  `6·6·6·4·3·2` = **27 points** over **six regions**, against a day budget of `4·4·4·3·3·2` = 20 days
  (SM-INV-14 as rewritten; `run-shape.md`). **The ramp is mission *length*, not count** — ~5–7 h par in
  region 1, ~12 h (a whole day) in region 6.

- Mission board at POIs: hand-authored types × procedural dressing. **The taxonomy lives in
  [missions.md](missions.md)** — four scoring axes (margin / coverage / restraint / clearance), three
  delivery types (point-to-point / fragile / freight).
- **First real type: the paper route** (coverage) — the uncle's job (see [opening.md](opening.md)).
  Its budget is *a day-fraction, not a clock*: the route ends when the light goes. Needs SM-1.
- Payout = **continuous** margin against par (SM-INV-4 as ratified 2026-08-01); par surfaces only as
  payout and a rank letter, never as a clock (SM-INV-3).
- **Mission points are run-layer** (SM-INV-14) and gate *when a region's main mission becomes
  available*; money buys parts. **Points buy access, money buys parts.**
- **Bonus objectives** — a giver offering *"a little extra if you finish with an A"*, paying in an
  unnamed **item** (spare tire, cooking kit). The one legal pre-drive target: a standard with no clock.
- Currency + running costs (consumables priced so lazy-day-negative holds; real wear costs are SM-3).
- At least one non-par type early (eggs unbroken / don't spook the horses) so par-scoring doesn't eat
  the tone (DESIGN.md §Failure modes). Fragile (§3b) is that type.
- Hard-timer types allowed (SM-INV-3 as amended) — but the default mission has no clock.
- Camping mid-mission is **job-dependent** (2026-07-19): short/perishable jobs die overnight, longer
  hauls permit next-day delivery. The mission's fiction says which.

## SM-3 — The Machine (wear, breakdown, the jalopy)

**Requires:** SM-2 (money must exist before a repair economy means anything).

**Goal:** the second death condition exists, and every run starts in a different bad truck.

- **Wear/condition model**: ONE framework, `f(time, intensity)` never distance (SM-INV-5), but
  **multiple per-component condition tracks** (DESIGN.md "Damage, wear & repair"). Each reads an
  honest physics signal the sim already produces; cheap, out of the hot loop; shared with FEAT-26
  rock hits and FEAT-36 debris impacts. Breakdown = death. The tracks:
  - **Tires ×4 independent** — gradual wear scales per-wheel μ; binary punctures on a
    wear→fragility curve; roadside self-change needs a spare, quick-jack/breaker-bar speeds it;
    carried tires + tool have real mass → CoG/handling.
  - **Engine** — `f(rpm, load, time)`; **air-filter** sub-track does ~nothing until ~20% then
    sharply accelerates engine wear (dirt roads degrade it faster — FEAT-38 tie); overheat → power
    loss + wear → blown head gasket.
  - **Suspension** — degrades shock damping; triggered off bump-stop over-travel or
    suspension-velocity. **Same signal the fragile mission type reads** (`missions.md` §3b) — one
    plumbing, two consumers.
  - **Brakes** front/rear pairs — `∫(brake torque·time)`; pad grades per axle set bias.
  - **Radiator** — early-game cooling deliberately marginal; front collisions damage/puncture it.
    **FEAT-51 (coolant temp) is this track arriving early**, driven by the FEAT-49 cluster's gauge —
    build the honest temp signal there, the *condition consequences* (power loss → wear → gasket)
    here.

> **Fuel is RATIFIED** [owner, 2026-08-01: *"there should 100% be fuel in the game and gas
> stations"*]. This resolves the contradiction between **FEAT-50** and `items.md`'s old *"Fuel? NOT
> DESIGNED"* row, in favour of fuel — the row is struck and DESIGN.md gains a **"Fuel and gas
> stations"** section as the design of record. What it means for this milestone:
>
> - **Fuel is the distance axis SM-INV-5 deliberately omits.** Wear prices how hard and how long you
>   drove; fuel prices how far. Neither has to lie about the other.
> - **Running dry is NOT a new fail state** — it is the existing breakdown *predicament* (SM-INV-1):
>   immobilised, fix it with a jerry can or pay for recovery. Only the existing can't-continue-and-
>   can't-afford rule ends the run.
> - **Gas stations are a POI type** and a cheap, common service venue — the counterweight to the
>   rare, expensive town service station, and the early game's one non-punishing place to spend money.
> - **Fuel price is the most legible carrier for Q9A cost escalation** there is.
>
> Build order: FEAT-50's tank + burn is **free-lane** (an honest needle for the shipped FEAT-49
> gauge). The *station economy* is SM-2/SM-3 work.
- **Repair, tow & death**: roadside self-service vs. town station, both cost time + money. **Tow** =
  fast-travel to nearest town, priced near-prohibitively; can't-afford-tow ends the run. Two deaths
  only (SM-INV-1): fatal crash impact or unrecoverable breakdown.
- **Diagnostic screen** (FEAT-34 instrument cluster): every track, air-filter warning critical.
- **Jalopy generator**: seeded roll over FEAT-23's parts space + starting wear. Every roll
  technically run-winning (SM-INV-7).
- Parts as found/bought items, **described never scored** (SM-INV-10). Catalog: [items.md](items.md).
- **No in-run vehicle purchase** (SM-INV-15) — parts yes, vehicles no.

## SM-4 — The Run (death, persistence, regions)

**Requires:** SM-3 (breakdown must exist for a run to end), FEAT-28 (the unlock primitive).

**Goal:** the roguelike shell — runs end, and the *player* is what carries forward.

> **Rewritten 2026-07-29.** *Was: "runs end, the world doesn't reset."* The world now **does** reset:
> the run layer resets completely on death, and what survives is literacy plus the garage
> (SM-INV-8 as narrowed, SM-INV-12 as rewritten).

- Run lifecycle: death → run summary → new run in a fresh jalopy.
- **Mission points**/story beats trigger **FEAT-28 region unlocks** (the brief validation load is the level-up moment
  — diegetic barrier lifts). Story frame: the barriers are the **Roamer's old trails**, and expansion
  is **gated by authored main missions**; points are the pacing floor, not the gate itself. Authoring the
  main missions is SM-5; SM-4 wires the trigger.
- **Two state objects** (SM-INV-12 as rewritten — meta no longer feeds worldgen):
  - **`runState`**: run age + progress, input to run-layer world state
    `(worldSeed, runState, coords)`. Advances at day/sleep/mission boundaries. **Resets on death.**
    Gates pin a default `runState` (the object they used to pin as `metaState`).
  - **`metaState`**: versioned persistent profile (localStorage), holding **unlocked starting
    vehicles and story keys only**. **Never touches generation.**
- What persists: **literacy + the garage**. What doesn't: car, parts, money, **mission points, region/trail
  clearance, and world parameter states** (SM-INV-8 narrowed, SM-INV-14).
- **The garage** — meta-progression is unlocked *starting vehicles*, lateral never upward.
- **Suspend-and-resume saving**: one slot, written on quit, **deleted on load**, deleted on death.
  Cheap precisely because worldgen is meta-free — the world is never serialized. (FEAT-42.)
- Run shape target: **6 regions** (chapters — the play space is cumulative, later missions may span
  regions, and **regions grow with depth on a sparser grid**), **20 days**, **6 h** to beat,
  **27 points**. The full trail chain must fit in **one run** (SM-INV-7) — that bounds region count.
  See [run-shape.md](run-shape.md).

## SM-5 — The World Turns (story delivery, horror)

**Requires:** SM-4 (the run must end for meta-progression to mean anything), SM-3 (wear gives the
"car is your horse" keystone its stakes).

**Goal:** the game is *about* something — **The Roamer** (DESIGN.md "The Roamer — the story spine"):
a spirit of your own past self who once roamed these lands on horseback. This milestone builds the
channels that deliver it. Q1's residual (motives + concrete endgame beat) plus Q4/Q6 must be answered
before it can close.

- **The Roamer is the thing delivered**; everything below is a *channel*. "Car is your horse" is the
  keystone — SM-3's wear/breakdown work is what gives this its stakes (breakdown = the horse dying
  under you).
- Story **parameter states**: staged generator params (leaning trees, moon, dark-at-noon, absence)
  keyed off **run progress** (`runState`; SM-INV-11 re-keyed 2026-07-29) — the **ambient** channel,
  still emergent. Escalation happens within a run and resets with it.
- **Doze as delivery vehicle**: the ~400 ms eyes-closed frames show *something*. This is where the
  Roamer visits.
- **Authored in-world beats** (SM-INV-11 relaxed 2026-07-20): staged in real world-space, not a
  bolted-on cutscene layer. The **main missions** gating region unlocks are the primary carriers.
  **The log drag** is the candidate main mission (`missions.md`) — and note the **beat/labor split**:
  the staged scene is once per profile (a story key on `metaState`), the chaining and clearing is
  run-layer and re-driven every run.
- **Spirits + classes — DEFERRED 2026-07-29** (DESIGN.md "The garage"): meta-progression is unlocked
  starting vehicles now, and under the narrowed SM-INV-8 spirits can no longer be permanent *world*
  additions. Not deleted; needs a pass reconciling them with the garage before any unlock plumbing.
  **The cast lives in [spirits-and-pacts.md](spirits-and-pacts.md)** (Pact/Warden classes, domains,
  disposition tracks, ledger shapes; The Night Owl / The Host / The Verge / The Confluence) —
  read its header first, it carries four flagged conflicts with rules ratified after it was written.
- **The Roamer's economy of gifts:** knowledge, unlocks and story keys **only — never resources or
  run-layer power** (SM-INV-8/9). Build the "where to look" hint surface as literacy transfer, not a
  loot faucet.
- Camp quality full dimensions; fishing (FEAT-37); bad-night spiral tuning.
- **Endgame** — residual of Q1. Direction is set (completing the Roamer's arc); the concrete final
  beat and the Roamer's motives are **owner-only, escalate**. The dead-horse ending is the current
  spine terminus (IDEAS.md).

---

## Dependency map

```
free lane (any time) ── FEAT-28 · FEAT-09 · FEAT-26/27 · FEAT-23 · FEAT-04a · FEAT-21 · FEAT-52
                        FEAT-48 (physics adapter) · FEAT-41 (menus)

SM-1 The Day ──▶ SM-2 The Wager ──▶ SM-3 The Machine ──▶ SM-4 The Run ──▶ SM-5 The World Turns
   │                  ▲                    ▲                   ▲
   └ SHIPPED          └ OPEN — spine in    └ FEAT-51 coolant   └ needs FEAT-28
     2026-07-30         (FEAT-53) ← HERE     is this, early
```

**Already banked, out of the critical path:** FEAT-29 par oracle (sanctioned early), the beta mission
harness (a test rig for it), FEAT-43 story sandbox, FEAT-46 POI pads.

## Working notes

- **SM-1 shipped 2026-07-30.** Retained below because the reasoning still governs how SM-2 is built.
- **SM-1 before SM-2** for two independent reasons: sleep pressure is testable and *fun-provable*
  without an economy, and **the day is the budget** several SM-2 mission types spend (the paper
  route's "until the light goes", the cost of a slow fragile run). Campable-ground detection also
  decides POI/campsite siting that SM-2 missions reuse.
- **Harnesses don't count as milestone entry.** FEAT-29 and `src/mission.js` were built ahead of SM-2
  deliberately — pure math plus a rig to exercise it. Building a test harness for a later milestone
  is always in order; shipping that milestone's *player-facing* systems is not.
- **Each milestone entry:** plan mode, mint tickets citing DESIGN.md invariants by `SM-INV-N`, and
  re-check the open-questions list — some answers gate scope.
- **One-off scenarios** (Dodge the Rocks, Escape the Police, …) are a separate content track, not
  story milestones — they hang off the same game-mode shell and reuse whatever systems exist when
  each is authored. Ticket them individually as ideas firm up.
- **When something lands, update "Where we are."** That section is what makes the rule checkable; a
  stale build state turns the rule back into memory.
- **Cab/vehicle tickets keep arriving ahead of their milestone**, and that is fine — FEAT-49
  (cluster, shipped), FEAT-51 (coolant temp) and FEAT-50 (fuel) are all *instrumentation* the player
  can enjoy in free roam today. The rule that matters: **the gauge is free-lane, the consequence is
  not.** A needle reading an honest signal is always in order; making that signal end a run is SM-3.
  For fuel that question is now **answered** (ratified 2026-08-01): running dry is the existing
  breakdown predicament, never a direct kill — see the note under SM-3 and DESIGN.md "Fuel and gas
  stations".

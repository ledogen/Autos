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

## Where we are — build state 2026-07-29

Keep this honest; it is the thing that makes the rule checkable.

**Shipped:**
- **FEAT-29 par oracle** (`src/par.js`) — the only *completed* story-mode ticket. Built early **by
  design**: pure math, order-independent, and it de-risks the most load-bearing `[DEFAULT]` in the
  economy (physics-honest par).
- **Beta mission harness** (`src/mission.js`) — point-to-point missions with accept/regenerate,
  scored against par. **This is a test rig for FEAT-29, not SM-2 delivery** — DESIGN.md
  (2026-07-20 b) calls it *"a testing harness for the par economy, not final gameplay"*, and
  regenerate is explicitly a testing affordance: **real story mode has no do-overs.**
- **Story sandbox** (`src/story.js`, FEAT-43) — routing-frozen bounded region, debug lockout seam.
  Ticket still open; the region-confinement half is in.
- **POI substrate** — `src/poi.js`, FEAT-46 lay-by pads (merged).

**Not started — nothing of SM-1 exists.** No sleepiness, no doze, no camping anywhere in `src/`.
This is the next milestone and **FEAT-47** is its ticket.

**Consequence worth stating:** the par economy can be measured but not yet *pressed against*, because
the clock it presses against is the day. That is a gap in the build, not a deviation from the plan.

---

## The free lane — always safe to build

Order-independent work. **Building any of this is never out of order**, and none of it needs
story-mode go-ahead. Listed so that picking one up never feels like a detour.

| Ticket | Story-mode role |
|---|---|
| **FEAT-28** region-gated connectivity | THE progression primitive. Connectivity gate == region unlock == trail-closed barrier (SM-INV-13). SM-4 wires XP/story beats to its unlock trigger. |
| **FEAT-09** contact pipeline / debris | Physics substrate for hazards and (later) camp-prop interaction. |
| **FEAT-26/27** rockslides (ambush/static) | Risk content — the procedural dressing that makes "drive at the limit" a bet. FEAT-26's flag-gated-nondeterminism pattern is the template for SM-INV-12. Its "what does a hit do" question resolves in SM-3's wear model. |
| **FEAT-23** drivetrain architecture P2–P5 | Parts-as-cars substrate (SM-INV-10). The parts-selector phase becomes the jalopy generator's roll-space in SM-3. |
| **FEAT-04a** visual vehicle swap | Jalopy variety reads visually — and, post-2026-07-29, the garage's roster is *starting vehicles*, so this carries more weight than it used to. |
| **FEAT-21** POI scatter | Mission anchors + campsite candidates. Prefer siting rules that also describe campable ground (flat, water-adjacent, meadow) — SM-1 reuses them. |
| **FEAT-48** physics engine adapter | Backend migration behind a swappable seam. Long lead time, blocks FEAT-36/35 and the log-drag chain. Phase 0 is a go/no-go determinism test — do that early regardless of story progress. |
| **FEAT-41** game menus + UI | The shell every player-facing feature docks into, including the mode split SM-1 needs. |

*(This table was formerly "SM-0 — Enablers". Same content, named for what it is. `SM-0` remains a
valid cite for it.)*

---

## SM-1 — The Day (sleep is the clock)

**Requires:** nothing. **This is the next milestone.**
**Ticket:** FEAT-47 (day clock, sleepiness, doze) · FEAT-45 (dispersed camping areas)

**Goal:** the work → read your eyelids → break off → hunt a site → arrive loop is *felt*, with no
economy attached. The last leg of the day is the game (SM-INV-6).

- **Game-mode shell** (ratified 2026-07-16): main menu selecting Free Roam / Story Mode (/ one-off
  scenarios later). Story mode boots region-limited with **debug tooling locked out** and sliders
  fixed. Extend the existing `window.__setGameMode` seam — do not invent a second mode mechanism.
  Free Roam remains exactly the game built to date. *(FEAT-41 is the fuller version of this.)*
- Run clock: **24-minute in-game day** [RATIFIED 2026-07-29] mapped onto sky time-of-day
  (`SKY_CYCLE` in `src/sky.js` already exists); day counter. ~10–15 days per run.
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

**Requires:** SM-1 (the day is the budget every mission type spends), FEAT-21 (POI anchors).
**Already in hand:** FEAT-29 par oracle; the beta mission harness to test against.

**Goal:** money exists and the arithmetic says: lazy day nets negative, brave day nets positive.

- Mission board at POIs: hand-authored types × procedural dressing. **The taxonomy lives in
  [missions.md](missions.md)** — four scoring axes (margin / coverage / restraint / clearance), three
  delivery types (point-to-point / fragile / freight).
- **First real type: the paper route** (coverage) — the uncle's job (see [opening.md](opening.md)).
  Its budget is *a day-fraction, not a clock*: the route ends when the light goes. Needs SM-1.
- Payout = margin against par (SM-INV-4); par surfaces ONLY as payout, never as a clock (SM-INV-3).
- **XP is run-layer** (SM-INV-14) and gates *when a region's main mission becomes available*; money
  buys parts. **XP buys time, money buys parts.** Scoring formulas in `missions.md` are PROPOSED.
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
- XP/story beats trigger **FEAT-28 region unlocks** (the brief validation load is the level-up moment
  — diegetic barrier lifts). Story frame: the barriers are the **Roamer's old trails**, and expansion
  is **gated by authored main missions**; XP is the pacing floor, not the gate itself. Authoring the
  main missions is SM-5; SM-4 wires the trigger.
- **Two state objects** (SM-INV-12 as rewritten — meta no longer feeds worldgen):
  - **`runState`**: run age + progress, input to run-layer world state
    `(worldSeed, runState, coords)`. Advances at day/sleep/mission boundaries. **Resets on death.**
    Gates pin a default `runState` (the object they used to pin as `metaState`).
  - **`metaState`**: versioned persistent profile (localStorage), holding **unlocked starting
    vehicles and story keys only**. **Never touches generation.**
- What persists: **literacy + the garage**. What doesn't: car, parts, money, **XP, region/trail
  clearance, and world parameter states** (SM-INV-8 narrowed, SM-INV-14).
- **The garage** — meta-progression is unlocked *starting vehicles*, lateral never upward.
- **Suspend-and-resume saving**: one slot, written on quit, **deleted on load**, deleted on death.
  Cheap precisely because worldgen is meta-free — the world is never serialized. (FEAT-42.)
- Run shape target: ~10 regions, 4–6 h to beat. The full trail chain must fit in **one run**
  (SM-INV-7) — that bounds region count. See [run-shape.md](run-shape.md).

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
  disposition tracks, ledger shapes; The Night Owl / The Innkeeper / The Verge / The Confluence) —
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
free lane (any time) ── FEAT-28 · FEAT-09 · FEAT-26/27 · FEAT-23 · FEAT-04a · FEAT-21
                        FEAT-48 (physics adapter) · FEAT-41 (menus)

SM-1 The Day ──▶ SM-2 The Wager ──▶ SM-3 The Machine ──▶ SM-4 The Run ──▶ SM-5 The World Turns
   │                  ▲                                        ▲
   └ no prereqs       └ needs FEAT-21                          └ needs FEAT-28
```

**Already banked, out of the critical path:** FEAT-29 par oracle (sanctioned early), the beta mission
harness (a test rig for it), FEAT-43 story sandbox, FEAT-46 POI pads.

## Working notes

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

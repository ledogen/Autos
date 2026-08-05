---
id: FEAT-61
type: feature
status: open
severity: major
opened: 2026-08-04
source: SM-2 milestone — first real mission type (plan-mode session 2026-08-04)
relates: FEAT-53, FEAT-59, FEAT-60, FEAT-46, FEAT-43, FEAT-29
invariants: SM-INV-2, SM-INV-3, SM-INV-4, SM-INV-12
plan: .planning/handoffs/HANDOFF-2026-08-04-paper-route.md
---

# FEAT-61: The paper route — SM-2's first real mission type

## Request

`missions.md` §2 calls the paper route *"the first real mission type"* and the carrier of the
**coverage** axis; `opening.md` makes **Uncle Larry** the person who hands it over and the gate on
better routes. SM-2 is open and its spine (FEAT-53: par → ratio → payout → wallet → points) is built
and owner-verified, so the economy this mission scores into already exists.

What is missing is everything that makes the route *a different activity* from the point-to-point
errand: a way for a character to talk, a way to throw something, houses to throw at, and a score with
more than one term in it.

**Outcome:** from Larry's POI near the spawn you take a route, hear him explain it once, drive a loop
of 4 houses landing rolls on their targets before the morning-coffee deadline, and get paid on how
fast, how accurate and how complete you were. Run it clean and he gives you a bigger route.

**The full approved plan — scoring algebra, module-by-module design, phases, gates, assumptions and
risks — lives in the handoff named in the frontmatter. Read it before starting.** This ticket is the
tracker entry; the handoff is the spec.

## Two ratified design amendments (Phase A — do these first, in the docs)

Both are owner rulings from the 2026-08-03/04 scoping conversation, and both contradict a doc
currently on `main`. Recording them as amendments keeps `missions.md` the source of truth instead of
letting code quietly diverge.

1. **The paper route has a deadline.** `missions.md` §2 currently says *"The budget is a day-fraction,
   not a clock… it isn't a timer, it's an inventory and a sunset."* Ruling: it is a **par-derived
   timer** — the papers have to land before people have their morning coffee. Legal under SM-INV-3 as
   amended (*"some mission types carry an explicit, visible, diegetic timer"*), and the diegetic
   framing is what makes it so. §2's budget paragraph is struck and replaced; the inventory cap
   survives.
2. **Accuracy is a fifth scoring axis.** `missions.md` states *"adding a fifth axis is a design act."*
   Ruling: accuracy is a real axis, not dressing. The scoring-axes table gains a row — **Accuracy ·
   measures where the thing you threw landed · pays continuous in distance from the target · never
   hard-fails.**

## Scope

- `src/dialogue.js` + `#dialogue-panel` — sequential cards, **no dialogue options**, `.dlg-key`
  control glyphs, `seen` set on the run layer.
- `src/throw.js` — hold-**F** aim (camera seam `setAimMode`/`getAimDir`), release to launch;
  gravity-only projectile inheriting vehicle velocity; visual is `spawnModel('newsRoll')` (FEAT-59).
- `src/poi.js` — POI records gain `kind: 'job' | 'house' | 'larry'`; `buildPaperRoute(center, radius)`
  reuses `build()`'s canonical order + `_evaluate()` battery for 15 deterministic houses.
- `src/main.js` — green target rings (`TARGET_R = 5 m`) on active customers, from the existing ring
  pool. House *bodies* stay the placeholder cube — **FEAT-60 owns modelled POIs**.
- `src/paper-route.js` — a **sibling** of `MissionSystem`, not a mode inside it: tour + one
  `computePar()`, deadline, delivery detection, settlement through the existing
  `EconomySystem.settle()`, tier advance.

**Out of scope:** modelled houses/mailboxes (FEAT-60), box-physics on the thrown roll, the
burger-joint opening and the tutorial that walks the player to Larry's house (later ticket).

## Acceptance

- **The economy anchors hold by construction.** A perfect route driven at par yields `quality = 1`,
  `ratioEff = 1.0` — payout identical to `payoutFor(par, 1.0, tier)` and letter **B**. No constant in
  `src/economy.js` or `src/par.js` moves; both are called unmodified.
- **One par, one oracle** (SM-INV-2): `computePar()` over the planned tour. No second par.
- **Deadline is exactly `parRoute × PAPER_TOLERANCE`** (recommended **1.2**, where payout already
  reaches zero). On the bell the route ends; landed papers pay, undelivered stock is forfeit.
- **Progression is voiced, not a bar:** one perfect route unlocks the next tier from Larry, 4 → 9 → 12
  → 15 houses (radius 1.0 → 1.5 km). `paperRouteTier` lives on the **run layer** — it re-earns each
  run.
- **SM-INV-12 holds:** all 15 houses generate *always*; the tier only chooses customers. Nothing in
  the run layer changes what worldgen builds.
- **`ratioEff` cannot produce a garbage grade** — the payout clamp floors at zero; the letter path
  needs the same guard.
- **Gates** (`test/gates.mjs`, subsystem `story`): `paper-route.mjs` (scoring algebra, world-free),
  `paper-poi.mjs` (heavy — 15 houses, window-invariance across two stream centres, never on a pad or
  in water, tier does not change what exists), `throw.mjs` (pure ballistics). Existing `story-poi`,
  `mission-network`, `economy`, `par-oracle`, `day-clock` stay green; `npm run test:all` before merge.
- **Live check** on the worktree's port: take the route, hear the two cards once, throw from a moving
  truck into a circle, see the result card, take a second route and confirm the briefing does not
  replay.

## Phases

- **A — Docs.** The two amendments in `missions.md`. No code.
- **B — Dialogue.** `src/dialogue.js` + panel + Larry's two cards, fired from a debug hook.
- **C — Houses.** `poi.js` `kind` + `buildPaperRoute` + green rings.
- **D — Throw.** `src/throw.js` + camera aim seam + reticle, debug key to throw anywhere.
- **E — The mission.** `src/paper-route.js` — tour par, deadline, scoring, settle, tier advance.
- **F — Gates + housekeeping.** New gates, slider/HUD audit, MILESTONES SM-2 paragraph.

## Open assumptions (owner to confirm — full list in the handoff)

- "10 metre circle" = 10 m **diameter**, so `TARGET_R = 5 m`.
- A thrown paper is **spent** whether or not it lands; stock = customers + 20% spares.
- Papers are unlimited-range — no minimum standoff.
- The loop back to Larry is fiction only; arrival at the last customer ends the route.
- Larry's POI is **placed, not authored** — nearest qualifying pad to spawn, so the mission has a
  source today.

## Risks

- **Tour routing cost is the one real unknown** — a 15-stop tour is an order of magnitude more edges
  than a Quick Job's `MAX_EDGES = 9`. Should be cache-warm in a frozen FEAT-43 region; if it blows a
  frame budget, compute the tour once at accept, behind the briefing cards (free cover).
- **Three amendments to ratified docs in one feature** (timer, fifth axis, character-voiced
  progression). Phase A records them so the next session inherits decisions, not drift.

## Where the work happens

Worktree `/Users/ledogen/CodeShit/CarGame-paper-route`, branch `feature/paper-route`, currently
fast-forwarded to `b93afbb` and untouched.

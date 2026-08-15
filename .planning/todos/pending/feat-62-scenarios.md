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

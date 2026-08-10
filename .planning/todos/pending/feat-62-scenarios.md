---
id: FEAT-62
type: feature
status: open
severity: major
opened: 2026-08-10
source: owner — "I like it so much I wanna make it a scenario, accessible mission ready to go from the main menu"
relates: FEAT-41, FEAT-61, FEAT-43, FEAT-42, BUG-45
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

## THE HARD PART: a scenario must pin the WORLD, not the seed

This is what the owner's note is about, and it is the whole engineering content of the ticket.

The road network is a pure function of `(seed, params)`, so the seed alone fixes the roads. **It does
not fix the mission.** Story mode's region — and therefore the POI roster, the newspaper customers,
and the route through them — is anchored on the **region centre**, and the region centre is *"wherever
the truck happens to be standing when the region goes live"* (`story.js._beginWarm`).

Where the truck is standing is not stable:

- `_reseatTruckAtSpawn` resolves the spawn with a two-tier `queryNearest` probe **against whatever is
  streamed at that moment**. Its own comment concedes the consequence: *"14 spawn IDENTICAL, the 1
  that differs lands on a CLOSER on-road point."*
- Entering story mode on an already-loaded seed takes the `reseat()` branch rather than `applySeed()`,
  and by then far more network is resident than on a cold load. That is exactly the fresh-load
  sensitivity the owner is pointing at.

BUG-45 fixed the *worst* symptom (mom and Larry swapping houses) by keying roster selection to each
pad's own id instead of to an index into a distance-filtered list. Measured after that fix:

| centre drift | POI roster | newspaper customers | region wall |
|---|---|---|---|
| ≤ 20 m | stable | stable | moves with the centre |
| 50 m | stable | **churns** | moves |
| 100 m | **mom can change** | churns | moves |

Good enough for story mode, where each run is its own world. **Not good enough for a scenario**,
whose entire promise is "the same challenge, every time, for everyone".

### The fix this ticket needs

**Pin the region centre in the scenario definition** — capture it once from a real session, store the
literal coordinates, and have the scenario entry path use them verbatim instead of asking the truck
where it is. The truck is then seated *from* the centre rather than the centre being derived *from*
the truck, which inverts the dependency that makes this fragile.

That also means a scenario does **not** depend on a fresh load, which is the more robust answer to
the owner's constraint: rather than documenting "only start this from a cold boot", make cold and
warm entry produce the same world by construction. A gate can then assert it — build the scenario's
world twice from different streaming histories and diff the roster, the customer list and the route.

## Prerequisite: the capture bridge must record the region centre

`src/capture.js` records `place.region`, but that is only the ~200 m probe box around the mark. **The
story region centre is recorded nowhere**, in any artifact.

The cost of that gap is already measured: three owner bug reports on seed 90 this week
(BUG-45, BUG-46, the tour-model defect) each had to be chased by rebuilding the region headlessly and
*guessing* the centre from `streamCenterHistory`, and the guess was never confirmed. Add the live
region (`storySystem.region()` → `{x, z, r}`) plus the active mission/route to the capture payload.

It is a few lines, it makes every future story-mode bug report reproducible, and **it is how the first
scenario's centre gets authored** — you drive to a world you like, capture, and paste the numbers into
the scenario definition.

## Scope

- **`data/scenarios.js`** — authored definitions, data only, the `data/dialogue.js` pattern. Each
  entry holds: `id`, display `name` + one-line `blurb`, `seed`, **`center: {x, z}`**, `regionRadius`,
  the start state (where the truck is seated and facing), and the mission to arm.
- **A scenario entry path** — a sibling of `StorySystem.enter()`, or a mode inside it, that takes a
  definition instead of a seed prompt: apply the seed, seat the truck at the authored start, warm the
  region on the **authored** centre, go live, arm the mission.
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

Seed **90** is the owner's candidate world (captures 2026-08-09/10). Its centre must be captured once
the bridge above records it — the value cannot be derived, and the guesses tried during BUG-46 all
produced different Larrys.

Start seated at Larry's place with the mission ready to take, so "press play" lands you at the thing
rather than at a drive to the thing. Tier 1 (four customers) is the right rung: it is the one the
owner has driven and rated, and it is ~2.8 km / par 2:32.

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
- **The world is identical every time.** Entering the same scenario from a cold boot and from a
  warm session (free roam → scenario, story mode → exit → scenario) produces the same region centre,
  the same POI roster, the same customer list and the same planned route. This is the ticket's
  load-bearing acceptance criterion.
- A gate asserts that: build the scenario's world twice under different streaming histories and diff
  roster ids, customer ids and the route's segment list.
- Captures record the story region centre and the active mission, so a scenario can be authored from
  one and a bug report against one can be reproduced.
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
- Fixing the spawn probe's stream sensitivity in general. Scenarios sidestep it by pinning the centre;
  story mode's own exposure to it is noted in BUG-45 and stays open.

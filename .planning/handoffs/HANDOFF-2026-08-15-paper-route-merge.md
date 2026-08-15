# HANDOFF — merging `feature/paper-route` into main — 2026-08-15

**You are merging 29 commits that deliver FEAT-61 (the paper route), FEAT-60 (modelled POI markers)
and FEAT-63 (the GPS re-plan). Read the whole of §1 before you type `git merge`.**

Branch: `feature/paper-route` @ `4e2c52a`, worktree `/Users/ledogen/CodeShit/CarGame-paper-route`.
Merge base: `37489ef`. Tree is clean; every commit is gated.

**Two owner rulings shape this merge, both 2026-08-15:** the topo map stays and only its customer
dot changes colour (§1), and Phase F is deferred for you to scope after the merge rather than done
before it (§4).

---

## 1. THE THING THAT WILL BITE YOU: main rewrote the 2D map underneath this branch

Main has **50 commits** since the merge base, and one of them is `67b8ea2` — *"Merge branch
'feature/topo-map' — 2D map redrawn as a topographic quadrangle"*. `src/map2d.js` on main is
**+632 / −145** against the base. This branch also touched `src/map2d.js`, but only **+65 / −8**.

**Do NOT resolve `src/map2d.js` by taking this branch's version.** It would delete the entire topo
map rewrite. Take **main's file as the base** and re-apply this branch's three additions onto it.

### The four files both sides changed

| file | main | this branch | how to resolve |
|---|---|---|---|
| `src/map2d.js` | +632 / −145 (topo rewrite) | +65 / −8 | **main's base**, re-apply 3 additions below |
| `data/map-icons.js` | +7 / −7 (palette darkened) | +20 (new `NEWSPAPER` glyph) | **both** — this branch only ADDS a const, main only retunes existing rows |
| `index.html` | +5 / −2 | +53 / −13 | both — should be textually disjoint, verify |
| `.planning/story-mode/missions.md` | small | §2 rewritten | **take this branch's** — it carries four ratified amendments |

### The three additions to re-apply to main's `src/map2d.js`

1. **`_drawCustomers` gains two states.** Off a route, quiet dots; on a route (**the offer included**,
   so the briefing map and the drive agree) each customer becomes the `NEWSPAPER` glyph. Driven by a
   new `getRouteState()` dep — `{ onRoute, arrow }` — supplied from `main.js`.
2. **`_drawStartArrow`** — a chevron 50 m down the route, offer only, in the route's own blue with a
   dark halo. It exists because a round routinely passes back through Larry's, so the line alone
   cannot say which end to start from.
3. **The `getRouteState` constructor dep**, and one call to `_drawStartArrow(ctx)` after
   `_drawMission(ctx)` in the draw order.

### The colours — OWNER-RULED 2026-08-15, no judgement needed

The owner's ruling, verbatim in effect: **keep the topo map, change its green customer dots to
white, and turn those white dots into newspapers once Larry's mission starts.**

So this branch's colours stand, and main's customer dot is the one thing that changes:

- **Customer dot: main's `#159149` / `#0d2a12` → `#ffffff` fill, `#101010` stroke.** This was
  checked rather than assumed: main's paper is `PAPER_GREEN = #cfe2bd`, and the near-black stroke is
  what carries the contrast, so a white dot reads cleanly on it. Main's own comment warns that
  `#3ddc6b` "sat invisibly on PAPER_GREEN" — that was an unstroked GLOW colour, which is a different
  problem from a stroked white.
- **The `NEWSPAPER` glyph keeps its white fill + `#101010` stroke**, for the same reason. It was
  rendered and inspected at 22.5 px during authoring.
- **The start chevron keeps `#5ab4ff`.** Verified: main's `_drawMission` still strokes the route in
  `rgba(90,180,255,0.85)`, unchanged by the topo rewrite, so the chevron still matches the line it
  is describing.

No gate covers `map2d.js` or `map-icons.js` — the runner says so outright rather than reporting a
hollow pass — so the smoke test in §3 is the only verification these get.

---

## 2. What the branch delivers

**FEAT-61 — the paper route.** Take a round from Uncle Larry, drive a tour of 4–15 customers, throw
rolled papers at target circles, get paid. Owner-driven across four sessions and owner-approved:
*"par on paper route feels good"*, *"payout curve is good"*.

**FEAT-60 — modelled POI markers.** Merged into this branch before the paper-route work started and
**not on main**, so this merge delivers both. That was deliberate — both touch `src/poi.js`
generation, and doing them together beat reconciling them afterwards.

**FEAT-63 — the GPS re-plan** (closed, `.planning/todos/completed/`). Drive off the route and the
guidance re-plans to the shortest way to finish, computed across frames in spare time.

### The five things worth knowing about the design

1. **`route` is the contract, `guide` is the line.** `route` holds customers, par and deadline;
   nothing in the re-plan path may touch it. `guide` is only a shape to follow. Scoring reads
   `route`, renderers read `line()`. This is what makes "par never moves" structural rather than
   careful — SM-INV-2 holds by construction.
2. **Par prices the stops.** A delivery pins the reference driver to a true zero at the porch — the
   one place `par.js`'s `vMin` floor does not apply — and charges no dwell. Before this, par drove a
   fifteen-porch round at 73 km/h average and the expediency bonus was unreachable by construction.
   `stopDwell` does not exist; nothing outside the paper route sets `stop`, so every other mission
   type prices byte-identically (`par-oracle` is green).
3. **Accuracy pays, the clock grades.** Accuracy scales the per-delivery rate and is banked ON THE
   SPOT as each paper lands (`EconomySystem.addSpot`); the end-of-route settlement is a pure
   function of time through the same `gradeRun()` every other mission uses. Par is a B.
4. **`bonusMax = 7/6` is not a free knob.** It is forced by the owner's equivalence — a rim-scraper
   blasting the round must earn what a methodical driver earns at par. If anyone retunes it, the
   equivalence is what they are actually changing. The derivation is in `missions.md` §2.
5. **One ordering algorithm, two drivers.** `planTourJob` is a generator; `planTour` is a thin drain
   over it. A second planner would be free to drift; `test/paper-reroute.mjs` pins that they agree.

---

## 3. Verification

- `npm run test:all` **after** the merge resolves — the branch's gates have only ever run against
  the branch, never against merged code, and main's 50 commits include map, asset and topo work.
- **48 → 49 gates**: this branch adds `test/paper-reroute.mjs` and `test/world-determinism.mjs`.
- `npm run build` must be clean. It caught a real break on this branch once (a renamed export whose
  import was not updated) that no gate would have.
- **Smoke test by hand**, because nothing headless covers the map or the HUD:
  seed 90 → story mode → drive to Larry's → the map opens on the offer → the start chevron points
  the way the GPS chevrons will → accept → deliver a paper (`+$N.NN` read-out, cyan ring goes out)
  → turn around and drive back (**no chevrons behind you**) → finish → the result card.

---

## 4. Known-open, deliberately not fixed

- **BUG-48** — the mission route cuts corners the road does not have; three RoadSystem instances
  resolve the same arc range differently. Filed with a capture in-repo and a hypothesis, **not
  diagnosed**. Affects ordinary POI missions too, and mis-prices par on the same segments.
- **BUG-47** — seed 11 strands Larry on a small graph component; 12 of 16 customers unroutable, so
  the ladder saturates at 4. Pre-existing, FEAT-28's problem, parked by the owner.
- **FEAT-62** — the paper route as a menu-launchable scenario. Filed, untouched.
- **FEAT-61 Phase F** — `test/paper-houses.mjs`, a debug folder for `PAPER_PARAMS` / `THROW_PARAMS`
  / `poiHouse*` / FEAT-63's `RR_*`, and the MILESTONES SM-2 paragraph.
  **DEFERRED TO AFTER THE MERGE, AND IT IS YOURS TO SCOPE (owner, 2026-08-15):** decide whether any
  of it is actually needed once the merge is done, rather than doing it because a ticket says so.
  The strongest case is the debug folder — several of those constants are feel-tuned by a single
  drive, and two (`RR_OFF_M`, `RR_STALE_M`) were reasoned about and never felt at all, so they are
  guesses with no dial on them. The weakest is `paper-houses.mjs`: `story-poi` and
  `world-determinism` already cover house determinism and window-invariance from two stream centres,
  so check what it would actually add before writing it.

## 5. Housekeeping the merge should not be surprised by

- The owner's **main checkout has uncommitted work** unrelated to this branch — `.gitignore`,
  `CLAUDE.md`, `package.json`, `.planning/story-mode/items.md`, plus untracked `tools/` and two
  `assets/models/src/ref-*` directories. Stash or commit it before merging; it is not ours.
- `test/gates.mjs` gained two rows. If both sides edited it, keep both.
- Two assets (`tent.glb`, `winnebago.glb`) exist on main and not here — that is main moving forward,
  not this branch deleting them. **Do not let a resolution drop them.**

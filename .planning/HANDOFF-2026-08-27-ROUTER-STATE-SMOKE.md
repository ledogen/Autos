# HANDOFF — state-of-the-router smoke test, 50 seeds

**You are a fresh agent picking up a data-collection run the owner scoped on 2026-08-27.**
Everything here is decided; nothing below needs re-litigating. Your job is to RUN it, then present
findings in a browser artifact with pictures.

| | |
|---|---|
| Code | worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`, branch `feature/corridor-router`, dev server already up on **:3343** |
| Head | `f82dd08` (verify with `git log --oneline -1`) |
| Docs | `/Users/ledogen/CodeShit/CarGame` (main) — the established split |
| Budget | up to **2 hours** and **50 % of the usage window**. Spend it; stop early only if the data stops paying |

Read `.planning/HANDOFF-2026-08-27-BUG-56-build.md` first for what the router currently is and what
was deliberately left broken. Do NOT re-derive its measurements.

---

## THE SCOPE, as the owner set it

**Sweep: seeds 1–50, 2.5 km radius, each region centred on THAT SEED'S OWN SPAWN** (not the origin).
Story mode centres its region on the spawn, so "is seed N playable" only means anything there.

Collect per seed:

1. **Cold load time.** Method decided: **one browser, re-enter story mode per seed.** `applySeed`
   regenerates the world and the route cache is per-RoadSystem, so ROUTING is genuinely cold each
   time; the page, the JIT and the worker pool stay warm. That is a real second-playthrough, which
   is what the owner wants at "actual M4 speeds". **Spot-check ~5 seeds with a fresh page load** and
   report the gap so the number is honest about what it excludes.
2. **Connectivity — is any seed BROKEN?** `validateArea(road, centre, discArea(2500), P)` from
   `src/world-validate.js` gives `components`, `condemned`, `unpinned`, `playable`. More than one
   component, or any condemned edge, is a broken seed. Name them.
3. **Worst grade** per seed, plus the histogram (over 20 / 24 / 30 %).
4. **Pad failures and ugly intersections** — see the picture plan below.

---

## THE OWNER'S ACTUAL DESIGN QUESTION: minimise the UNFUN

The owner explicitly redirected this away from "what would be more fun":

> "Maybe it's better to consider how we can minimize the *unfun* things in the world. **I don't
> trust you to make good calls on vibes** but you can look for harsh road transitions, gnarly bumps
> or dips that might catch someone off guard and feel unfair. Another thing that I think adds tedium
> is super long straight sections of road. It's easy to go fast but the intersection at the end is a
> case of: time your braking point right or your whole run is over. Not skillful and not fun."

**Take the "no vibes" instruction literally.** Do not write aesthetic judgements, do not rank worlds
by how they "feel", do not editorialise about character. Measure the three named classes, report
numbers and pictures, and let the owner judge. Where you must interpret, say so in one clause and
give the number that would settle it.

### The three classes, and a proposed metric for each

You may improve these metrics — they are a starting point, not a specification. State clearly which
one you used.

**(1) HARSH TRANSITIONS — the road changes faster than a driver can read it.**
- Curvature step: |Δκ| between consecutive samples along a run, i.e. straight → tight without a
  transition. `runProfile(arcS, runKey)` gives `tx/tz`; κ from the heading change over an arc window.
- Camber rate: `camberProfile(arcS, runKey)` differentiated along arc. `roadCamberRate` slew-limits
  it to 1.5 °/m on the OPEN road, but junction blends and BUG-56 departures are separate paths — the
  fork camber match (B4) was measured swinging 34 ° in 45 m before it landed.
- Grade step: |Δgrade| per metre.
- Suggested reporting: the worst N sites, and the distribution, so "harsh" gets a threshold from the
  data rather than from you.

**(2) UNFAIR BUMPS AND DIPS — vertical surprises.**
This is the one with no existing instrument, so it is the most valuable to build.
- `test/road-smoothness.mjs` only catches WALLS — a 0.15 m step in 0.1 m, i.e. a collision defect.
  A crest or sag that is perfectly smooth and still launches the truck passes it today.
- Metric: VERTICAL CURVE RADIUS, `Rv = ds / Δgrade`, along every run. A crest with small `Rv` taken
  at speed unloads the suspension; a sag compresses it.
- The honest version coupts SPEED: airtime needs `v² / Rv > g`. So compute an achievable approach
  speed (the preceding straight/curvature and grade will bound it) and flag crests where the truck
  would go light. `test/drivetrain-climb.mjs` measured the truck holds 30 % grade at 52 km/h and
  tops out ~165 km/h flat — use real numbers, not guesses.
- Cross-check any candidate against the physics: `test/lib/physics-replay.mjs` exists and the
  `assert-m4-*` scripts drive scenarios headlessly. If you can show a wheel leaving the ground on a
  measured crest, that is the finding.

**(3) LONG STRAIGHTS INTO JUNCTIONS — the braking-point roulette.**
The owner's clearest, most actionable complaint. Their words: *"time your braking point right or
your whole run is over. Not skillful and not fun."*
- Metric: for every junction node, for every incident leg, the length of near-straight approach
  immediately before the node (curvature under some threshold), and the speed that run-up implies.
- Then ask what is AT the end: a through road you can carry speed through, or a T that demands a
  stop. A 900 m straight into a T is the worst case; a 900 m straight into a gentle continuation is
  not a problem at all. **Report those separately — conflating them would overstate the problem.**
- Useful context you already have: `roadMinTurnRadius` is 15 m and junction pads clamp arrival grade
  to `mergePadArrivalMax`. Junction geometry lives in `_detectNodeJunctions()` (node → legs, each
  with `runKey` and endpoint `arc`).
- If the class is real and prevalent, the fix vocabulary is worth naming for the owner (do NOT build
  any of it): approach curvature in the router's cost, a visual warning — **ASSET-31 road signs
  already exist and are unplaced, see FEAT-72** — or simply not generating long straights into
  stop-junctions. Present options, let the owner rule.

---

## Instruments that already exist — use these, do not rebuild them

| | |
|---|---|
| `src/world-validate.js` | `validateArea(road, centre, discArea(r), P)` → components / condemned / unpinned / grade histogram. THE connectivity answer |
| `test/lib/road-battery.mjs` | `WINDOWS` + `buildWindow(W, P)`; its `spawn: true` entry is the exact spawn-region streaming recipe you need for all 50 seeds |
| `test/junction-stitch.mjs` | deck gap AND ribbon-edge gap vs lateral separation. `--window=` filters. Its `fork ROLL residual` line is the camber-mismatch statistic |
| `test/pad-census.mjs` | every ≥3-leg junction gets a pad, and WHICH RUNG built it. `hull` = the crude convex-hull floor, i.e. a junction that exists but is not shaped |
| `test/road-grade.mjs` | nothing ships above the `gMaxRoad + gradeTol` ceiling; grade histogram + ladder rungs |
| `test/node-pin.mjs` | every run ends at the node it shares |
| `test/road-smoothness.mjs` | the collision surface — WALLS only, see class (2) above |
| `test/replay.mjs <capture>` | reports gradeY / hit / runKey / arcS / minR at a marked spot |
| `test/screenshot.mjs <x> <z> [y] [--flags]` | headless CDP screenshot. `--port=3343` is REQUIRED (default 8000 is the main checkout) |
| `test/lib/cdp.mjs` | `launchChrome` / `connect` / `evalJS` — for anything the screenshot tool cannot frame |

**Reference numbers from 2026-08-27 so you know what normal looks like** (9-window battery, not the
50-seed sweep): 412 runs · 323 km · over 20 % grade 7.06 % · over 24 % 3.10 % · worst 38 % · 0
condemned · 0 unpinned · pad rungs weld 106 / circle 43 / hull 28 / NONE 0 · junction-stitch 105
sites, fork roll residual median 0.1 °.

**`npm test` is 29/34 with FIVE BOOKED REDS — this is expected, do not chase them:**
`junction-stitch` (BUG-56's own allowed red), `graph-topology` (corridor-clearance, booked in B5),
`mission-network`, `paper-tour`, `pond-route-around` (instrument re-baselines). `play-area.mjs` is a
`manual` gate and is held back from `npm test` on purpose — run it with `--only` if you want it.

---

## Pictures

Owner's ruling: **both kinds, a couple of each.** Rank separately and screenshot 2–3 of each:

- **worst measured deck gap** — `junction-stitch --verbose`, the `edge gap … at … separation` rows;
- **worst pad quality** — `pad-census`, junctions that fell to the `hull` rung.

Plus whatever class (1)/(2)/(3) turns up. If a class is prevalent, 2 examples is enough — the owner
said so explicitly.

### Screenshot recipe that works (learned the hard way this session)

```
node test/screenshot.mjs <x> <z> --port=3343 --seed=<s> --height=38 --pitch=-1.05 --zoff=20 --wait=30000
```
- **`--wait` 30000, not the 6500 default.** At a short wait the terrain has not streamed and you get
  a road fragment floating in sky-blue. This wasted three shots.
- **Steep oblique (pitch −1.0 to −1.2) for junctions.** Roads sit in deep CUTS — up to 30 m below the
  surrounding hillside — so a low camera ends up INSIDE the hill and you photograph the terrain
  backface. A shallow "cinematic" angle will fail; do not keep retrying it.
- Frame by adjusting `--zoff` (camera sits at `z + zoff`, looking toward −Z) before touching `--yaw`.
- For a batch, drive one browser via `test/lib/cdp.mjs` and move `window.__view(x,y,z,yaw,pitch)`
  between shots — far faster than one browser launch per picture.

---

## The artifact

Publish an HTML artifact (`Artifact` tool). **Load the `artifact-design` skill before writing it** —
that is mandatory, not advisory. Points specific to this one:

- **16 MB rendered cap, and base64 inflates by ~33 %.** A 1400×813 PNG is 1–2 MB, so ~8 full-size
  images is the ceiling. Downscale, or use JPEG for photos, and keep the count honest.
- Everything must be inlined — a strict CSP blocks every external host.
- Theme-aware, and tables/wide content must scroll inside their own container.
- Lead with the 50-seed table (seed · load s · components · condemned · worst grade), then the three
  unfun classes, then the pictures. The owner reads numbers and will catch a claim that outruns them.

---

## TRAPS — every one of these cost real time this session

1. **String seeds MUST go through `parseWorldSeed`.** A raw `'lone-pine'` (or a bare number where a
   parsed seed is expected) builds a garbage world. This has burned three sessions now.
2. **NEVER `git checkout` `src/road.js` in this worktree.** The owner may be watching :3343; an A/B
   swap under a live dev server made them reload mid-swap and report a working fix as broken. To A/B
   a method, patch `RoadSystem.prototype` in a throwaway script — that is how most of this session's
   tables were produced, with zero file edits. For anything more structural use
   `git worktree add --detach /tmp/… <sha>` and symlink `node_modules`.
3. **A long-lived Vite server can serve stale modules.** Verify with
   `curl -s localhost:3343/src/road.js | grep <marker>` before trusting an in-browser result.
4. **Scratch scripts must live where `node_modules` resolves** — either inside the worktree, or in
   the scratchpad with `ln -sfn <worktree>/node_modules <scratchpad>/node_modules`, and with absolute
   import paths.
5. **`_v2Infeasible` is NOT a shipped-drape counter.** The plan layer probes merge and shove
   candidates through the same solver, so it ticks for geometry that never ships. Measure the
   registered geometry instead — that is why `road-grade.mjs` gates on the shipped grade.
6. **Wall-clock in a single world build is noisy** (±15 % observed). For any timing claim, use a min
   of N repetitions or an isolated bench, not one run.
7. **A capture from before the v2 router is STALE** — `bug-48-seed90-route-shortcut.json` no longer
   reproduces because seed 90's network was rebuilt. Do not conclude a bug is fixed from a stale
   capture failing to replay; check the mechanism instead.

---

## Deliverables, in priority order

1. The 50-seed table, and a plain answer to **"is any seed broken on connectivity?"**
2. Cold load times, with the method's limits stated.
3. The three unfun classes: metric, distribution, worst examples, prevalence.
4. Pictures: 2–3 worst deck gaps, 2–3 worst pads, plus class examples.
5. The artifact, and the URL handed to the owner.
6. **Suggestions are for the OWNER TO RULE, not for you to build.** Name options and their measured
   cost. Do not start implementing a world change in this session.

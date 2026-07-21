# Handoff — FEAT-39 GPS navigation assist (branch `feature/gps`)

**Date:** 2026-07-21 · **Branch:** `feature/gps` · **Worktree:** `/Users/ledogen/CodeShit/CarGame-gps`
**Base:** local `main` @ `dd80649` · **Status:** complete, user-previewed, unpushed, ready to merge.
**Re-run `npm run test:all` before merging** — the full suite predates the `src/mission.js` edit.

## Merge it

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge gps      # or: git -C <root> merge --no-ff feature/gps
bash ~/.claude/skills/worktree/scripts/wt.sh clean gps
```

**No conflicts expected.** `main` has not moved since `dd80649`. Every `src/main.js` edit is
additive (an import, a `let`, a construction block, a GUI line, a per-frame call, a seed-change
line) — nothing existing was restructured.

> Note for whoever merges: `wt.sh new` branched from `origin/main` (`a3e8ddb`), which was **two
> commits behind local `main`**. The branch was reset onto `dd80649` before any work. If you spin
> up another worktree here, check that first — `origin/main` is stale.

## Commits (5)

| | |
|---|---|
| `96623d7` | feat: GPS navigation assist — in-world route chevrons + junction turn arrows |
| `e9bc56d` | feat: chevrons static on a world lattice, lifted clear of the road |
| `514356b` | fix: chevrons back to road level; turn arrow bends to the real angle |
| `4cca27e` | feat: arrows only at real intersections, as an upright board down the exit road |
| `39f7031`, this file | docs: merge handoff |

The later commits are **iteration on the owner's eye**, not separate features — each replaced part of
the one before after seeing it in-game. Read `4cca27e` for the design that actually shipped; the
curved-arrow machinery in `96623d7`/`514356b` no longer exists.

A commit reordering the mission-panel export fields was made and then **reverted at the owner's
request** — `git reset --hard`, not a revert commit, so it leaves no trace. Do not resurrect it.

## What shipped

`src/gps.js` — a guidance overlay, and only that. It never touches the input path, the physics, or
the par oracle (FEAT-39 explicitly carves the GPS out as the one non-input-modulation assist).

- **Chevrons** pinned to a **fixed world lattice** (route arc = `k * CHEV_SPACING`, 15 m) at
  `CHEV_HOVER = 0.35` m — road-paint height. Ten instances are a pool recycled forward, so the truck
  drives *into and through* them rather than pushing them ahead; each fades out over its last 20 m.
- **One upright arrow board** standing at the **next real intersection**, aimed straight down the
  road you should take, fading in at 140 m.
- **A ring** at the destination on the final approach (arrival was a bare 28 m radius with nothing
  drawn).

### Two design rules that were learned the hard way — do not undo them

1. **Upright, not flat.** A horizontal glyph is met almost exactly edge-on from the chase cam, which
   is the one orientation a driver cannot read. Both the first (curved, flat) arrow and the
   lifted-to-3.9 m chevrons failed on this. Chevrons work low and flat *because* they are read as
   paint at close range; the junction board works *because* it stands up.
2. **Degree, not angle, decides what is an intersection.** `mission.js` tags each segment with
   `endDeg`, the degree of the node it ends at; only 3+ raises an arrow. The earlier 18° turn-angle
   deadband looked reasonable and was wrong: this network kinks hard at degree-2 nodes (QUAL-16), so
   ~42% of the arrows it raised on seed 6 were at plain bends. A crossroads driven *straight through*
   still gets an arrow — not turning is a decision too.

### Why it is cheap

It reads `mission.segments` — the route `mission.js:_roll()` **already computed and priced** — and
bakes it once into a flat polyline (`bakeRoute`). Per frame it does one windowed nearest-vertex
search (~50 distance tests) and writes 10 instance matrices. **No routing, no `RoadSystem` query,
no streaming coupling.** Instrumented as `frame.gps.update` in the PERF-08 harness.

## Touch points

| File | Change |
|---|---|
| `src/gps.js` | **new** — the whole feature (`bakeRoute` / `advanceProgress` / `sampleRoute` are pure + exported; `GpsSystem` + `addGpsGui` are the THREE half) |
| `src/main.js` | 6 additive hooks: import (`:47`), `let gpsSystem` (`:983`), construction after `missionSystem` (`~:1648`), `window.__setGpsEnabled` (`~:1664`), `addGpsGui` (`~:1915`), per-frame `update` before `map2d.render()` (`~:2670`), `clearRoute()` on seed change (`~:558`) |
| `src/mission.js` | **one line** in `_roll()`: tags each segment with `endDeg`. The only edit outside gps.js's own files, and the only thing GPS needs that the mission did not already compute |
| `test/gps-route.mjs` | **new** gate |
| `test/mission-network.mjs` | asserts `endDeg` is actually tagged (see Verification) |
| `test/gates.mjs` | registers gps-route (`story` / `fast`, `extraDeps: ['src/main.js']`) |
| `.planning/todos/pending/feat-driver-assists.md` | **Progress** section — FEAT-39 stays OPEN |

## Ticket state

FEAT-39 covers **five** assists. Only **#5 (GPS)** is done; the four handling assists (TCS, ABS,
understeer/oversteer reduction) and the Assists menu page are untouched and the ticket stays in
`pending/`. Two design questions it raised are now **answered** and recorded on the ticket:

- Presentation: **in-world arrows only** — no mini-map, no HUD ribbon. (Owner call.)
- Default: **ON**, for playtesting and FEAT-30 par calibration. Story mode will gate it later via
  `window.__setGpsEnabled(v)` / the lil-gui toggle — those exist purely as the FEAT-41 seam.

## Verification done

- **All 38 gates green** (`npm run test:all`, 363 s) as of `96623d7`. `npm test` (affected → 3 gates
  incl. the heavy `mission-network`, 51 s) green on `4cca27e`. **Re-run `test:all` before merging** —
  the full suite has not been run since `mission.js` was touched, though nothing outside `story`
  imports it.
- `test/gps-route.mjs` pins what fails *silently*: travel order through reversed edges (`s1 < s0`)
  and partial first/last arc ranges; the degree filter (a 90° bend at a degree-2 node raises
  nothing, the same geometry at degree 3 does, a straight-through crossroads still does); windowed
  progress staying monotonic past a parallel return leg plus the full-scan re-acquire after a stale
  index; and — running the real `GpsSystem` on THREE's renderer-free scene graph — that chevrons
  land on the lattice and **stay static as the truck advances**, and that the board stands at the
  junction with its tip on the exit direction and local +Y still world up.
- `test/mission-network.mjs` asserts every rolled segment carries `endDeg`. This matters: `gps.js`
  fails **open** on a missing tag, so losing it would silently restore arrow-on-every-bend, and
  gps-route cannot catch that because it feeds synthetic segments.
- Visually confirmed in **live headless story-mode runs over CDP** at each iteration — that loop is
  what caught both the wrong-angle arrow and the degree-2 false positive, neither of which any unit
  assertion would have flagged. Scratch CDP drivers lived in the session scratchpad and are
  intentionally not committed — `src/` carries no diagnostic plumbing.
- **Photographing the arrow needs a temporary edit.** It only draws within `ARROW_IN` (140 m) of the
  truck, and there is no way to drive a mission headlessly. Every arrow screenshot was taken by
  setting `ARROW_IN = 4000`, shooting via the freecam, then restoring the constant. Check `git diff`
  after doing this — it is easy to leave behind.

## Known gaps / judgement calls for the owner

1. **Off-route behaviour is passive by design** — stray and the chevrons keep marking the route,
   leading you back. No "wrong way" warning.
2. **Only bound to missions.** GPS shows while `missionSystem.state` is `countdown` or `running`.
   Free roam has no destination to route to; a map-waypoint source (double-click on `M`) was
   scoped and deliberately deferred — it would reuse the Dijkstra already in `mission.js:_roll()`.
3. **Chevron Y is the routed design grade (`gradeAt`), not the asphalt top** — they can sit up to
   ~1 m off the true surface where the two diverge. At the new `CHEV_HOVER = 0.35` this is the one
   remaining place the overlay could visibly clip into or float over the road. **Not yet observed
   in play.** If it shows up, the fix is `roadSystem.sampleRoadTopY(x, z)` for the ~10 visible
   chevrons per frame (memoised via `carveHint`, so it is affordable) with `gradeAt` as fallback —
   at the cost of the module's current total independence from `RoadSystem`.
4. **The board is only face-on when the turn is sharp.** It aims down the exit road, so at a
   shallow-angle junction the driver still meets it fairly edge-on. Every junction it appears at is
   degree 3+, but not every one of those is a hard turn. A camera-facing billboard would fix the
   legibility and lose the "points at the actual road" property — a real trade, not an oversight.

## Gotcha worth keeping

`THREE.Matrix4.decompose()` reports scale **(1, 1, 1)** for a degenerate zero-scale matrix — it
cannot distinguish a hidden `InstancedMesh` instance from a live one. Test the raw basis
(`Math.hypot(e[0], e[1], e[2])`) instead. This silently broke the gate's own visibility helper
before it was caught.

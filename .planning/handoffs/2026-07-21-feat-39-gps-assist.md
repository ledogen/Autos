# Handoff — FEAT-39 GPS navigation assist (branch `feature/gps`)

**Date:** 2026-07-21 · **Branch:** `feature/gps` · **Worktree:** `/Users/ledogen/CodeShit/CarGame-gps`
**Base:** local `main` @ `dd80649` · **Status:** complete, user-previewed, unpushed, ready to merge.

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

## Commits (2)

| | |
|---|---|
| `96623d7` | feat(FEAT-39): GPS navigation assist — in-world route chevrons + junction turn arrows |
| `e9bc56d` | feat(FEAT-39): chevrons static on a world lattice, lifted clear of the road |

A third commit (mission-panel field reorder) was made and then **reverted at the owner's request** —
`git reset --hard`, not a revert commit, so it leaves no trace. Do not resurrect it.

## What shipped

`src/gps.js` — a guidance overlay, and only that. It never touches the input path, the physics, or
the par oracle (FEAT-39 explicitly carves the GPS out as the one non-input-modulation assist).

- **Chevrons** pinned to a **fixed world lattice** (route arc = `k * CHEV_SPACING`, 15 m), hovering
  `CHEV_HOVER = 3.9` m over the routed surface. Ten instances are a pool recycled forward, so the
  truck drives *into and through* them; each fades out over its last 20 m and the far end fades in.
- **One curved turn arrow** lying flat `ARROW_HOVER = 6.0` m over the **next** junction, pointing
  into the road to take, fading in at 140 m. Shown **only where a decision exists** — joins inside
  an 18° deadband (`STRAIGHT_DEG`) are kinks and raise nothing. That deadband is the entire reason
  the overlay stays non-invasive; do not "fix" it by arrowing every join.
- **A ring** at the destination on the final approach (arrival was a bare 28 m radius with nothing
  drawn).

### Why it is cheap

It reads `mission.segments` — the route `mission.js:_roll()` **already computed and priced** — and
bakes it once into a flat polyline (`bakeRoute`). Per frame it does one windowed nearest-vertex
search (~50 distance tests) and writes 10 instance matrices. **No routing, no `RoadSystem` query,
no streaming coupling.** Instrumented as `frame.gps.update` in the PERF-08 harness.

## Touch points

| File | Change |
|---|---|
| `src/gps.js` | **new** — the whole feature (`bakeRoute` / `classifyTurn` / `advanceProgress` / `sampleRoute` are pure + exported; `GpsSystem` + `addGpsGui` are the THREE half) |
| `src/main.js` | 6 additive hooks: import (`:47`), `let gpsSystem` (`:983`), construction after `missionSystem` (`~:1648`), `window.__setGpsEnabled` (`~:1664`), `addGpsGui` (`~:1915`), per-frame `update` before `map2d.render()` (`~:2670`), `clearRoute()` on seed change (`~:558`) |
| `test/gps-route.mjs` | **new** gate |
| `test/gates.mjs` | registers it (`story` / `fast`, `extraDeps: ['src/main.js']`) |
| `.planning/todos/pending/feat-driver-assists.md` | **Progress** section — FEAT-39 stays OPEN |

## Ticket state

FEAT-39 covers **five** assists. Only **#5 (GPS)** is done; the four handling assists (TCS, ABS,
understeer/oversteer reduction) and the Assists menu page are untouched and the ticket stays in
`pending/`. Two design questions it raised are now **answered** and recorded on the ticket:

- Presentation: **in-world arrows only** — no mini-map, no HUD ribbon. (Owner call.)
- Default: **ON**, for playtesting and FEAT-30 par calibration. Story mode will gate it later via
  `window.__setGpsEnabled(v)` / the lil-gui toggle — those exist purely as the FEAT-41 seam.

## Verification done

- **All 38 gates green** (`npm run test:all`, 363 s) as of `96623d7`; `npm test` (affected → 1 gate)
  green on `e9bc56d`. Nothing outside `story` is affected — the feature imports no worldgen code.
- `test/gps-route.mjs` pins what fails *silently*: travel order through reversed edges (`s1 < s0`)
  and partial first/last arc ranges; turn sign (+ve = right) and the deadband; windowed progress
  staying monotonic past a parallel return leg, plus the full-scan re-acquire after a stale index;
  and — running the real `GpsSystem` on THREE's renderer-free scene graph — that chevrons land on
  the lattice pointing the way you travel, **stay static as the truck advances**, and the arrow
  hangs over the junction rather than the car.
- Visually confirmed in a **live headless story-mode run over CDP** (chevrons + a turn arrow at a
  real T-junction), zero console errors. Scratch drivers lived in the session scratchpad and are
  intentionally not committed — `src/` carries no diagnostic plumbing.

## Known gaps / judgement calls for the owner

1. **The arrow depicts a 90° turn regardless of the real angle** — it is a symbol, yawed to the
   incoming direction, like any GPS glyph. Correct at T-junctions; a 150° hairpin reads as a plain
   "turn left". A hairpin glyph is a third `_turnArrowGeometry` if it ever matters.
2. **`CHEV_HOVER = 3.9` puts the near chevrons high in the chase view** — they read as an overhead
   gate rather than road paint. This is what was asked for; it is one constant if the owner wants
   to split the difference.
3. **Off-route behaviour is passive by design** — stray and the chevrons keep marking the route,
   leading you back. No "wrong way" warning.
4. **Only bound to missions.** GPS shows while `missionSystem.state` is `countdown` or `running`.
   Free roam has no destination to route to; a map-waypoint source (double-click on `M`) was
   scoped and deliberately deferred — it would reuse the Dijkstra already in `mission.js:_roll()`.
5. **Chevron Y is the routed design grade (`gradeAt`), not the asphalt top.** They can sit ~1 m off
   the true surface where the two diverge. Irrelevant at a 3.9 m hover; it would matter if anyone
   ever drops them back down to road level, in which case switch to `roadSystem.sampleRoadTopY`.

## Gotcha worth keeping

`THREE.Matrix4.decompose()` reports scale **(1, 1, 1)** for a degenerate zero-scale matrix — it
cannot distinguish a hidden `InstancedMesh` instance from a live one. Test the raw basis
(`Math.hypot(e[0], e[1], e[2])`) instead. This silently broke the gate's own visibility helper
before it was caught.

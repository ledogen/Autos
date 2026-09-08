# HANDOFF — merging `feature/planner` into main — 2026-09-07

**One commit, no conflicts, nothing to hand-resolve.** Merge base is `977c344`, which is also main's
tip — main did not move during the work, so `git merge feature/planner` from main is a
fast-forward. `git merge-tree --write-tree main feature/planner` is clean. Tree is clean.

Branch: `feature/planner` @ `6dc6887`, worktree `/Users/ledogen/CodeShit/CarGame-planner`, dev
server on :3153 (`npm run dev -- --port 3153 --strictPort`). `node_modules` installed in the
worktree.

Delivers: **missions plan on the play network**, and the private planner RoadSystem — instance,
pre-warm, worker client and constants — is deleted. No ticket; this came out of an owner question
about the "building the road network for this area" panel and was ruled and built in the same
session.

---

## 1. The bug behind the question

> "if i rush into story mode and immediately fire up a quick job, it says 'building the road network
> for this area' — shouldn't it already be built since story mode is cached?"

It was building a road network. Just not the one story mode had already built.

There were **two** networks. The play `RoadSystem`, which story mode widens to
`REGION_RADIUS_M + WARM_MARGIN_M` (2800 m), builds off-thread, registers and **freezes** behind the
loading screen. And a second, private planner `RoadSystem` at its own 1400 m radius, which
`MissionSystem` built for itself and which Quick Job actually planned on.

The second one had a pre-warm (`_startPlannerWarm`), and that warm was gated on
`!storySystem.isEntering()` — deliberately, so it would not fight the region build for the network
Worker. So the order was: loading screen clears → Quick Job button appears → *then*, on the next
10 Hz poll tick, the planner warm starts and takes a couple of seconds on the Worker. Click Quick
Job inside that window and `_plannerWarm.ready` was still false, so `makePlanner` fell through to
its cold path: build a fresh RoadSystem and `update()` it **on the main thread**. Routes were cache
hits (`_buildPlannerRoad` shared the play instance's `_proto.cls` Map by reference), but the BUG-56
plan layer still ran synchronously — the ~4 s the PERF-30 note describes. That was the panel.

Two smaller defects fell out of the same reading, both now moot:

- The warm centred on the **car**; in story mode the planner asked for the **region centre**
  (FEAT-43 anchoring). Drive more than `PLAN_RESTREAM_MOVE` (700 m) from centre before the first
  Quick Job and the warm-reuse test could never match, so the cold build was unavoidable.
- The warm poll had no region gate, so **free roam** rebuilt a 1400 m network every 700 m of drift
  for a planner nothing in free roam can reach (see §3).

## 2. The ruling

Option A, owner, 2026-09-07: **the planning network is the play network**, and the free-roam planner
path goes with it.

> "option A and get rid of the freeroam planner for both, then. if we need to add the planner back
> to freeroam we can blueprint it from the story mode code anyway"

The justification for a separate planner was a free-roam justification: the play instance only holds
a ~320 m window and widening it would re-shape the road under the truck (the comment cited BUG-25).
**That is not why it existed by the end.** Story mode already registers the play instance at 2800 m
and relies on the cull being a pure function of (seed, params, region) — `graph-cull-radius-
invariance` and `restream-invariance` assert exactly that. The real objection to a wide band is
cost, not correctness, and story mode pays it once and freezes.

And missions cannot be reached from free roam at all: `#quickjob-btn` is `display:none` unless
`setQuickJobVisible(true)`, which only `story.js` calls, and POI givers are placed at
`onRegionLive` and dropped at `onRegionExit`. So `_planner()`'s car-following branch,
`PLAN_RESTREAM_MOVE` and the `getRegion() → null` path were live code with no live caller — residue
from before FEAT-43 moved Quick Job inside story mode.

## 3. What shipped (`6dc6887`)

**Deleted:**

| Gone | Was |
|---|---|
| `_buildPlannerRoad`, `_startPlannerWarm` (`main.js`) | built + warmed the private instance |
| the 10 Hz warm poll in `loop()` | kicked a re-warm every 700 m of drift, throttled to 20 s |
| `netClient.register('mission', …)` | third client on the network Worker |
| `MissionSystem.makePlanner` / `_plan` / `_planner()` / `planner()` / `invalidatePlan()` | the planner seam |
| `MISSION_PLAN_RADIUS`, `PLAN_RESTREAM_MOVE` | the private radius + drift threshold |
| `_waterNoGoFns` (`main.js`) | pond-exclusion stash that existed **only** to inject into the lazily-built planner |

**Rewired:**

- `MissionSystem._roll()` calls `this._getRoad()` — the play instance, which in story mode is the
  frozen region band. Real, culled, so a mission still can only ever propose roads that exist.
- `paperRouteSystem`'s `getRoad` was `() => missionSystem?.planner() ?? roadSystem`; it is now
  `() => roadSystem`. Same object either way, one less indirection.
- `clearOffers()` replaces `invalidatePlan()` at the two call sites that need it — `applyWorldSeed`
  and `rebuildWaterSystem`. Cached POI offers pin centerlines from the outgoing network and must
  still be dropped; there is simply no plan left to invalidate alongside them.
- `map2d`'s `MAP_RADIUS` was `= MISSION_PLAN_RADIUS`; it is now its own `1400`, with the measured
  coverage-vs-radius table moved across so the number keeps its justification.

Comments in `story.js`, `road-network-client.js` and `map2d.js` that described the planner as a
second network were corrected rather than deleted — each one now says what is actually there.

## 4. The behaviour change, and it IS one

The candidate node set is no longer a 1400 m window around the region centre. It is **the whole
region band** the play instance holds. `REGION_MARGIN` still clips candidates to 100 m inside the
wall and `LEG_MIN`/`LEG_MAX` (1500–4000 m of straight-line graph distance) still bound the leg, so
nothing escapes and nothing runs away in length — but **jobs can now start further from the region
centre than they used to**, and that is visible in the offers before it is visible anywhere else.

Measured on the real configuration (seed 6, 2800 m band centred at (4500, 600)), via
`test/smoke-region-plan.mjs`:

```
region band 2800 m built in 10.5 s — 182 edges
12/12 rolls produced a job (0 null), 1 ms/roll
lengths 1.8–5.6 km · worst radius 2211 m of 2500 · 0 escaped the wall
```

1 ms per roll, against a build that used to be seconds. The FEAT-43 containment guards are what
hold the line here, and they now carry more weight than they did — the `mission-network` §6 region
check is the gate that pins them.

## 5. The one place this is a downgrade

If the region warm **times out** (`WARM_MAX_MS`, 180 s) or throws, `story.js` calls `_goLive(false)`
and enters **unfrozen**, with streaming still live. The planner then sees whatever the play instance
happens to hold at that moment, where the old private planner would have built its own 1400 m band
regardless. A roll on a thin network returns `null` and the offer panel says so.

Left as-is deliberately: that path is already documented as "degraded, but playable and honest", and
re-introducing a private-planner fallback would restore the whole thing this branch deletes. Worth
knowing it exists before someone debugs a null offer on a seed that took three minutes to warm.

## 6. What this branch did NOT do

- **`map2d` still builds its own RoadSystem.** In story mode that is a *third* network — the map
  streams to `REGION_RADIUS_M + 400` around its pan cursor via `setRadiusCap`. It shares the play
  route cache, so it is routing-cheap, but it is still a second registered network of the same
  region. Collapsing it onto the play instance is the same argument as this branch and was left
  alone as out of scope. Candidate for a ticket if map open time ever matters.
- **Free-roam missions.** They cannot come back for free: the play band is 320 m and cannot be
  frozen, because the player drives arbitrarily far. The owner's ruling is to blueprint a new wide
  band from the story-mode code if it is ever wanted; the note at the top of `src/mission.js` says
  so at the point someone would need to read it.

## 7. Verification

- **Owner, live, in the worktree:** free roam and story mode both load and stream normally, and
  "story quick job loads instantly" — the reported behaviour is gone.
- `npm test` (affected): **11/11 green** — `mission-network`, `story-poi`, `world-determinism`,
  `paper-route`, `paper-tour`, `paper-reroute`, `par-oracle`, `gps-route`, `camp-zones`,
  `camp-view`, `prop-shadow-alignment`.
- `npm run build`: clean.
- `node test/smoke-region-plan.mjs`: the numbers in §4. **This is a rainy-day script, not a
  registered gate** — it is the only thing that exercises missions in the configuration they now
  actually run in (the full region band), which no gate covers: `mission-network` streams a 1400 m
  band for speed and says so. Drop it if it is not wanted; nothing depends on it.
- `npm run test:all`: **67/68 green, one failure — `junction-stitch`, the documented standing red**
  ("RED until the departure pass lands", BUG-56, written into its `test/gates.mjs` description).
  Nothing else fails. Worth noting for anyone working from the older lists: `mission-network`,
  `paper-tour` and `pond-route-around` were standing reds as of the QUAL-27 handoff (2026-09-05)
  and are **green now** — that list shrank to one. Wall 401 s, gate-cpu 1754 s, pool 8;
  `play-area` (358 s) is the long pole.

Test-side edits, for the record: `makePlanner` removed from the five `MissionSystem` constructions
in `test/mission-network.mjs` and `test/story-poi.mjs`; `MISSION_PLAN_RADIUS` replaced by a local
`PLAN_R = 1400` in `mission-network` with a note on why the gate's claims are radius-independent;
`ms.invalidatePlan()` → `ms.clearOffers()` in `story-poi` §7 and the matching phrase in
`test/gates.mjs`'s description.

## 8. Merge procedure

```bash
git -C /Users/ledogen/CodeShit/CarGame checkout main
git -C /Users/ledogen/CodeShit/CarGame merge --no-ff feature/planner
npm run test:all          # compare against main's standing reds, nothing new
bash ~/.claude/skills/worktree/scripts/wt.sh clean planner
bash ~/.claude/skills/window-title/scripts/title.sh --clear
```

Note `assets/models/src/ranger.py` is modified and uncommitted in the main working directory
(unrelated to this branch, present before it was cut). It does not conflict — no file this branch
touches overlaps it — but `git checkout main` will carry it along as it stands.

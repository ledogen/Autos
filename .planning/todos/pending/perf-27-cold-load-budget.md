---
id: PERF-27
type: perf
status: open
opened: 2026-07-26
severity: major
source: user framing during FEAT-43 story-mode work (2026-07-26)
relates: [FEAT-43 (story mode — THE path this must be fast for), PERF-19/PERF-20 (Vite bundling,
the last cold-load pass), QUAL-14 (route cache), PERF-22 (terrain LOD)]
note: "Framing ticket, not a designed fix yet. Its job is to stop the bundled route cache from
being mistaken for a shipping load-time optimization — it is a DEV convenience and is currently
making the cold load WORSE for real players."
---

> **2026-09-22 — THE FRAME FOR EVERYTHING BELOW: every load is a cold generation.** The typical
> session is Minecraft-style: a fresh random seed and a world nobody has built before; a custom seed
> or a resumed save regenerates from nothing too (owner; recorded in DESIGN.md, "Every world is
> generated cold"). Saving generation data to speed up a resume was declined — the save stays
> kilobytes. So **only pure generation wins count**. That rules out the per-region / per-seed route
> cache suggested further down ("baking a cache per region"); caches are fine only inside ONE load.
>
> **Measure on a seed the session has not built.** A blank story seed rolls `Math.random()`, so a
> real entry ALWAYS reseeds; `story-coldload.mjs --seed=6` (the harness boots on 6, `--bootseed`) skips that and is the
> wrong path. Use `--seed=811` or any other.
>
> **Correction to the 2026-09-07 "two thirds is terrain" reading below.** Per-phase bucket diffs
> put terrain's main-thread work at ~3% of cold→driving at 1× and ~9% at 4×; the `ring` and refill
> windows were mostly prop scatter and physics catch-up. The cost is road generation.
>
> **Landed on `feature/terrain-coldload` (A/B vs main, seed 811, loaded box): 1× 33.2 → 25.3 s,
> 4× 50.4 → 36.3 s cold→driving.** All pure generation:
> - The network worker discarded its warm RoadSystem on EVERY build: its reuse key hashed
>   RANGER_PARAMS' per-frame physics scratch (`_tireFz`, …). One load builds the same new seed 3–4
>   times (spawn tiers, then the 2800 m region); each now reuses the last one's routes.
> - FEAT-77 clearance pass-1 routes (~6 s of the region pre-warm) ran inline on the network worker's
>   one thread; now dispatched to the route pool as a first wave (`_warmPass1`).
> - `_nearestOnPolyXZ` squared-distance pre-tests (self time 2.2 → 1.1 s).
> - Terrain: story entry re-carves in place instead of disposing the ring twice; the loading screen
>   holds until the ring is carved; a held sim no longer strands the render pose (and the terrain
>   ring streaming around it) at the OLD spawn for the whole load.
>
> **Remaining, largest first (1×, seed 811, on the branch):** see the 2026-09-22 section at the end.

> **2026-09-07 — RE-BASELINED after the merge train** (FEAT-76 wye→T, QUAL-30's 1 415-line deletion,
> FEAT-41 menus, BUG-41 par, red-gates). Owner asked for it because worldgen timing moved a lot.
> `test/story-coldload.mjs` against the BUILT app on `vite preview`, fresh Chrome profile per run.
>
> | | boot (`ready`) | ring | region routed (`live`) | **cold → DRIVING** |
> |---|---|---|---|---|
> | seed 6, cpu 1× | 2.71 s | 4.11 s | 16.13 s | **16.82 s** |
> | seed 6, cpu 4× | 5.05 s | 14.04 s | 27.93 s | **33.44 s** |
> | seed 811 (uncached region), cpu 4× | 4.91 s | 13.17 s | 27.73 s | **32.27 s** |
>
> **Against the last recorded figures — 14.7 s baked / 42.8 s unbaked at 4× — there is now ONE
> column, and it is 33.4 s.** The bake subsystem was deleted 2026-08-19, so the 14.7 s never applied
> to anyone but seed 6 on the owner's machine, and this ticket's central complaint goes with it: the
> 8.31 MB gzip route-cache asset that "every byte of is downloaded by everyone on every cold load"
> no longer exists. The honest player-facing number improved **42.8 s → 33.4 s (−22%)**, and it is
> now the same for every seed — seed 811, which used to be the uncached worst case, is 32.3 s,
> INDISTINGUISHABLE from the formerly-baked seed 6. That is the shape this ticket wanted.
>
> Where the remaining 33 s sits at 4×: boot 5 s, then 9 s filling the free-roam chunk ring before
> story entry is even called, then 14 s routing the region, then 5 s refilling terrain. **Two thirds
> of it is terrain, not routing** — the reverse of the assumption the 2026-08-27 table above was
> collected under, and it is the load-bearing change for anyone picking up this ticket. Routing got
> cheap: the same seed-6 network that took 41 s to build headlessly before FEAT-76 takes 5 s now
> (the band ladder's dry profile solves are gone), and `bench-worldgen` puts a cold r1400 road
> network at 1.4–2.0 s per seed.
>
> Bundle for the record: `index-*.js` 1 416 kB / 436 kB gzip, `box3d.wasm` 838 kB / 319 kB gzip.
>
> **2026-08-27 — cold ROUTING measured on `feature/corridor-router`**, since this ticket's job is to
> hold the numbers. Single-threaded, headless, road network only (no terrain, mesh or POIs):
>
> | | edges | road km | cold build |
> |---|---|---|---|
> | story region (r 2800 m, `REGION_WARM_RADIUS_M`) | ~142 | ~110 km | **11–25 s, avg 17 s** |
> | 12 km square (r 8485 m) | ~1155 | ~880 km | **100–126 s, avg 114 s** |
>
> **The cost is linear in EDGE COUNT, not radius** — ~70–85 ms per routed centreline at both scales.
> The 12 km area is 6.8× the work because it has 6.8× the edges. So the lever is site density, not
> the radius knob.
>
> The game runs a 2–4 worker pool (`hardwareConcurrency − 2`, capped at 4, and measured SLOWER at 8
> on the M4), so wall-clock in-game is lower than these — but not by 4×, because assembly and slicing
> stay on the main thread. Not measured in-game.
>
> Bears on this ticket's own framing: a pre-validated seed list would collapse the cold cost to zero
> for a new game, and `test/play-area.mjs` is already the tool that would validate the candidates.


# PERF-27: Cold load time on older machines — story mode is the path that has to be fast

## Why this exists

Owner framing, 2026-07-26, recorded because it re-scopes work that already looks finished:

1. **Story mode is the intended audience's entry point.** Free roam is the sandbox we develop in;
   story mode (FEAT-43) is how people will actually play the game. Load-time work should be
   budgeted against *cold boot → driving in story mode on an older machine*, not against the
   free-roam numbers we happen to measure while developing.
2. **`data/route-cache-default.json.gz` is a DEV convenience, not a shipping optimization.** It
   exists so the owner's dev/playtest cycles on seed 6 are instant. It is emphatically *not* the
   answer to cold load for players: it only ever covered seed 6 (a test seed; there is no default seed), and every byte of it is
   downloaded by everyone on every cold load whether or not they enter story mode.

Point 2 currently bites. FEAT-43 re-baked the cache from 1700 m to 3100 m so story entry on seed 6
stops routing live (104 of 216 in-band edges were uncached — see the FEAT-43 ticket). That took the
asset from **3.82 MB → 8.31 MB gzipped**, which is a real, unconditional cold-load regression for
players, taken deliberately to buy a fast dev loop. That trade is fine *today* and wrong to ship.

## DONE — item 1: the cache is off the boot critical path (2026-07-26)

A second cost surfaced while measuring, and it is the one that matters for older machines: the
download is only about a third of the story. The combined 8.31 MB gzip was **24.85 MB of JSON**, and
inflate + `JSON.parse` run on the **main thread** — ~100 ms here (38 ms gunzip + 63 ms parse), figure
several hundred on an old laptop, plus a ~25 MB allocation spike. Unlike the download, *that is paid
on every load whether or not the file is HTTP-cached*. Bandwidth alone was never the argument.

So the asset is now **split by when it is needed**, per the owner's call (wait for the free-roam
cache at boot, lazily pull the story region afterwards so it is ready by the time they click):

| asset | covers | when |
|---|---|---|
| `data/route-cache-default.json.gz` — BASE | spawn band + `MISSION_PLAN_RADIUS` → 1700 m | **awaited at boot** (unchanged QUAL-14 behaviour) |
| `data/route-cache-region.json.gz` — REGION delta | + out to 3100 m for the story warm | **background** after `__rsReady` (idle callback), **awaited by story entry** |

REGION is a true delta — disjoint from BASE, gated — so nothing is downloaded twice. Boot is back to
**3.64 MB**, i.e. the pre-FEAT-43 size, and the region's 4.67 MB never blocks time-to-drive.

Verified in-browser (headless Chrome/CDP against the built `dist/`):
- `__rsReady` at **1403 ms**; BASE requested before ready, REGION **not** requested before ready,
  REGION requested after idle. 0 page exceptions.
- Story entry reaches `live` in **1594 ms**, `isRoutingFrozen() === true`, region centred at r=2500,
  Quick Job button up, loading overlay down.
- Gated by `route-bundle-parity`, now 5 checks: both sigs, the base/region **disjointness**, live
  router parity, and **REGION-COVERAGE** — 0 of 216 in-band edges uncached at the 2800 m warm. That
  last one directly pins the original bug, which no existing check could see (nothing was *stale*,
  the bake just stopped short).

**Remaining player-side cost, deliberately left:** the background prefetch still runs for everyone,
so a player who never opens story mode still downloads (and parses) the region delta, just off the
critical path. That is the owner's current preference — story mode is where the dev loop lives and
it must be instant on click. Flipping it to story-entry-only is a one-line change: drop the
`requestIdleCallback` kick in main.js and let `_ensureRegionRoutes()` do the fetch on demand.

## DONE — item 2: the baseline exists (2026-07-27)

Tool: **`test/story-coldload.mjs`** (new, not a gate). Drives a cold Chrome (throwaway profile ⇒ HTTP cache
cold every run) against the **built** app via `vite preview`, and — unlike `test/hitch-report.mjs`,
which throttles *after* settling because it asks about steady-state play — applies the CPU throttle
**before navigation**, because here the load *is* the measurement. `--cpu=4` stands in for an older
machine (the host is an M4; this is a simulation, not a real low-end box — treat the ratios as
sound and the absolute numbers as optimistic).

Four phases, all from `Page.navigate`: `ready` (`__rsReady`, BASE cache awaited) → `ring` (chunk
ring full) → `live` (`__story()._phase === 'live'`, region routed + frozen) → **`drivable`** (ring
refilled after entry). That last phase was added when the first run showed `chunks: 0` at `live`:
**entry reseats/reseeds, which drops the chunk ring**, so "routing frozen" is not yet "can drive".
Time-to-drive is `drivable`, not `live` — 0.4–3.0 s later depending on throttle.

| run | cpu | story seed | ready | ring | live | **drivable** |
|---|---|---|---|---|---|---|
| cold (first launch of the day) | 1× | 6 (baked) | 1.42 s | 2.88 s | 3.71 s | — |
| | 1× | 6 (baked) | 1.27 s | 2.61 s | 3.57 s | **4.01 s** |
| | 4× | 6 (baked) | 4.31 s | 10.26 s | 12.47 s | **14.67 s** |
| | 1× | 811 (uncached) | 1.26 s | 2.74 s | 13.92 s | **14.70 s** |
| | 4× | 811 (uncached) | 4.32 s | 10.09 s | 39.79 s | **42.78 s** |

`?prof=1` is on in all runs (needed for `window.__story`). Raw JSON went to `perf-runs/`, which is
gitignored per-machine harness scratch — the numbers below are the record; re-run the tool to
regenerate them. The three drivers live in `test/` (tracked, alongside `hitch-report.mjs`).

**What the numbers say.**

1. **The baked seed is fine even at 4×**: 14.7 s cold → driving, of which story entry is only
   4.4 s. The BASE/REGION split is doing its job — boot is 4.3 s and the region delta lands during
   the ring fill.
2. **The custom seed is the problem.** Entry goes 4.4 s → 32.6 s at 4×; boot is unchanged
   (1.3 / 4.3 s) since BASE still hits for the free-roam spawn. *This first read blamed the region
   warm — item 3 measured it and that was wrong: the warm is 5.5 s of it, the world rebuild is the
   rest.*
3. **The doomed cache fetch is NOT a meaningful cost — measured, not assumed.** A seed other than 6
   re-fetches and parses both assets only to find `rec.sig` mismatched (the sig lives *inside* the
   file, so the loader must parse to know). That looked like a headline cost in the resource
   timings — the BASE re-fetch shows `duration` 20.2 s at 4× — but that duration is main-thread
   starvation from the concurrent routing, not the fetch. Timed in isolation
   (`test/route-cache-miss-cost.mjs`): **90 ms at 1×, 206 ms at 4×** for both assets together.
   A sig sidecar/manifest would be tidy, but it buys ~0.2 s of a 32 s problem. Not the lever.
4. Caveat on inflate: `vite preview` sets `content-encoding: gzip`, so Chrome inflates transparently
   and the app's own `DecompressionStream` branch never runs. **GitHub Pages serves the `.gz` raw**,
   so the deployed app pays an inflate these runs do not measure. Parse (the portable, unavoidably
   main-thread half) is 13/16 ms at 1×, 51/64 ms at 4×.

## Item 3 — attributed 2026-07-27: it is the RESEED, not the region warm

The 32.6 s looked like region routing. It is not. Two experiments, both at 4× on unbaked seed 811:

**A. Halve the region.** `REGION_RADIUS_M` 2500 → 1250 (warm 2800 → 1550), rebuilt, re-measured:
entry **32.63 s → 30.10 s**. Halving the play area bought 2.5 s. Whatever dominates entry does not
scale with the region.

**B. Boot already on the seed, then enter it.** `?seed=811` at boot, then `enter('811')` — the same
seed, so entry skips the world rebuild entirely and `enter → live` is the region warm ALONE:

| | boot (ready) | ring | entry → live | drivable | **total** |
|---|---|---|---|---|---|
| boot 6 → enter 6 (baked) | 4.31 s | 10.26 s | 2.15 s | 14.67 s | **14.67 s** |
| boot 6 → enter 811 (reseed) | 4.32 s | 10.09 s | **29.64 s** | 42.78 s | **42.78 s** |
| boot 811 → enter 811 (no reseed) | 7.18 s | 15.45 s | **5.49 s** | 23.38 s | **23.38 s** |

So on an unbaked seed the **region warm is ~5.5 s** and the **world rebuild is ~25 s** — the reseed
tears down and regenerates terrain + graph + spawn-band routes while the loading screen shows, and
that is the cost QUAL-14's cache hides for seed 6. Booting *into* the seed pays it once, inside a
boot the player already expects: **42.78 s → 23.38 s for the same destination.**

The node-side radius curve (`test/region-radius-curve.mjs`, seed 811: 209 in-band edges,
41.1 s single-threaded to 2800 m, outer rings up to 338 ms/edge vs ~150 inner) is still the right
tool for costing a radius change — it just is not the binding constraint today. Keep it for when
the region warm actually matters (a slower machine, or after the rebuild is fixed).

### What follows from this

- **The lever is the double world build, not the radius.** A player who picks a story seed today
  builds the world twice: once at boot in free roam, once on entry. Selecting mode + seed *before*
  the sim initialises removes the second build — which is exactly what **FEAT-41's boot-to-menu**
  flow implies. Worth deciding there rather than bolting a special case onto story entry.
- **Do not shrink `REGION_RADIUS_M` for load reasons.** It costs play area and buys ~2.5 s. If the
  radius changes, let it be a design call about the play area.
- ~~If shipped story mode ends up with a fixed set of regions (FEAT-28 macro tiles), baking a cache
  per region removes the region warm entirely — but that is ~4 MB per region, and the warm is only
  5.5 s, so it is a poor trade until the rebuild cost is gone.~~ **RULED OUT 2026-09-22** — every
  world is generated cold; no generation data ships or saves (see the frame at the top).
- Terrain-side cost (PERF-22) is not implicated: the post-entry ring refill is 0.4 s at 1× / 2.4 s
  at 4×.

### Not measured / left open

- All numbers are M4 + CDP throttle. `--cpu=4` does appear to throttle the road workers (browser
  entry scales with it against the node single-thread baseline), but this is a simulation of an
  older machine, not one.

## Item 4 — the reseed broken down, 2026-07-28: it is `road.streamNetwork`, not terrain

**First, a correction to item 3's "left open" note.** `--mode=reseed` was not failing because the
chunk count behaves unexpectedly. `changeSeed` is a **debug.js callback** (`main.js` — the object
passed to `initDebug`), and was never a member of the `LEVERS` map, so `__lever('changeSeed', …)`
returned `false` and reseeded **nothing**. The old harness line wrapped it as
`(window.__lever(…), true)`, which swallowed the `false` — so the teardown predicate was waiting on
a world rebuild that had never been asked for. The chunk-dip predicate was *also* unreachable (see
below), but it never got the chance to be wrong.

Fixed, all in the `?prof=1` block or the harness:
- `changeSeed` added to `LEVERS` — it calls the same `applyWorldSeed()` the debug seed field and
  Story Mode's seed prompt call, so the harness measures the shipping path.
- `__lever` now passes a **promise** return through, so an async lever is awaitable. `changeSeed`
  returns the FEAT-43 awaitable Path-B rebuild promise, which is the exact completion signal —
  no predicate-guessing. (The chunk-dip probe could never have worked: `rebuildAllChunksFromWorker`
  is the LAST line of `_rebuildFullNow`, so the ring only drops after the cost is already paid.)
- The frame-180 `perfReset()` in the game loop is now suppressed under `?prof=1`. On a throttled
  load frame 180 lands *mid-rebuild* and was wiping the spans; with a harness attached, it owns the
  buckets.
- `__world()` reports `seed` (the harness already read `w.seed` and got `undefined`).

**Method.** `_rebuildFullNow` records a `perfAdd` wall span per step, and the harness diffs the
whole bucket table across the rebuild window — so the steps say *where the wall went* and the diff
says *what the main thread was doing while it went there*.

**Result — the ~25 s is main-thread road streaming.** Reseed to unbaked seed 811, 4×:

| bucket | ms | share of the 35.2 s rebuild |
|---|---|---|
| `frame.road.update` | 23 025 | 65% |
| ↳ `road.streamNetwork` | 23 017 | (all of it) |
| `frame.props.update` | 6 766 | 19% |
| `frame.physics` | 1 378 | 4% |
| `frame.road.warmRoutes` | 740 | 2% |
| `frame.terrain.update` | 368 | 1% |
| main thread busy | 33 300 | **94% of wall** |

So of the three candidates the ticket named: **terrain regen is ~0** on the main thread (it is on the
Worker; the ring refill was already measured at 0.4–2.4 s), the **route warm is 0.7 s**, and the cost
is the synchronous **`RoadSystem._streamNetwork`** for the new seed, plus a secondary 6.8 s of prop
scatter rebuild. Unthrottled it is the same shape — 6.9 s `road.streamNetwork` + 2.7 s props of
11.3 s busy — but only 66% of wall, the remainder being worker routing awaited inside `reseat`.

**The 25 s "cache fetch" is a mirage, and this is the second time it has fooled a reading of these
numbers.** The step spans blamed `routeImport` (25.2 s of 33.6 s), and drilling in blamed
`fetch()` (24.1 s of that). But the same 3.6 MB asset takes **41 ms** at boot from the same server
in the same run. The fetch is not slow — its promise cannot *resolve* on a main thread that is 94%
busy streaming road. Item 3 said the resource-timing duration was starvation rather than fetch cost;
that was right, and this is the mechanism. Do not re-litigate it a third time: **any await that
spans the rebuild will report ~25 s and none of them are the cause.**

### What follows

- The optimisation target, if the double build is ever not removable, is `_streamNetwork` on a cold
  seed — not the route cache, not the region radius, not terrain. Note this is the same main-thread
  streaming work PERF-26 is looking at, arriving all at once instead of spread over driving.
- The double-build lever (below) still dominates: removing the second build removes 100% of this,
  which is why it stays the recommendation rather than optimising `_streamNetwork`.

### Measurement caveat for these runs

The box was ~1.5× slower tonight than when item 2's table was recorded (`mediaanalysisd` +
`mds_stores` reindexing throughout, load ~3.7). A control re-run of the item-2 story path at 4×/811
gave **64.0 s** against the recorded **42.78 s**. So **the absolute numbers in this section are not
comparable to the item-2 table** — the shares and the ordering are what this section asserts, and
those are internal to each run. Re-run the control on a quiet box before treating any absolute here
as a baseline.

## Acceptance

- ~~The bundled route cache no longer costs a cold load anything for a player who does not use it.~~
  **Partially done:** it no longer costs *time-to-drive* anything. Still downloaded in the
  background for everyone; see the note above for the one-line escalation.
- ~~A recorded cold-boot → driving-in-story-mode measurement on a low-end target exists, so future
  load work has a baseline that reflects the intended audience.~~ **DONE 2026-07-27** — table above,
  reproducible via `test/story-coldload.mjs`.
- ~~Story entry on an unbaked seed is not dominated by the region warm.~~ **Attributed 2026-07-27:**
  it never was — the region warm is 5.5 s; the world rebuild is ~25 s. See item 3.
- [ ] Remove the double world build for a player who picks a story seed (42.78 s → 23.38 s at 4×,
      measured). Belongs with FEAT-41's boot-to-menu flow — decide it there.
- ~~Break down the reseed's ~25 s (terrain regen vs graph vs spawn-band routing) before optimising
      it — the harness's `--mode=reseed` teardown predicate does not fire and needs fixing first.~~
      **DONE 2026-07-28** — `--mode=reseed` fixed (the lever did not exist; see item 4) and the
      answer is neither of the three as framed: 65% is main-thread `road.streamNetwork`, 19% prop
      scatter, terrain ~1%, route warm 2%.

## 2026-09-22 — where the remaining cold load sits (pure generation only)

Branch `feature/terrain-coldload`, seed 811, 1×, quiet-box run: **~16–20 s cold → driving**. Story
entry, from click to driving, splits as below. The sizes are MEASURED; the "worth" column is an ESTIMATE, and
each estimate is the thing to verify first.

| Where | Measured | Lever | Worth (est.) |
|---|---|---|---|
| Region build, network-worker pre-warm | 5.4–6.2 s | route waves wait on their slowest job (0.7–0.9 s outliers, some on E-cores): dispatch longest-first, and merge waves where the dependency allows | 1–2 s |
| Region build, serial plan layer | ~2.7 s pre-warm + ~2.0–2.5 s build | the pre-warm's wave 3 runs `_v2SettleDeletions`, then the build re-derives it after the rev bump — carry it instead; the other plan passes are one thread | 1–2 s |
| Spawn resolve on the new seed | ~2 s (672 m + 228 m builds) | routes now carry into the region build, so the residue is the plan layer run twice on a small window | ≤1 s |
| Go-live POI placement | 0.9 s + houses 0.3 s, main thread | dominated by cold water queries (`streamsInBBox`, `pondsInBBox`) | ~0.5–1 s |
| Entry pump latency | ~0.5 s | `SETTLE_MIN_MS` 400 ms before the region build is issued; the done flag is polled every 250 ms | ~0.4 s |
| **Build the story world behind the menu** | the whole ~12 s entry | pre-roll the blank-seed `Math.random()` at boot and generate THAT world (region included) while the player is in the menu. Still pure generation — nothing saved. Design call: free roam's boot world would then be random too, or be built second. *(Owner 11-06: "not now" for this lever; the boot world IS random now, so a world nobody picked is never the same one twice.)* | hides up to all of it |

The last row is the only one that changes the order of magnitude; the rest are each a second or so.

## 2026-11-06 — re-measured on main `0d7c84c6` (Spare): preliminary, LOADED box (load 5–21)

`test/story-coldload.mjs` now prints the click → live **split**: settle = the reseed (spawn resolve + the new
free-roam world), region warm = the worker's region build plus pumps, seed check, and go-live (POI placement). It
times story's own deps from the page. Built bundle (`vite preview`). Random seeds from BUG-105's census list.

| seed | cpu | boot (ready) | settle | region warm | go-live | **entry** | **total** |
|---|---|---|---|---|---|---|---|
| 3997014678 | 1× | 7.8 s | 10.8 s | 20.5 s | 0.65 s | 33.9 s | 45.3 s |
| 2623851183 | 1× | 8.3 s | 8.6 s | 19.4 s | 0.64 s | 30.7 s | 42.4 s |
| 744309545 | 1× | 8.5 s | 5.7 s | 18.4 s | 0.79 s | 27.2 s | 39.3 s |
| 3997014678 | 4× | 17.6 s | 12.1 s | 24.0 s | 2.5 s | 44.6 s | 72.1 s |
| 2623851183 | 4× | 13.9 s | 11.6 s | 24.6 s | 2.3 s | 44.4 s | 70.3 s |
| 744309545 | 4× | 14.3 s | 8.4 s | 27.2 s | 2.9 s | 48.0 s | 71.2 s |

**Read with care; this box was loaded throughout.** Even so:
- **Story entry on a RANDOM seed at cpu ×4 is ~44–48 s here.** PERF-31's and BUG-105's "9 s" was seed 6, the boot
  seed: no reseed, warm caches. That is not the path a player takes.
- **The settle is 5.6–10.8 s at 1× (09-22: ~2 s).** It is ~97 % `reseed.reseat`: the free-roam spawn resolve builds
  networks around candidates, then the region warm builds the whole region over the same ground.
- **Go-live (POI placement) is 0.6–0.8 s at 1×.** It meets the 09-22 row's target (0.9 + 0.3 s) and can be closed;
  2.3–2.9 s at 4×.
- **The region warm is the biggest row.** Region bench (`wip/perf-31/region-bench.mjs`, seed 3997014678, loaded):
  old main `871d7750` thread 7.0 s + pool 18.1 s / 356 jobs; now thread 10.2 s + pool 28.8 s / 358 jobs. Same network
  hash. BUG-105's pass-1 forecast lives in that warm thread.

**Owed:** the same sweep, plus the region bench A/B, in a quiet window. Then the levers, and the "behind the menu"
numbers.

## 2026-11-06 — QUIET-WINDOW numbers (orchestrator's window, load 2.7–5.2) — these supersede the loaded table above

**Current main `48b6c989` (= `0d7c84c6` + docs), built bundle, three random seeds** (3997014678, 2623851183,
744309545):

| | 1× | cpu ×4 |
|---|---|---|
| free-roam boot: ready / ring | 3.4–3.5 s / 5.0–5.2 s | 5.4–6.4 s (ready) |
| settle (reseed: spawn resolve + world) | 2.4–3.2 s | 4.0–4.9 s |
| region warm (worker region build + pumps) | 6.9–7.4 s | 7.4–8.8 s |
| go-live (POI placement, board, camps) | 0.31 s | 1.2–1.3 s |
| **story entry (click → driving)** | **11.2–11.5 s** | **17.4–18.2 s** |
| **cold → driving** | **16.4–16.5 s** | **~28–29 s** |

The loaded table above (44–48 s at 4×) was the box, not the code. Random-seed entry at cpu ×4 is ~17.7 s, under the
owner's 30 s bar.

**BUG-105's cost on a player's path** (A/B the orchestrator asked for, cpu ×4, alternating per seed):
- story entry `8739d3cb` → `14c6feb6`: 17.02 → 17.71 s (+0.70 s, +4 %). Main is 17.73 s.
- Region bench (1× headless, one region): thread 2.87 → 3.04 s (+6 %), pool CPU unchanged, network hash identical.
- Well inside the orchestrator's 2 s line, so BUG-105 stays.

**The rows, against the 09-22 table:**

| 09-22 row | then | now (1×, quiet) | status |
|---|---|---|---|
| Go-live POI placement | 0.9 + 0.3 s | 0.31 s | **CLOSED: under target** |
| Serial plan layer | ~2.7 s pre-warm + 2.0–2.5 s build | region bench thread ~3.0 s (warm 2.4 + build 0.6) | **CLOSED: met (PERF-31)** |
| Worker pre-warm, route waves | 5.4–6.2 s | region warm wall 6.9–7.4 s, of which thread ~3 s; pool CPU ~8.5 s / 356 jobs across the nested pool | open: the wave-stall lever (longest-first dispatch) is unmeasured |
| Spawn resolve | ~2 s | settle 2.4–3.2 s (97 % `reseed.reseat`) | open: ≤ 1 s by its own estimate |
| Entry pump latency | ~0.5 s | not separable from the region warm wall yet | open: measure (SETTLE_MIN_MS 400 ms + 250 ms poll) |
| **Build the story world behind the menu** | the whole ~12 s entry | **hides 11.2–11.5 s at 1×, ~17.7 s at cpu ×4** | **owner's call, made cheap below** |

**The "behind the menu" call: what it would cost the menu.** Frame times on the loading screen's own frame loop, while
the same work runs:
- 1×: median 60 fps, p95 17 ms, worst single hitch 0.3–0.6 s. The menu truck stays smooth with an occasional
  half-second stall.
- cpu ×4: median 60 fps, p95 33–50 ms, worst hitch 1.6–2.3 s, all in the settle. Visible once or twice on a slow
  machine.
- The design call stands as framed: free roam's boot world becomes random too, or is built second. The orchestrator
  takes it to the owner.

**Tools:** `test/story-coldload.mjs` (split + frame times), `wip/perf-27/{sweep.sh, ab105.sh}`,
`wip/perf-31/region-bench.mjs`.

### The two open levers, scoped (2026-11-06)

**Route waves, longest-first dispatch: below the 1 s bar, NOT built.** `wip/perf-31/wavesim.mjs` records every
route job's time per wave in a region build, then simulates the pool (4 workers, pull dispatch) both ways: the order
the plan issues jobs (today), and longest-first with the TRUE times, which is the upper bound for any predictor.
- Seeds 3997014678 / 2623851183 / 744309545: FIFO 4.57 / 5.10 / 5.17 s vs longest-first 4.23 / 4.06 / 4.27 s, a
  gain of 0.34 / 1.04 / 0.90 s at best.
- The floor of each wave is its single longest route job (up to 2 s in the first wave), and no ordering beats it.
- The browser's cpu ×4 throttle barely slows the region warm (6.9–7.4 → 7.4–8.8 s), so the routing in the workers
  isn't the throttled part. The gain does not grow at 4×.
- A real predictor (edge length, corridor size) would get perhaps half: ~0.2–0.5 s.

**Settle: 2.4–3.2 s at 1×, 4.0–4.9 s at cpu ×4.**
- The throttle only slows main-thread work. Solving the 1× and 4× numbers gives ~0.6 s of main-thread work at 1×
  (~2.3 s at 4×), plus ~2.2 s waiting on the worker's spawn-network builds.
- A ≥ 1 s lever at 4× has to come out of that ~2.3 s main-thread share.
- `story-coldload.mjs --mode=reseed`, which should break it down, hung on current code at cpu ×4: its "route warm
  drained" end condition never fired in 600 s. The predicate needs fixing before the settle can be split.

**Where that leaves PERF-27:**
- Rows closed: POI placement, plan layer.
- Route waves: measured, < 1 s, not built.
- Spawn resolve / settle: the 4× main-thread share (~2.3 s) is the only candidate left; it needs the reseed harness
  fixed.
- Pump latency: unmeasured, ≤ ~0.5 s by construction (SETTLE_MIN_MS 400 ms + 250 ms poll).
- "Behind the menu": the owner's call, numbers above.

### Built: the dispatch warm primes pond discs only (`25f2d7fe`, NOT landed; parked 2026-11-06 for the owner's playtest)

**Reseed harness fixed first.** `story-coldload --mode=reseed`, `hitch-report` and `profile` all waited on
`__road().lastWarm`. Nothing has set `_lastWarmCenter` since PERF-30 (the network builds off-thread), so all three
hung. `__road()` now reports `netIdle` (the network client has nothing active and nothing queued), and the three
harnesses wait on it.

**The lever.**
- What the fixed reseed breakdown showed (cpu ×4, loaded box): the biggest main-thread bucket in the settle was
  `road.dispatch.warm`, 4.35 s. That is the network client's water warm before each build, over the whole disc box
  (~13–18 km across with its stream-length margin), and it traced every stream in that box.
- The worker routes on pond discs only. `wip/perf-27/waterwarm.mjs`, headless 1×: full warm 1.7 s (320 m window) and
  2.5–4.1 s (region), against 0.3–0.5 s and 0.6–1.1 s for the ponds alone.
- New `WaterSystem.warmPonds`: cell scans + rim casts over the box with the ponds' own reach margin. The client's
  hook uses it.
- Streams near the player stay warmed per frame (±768 m), which is the anti-hitch job.
- Cache priming only: the discs are byte-identical, and the world cannot change.

**Measured (loaded box, load ~11–13, so indicative only):** reseed at cpu ×4, seed 2623851183:
`road.dispatch.warm` 4.35 → 1.08 s, `reseed.reseat` 14.6 → 6.3 s, rebuild 15.2 → 6.8 s, entry 18.2 → 9.7 s.

**Gates:** affected 25/25 green.

**NEXT (to land):**
1. ~~`cdp-smoke` (main.js changed).~~ PASS 25/25 on the lane head `88b5dc3a` (2026-11-07, lever included).
2. ~~`fingerprint-world` vs main, as a formality.~~ Lane `926133ee` vs main `327fd0c9` (2026-11-07): only `tiles`
   differs, in the 5 bore windows (+17 / +18 / +5 / +5 / +5 meshes, exactly BUG-112's bore floors). Everything else
   is identical in all six windows (network, profiles, junctions, POIs, surface, carve, water, props), and seed 3 is
   identical outright. The lever changes nothing headless, as expected.
3. A quiet window: `wip/perf-27/sweep.sh` on random seeds, 1× and 4×, main vs `25f2d7fe`, plus the reseed mode.
4. Hash to the orchestrator.

**Still open after this:** the settle's other main-thread buckets at 4× (loaded): `frame.physics` ~1.4 s, props
~1.2 s, render ~1.0 s. Physics stepping behind a loading screen may be a lever; measure in the quiet window first.

### "Behind the menu" — PARKED (owner, 2026-11-06)

Owner, verbatim (perf27-menu, "not now"): "not now. but record the findings we could add this later."

The findings stand as recorded above, in "The 'behind the menu' call: what it would cost the menu":
- **What it hides:** the whole story entry, 11.2–11.5 s at 1× and ~17.7 s at cpu ×4 (quiet window).
- **What it costs the menu:** median 60 fps at both speeds. Worst hitch 0.3–0.6 s at 1× and 1.6–2.3 s at cpu ×4, all in
  the settle.
- **How:** pre-roll the blank-seed `Math.random()` at boot and generate that world, region included, while the player
  is in the menu. Still pure generation, nothing saved (cold-generation rule).
- **The design half** (free roam's boot world becomes random too, or is built second) went to Lane A with the
  free-roam random-seed work (orchestrator, 2026-11-06).

Nothing is built. If it comes back, re-time the menu hitch first: the settle's main-thread share is what stalls the
menu, and `25f2d7fe` (above) shrinks it.

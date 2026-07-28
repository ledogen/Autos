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

# PERF-27: Cold load time on older machines — story mode is the path that has to be fast

## Why this exists

Owner framing, 2026-07-26, recorded because it re-scopes work that already looks finished:

1. **Story mode is the intended audience's entry point.** Free roam is the sandbox we develop in;
   story mode (FEAT-43) is how people will actually play the game. Load-time work should be
   budgeted against *cold boot → driving in story mode on an older machine*, not against the
   free-roam numbers we happen to measure while developing.
2. **`data/route-cache-default.json.gz` is a DEV convenience, not a shipping optimization.** It
   exists so the owner's dev/playtest cycles on seed 6 are instant. It is emphatically *not* the
   answer to cold load for players: it only ever covers the default seed, and every byte of it is
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
3. **The doomed cache fetch is NOT a meaningful cost — measured, not assumed.** A non-default seed
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
- If shipped story mode ends up with a fixed set of regions (FEAT-28 macro tiles), baking a cache
  per region removes the region warm entirely — but that is ~4 MB per region, and the warm is only
  5.5 s, so it is a poor trade until the rebuild cost is gone.
- Terrain-side cost (PERF-22) is not implicated: the post-entry ring refill is 0.4 s at 1× / 2.4 s
  at 4×.

### Not measured / left open

- The reseed's own 25 s is not broken down (terrain regen vs graph vs spawn-band routing). A
  `--mode=reseed` path exists in the harness but its teardown predicate never fires — the chunk
  count does not dip the way the probe assumed, so that split is still unmeasured. Worth fixing
  before anyone optimises the rebuild.
- All numbers are M4 + CDP throttle. `--cpu=4` does appear to throttle the road workers (browser
  entry scales with it against the node single-thread baseline), but this is a simulation of an
  older machine, not one.

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
- [ ] Break down the reseed's ~25 s (terrain regen vs graph vs spawn-band routing) before optimising
      it — the harness's `--mode=reseed` teardown predicate does not fire and needs fixing first.

---
id: PERF-26
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

# PERF-26: Cold load time on older machines — story mode is the path that has to be fast

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

## Still open — item 2: measure the real thing

- Cold boot → driving, in *story mode*, on a low-end machine, with the cache absent (i.e. what a
  player on any non-default seed already experiences today). `?prof=1` + `perf-runs/boot-diag.mjs`
  measure free-roam boot; story entry adds the region warm on top and that total is the number.
- Everything else — how much of the region warm can move off the critical path, whether the region
  radius is right for a *cold* entry, terrain-side cost (PERF-22) — follows from that measurement
  rather than from guesses here.

## Acceptance

- ~~The bundled route cache no longer costs a cold load anything for a player who does not use it.~~
  **Partially done:** it no longer costs *time-to-drive* anything. Still downloaded in the
  background for everyone; see the note above for the one-line escalation.
- A recorded cold-boot → driving-in-story-mode measurement on a low-end target exists, so future
  load work has a baseline that reflects the intended audience.

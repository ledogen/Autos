---
id: PERF-28
type: perf
status: open
severity: major
opened: 2026-08-24
source: owner observation (2026-08-24) — "occasionally a .1-.2ms frame loss event" while
  free-camming (most noticeable) and driving (less noticeable); reading the magnitude as
  0.1–0.2 s stalls (a 6–12 frame loss at 60 fps — a 0.2 ms event would be invisible)
relates: PERF-26 (hitch-report attribution harness + warmscan), PERF-08 (?prof/?hitch
  instrumentation), BUG-55 (delete-rung cost — the top suspect), PERF-19 item 5 (terrain
  main-thread stages, deferred)
---

# PERF-28: diagnose the occasional 0.1–0.2 s frame-loss events (freecam ≫ driving)

Owner report: intermittent frame-loss events, most noticeable in free-cam, less while driving.
Unknown whether terrain or router. Diagnose FIRST, then fix the top-ranked cause — no smoothing
work before the attribution table exists.

## Hypothesis going in (to be confirmed, not assumed)

Free-cam crosses macro-cell window thresholds much faster than driving, and the frequency
ordering (freecam ≫ driving) matches main-thread work that fires per stream-window rebuild:

1. **Top suspect — the BUG-55 registration-side scans**: the pair census + the delete rung's
   `_v2ConflictPairs` enumeration measured **+270–360 ms per origin build (~7 %)** headless,
   and both run on the main thread at window rebuild. The consolidation lever (census and
   delete rung each scan per-edge today — fold into one pass) is already booked in the BUG-55
   ticket. Nest windows additionally build the lazy deep box (measured ~noise, but it is on
   the same thread).
2. Terrain chunk main-thread stages (`_buildCarveTable`, normals, vertex colors — the
   PERF-19-deferred "move to the Worker" items).
3. Degree pass / Urquhart rebuild (PERF-26 memoized the hot path; a miss still pays 30–91 ms
   at 4×).

## Method

`test/hitch-report.mjs` is built for exactly this — CDP-driven, per-frame subsystem
attribution, lift table vs quiet-frame control, `--cpu=N` throttling for stable ranking:

```
node test/hitch-report.mjs --scenario=stream --cpu=4 --duration=60 --seed=6 --out=perf-runs/perf28-stream.json
node test/hitch-report.mjs --scenario=drive  --cpu=4 --duration=45 --seed=6 --out=perf-runs/perf28-drive.json
```

(run against the corridor-router worktree server — pass its port; nothing needed from the
owner, the ?hitch instrumentation self-attributes). A/B any fix with the same two commands.

## Acceptance

- The attribution table names the subsystem(s) carrying the events, recorded in this ticket
  (before/after).
- After the fix: no streaming tag with a lift that implies a >50 ms frame at --cpu=4 in either
  scenario, and the owner no longer sees the events in free-cam at native speed.
- No behavioural change to the network: worldgen gates byte-green (`npm test` affected set;
  invariance + restream in particular if the fix stages or reorders window work).

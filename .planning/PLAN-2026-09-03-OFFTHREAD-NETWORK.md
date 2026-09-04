# PLAN 2026-09-03 — the merge train, then the network worker

Owner-ratified 2026-09-03: merge the finished worktrees into main FIRST, then move the whole
road-network build (routing + the BUG-56 plan layer) onto a Web Worker so streaming never
freezes the frame. Cold spawn keeps the loading screen. The plan-layer CPU cost (~3× vs
v2-at-birth) is explicitly OUT of scope here — it is PERF-31, run after this lands so
regressions attribute cleanly.

Tickets: **INFRA-06** (merge train) → **PERF-30** (network worker) → **PERF-31** (plan-layer
CPU, banked). PERF-30 does not start until INFRA-06 is closed and `npm run test:all` is green
on main.

## Execution model (binding)

- **Serial on shared code.** One executor at a time touches `src/` — the standing owner rule
  (parallel agents on one worktree corrupted work before). Parallel subagents are fine for
  READ-ONLY work: surveying diffs, running gate batteries, profiling.
- Subagents launch with **model: opus** (standing owner rule).
- Verify cadence: full `npm run test:all` after each merge in the train, and after each PERF-30
  phase. In-game verify on :8000 (main) once the train lands — the owner drives, we screenshot.

## Phase 0 — INFRA-06: the merge train (one session)

Verified state 2026-09-03 (relative to LOCAL main `406c2b1`):

| branch | unique commits | worktree | verdict (owner) |
|---|---|---|---|
| `feature/corridor-router` | 70 | CarGame-corridor-router :3343 | **merge** — v2 router + BUG-56 + R1–R8, gates green |
| `feature/ignition` | 7 | CarGame-ignition :3965 | **merge** — FEAT-33 done, handoff written |
| `feature/damage` | 40 | CarGame-damage | **merge** — SM-3 v1, handoff written |
| `feature/par-reanchor` | 0 | — | already merged (`5c7d648` is an ancestor of main) — nothing to do |
| `feature/out-of-round` | 4 | CarGame-out-of-round | **dies** — the liked pieces are in the damage tree |
| `feature/seed20-road` | 2 (32 behind) | CarGame-seed20-road | **worktree dies, branch kept** as v1-router reference; its BUG-51 grade work is superseded by BUG-56 C |

Order: **corridor-router → ignition → damage**, full suite between each. Rationale: corridor is
the biggest and rewrites `src/road.js`; merging it first means ignition (no road.js) and damage
(ONE road.js commit — `4e8ce50`, tire envelope at road edges) resolve against the final road.js,
each a bounded conflict instead of corridor's 70 commits resolving against theirs.

Known conflict surface (measured with `git diff --name-only main...<branch>`):
- `data/ranger.js` + `src/debug.js` + `src/main.js` — touched by all three; edits are additive
  (params + sliders + wiring). Resolution is keep-both, but LOOK at each hunk.
- `src/road.js` — corridor rewrites it; damage's `4e8ce50` re-applies on top.
- **Each branch carries its own merge handoff — read it before its merge:**
  `CarGame-ignition/.planning/handoffs/HANDOFF-2026-08-23-ignition-merge.md` and
  `CarGame-damage/.planning/handoffs/HANDOFF-2026-08-23-damage-merge.md`.

Close-out steps, in order:
1. Merge the three branches as above (in the MAIN worktree; commit per merge).
2. **Re-bake the route caches ONCE at the end**: `test/bake-route-bundle.mjs` (on main; the
   corridor branch never had it). Both `data/route-cache-default.json.gz` and
   `-region.json.gz` are invalid after the corridor merge — R4 pin-fingerprinting changed every
   cache key, so the old bundles are silently useless (not harmful: `importRouteCache` fills
   missing keys only). Verify the bake round-trips the new `#p…` keys.
3. `npm run test:all` green (modulo the booked reds recorded in HANDOFF-2026-09-01-R8-BUILD.md).
4. Retire: `git worktree remove` for out-of-round + seed20-road (+ corridor/ignition/damage
   trees once their branches are merged); delete `feature/out-of-round`; keep
   `feature/seed20-road` the branch.
5. **Ask the owner before pushing** — local main is 105 ahead of origin and a push deploys to
   Pages via Actions.

## Phase 1–3 — PERF-30: the network worker

Full design in the ticket. The one-paragraph shape: a module worker (same import-the-real-code
pattern as `road-route-worker.js` — no mirror) owns its own `RoadSystem` and does the ENTIRE
build — routing, plan layer, assembly — off-thread; the main thread keeps driving on the old
network until the finished one arrives, then swaps atomically between frames and rebuilds the
cheap derived state (slices, profiles, graph). Cold spawn blocks behind the existing loading
screen. Sync path stays as the no-worker fallback so every headless gate is untouched. A new
`network-worker-parity` gate pins worker == sync byte-identically, the way `road-worker-parity`
pins routes.

Phases (serial):
1. **Scaffold + parity** — worker, protocol (epoch, params snapshot, pond discs as data),
   `RoadSystem.adoptNetwork()` ingest, parity gate green.
2. **Play integration** — `_streamNetwork` split into request/adopt, atomic swap + rev
   invalidation, teleport + story cold-load behind the loading screen, slider-epoch discard.
3. **Cleanup + measure** — decide the old route-worker prewarm's fate (likely redundant in
   play), PERF-08 hitch numbers before/after, full suite, owner drive.

Risks and their mitigations are in the ticket; the load-bearing ones: swap atomicity with
everything keyed on `_networkRev`, water no-go arriving as data rather than closures, and the
params-epoch protocol (copy the route worker's, it is proven).

## Where the numbers live

`.planning/HANDOFF-2026-09-01-R8-BUILD.md` (state of the branch being merged, booked reds,
timing by era) · the Wye Report artifact (photo evidence) ·
`.planning/todos/pending/perf-28-streaming-hitch-events.md` (PERF-30 should close most of it —
re-measure at the end and cross-reference).

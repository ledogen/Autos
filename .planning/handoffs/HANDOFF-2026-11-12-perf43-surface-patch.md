# Handoff 2026-11-12 (night) — PERF-43 the per-wheel surface patch, then PERF-45 and PERF-44

**Worktree** `/Users/ledogen/CodeShit/CarGame-perf43` · **branch** `perf/perf-43-surface-patch` (off main 3d008134) ·
**port** 8043 (no server running; start one only for an owner look: `nohup npx vite --port 8043 --strictPort > /tmp/v8043.log 2>&1 &`).
Window title should read `CarGame-perf43 :8043`. Work ONLY in this worktree; start every Bash call with
`cd /Users/ledogen/CodeShit/CarGame-perf43 && …`. Commit WIP at every step (`git commit -m 'wip(PERF-43): …' -- <paths>`).

## Where things stand

- **The PERF-37 branch LANDED on main** 2026-11-12: fast-forward to 3d008134, after `test:all --browser` (149 gates
  green, cdp-smoke included). It holds PERF-38 (map render skip + repaint), PERF-39 (tire normal, hub resolve), PERF-40
  (the playtest bench), and PERF-42 so far. **Main is NOT pushed** (a push deploys Pages); the owner pushes or asks.
- **PERF-42** (bench physics spikes) is open at 7.7 % of moving seconds over 100 ms/s (main 07581275 was 8.1 %, the
  goal ≤ 5 %). Its ticket has every measurement. PERF-43 is the fix that finishes it.

## Order of work

1. **PERF-43 — the per-wheel surface patch.** `.planning/todos/pending/perf-43-per-wheel-surface-patch.md` is the
   plan: the rule, the layer table, the design, the proof obligation, the steps, the acceptance. Write its exactness
   gate first (extend `test/hint-reuse.mjs`), red, then build layer by layer with the gate green after each.
   This is a multi-file `road.js` refactor: per CLAUDE.md, show the owner the plan in plan mode before implementing
   if anything in the ticket's design has to change.
2. **PERF-45 — the parked main thread** (170 ms/s with nothing moving). Its physics half becomes PERF-43's patch memo;
   do its render-CPU and postStream profile after PERF-43 (or in parallel only if PERF-43 is waiting on the owner).
3. **PERF-44 — the triangle budget** (an investigation, then the owner picks). Independent of the others. Read
   PERF-41 first: triangles were measured cheap on this GPU (the terrain shader is most of it), so the census must show
   where triangles DO cost (shadow passes, CPU side) before proposing cuts.

## Tools (git-invisible, in `wip/perf-42/` here; copied from the PERF-37 worktree)

- `lat.mjs [seed]` — one wheel's ground-query µs and road resolves by lateral offset from the centreline (world rig).
- `spots.mjs <seed> <run dir> <build letter>` — query µs at a bench run's spike-second positions vs its calm ones. Bench
  runs live in `/Users/ledogen/CodeShit/CarGame-perf37/perf-runs/` (gitignored there): pass e.g.
  `/Users/ledogen/CodeShit/CarGame-perf37/perf-runs/2026-11-12-branch-connector-fix/ A`. Edit its `D` default.
- `prof-spot.mjs <seed> <idx> <run dir> <letter>` under `node --cpu-prof --cpu-prof-dir=wip/perf-42/prof`, then
  `node wip/perf-42/under.cjs wip/perf-42/prof queryContacts` — self and inclusive time under the query only.
- `foot.mjs`, `why.mjs`, `spot.mjs` — PERF-42's one-off checks. `ab-surface.mjs` compares heights against a base
  checkout (its `BASE` path is gone; make a detached worktree at the base commit and point it there).
- The world rig's water hook scans a 1 km box per call: set `W.terr.self._waterCarve = null` for timing (the scripts do).

## Measuring

- Bench: `node test/playtest-bench.mjs --a=../CarGame-main0758 --b=. --reps=2` (A = main 07581275 pinned, detached,
  with `node_modules`). For "vs current main", make a fresh detached worktree at main instead. ~7 min per session; it
  wants a quiet machine (load is printed per session). `--probe` counts road resolves per second (not for ms).
- Gates: `node test/run-all.mjs --changed=<paths>` after committing (plain `npm test` diffs the working tree, so it
  selects nothing once committed). `npm run test:all -- --browser` before landing.
- Identity: `node test/fingerprint-world.mjs --out=… --compare=…` against main; PERF-42's connector change already
  shows as `surface` float noise (≤ 1.3e-13 m), so compare against main, not against an older fingerprint.

## Worktrees on disk from this work

- `/Users/ledogen/CodeShit/CarGame-perf37` — the landed branch; keep for its `perf-runs/` (bench data) and handoff.
- `/Users/ledogen/CodeShit/CarGame-main0758` — main 07581275 pinned, the bench's A side.
- `/Users/ledogen/CodeShit/CarGame-nov01` — 9a7e3d71, Nov 01, the pre-BUG-70 reference build.
The owner has not said whether to remove the last two.

## Open owner questions (carry them in the report)

1. Record the PERF-40 baseline (`--record`) now that the branch is on main?
2. Push main (deploys Pages)?
3. Remove `CarGame-nov01` / `CarGame-main0758`?

# Handoff 2026-11-12 (late night) — PERF-43 the per-wheel surface patch (in progress), then PERF-45, PERF-41, PERF-44

**Worktree** `/Users/ledogen/CodeShit/CarGame-perf43` · **branch** `perf/perf-43-surface-patch` (off main 3d008134) ·
**port** 8043 (no server running; for an owner look: `nohup npx vite --port 8043 --strictPort > /tmp/v8043.log 2>&1 &`).
Window title `CarGame-perf43 :8043`. Work ONLY here; start every Bash call with `cd /Users/ledogen/CodeShit/CarGame-perf43 && …`.
Commit WIP every step (`git commit -m 'wip(PERF-43): …' -- <paths>`).

## Where things stand — PERF-43 CLOSED (owner, 2026-11-12); next is PERF-41

PERF-43 is closed by the owner's ruling ("the rest of the juice is not worth the squeeze"): see
`.planning/todos/completed/perf-43-per-wheel-surface-patch.md` § Resolution — what shipped, the quiet-machine numbers
(spike median 149→150 / 181→175 / 146→126 µs), and why the remaining cost is per-sample maths. The branch's last
commits (9b0e93eb bit-identical trims, aec90c63 the hub-resolve regression fix, c1445806 the close) are handed to the
orchestrator to land after `test:all --browser`. PERF-42 stays open at 7.7 % (the recorded PERF-40 baseline,
`.planning/perf/history.jsonl`).

**Next: PERF-41 — the GPU budget, the terrain's per-pixel shading** (`.planning/todos/pending/perf-41-gpu-budget-terrain-shader.md`;
owner: before PERF-44, and taken before PERF-45). Start a fresh worktree off main after the landing
(`perf/perf-41-terrain-shader`), not this branch. The lever list and the measuring script (`wip/perf-41/gpuab.mjs`,
in THIS worktree — copy it; point its `cdp.mjs` / `ioreport.py` imports at the new worktree's `test/lib/`) are in the
previous handoff text below under "Order of work" (git history of this file, 70a2ecb3). Deliverable: each lever's
measured saving with before/after screenshot sheets; the owner picks (the look is theirs). GPU by active cycles, not watts.

## Coordination (the orchestrator, cargame-a9, 11-12)

- Lanes are kept out of src/road*.js, src/terrain*.js and the files named in the ticket; message the orchestrator
  (SendMessage) BEFORE a playtest-bench run — it holds lane spawns/smokes for ~15 min. Lanes also `pgrep -f playtest-bench`.
- BUG-156 (land/bug-156 @ 34fc3e6f, road.js `_limbWeight`) is held for you: cherry-pick before touching the ruled blend.
- Routed to this lane by the owner's inbox: BUG-164 (every POI loaded/visible through fog — with PERF-44's census),
  PERF-46 (map pan jitter in bursts on Windows; may predate PERF-38).

## Tools (git-invisible)

- `wip/perf-42/spots.mjs <seed> <run dir> A` — query µs at bench spike vs calm positions. Run dir:
  `/Users/ledogen/CodeShit/CarGame-perf37/perf-runs/2026-11-12-branch-connector-fix/`. A copy for main's side is in
  `/Users/ledogen/CodeShit/CarGame/wip/perf-43/` (interleave A/B when the machine is loaded; quiet beats both).
- `wip/perf-43/prof-all.mjs <seed> <dir> A` under `node --cpu-prof --cpu-prof-dir=wip/perf-43/prof`, then
  `node wip/perf-42/under.cjs wip/perf-43/prof queryContacts` — inclusive/self time under the query, all spike positions.
- `wip/perf-43/count.mjs <seed> <dir> A` — per-query call counts (resolves, searches, Newton evaluations).
- `wip/perf-43/why-jn.mjs`, `why-warm.mjs`, `ab-normal-pt.mjs` — the one-off diagnoses behind the ticket's numbers.
- PERF-41's `wip/perf-41/gpuab.mjs` and the rest of `wip/perf-42/` as before (see git history of this file).

## Order of work after PERF-43

PERF-45 (parked main thread; its physics half is PERF-43's "rest is free" memo), then PERF-41 (terrain shader — owner:
before PERF-44), then PERF-44 (triangle census; BUG-164 rides with it). Unchanged from the previous handoff.

## Open owner questions (carry them in the report)

1. Ship 6e731daa's three reuse fixes to main ahead of PERF-43?
2. Record the PERF-40 baseline (`--record`) now that the PERF-37 branch is on main?
3. Push main (deploys Pages)?
4. Remove `CarGame-nov01` / `CarGame-main0758`?

---
id: INFRA-06
type: infra
status: pending
severity: high
---

# INFRA-06 — the merge train: corridor-router, ignition, damage → main

Owner-ratified 2026-09-03. Merge the three finished worktrees into main, retire the dead ones,
re-bake the route caches once. Prerequisite for PERF-30 (network worker). Full order, conflict
surface, and close-out steps: **`.planning/PLAN-2026-09-03-OFFTHREAD-NETWORK.md` Phase 0** — that
plan is the spec; this ticket is the tracker entry.

## Acceptance

- [ ] `feature/corridor-router` (70 commits), `feature/ignition` (7), `feature/damage` (40)
      merged into main, in that order, `npm run test:all` between each
- [ ] Final suite green modulo the booked reds listed in HANDOFF-2026-09-01-R8-BUILD.md
      (junction-stitch + three instrument re-baselines)
- [ ] Both route-cache bundles re-baked (`test/bake-route-bundle.mjs`) and verified to
      round-trip the R4 `#p…` fingerprinted keys
- [ ] Worktrees removed: out-of-round (branch deleted), seed20-road (branch KEPT as v1
      reference), plus the three merged trees
- [ ] Each branch's own merge handoff was read before its merge (ignition + damage carry
      `HANDOFF-2026-08-23-*-merge.md` in their `.planning/handoffs/`)
- [ ] Owner asked before any push to origin (a push deploys)

## Resolution (2026-09-04)

Merged in order, full `npm run test:all` between each, all three suites green modulo the four
booked reds (junction-stitch + mission-network / paper-tour / pond-route-around re-baselines):

- `feature/corridor-router` → `f273bc0` (one conflict, test/gates.mjs — kept main's
  model-palette entry, took the branch's road-worker-parity, dropped the two v1 gate entries
  whose files the branch deleted). Suite 53/57.
- `feature/ignition` → clean auto-merge. Suite 54/58 (ignition-starter green).
- `feature/damage` → `639b9ad` (two conflicts, src/main.js + LAYOUT.md, both keep-both unions).
  Suite 62/66 (all eight damage gates green).

**The re-bake acceptance item is VOID, not skipped.** The plan assumed the route-cache bundles
survive the merge and need re-baking; in fact the corridor branch deleted the entire bake
subsystem — both `.gz` bundles, `src/route-store.js`, `test/bake-route-bundle.mjs`, the two v1
gates, and the vite copy entries — as an explicit measured owner call (`584674f`, 2026-08-19:
v2 routes a whole story region live in ~2.8 s at 4×, the bundle bought ~1 s on one seed). There
is no cache asset left to be stale, so the item's intent (no poisoned `#p…` keys) holds
vacuously. The in-session route cache (`_sessionRouteCache`) is what remains, and it needs no
bake. CLAUDE.md's runtime-assets line still mentions `route-cache-default.json.gz` — stale, one
line, flagged to the owner.

**Retired:** all five worktrees removed; `feature/out-of-round` deleted (its liked pieces are in
the damage tree); the three merged branches deleted; `feature/seed20-road` branch KEPT as the
v1-router reference. The pre-existing `CarGame-par-reanchor` leftover directory (unregistered,
already-merged branch) was left untouched — not in this train's retire list.

**Post-merge integration gap, flagged not built:** `src/damage.js` never writes
`vehicleState.engineHealth`, the FEAT-33 seam (ignition handoff §6 expects SM-3 to drive crank
time from engine condition). Both branches were built in parallel and neither could see the
other. One small stitch, owner's call on where engine-track condition maps to catch time.

Push to origin pre-authorized by the owner in the session request ("push to origin after
merges").

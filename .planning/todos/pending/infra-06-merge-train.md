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

---
id: BUG-35
type: bug
status: closed
opened: 2026-07-13
severity: major
source: test-run
note: "Filed from a full `npm test` run on 2026-07-13 (wall 945s). Split out from the suite-reorg work (INFRA-02) so that effort isn't pulled into a graph-invariance debug. This is a RED gate = a real regression signal, not a flake — investigate before it's masked by the affected-gates selection (which may stop running it on non-road edits)."
---

# BUG-35: graph-topology gate is failing (32/33 suite red)

## Symptom

`npm test` on 2026-07-13 reported `RUN-ALL: 32/33 gates green — FAILED: graph-topology.mjs`
(gate wall time 413s). The other 32 gates were green.

`graph-topology.mjs` (FEAT-13 v2) asserts, over blue-noise + Urquhart graphs:
reachability, window-invariance, direction variety, step-free inter-edge surface, and
junction-at-road-grade. One or more of those sub-assertions is now failing — the run summary
did not capture which (the per-gate detail scrolled out of the retained tail).

## First step — DONE (isolated rerun, PERF-08 session 2026-07-13)

`node test/run-all.mjs --serial --only=graph-topology` → **9/10 checks green; the failing
sub-assertion is GRAPH-REACHABILITY**:

```
[FAIL] ✗ GRAPH-REACHABILITY
        nodes=49 orphans=0 #comps=4 largest=38 (78%) — Urquhart ⊇ MST ⇒ connected
```

Threshold is `largest/nodes > 0.85` (test/graph-topology.mjs:47); actual 78 %. All other checks
(window-invariance, crossings-culled, junction-at-road-grade, etc.) pass. This matches the
QUAL-14 closure record verbatim ("the REACHABILITY red stays an accepted known-red gate",
suite 28/29 at the time — the crossing CULLER eats edges, splitting components; the
goalBlend-60 / corridorExempt-50 levers that would green it were deliberately not pulled because
they change road feel). So this is the **long-standing accepted red, not a new regression** —
the remaining work is the second acceptance box: either encode the accepted state (e.g. assert
`orphans === 0` + no NEW component regression vs a blessed 78 % baseline) or pull the levers and
re-verify feel.

## Suspects (unverified — for the investigator)

- Recent road/graph work in the current uncommitted tree (`src/main.js`, `src/props/*` are dirty
  per git status, but graph-topology imports `src/road.js` + `data/ranger.js`, so look at road.js
  history since the last known-green run).
- The visual-polish merge (1103240) reworked meanders/riverbed/carve — if any road-graph or carve
  path shifted, window-invariance or step-free-surface could have drifted.
- REACHABILITY has been a known-deferred red in the past (see memory `project_qual14_route_clearance.md`
  — "REACHABILITY red accepted"). Confirm whether this is that long-standing accepted state
  leaking into a hard failure, vs a NEW regression. If it's the former, the gate's expectation may
  need updating rather than the code.

## Acceptance

- [ ] Identified which sub-assertion fails and whether it's a new regression or a long-known-accepted
      red that should be encoded as an expected-tolerance (not a hard fail).
- [ ] Either the code regression is fixed, or the gate's expectation is corrected with a comment
      explaining why — `npm test` returns to all-green.
- [ ] If it was a regression, note the introducing commit in the resolution.

## Relationships

- **INFRA-02** (test-suite affected-gates reorg) — this bug was surfaced by the same run that
  motivated INFRA-02. Keep them separate: INFRA-02 must not silently stop running graph-topology
  and thereby hide this. Until BUG-35 closes, graph-topology stays in the road/graph subsystem set.
- Memory `project_qual14_route_clearance.md` — prior context on accepted REACHABILITY red.

## Decision 2026-07-14: KEEP the fragments for now (user)

A window-invariant fragment cull (bounded-component flood over the BUG-25 one-ring data, gate
flipped to "largest = 100% of kept nodes") was designed and about to be implemented; the user
called it off — unreachable fragments stay in the world for now. GRAPH-REACHABILITY remains the
accepted known-red at 78% largest-component. If this is picked up later, the design sketch lives
in this session's record; the acceptance remains as written above (fix or encode the tolerance).

## Resolution (2026-07-19)

Closed after the feature/perf-worldgen merge (d731cb3). The failing sub-assertion was
GRAPH-REACHABILITY — confirmed above as the long-standing accepted red (78% largest component,
4 components), not a new regression. The new routing defaults (corridor-heuristic router +
wTurn 1750 + junction thinning v3) changed the network character such that the gate now passes
honestly: nodes=51 orphans=0 #comps=2 largest=49 (96%) vs the 85% threshold. Verified 2026-07-19
via `node test/run-all.mjs --serial --only=graph-topology` (10/10 checks) and the post-merge full
suite (34/34). The gate file itself was NOT modified — no tolerance was encoded; the world greened it.
Residual risk (window-noisy boundary dips, per project_reachability_window_noise memory) is owned
by FEAT-28 region-gated connectivity, which remains open.

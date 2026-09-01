# HANDOFF 2026-09-01 — the R1–R8 build: the wye is live

The 2026-08-31 rulings (`HANDOFF-2026-08-31-STITCH-CLASSES.md`) are **built**, in the confirmed
order R4 → R8 stage 1 → R8 stage 2 → class A → R3 → R5 → R6, plus every ride-along instrument
repair. Owner choices taken this session (asked, answered): **sharp crease** at the wye,
**wyeCreaseMaxDeg = 30°** (tunable, slider added), cap binds **at the wye only**.

| | |
|---|---|
| Code | worktree `CarGame-corridor-router`, branch `feature/corridor-router`, dev **:3343** |
| Commits | `3addd5b` (R4 + R8 + relief + re-entry + R3 instruments + wye-release gate) · `e97d611` (R5 + R6 + clearance re-baseline) · `fe68994` (R2 gating jurisdiction) · `9c2732b` (determinism fp-fix) — head **`9c2732b`** |
| Docs | this file, on main |

## The headline numbers

| quantity | before | after |
|---|---|---|
| ceded-strand release separation | **64/64 at exactly 0.00 m** | **57/57 at ≥ 10.02 m** (median 11.1) |
| own-deck arc within one road width (outside pads+ceded) | 12.8 km / 256 pairs | **10.1 km / 174 pairs** |
| worst deck disagreement in that band | 9.55 m | **5.09 m** |
| junction-stitch gating rows | 105 | **90** |
| fork ROLL residual (worst / median) | 32.6° / 0.4° | **3.2° / 0.3°** |
| the 19 classified sites | — | **7 clear** (01+05 A, 07 D, 11+12 C, 06+17 B) |
| graph-topology | 7/8 (booked corridor-clearance red) | **8/8** |
| battery connectivity | 1 component per window (except lone-pine's known 2) | **unchanged** |

## What was built, per ruling

- **R4 — built-degree pins.** `_assembleGraphEdges` runs a SETTLE pass first (`_v2SettleDeletions`):
  plan pass 1 on graph-degree pins decides and **freezes** the crossing-rung delete set; if any
  deletion flips a node's pin class (3→2, 2→1) the whole plan layer re-runs on built-degree pins
  under a `_planRev` tag, with `_v2DeleteFor` **closed** (memo-only). Deletions stay judged on
  layer-0 — that is what breaks the pins→routes→crossings→degree→pins cycle. `_graphDegreeOf`
  subtracts frozen deletions, so `_runEndpointJunctions`, pads and leaf tapers classify by the
  built network (R4's surface half, seed-6 node 4,1,1).
- **R8 stages 1+2 — the wye.** The departure hold ties the loser to the winner's deck **plane**
  (centre + lateral·sin(camber); winner camber estimated at assembly by the canonical
  `_computeCamberArrays` over the winner view, memoized). The B6 holdFrac rungs **[0.5, 0] are
  deleted** — a shortened hold is R8's illegal overlapping-decks state — and `cededSpans` extend to
  the wye vertex (`s1`/`s0` land on the hold's first clear vertex, ≥ 2·halfWidth by construction).
  New `exS0`/`exS1` fields keep the surface-resolve exclusion at the verbatim boundary — the
  2026-08-22 "nobody owned the gore" negative result still stands. `_applyDepartureCamber`'s ramp
  is re-anchored to the wye (D0 = 10 m → D1 = 20 m, **decoupled from mergeProxM**) with the blend
  target clamped to winner ± `roadV2.wyeCreaseMaxDeg`.
- **The RELIEF RUNG — load-bearing, do not clean it up.** Deleting holdFrac immediately reproduced
  the **seed-7 component split** (declined merge → crossing unsanctioned → delete rung took the
  leg — B3's exact lesson). A last-resort full-hold rung with the seam and departure-grade
  acceptances relaxed keeps the connection, counted `steep-fork`. Grade failure ranks below
  connectivity violation (owner's standing ruling).
- **Class A — the re-entry decline.** `_v2DepartureHold` keeps its rolling window walking past the
  release vertex; a band that dips back under one road width **declines** (relief rung exempt).
  This, not a sanction change, killed site 03's crossing-at-7.2-m-of-air: the ceded-extent
  sanction was measured CORRECT for the delete rung's question (it marks the built-replaced
  interval) and was left alone.
- **R3 + repairs — the instruments.** Stitch-gate `PADR` 15 → the ruled **10 m**; the pair's own
  divergence (wye) points are pad centres; rows dedupe **by position** (a 3-legged node was three
  rows for one spot); tunnel exclusion covers ±80 m of approach cut. `road-worker-parity` routes
  with the cached entry's own pins (`_v2DirsSpec`).
- **R2 applied to the ruler.** Gating jurisdiction is **under one road width centre-to-centre**;
  the 10–18 m shared-earthworks band is counted (`legal two-roads samples`) and reported, never
  gated — R8's own table says over 10 m each road owes the other nothing. This is what cleared
  class E. Same re-baseline for graph-topology's corridor-clearance floor (17.5 → 9.5 m).
- **R5 — the sibling-departure cost.** Sibling bearings (chords toward each end's other settled
  neighbours — pure graph data) ride `dirs` into the spec; `corridorSearch` prices any step within
  `sibConeDeg` (25°) of a sibling at `wSibDepart` (3/m) while inside `sibReachM` (120 m) of the
  node — **demoted rungs only**, and a COST, never a gate. A1's chord-proxy corridor pricing stays
  reverted; QUAL-26's two-pass stays banked.
- **R6 — the pinned-approach preference.** A loser that kept its pin (read off the **geometry** —
  first-leg direction inside the pin cone — never route metadata, so cache-rehydrated routes
  answer identically) declines its merge only where safe: no proper crossings, separation ≥ one
  road width beyond the pad, overlap within corridor-clearance's 80 m endpoint exemption.
  Everything else merges and is counted (`pin-overwrite`) — seed 21's 175 m evidence pair is the
  counted case. The un-floored version was tried first: it halved the battery's merges and lost a
  run — reverted to the floored form.
- **New gate `test/wye-release.mjs` (registered, GATING):** every end-anchored ceded strand
  releases at ≥ 2·halfWidth; reports the residual sub-road-width own-deck arc and worst deck
  disagreement. Mid-span strands are tagged (`midSpan: true`) and excluded — see traps.
- **Determinism.** Route-cache keys for dirful routes are **pin-fingerprinted** (`_v2DirsNS`,
  `#p…`): the settle pass routes margin edges whose pins come from the band graph's
  fringe-truncated adjacency, and a plain-key cache entry let one window's fringe pins answer
  another window's interior request (world-determinism measured it as a 10.16 m spawn move under
  driving history). An entry is now a pure fn of (edge, pins).

## Gate state

`npm test` affected set: green except the standing reds — `junction-stitch` (the owner's allowed
red, now 90), and the three booked instrument re-baselines (`mission-network`, `paper-tour`,
`pond-route-around`). `world-determinism`: **ALL CHECKS PASS** after the fingerprint
fix — including the seed-6 "newspaper customers off-centre" probe that had been booked as a
marginal-site flap since B4; it was the same cache-poisoning all along, so `paper-reroute`'s watch
may be closable too. `wye-release` PASS. `graph-topology` 8/8.

## The residue — one shape, measured

The 90 surviving stitch rows are dominated by **short-conflict leg pairs**: two legs at one node
whose shared stretch is under the merge vocabulary's `MINREG` (30 m) — so no merge, no ceded
strand, no wye — sitting in the **10–30 m throat** that the ruled 10 m pad no longer hides (the
old 15 m instrument margin covered part of it). Typical row: 0.2–1.5 m separation, 1–6 m gap,
11–17 m from the node. That is the next target. R7 (node relocation) stays HELD.

## Traps

1. **Mid-span forks have no departure hold** — built, measured, **reverted** (it trades a
   road-smoothness collision step at the join). Their wye stays booked on BUG-56.
2. **`_v2DeleteFor` is closed after settle** — a pass-2 caller gets memo-or-null. Minting a
   verdict from pass-2 geometry would change built degree under the pins derived from it.
3. **This branch has no bundled route cache** — the R4 "re-keys the cache, needs a re-bake" trap
   lands at **merge-to-main**, when `data/route-cache-default.json.gz` is regenerated.
4. The relief rung is why seed 7 is one component. The R6 minSep floor is why the battery kept its
   merges. Both were measured the hard way this session; neither is an optional nicety.
5. All prior traps stand (throwaway-script A/B in the :3343 worktree, `parseWorldSeed`,
   `_v2DirFallbacks` under-reporting, screenshot recipe).

## Open (owner) questions, deliberately not decided here

- **Class-C/D binding condition vs connectivity:** R8's under-10 m table offers "one segment is
  deleted" for pairs that cannot merge. Extending the delete rung to mere overlap (no crossing)
  collides with the standing connectivity-always-wins ruling. As built, the planner caught both
  class-C sites via a merge record and class D routed apart, so nothing forced the question — but
  the residue's short-conflict pairs may re-raise it.
- **The 10–30 m throat:** fix by letting the wye vocabulary go below `MINREG`, or by a pad-adjacent
  surface treatment? Either changes a ruled quantity (merge minimum / pad reach), so it is an
  owner call.

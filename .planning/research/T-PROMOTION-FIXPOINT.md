# FEAT-76 — the fixpoint argument for wye→T promotion

Written before any code, per the ticket's build order step 2. This is the piece that has to be
checked: promoting a fork to a real node changes node degree, degree feeds departure pins, and pins
feed routing. If that cycle closes, the build is not window-invariant and the ticket has to be
re-scoped.

## The claim

**It does not close, because the promotion never touches the graph.**

`_assembleGraphEdges` runs in two layers:

1. **the plan layer** — `_buildUrquhart` → `_degreeDrops` → `_v2SettleDeletions` → `_v2EdgeDirs`
   (departure pins) → `_edgeCenterline` (routing) → `_v2NodeMerges` (who cedes to whom, where).
   Everything here reads the Urquhart graph `g` and the frozen drop/delete sets.
2. **the assembly layer** — `_registerRun` / `_v2RegisterMerged` / `_v2RegisterShoved`: turn a routed
   centerline into `_network` entries.

The wye lives in layer 2 (`_v2RegisterMerged` builds `[ceded][band][own line]`). **The T lives in
layer 2 as well.** `g`, `g.adj`, `drop`, the delete set and every pin are byte-identical before and
after this ticket. No edge is added to the graph, none is removed, no node's graph degree moves. So:

- `_v2EdgeDirs` returns the same pins → `_edgeCenterline` returns the same polylines → **no road
  moves**, which is the owner's first-order requirement anyway.
- `_v2NodeMerges` is a pure function of `(g, drop, node)`; unchanged inputs, unchanged output. The
  promotion is derived FROM its output (`variants[0].wCut` is already the fork arc — that IS `P`),
  never fed back into it.
- `_planRev`'s two-pass trick is not needed and is not entered: nothing in the promotion can flip a
  delete verdict or a pin class.

`P` exists only in three assembly-layer structures: `_network` (as `cellA`/`cellB` of the sliced
runs), `_proto.nodeInc`, and a per-rev promotion table. That is the whole blast radius inside
`road.js`.

## The one place the argument is NOT free

The graph says node `N` still has three incident edges; the registered network now has only two runs
ending there (the side road starts at `P` instead). `_graphDegreeOf` reads `g.adj`, so it would
report 3 for a node that is now a 2-leg bend — and `_runEndpointJunctions` would flatten camber and
fit a 3-way pad plane at a node `_detectNodeJunctions` is building a deg-2 fillet for.

**Fix: `_graphDegreeOf` subtracts promoted-away edges, exactly the way it already subtracts the R4
frozen delete set** (`delF`). Same shape, same purity: the promotion table is a pure function of the
settled plan layer, so every window subtracts the identical set. `_graphDegreeOf` is a *consumer* of
the frozen sets, never an input to routing — subtracting there cannot reach back into the pins.

Consequence to accept: a node whose only two graph edges merged becomes a registered **leaf**. That
is what the geometry says (one road leaves `N`; the second hangs off `P` further out) and
connectivity is unchanged — `B` is still reachable, via `P`. `_leafA/_leafB` already read
`_graphDegreeOf`, so the leaf taper follows automatically.

## The second place: the pad plane at P must not move the trunk

`_computePadPlane` biases `y0` toward raw terrain by up to `roadJunctionPadTerrainBias` (3 m). At an
ordinary site node that is right — the node has no deck of its own. **`P` does**: it is a point on a
road that is already built, and the ticket's ruling is that the through road does not move. A 3 m
terrain bias at `P` would put a step in the middle of a previously smooth trunk.

So a promoted node's pad plane is **nailed to the trunk**: `y0` = the trunk's own deck at `P`, grade
vector = the trunk's own longitudinal grade there, no terrain bias, no least-squares fit over the
three strands. There is no freedom here and taking any is a regression.

## Node identity

Real node ids are site ids `[cmx, cmz, k]` with `k >= 0`, stringified as `` `${a},${b},${c}` `` and
parsed back with `.split(',').map(Number)` in several places — so a synthetic id must be **three
numbers that survive that round trip**.

    P id = [round(x * 1000), round(z * 1000), -1]      // millimetre-quantised world XZ, k = -1

- **No collision**, structurally: every real `k` is `>= 0`, so `-1` is a namespace of its own. This
  does not depend on the quantisation being lucky.
- **Window-invariant**, because `P` is a VERTEX of the trunk's registered polyline (the split snaps
  to the nearest sample vertex), and that polyline is bit-identical in every window — same route,
  same profile solve, same inputs. Quantisation is belt-and-braces, not the guarantee.
- **`_siteAt` answers for it** — one branch, `k === -1` → `new Vector3(x/1000, deckY, z/1000)`. That
  covers `_nodePos` too (it delegates), and `_computePadPlane`, which calls `_siteAt` directly.
- Run keys stay `` `g:${key(c1)}:${key(c2)}` ``; synthetic keys contain commas and minus signs but
  no colons, so the four places that split a run key on `':'` are unaffected.

The four modules outside the road system (`mission.js`, `map2d.js`, `paper-route.js`,
`world-validate.js`) consume node ids as opaque triples through `_nodePos` / `cellA` / `cellB`. They
need no change, and the union-find sees `N–P`, `P–A`, `P–B` as three ordinary edges.

## What the side road actually is

`_v2NodeMerges` already hands us both halves:

    variants[0].wCut   arc on the WINNER where the fork is        -> P
    variants[0].lCut   arc on the LOSER abreast of P (<= 18 m off) -> where its own line resumes

The T's side run is the loser's own polyline from `lCut` to `B`, **translated onto `P` by a lateral
offset that decays to zero** — the same construction `_v2BuildTaper` uses, minus the one constraint
that makes a wye a wye: the band's start tangent is no longer forced to the winner's heading. That
constraint is where the tight radii came from (median band corner 23.3 m against open road's 1st
percentile of 24.8 m). Freed of it, the blend is a <= 18 m offset decaying over ~50 m — gentle by
construction, and the junction pad at `P` dresses the actual corner, which is what pads are for.

Profile: the side run's start Y is pinned to the trunk's deck at `P` (`_v2GradePts` `opts.yA`),
which the pad plane above then agrees with by construction.

## Acceptance checks that must be PORTED, not deleted

- **BUG-56 B6, departure grade** — the steepest 12 m a driver meets leaving `P`. Still needed; now
  measured on the side run's first 12 m instead of on a band rung.
- **BUG-56 B3, the seam** — two decks may not diverge faster than the ground between them can slope.
  Still needed: a shallow-angle T keeps the two roads close for tens of metres past `P`.

---
id: BUG-61
type: bug
status: pending
severity: major
---

# BUG-61 — a promoted T's node id is NOT window-invariant, and the id is the run key

**Defect in FEAT-76 as merged (`29274b2`, on main and pushed).** Found 2026-09-07 while measuring
`feature/stitch`; the branch made it likely enough to trip a gate, it did not cause it.

## The claim that turned out to be false

FEAT-76's node identity rests on this, from its own fixpoint memo:

> it is **window-invariant** because the point it names is a VERTEX of the trunk's registered
> polyline, which is bit-identical in every window (same route, same profile solve, same inputs).
> The quantisation is belt-and-braces, not the guarantee.

**The vertex is bit-identical. WHICH VERTEX GETS CHOSEN IS NOT.** `_v2ForkCandidates` ranks candidate
forks by deck agreement over the trunk's *registered* geometry and picks the best; the candidate set
and the ranking both depend on what is registered in that window. Move the window and the fork lands
a few metres away — and since the id is the millimetre-quantised position, a few metres is a
different node, a different run key, and a road that "evaporates" for anything holding the old key.

## DIAGNOSIS — the invariance argument was sound when written, and I invalidated it

This is the part worth reading before touching the fix, because the bug is not a missing check. It
is a design that was correct on paper and was quietly changed out from under its own proof.

**`.planning/research/T-PROMOTION-FIXPOINT.md` was written before any code, as the ticket demanded,
and its argument is valid for the design it describes.** That design put the fork at the PLAN
layer's own answer:

> the promotion is derived FROM its output (`variants[0].wCut` is already the fork arc — that IS
> `P`), never fed back into it. *(memo line 27, and again in the table at line 90)*

`_v2NodeMerges` is a pure function of `(g, drop, node)`. Its `variants[0].wCut` is therefore
window-invariant by construction, and so was `P`. **The memo proves invariance for a `P` the shipped
code does not use.**

During the build, plan variants started failing the departure acceptance, and I added
`_v2ForkCandidates` — a scan-and-rank that proposes its own fork positions and orders them by deck
agreement. It **overrides** `variants[0].wCut`. That change moved the fork decision out of the pure
plan layer and into the assembly layer, and the fixpoint memo was never revisited. Nothing flagged
it because the memo's conclusion ("nothing feeds back into routing") stayed true — routing really is
untouched. The conclusion that quietly stopped being true is a different one: that **P itself** is a
pure function of the graph.

### What actually varies, concretely

`_v2ForkCandidates` and the commit path read three things that are NOT window-invariant:

1. **The trunk's and side run's REGISTERED polylines** — the parting-point scan (`lastClose`), the
   `clears` filter and the `dY` deck-agreement ranking all walk registered geometry. Which runs
   register, and how far they extend, depends on the band.
2. **`_v2TrunkPieceAt` / the `pieces` table** — a promotion lands on whatever piece a PREVIOUS
   promotion left behind. The set of prior promotions is the set of in-band merge pairs, which is
   window-dependent. So promotion order and available trunk length both vary.
3. **The ranking itself is continuous.** `dY` is a float; two candidates a few metres apart routinely
   score within centimetres. A near-tie flips under any perturbation, and a flip is 4 m of node
   movement — which is a different id. This is why the failure is intermittent rather than
   systematic, and why it got more likely on `feature/stitch`: ranking selects among more candidates.

### Why the gate I wrote to prove this passed anyway

`test/promoted-node-id.mjs` exists specifically to assert this property. It uses four windows within
~1 km of origin at the same radius — heavily overlapping, nearly identical band boxes, so items 1
and 2 above barely differ and the ranking agrees. **I sampled the windows most likely to agree and
read the result as proof.** An invariance gate has to sample DISSIMILAR windows: different radii,
kilometres apart, and specifically the mission-radius-versus-play-radius pair (320 m) that is the
seam the game actually crosses. That is fix step 3, and it should land even if step 1 makes it
redundant, because the next person to touch the fork ranking needs a gate that can catch them.

## Reproducer

`test/mission-network.mjs`, "the drop-point road still exists when the PLAY system streams there".

| | id | world |
|---|---|---|
| recorded when the mission was planned | `3063021,998581,-1` | (3063.0, 998.6) |
| present in the 320 m play window | `3059681,1000775,-1` | (3059.7, 1000.8) |

**Same T, 4.0 m apart.** The road is genuinely there — nearest pavement to the mission end is
**0.4 m**, on run `g:5,0,1:3059681,1000775,-1`. Nothing is missing from the world; the *name* moved.

## Why the existing gate misses it

`test/promoted-node-id.mjs` (FEAT-76's own) compares ids across four windows within ~1 km of origin
and passes. It never looks 3 km out, and its windows are similar enough that the fork ranking agrees.
A determinism sweep over 5 windows and 6 seeds at 1400–2200 m found **0 of 24** core nodes differing
— the invariance holds locally and breaks at scale, which is the worst shape for a latent bug.

## Blast radius — this is why it is `major`

The synthetic id IS the run key (`g:<a>:<b>`), and four modules outside the road system carry node
ids as opaque triples: `mission.js`, `map2d.js`, `paper-route.js`, `world-validate.js`. Anything
that stores a run key or a cell id across a re-stream with different coverage can lose its road.
`mission-network` caught the mission case; the paper route stores customer edges the same way.

## The fix, in the order it should be attempted

1. **Make the fork choice a pure function of window-invariant inputs.** The information is already
   there and already invariant: `_v2PromotableFor` runs the whole decision at PLAN time on
   `_v2RunSample` geometry. The assembly then RE-DECIDES on registered runs, and that is where the
   variance enters. Have the plan layer decide the fork arc once and have the assembly apply it.
2. **Failing that, quantise the fork to a window-invariant grid** — e.g. snap the fork arc to a fixed
   step along the trunk's own arc — so a few metres of ranking noise cannot move the id.
3. **Extend `promoted-node-id.mjs`** to windows kilometres apart at play radius (320 m) versus
   mission radius, which is the seam that actually broke. The current gate's windows are too similar
   to each other to catch this.

Do NOT "fix" this by making consumers resolve roads geometrically instead of by key — that hides a
real invariance break behind a workaround, and BUG-25 is the precedent for how expensive those are.

## Not the cause, ruled out with measurements

- **Not crowding.** Two Ts 32 m apart looked like the culprit; a 45 m clearance guard did make the
  symptom go away, but the owner ruled spacing is not the issue (*"a T within 45 m of another
  junction is fine as long as it's deterministic — many roads have spontaneous spurs"*) and the
  guard was reverted. It was masking this, not fixing it.
- **Not the ranking change** on `feature/stitch`. Ranking promotes more Ts, so it raised the odds
  until a gate caught it. The defect is on main.

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

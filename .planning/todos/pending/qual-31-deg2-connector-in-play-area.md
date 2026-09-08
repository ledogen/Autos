---
id: QUAL-31
type: quality
status: pending
severity: low
opened: 2026-09-07
source: >
  fallout from PERF-32. Fixing the connector's cost meant reading QUAL-24's premise, and the premise
  is false on the first seed anyone looked at.
relates_to: >
  src/road.js (_connectorCarve doc comment, _mergeDeg2Chains, _deg2ArcTiles), QUAL-16 (the connector
  itself), QUAL-24 (the chain merge, and the claim below), PERF-32 (found it)
---

# QUAL-31: a deg-2 connector sits in the played area, which QUAL-24 says cannot happen

## The claim on the books

`_connectorCarve`'s doc comment (QUAL-24, owner call 2026-08-03) states:

> A deg-2 site is a continuing path, and `_mergeDeg2Chains` now splices its runs into ONE run so the
> join is ordinary road with one profile; connectors are not built there. What remains is the
> streaming FRONTIER, where a site's degree is not known-complete (its incident edges are not all
> registered) so `through()` declines to merge and a deg-2 node still forms. **Those sit at the band
> edge, hundreds of metres past the ~160 m draw distance — reachable, never seen.**

That last sentence is load-bearing. It is the stated reason the connector path was allowed to be
expensive: nobody drives on one.

## What is actually there

Seed 3301512992 has `@deg2:-119.9,-27.4` — a 44.9 m connector, halfWidth 5, legs
`g:-1,-1,2:-189963,-40961,-1` and `g:-1,-1,2:0,-1,2`. It is **9 m from the road the truck drives on**
and the truck sits at lateral 2.8 m from its centreline with `blendW = 1.0`, i.e. squarely on it.

It is not a frontier artifact. Rebuilt from six independent stream centres — (0,0), ±300 m on each
axis, and +600/+600 — the connector is present in **all six**. A frontier artifact would dissolve
once the far side streamed in.

So `_mergeDeg2Chains` did not splice this node, and it is not because the degree was unknown.

## The question

One of these is true, and somebody has to say which:

1. **`_mergeDeg2Chains` has a gap** — `through()` is declining a merge it should accept, and this is
   a real (if cosmetic-and-cheap-now) defect. Worth knowing how often: a connector is a *different*
   carve composition from an ordinary run, so wherever one lands in the play area the road is built
   by the fallback path rather than the primary one.
2. **The comment is stale** — connectors in the play area are expected and fine, and QUAL-24's
   "reachable, never seen" was true of the streaming design at the time and is not any more.

## Why it is only `low` now

PERF-32 removed the sting. A connector cost 8.5 ms of ground query per physics step and poisoned a
192 m halo around itself; both are fixed, and the halo is fixed for *every* connector, wherever it
sits. So this is no longer a performance question — it is a "do we understand our own road graph"
question, plus a doc comment that currently misleads the next reader into thinking this path is cold.

## Acceptance

- [ ] census: how many deg-2 connectors land inside the play area, across the standard seed set
- [ ] verdict on 1 vs 2 above (owner's call if it turns on intent)
- [ ] `_connectorCarve`'s QUAL-24 comment either corrected, or kept with evidence that it holds

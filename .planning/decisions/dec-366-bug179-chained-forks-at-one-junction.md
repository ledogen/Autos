---
id: DEC-366
status: standing
decided: 2026-11-17
area: roads
governs: BUG-179, junction promotion, merge plan, _v2NodeMerges, src/road.js, test/leg-overlap-census.mjs
supersedes:
---

# DEC-366: BUG-179 — the merge plan may chain forks at one junction; the owner signs off on ten examples first

**Ruling.** Choice: "1: allow a chain of forks at one junction (recommended)". Note: "build 1. and show me 10 examples
of chained forks that are generated and let me sign off before its on main. im worried this expansion could create a
whole class of bugs".

**Why.** At a junction where a road already forks off one leg further out, the merge plan's role rule (a run may not
both win and lose a merge at one node) dropped the second leg's fork, so two legs that share 30 m of pavement were
built as two roads and tore past the 30 m plane hold (6.12 m on the capture's seed). Letting the chain through makes
the second leg a T off the first, held level by the T's deck hold. The owner fears a new class of bugs, so the change
lands only after he has seen ten generated chained forks.

**Replaces.** Nothing. It answers the "ask before changing junction promotion" note (owner, 2026-11-13, memory).

**Source.** ledorepo `answered/bug179-fork-chain.json`, 2026-11-17. Owner's words.

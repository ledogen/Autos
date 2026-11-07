---
id: FEAT-183
type: feature
status: open
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 (answering qual35-call: "1 — leave it") — "Make a new feature ticket for post alpha and note that an idea is to set nodes or move them based on a price field of connectivity Instead of just leaving them where they lie like we have today. I think it would be cool to pursue a big road network redesign later You can add these ideas as well Suggested speed limits through areas where curves meet a criteria This naturally fits in with your branch and spur architecture. Just a thought I want to save for later. Just because this prototype didn't work well doesn't mean that choosing where nodes get placed more intelligently is a bad idea."
relates: QUAL-35 (phase 0 measured, closed "leave it" — its report https://claude.ai/artifact/H96gBEYDd85r4jZPiz97G4 and tools in wip/qual-35/ are the starting evidence), BUG-105, BUG-69
---
lane: post-alpha (no lane)

# FEAT-183: a road-network redesign, later — idea bank

Post-alpha. Nothing is built or scheduled; this collects the owner's ideas for a future redesign.

- **Nodes placed by a connectivity cost field.** Set or move each node where a "price field" of connectivity says,
  instead of leaving it where its blue-noise site lies. QUAL-35's prototype (junctions slid by a summed cost
  field) measured badly as a bolt-on: 40–73 % of junctions move, +32 % build, and it absorbs almost no repairs.
  The owner's point: that prototype failing doesn't make smarter node placement a bad idea, it argues for doing it
  as part of a ground-up redesign.
- **Suggested speed limits** through stretches where curves meet a criterion (e.g. a sign before a bend tighter
  than X, or a run of them). Fits the branch-and-spur architecture.

## Acceptance
- [ ] When opened post-alpha: a design pass that names what the redesign replaces, with QUAL-35's numbers as the baseline.

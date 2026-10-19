---
id: FEAT-130
type: feature
status: open
severity: major
opened: 2026-10-19
source: owner, 2026-10-19 — "need damage visuals. i think theres opportunity for something novel/procedural/ soft body but very lightweight. just to approximate crunch"
relates: FEAT-90 (damage screen — pictogram, shipped), BUG-79 (alignment damage), SM-3 wear/condition
---

# FEAT-130: Procedural damage visuals — lightweight "crunch"

## Request
Impacts should visibly crunch the body. Something novel/procedural, soft-body flavoured but very
cheap — an approximation, not real FEM.

## Direction (to be designed — owner's call)
- Candidate: on impact, displace body verts near the contact point along the impulse direction,
  scaled by impulse magnitude, capped per vertex — accumulated into the mesh once (no per-frame cost).
- Fits the faceted art style: dents read as new facets, no textures/normal maps.
- Mirror the damage model: dent location should correlate with what FEAT-90's pictogram reports.

## Acceptance
- [ ] Design sketched + approved (plan mode) before code.
- [ ] Zero per-frame cost when no impacts; impact-time cost measured in ms.
- [ ] Resets on repair.

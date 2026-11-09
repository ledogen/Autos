---
id: FEAT-193
type: feature
status: open
severity: minor
opened: 2026-11-09
source: owner, 2026-11-08 tracker owed side-slide-lever — "can i have body grip on all offroad surfaces bumped to 1.0 mu. onroad leave 0.5 mu. simplified dig in"
relates: BUG-115, BUG-116, BUG-140
lane: Spare (physics files are Lane B's; Spare builds it while B is on the road-surface landings)
---

## What

The owner's pick on BUG-115/116's side-slide levers: the "simplified dig-in". Instead of a new ploughing force
(lever (b)), the body's friction depends on what it slides on:
- **Off-road** (terrain heightfield, every off-road surface): body μ = **1.0**.
- **On-road** (the road deck): body μ stays **0.5** (today's flank value, BUG-116).

This is the per-surface cab friction BUG-115 § "Follow-up idea" recorded: a rolling truck on dirt grips and
tumbles on; on asphalt it skids along. MESH == PHYSICS still holds: the surface is the collider it touches,
not a second lookup.

## Acceptance

- Body-vs-terrain contacts use μ 1.0, body-vs-road 0.5; tires and props unchanged. Tunable in the debug menu.
- Measured, headless: BUG-116's side-slide numbers (stop distance along and across, rolls on vs stops) on dirt and on
  road, before → after.
- The physics fingerprint is re-pinned in the same commit (one re-pin with BUG-140 if they land together).
- One feel drive owed to the owner (shared with BUG-140's).

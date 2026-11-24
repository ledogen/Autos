---
id: BUG-258
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 — "Make a new ticket for smoothing out jagged edges and terrain and use these locations as an example of where there are jagged edges. another example is here: 3435846510 -2835 670. I've been noticing these for a while and it bothers me. It seems like they appear sometimes just at really sharp crests that generate naturally, but mostly from the intersection of two different earthworks"
relates: BUG-64, BUG-130, FEAT-77, src/terrain.js, src/road.js
---
lane: engine & world

# BUG-258: Jagged terrain edges where two earthworks meet

## Next steps
A world-gen lane (Opus): measure first. Find what makes the edge at the example sites, then propose the fix to the owner with before/after screenshot sheets.

## Summary
The ground shows hard, jagged edges. The owner sees them mostly where two different earthworks (a road's cut or fill bank) intersect, and sometimes on sharp natural crests. This ticket replaces the "switchback step" follow-up from BUG-64.

## Description
Example sites:
- Seed 3435846510 at x −2835, z 670 (owner's capture).
- The BUG-64 sheet's sites (`.planning/todos/completed/bug-64-walls-between-close-roads.md`, § Description). Its two worst are one road passing twice on a switchback, where the upper pass's 14 m fill bank ends in a 1 m step at 86°.

Two suspected sources, both unproven:
1. Two carves blended by a hard min/max, which leaves a crease along the line where one carve takes over from the other.
2. A natural crest sharper than the terrain mesh can sample, so the triangles alternate across the ridge.

## Tracker
- [ ] Reproduce at the owner's site and the BUG-64 sites; name the cause of each edge
- [ ] Census over random seeds: how often, how tall
- [ ] Fix proposed to the owner with screenshot sheets (MESH == PHYSICS holds)
- [ ] Built, gates green, owner's look

## Decisions
- 2026-11-24, owner: BUG-64 closes; overlap walls stay in FEAT-77; this ticket covers the jagged edges, with BUG-64's sites as examples.

## Files
`src/terrain.js` · `src/road.js`

## Log
- 2026-11-24: opened from the owner's answer on card bug64-walls-pick.

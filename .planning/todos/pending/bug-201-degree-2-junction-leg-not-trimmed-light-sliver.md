---
id: BUG-201
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "the unknown sliver is an active bug class on main. i think specifically deg 2 junctions dont get their legs trimmed properly. ticket and fix it"
relates: BUG-179, DEC-068, DEC-069, src/road.js
---
lane: B

# BUG-201: A light sliver on the outer edge of a two-road bend

## Next steps
Lane B (Opus), once BUG-179 is on main: reproduce on main, test the owner's hypothesis, fix at the root.

## Summary
At a degree-2 junction (two roads meeting at a bend) a light sliver about 1 m long shows on the outer edge of the
pavement. BUG-179's sheet shows one at the tile #17 bend. The owner says this is an existing class on main, and
thinks the legs of a degree-2 junction are not trimmed properly where they meet the connector.

## Description
Seen: `CarGame-machine/wip/bug-179/chained-forks-sheet.jpg`, tile #17 (after), outer edge of the bend. Not
investigated there. BUG-179's stub drop makes more of these bends (each old fork becomes a 2-leg bend on the existing
deg-2 connector), so the class gets more common once BUG-179 lands.

To establish: what the sliver is (a gap showing terrain or the carve's light underside, a leg ribbon overrunning the
connector, or two surfaces z-fighting, i.e. two triangles at the same depth flickering), whether physics has the same
hole (MESH == PHYSICS), and how often it occurs on random seeds on main.

Bound by: pads weld to ribbons on shared mouth vertices (DEC-068); never setAttribute on pooled geometry (DEC-073).

## Tracker
- [ ] Reproduced on main at a degree-2 junction, the sliver's geometry named and measured
- [ ] The owner's hypothesis (legs not trimmed at a deg-2 junction) confirmed or replaced
- [ ] Census on random seeds: how many degree-2 junctions show it, before → after
- [ ] Fixed at the root with a gate that fails before and passes after; fingerprint differences explained
- [ ] Before/after screenshots for the owner

## Decisions
- 2026-11-17, owner: "ticket and fix it"

## Files
`src/road.js`

## Log
- 2026-11-17: minted by the orchestrator from the owner's verdict on BUG-179's round-2 sheet.

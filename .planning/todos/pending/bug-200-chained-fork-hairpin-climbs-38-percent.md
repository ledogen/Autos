---
id: BUG-200
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "ticket #9 for voilating max grade significantly. id like to find a fix which might end up being to drop it all together."
relates: BUG-179, DEC-366, DEC-064, DEC-065, src/road.js
---
lane: B

# BUG-200: A chained fork leaves a hairpin that climbs 38 %

## Next steps
Lane B (Opus), after BUG-179 lands and BUG-201 is done (serial on `src/road.js`): find why this site is built at 38 %
and bring fixes to the owner as choices with screenshots. Dropping the road altogether is an acceptable fix.

## Summary
On seed 688224244 (tile #9 / #19 of BUG-179's sheet) the chained fork turns an old T into a tight hairpin whose
centreline climbs 38 % for 20–36 m past the old fork. That is far above the grade a road is meant to have. The climb
came with the chained fork (BUG-179), not with its dead-end trim.

## Description
BUG-179's round-2 finding: not a tear. The 0.79 m "step" on the outer metre of pavement is a smooth slope (0.61 m in
the inner 3 m). The centreline is the same with the chained fork alone. Sheet:
`CarGame-machine/wip/bug-179/chained-forks-sheet.jpg`, tile #19. Nobody has driven it.

Not known: whether main built this stretch at all or at what grade, which stage sets the 38 % (the router's ceiling
rung, the profile planner recovering from the fork's pad plane, or the chain's fork point sitting too close to the
node), and how many other chains do the same. The tutorial seed search (FEAT-229 r2) found the router allows up to
38 % generally: say whether this is that same ceiling or something the chain adds.

Bound by: no road-character retune (DEC-064), no longitudinal grade smoother (DEC-065), connectivity never goes
down except by an owner-approved drop.

## Tracker
- [ ] The site reproduced headlessly; grade profile main vs BUG-179, the stage that sets it named
- [ ] Census: how many chained forks (and plain forks on main) exceed the design grade, on random seeds
- [ ] Fix options shown to the owner with before/after screenshots; "drop the road" among them
- [ ] The owner's pick built, with a gate that fails before and passes after

## Decisions
- 2026-11-17, owner: "id like to find a fix which might end up being to drop it all together."

## Files
`src/road.js` · `test/leg-overlap-tear.mjs`

## Log
- 2026-11-17: minted by the orchestrator from the owner's verdict on BUG-179's round-2 sheet.

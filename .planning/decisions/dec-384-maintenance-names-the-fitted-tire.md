---
id: DEC-384
status: standing
decided: 2026-11-17
area: ui
governs: FEAT-262, src/service-screen.js, maintenance
supersedes:
---
# DEC-384: The maintenance menu names the tire fitted on each corner
**Ruling.** "The maintenance menu needs to tell you if your tire is old or standard". Built as: each corner line under Tires and Wheels carries the fitted tire's own name from `data/parts.js` (Old tire, Standard tire, Sport tire, All-terrain tire, Load-range E tire), stock or not.
**Why.** The condition percentages alone do not say which tire you are wearing; before this the name showed only for a non-factory part on the other rows.
**Replaces.** Nothing. The "name only when not factory" rule of `_part` still holds for every other part.
**Source.** Owner inbox 20261117101351-o1a3, 2026-11-17. The quoted line is the owner's; the "Built as" sentence is the lane's wording.

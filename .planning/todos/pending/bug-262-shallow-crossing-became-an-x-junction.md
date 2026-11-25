---
id: BUG-262
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 (chat) — "match above ground behavior - merge into one road" · "10m"
relates: BUG-259, BUG-234, DEC-495, DEC-494, DEC-068, src/road.js
---
lane: engine & world

# BUG-262: A 3° crossing became a full X junction

## Next steps
A world-gen lane (Opus), when the owner lifts the 11-24 hold. Measure first, then fix upstream.

## Summary
Two roads that cross at a very shallow angle should merge into one road, as the above-ground rule already says. On seed 2280440363 near (19, −42) a crossing of about 3° inside a tunnel became a full X junction instead, and its pad cannot weld to its legs.

## Description
- The crossing detector classes a crossing under `roadCrossAngleMin` (12°, `src/road.js` ~7747) as NEAR_PARALLEL: a graze that gets a box merge, not a shaped junction.
- The site crosses twice, about 100 m apart, at about 3°. Both crossings are X junctions on main (BUG-234).
- Not yet known: whether BUG-234's X path skips the angle rule, or a double crossing is handled one crossing at a time.
- Pad state there: main has the convex-hull fallback with 2 of 4 legs welded; BUG-259 slice 2 (branch `land/bug-259-tunnel-x`, not landed) has 0 of 4.
- `test/pad-census.mjs` on main, 11-24: 211 real junctions, 211 welded, 0 on the hull fallback. Its windows may hold no X junction.

## Tracker
- [ ] Trace why the 3° site became an X
- [ ] Census of crossing angles on random seeds: how many X junctions sit under 12°, above and below ground
- [ ] A crossing under the limit merges into one road, underground as above ground (DEC-495)
- [ ] An underground junction sits at least 10 m from a portal (DEC-495); a gate holds it
- [ ] No junction on the hull fallback at an X; `pad-census` covers X junctions
- [ ] Before/after sheet on random seeds; owner's look

## Decisions
- 2026-11-24, owner (DEC-495): a crossing under the near-parallel limit merges into one road, underground too; an underground junction is at least 10 m from a portal.

## Open questions
None.

## Links
BUG-259 (slice 2 and its card `bug259-slice2-weld-pick`) · BUG-234 · DEC-068 · DEC-494

## Files
`src/road.js`

## Log
- 2026-11-24: minted by the orchestrator from the owner's two rulings in chat.

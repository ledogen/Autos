---
id: FEAT-295
type: feature
status: open
severity: major
opened: 2026-11-19
source: owner, in chat, 2026-11-19, after trying the paper throw on :8005
relates: ASSET-91, FEAT-275, FEAT-276, FEAT-277, FEAT-266, FEAT-74, DEC-429, src/poi.js, src/paper-route.js
---
lane: Places and Missions

# FEAT-295: Paper route targets are houses with porches, not goals on empty terrain

## Next steps
- ASSET-91 first: the three small houses with porches (being modelled).
- Then place them at Larry's delivery targets (DEC-429: most targets are residence models with pads, "About 30% can remain just boxes wherever"). It touches `_rebuildPoiMarkers` / `_spawnSatellite`, where the mailboxes branch (`land/feat-275-280-mailboxes`, held for the owner's look) also works: land that first.
- The owner's review card for this ticket MUST include the porch throw (see Open questions): he asked for the physics review to be merged into the houses card.

## Summary
Owner: "I wasn't able to throw onto any porches because there are no houses on the route. It's still goals on empty terrain."

## Description
FEAT-277 (thrown papers as rigid bodies) is signed off by the owner on flat ground and walls: "the throwing and physics is good. good damping too." What he could not test is the thing the physics was built for (inbox 20261118013250-sf5w): "ability to throw the paper at the wall of a house or the front door and have it fall down into the circle" and a paper resting on a porch. A route's targets today are a halo on bare ground (and, on the mailboxes branch, a mailbox on the shoulder).
Cold generation only: which target gets which house is a pure function of the seed.

## Tracker
- [ ] ASSET-91's three houses ship.
- [ ] Houses stand at route targets (share per DEC-429), each on a pad, porch facing the road, the halo on the porch or the yard (owner's call, below).
- [ ] 400-seed no-throw sweep, fingerprint, gates, smoke.
- [ ] Owner's card: the look of the houses AND the porch throw (a paper thrown at the wall or door drops into the circle; one landing on the porch scores).
- [ ] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner: the paper physics review is closed as good; its remaining check (porches) is reviewed on this ticket's card.

## Open questions
- Where the scored circle sits at a house: centred on the porch, or the front yard with the porch inside it. Owner's call when the first house stands.
- DEC-429's second aspiration (the route's objective becomes "onto the PORCH of every residence") changes Larry's scoring; not part of this ticket unless the owner says so.

## Links
ASSET-91, FEAT-275, FEAT-277, DEC-429, DEC-414.

## Files
`src/poi.js`, `src/paper-route.js`, `src/main.js` (`_rebuildPoiMarkers`), `data/prop-models.js`.

## Log
- 2026-11-19: minted from the owner's look at the paper throw.

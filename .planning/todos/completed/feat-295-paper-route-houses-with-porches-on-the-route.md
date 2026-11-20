---
id: FEAT-295
type: feature
status: closed
severity: major
opened: 2026-11-19
source: owner, in chat, 2026-11-19, after trying the paper throw on :8005
relates: ASSET-91, FEAT-275, FEAT-276, FEAT-277, FEAT-266, FEAT-74, DEC-429, src/poi.js, src/paper-route.js
---
lane: Places and Missions

# FEAT-295: Paper route targets are houses with porches, not goals on empty terrain

## Next steps
Closed 2026-11-20. Landed; owner: great work, land what you have. Follow-ups BUG-246 and FEAT-311.

## Summary
Owner: "I wasn't able to throw onto any porches because there are no houses on the route. It's still goals on empty terrain."

## Description
FEAT-277 (thrown papers as rigid bodies) is signed off by the owner on flat ground and walls: "the throwing and physics is good. good damping too." What he could not test is the thing the physics was built for (inbox 20261118013250-sf5w): "ability to throw the paper at the wall of a house or the front door and have it fall down into the circle" and a paper resting on a porch. A route's targets today are a halo on bare ground (and, on the mailboxes branch, a mailbox on the shoulder).
Cold generation only: which target gets which house is a pure function of the seed.

## Tracker
- [x] ASSET-91's three houses ship (merged into this branch; their look is on card asset91-porch-houses-look).
- [x] Houses stand at route targets, each on a pad, porch facing the road, the halo on the porch floor (src/poi.js _routeHouse;
  95 % of stops on 12 seeds, the rest keep today's bare target + mailbox). Gates route-houses, porch-throw.
- [x] 400-seed no-throw sweep (0 errors, 3843/4002 stops housed), fingerprint, gates (61/62 + dist-assets fixed), smoke, pad-e2e.
- [x] Owner's card: the look of the houses AND the porch throw (a paper thrown at the wall or door drops into the circle; one landing on the porch scores).
- [x] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner: the paper physics review is closed as good; its remaining check (porches) is reviewed on this ticket's card.

## Open questions
- Where the scored circle sits at a house: centred on the porch, or the front yard with the porch inside it. Owner's call when the first house stands.
  Built: centred on the porch floor (the orchestrator's brief), the scoring rule unchanged (distance at rest, 5 m circle).
- Should a paper resting ON the porch score full regardless of distance (porch = full, yard = partial)? On the card.
- DEC-429's second aspiration (the route's objective becomes "onto the PORCH of every residence") changes Larry's scoring; not part of this ticket unless the owner says so.

## Links
ASSET-91, FEAT-275, FEAT-277, DEC-429, DEC-414.

## Files
`src/poi.js`, `src/paper-route.js`, `src/main.js` (`_rebuildPoiMarkers`), `data/prop-models.js`.

## Log
- 2026-11-19: minted from the owner's look at the paper throw.
- 2026-11-19: built. Each stop draws a house (cottagePorch / ranchDeck / cabinLanding, tag `routeHouse`) placed so the
  porch floor's centre is the stop's target (13 m off the centreline, unmoved), on a residence-style pad (shoulder +0.6 m to
  the back eave, flat at the shoulder's top; natural ground fitted 1 stop in 30). Fallback: today's bare target + mailbox.
  Halo at the porch floor's top; colliders via PoiPhysics; model via the _clutter queue. Fingerprint: only story windows'
  poi / surface / carve differ (the pads); road deck bit-identical (gate).
- 2026-11-19: route-houses on 50 random seeds PASS (479/501 housed); porch-throw 45/78 throws rest on a porch, all
  great/bullseye; smoke PASS on retry (first run: opening's off-road auto-reset timed out once); pad-e2e ALL OK.
- 2026-11-20: owner, card feat295-porch-throw-try: "Change (note box below)". Note: "I like the assets, I like the targets, the physics is working great, overall great work. Collisions with the vehicle work mostly. Usually crashing into a porch stops the truck, but occasionally it also lets the truck through. And then the truck crashes into the house, but is clipping through the porch. This only happened at slow speed for me, specifically on the third house on the scenarios paper route. And land what you have because it's much better than bare circles. One other request is distance to the next house with distance to the last house in parentheses up at the top somewhere." Landed on main (de95a525). The porch scoring rule question ("porch = full") was not answered: the distance rule stays. Follow-ups are BUG-246 (the truck sometimes passes through a porch at slow speed) and FEAT-311 (distance to the next house, the last in parentheses, at the top). Closed.


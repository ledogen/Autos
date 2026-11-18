---
id: BUG-217
type: bug
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18, with capture autos-capture-1794991981756.json (tutorial, current main)
relates: QUAL-18, BUG-78, PERF-41, src/shadow-fade.js, src/main.js
---
lane: engine & world

# BUG-217: The fine shadow map's edge is visible about 20 m ahead and behind the truck, on ground already in coarse shadow

## Next steps
Reproduce from the capture, measure the brightness step across the near map's edge on ground that the far map already shades, match the two, verify with screenshots.

## Summary
Driving on a mountainside that is in the far (coarse) shadow, a darker patch of near (fine) shadow travels with the truck. Its edge is visible roughly 20 m ahead and 20 m behind.

## Description
Owner: "the glitch where I can see the shadow loading in the edge of the coarse shadow map is definitely there. I think the fine and coarse maps just don't match in brightness very well. So even though this this mountain is in coarse shadow, it still looks like as I drive into it the fine shadow is appearing out of nowhere. However, it's just moving with me, I think. What I can say is the shadow follows the truck, not the freecam. I can say it happens right here. … I can see the edge about 20 meters ahead of me and 20 meters behind me and it moves with the truck as I drive. Try matching the brightness between the two regions and then use screenshots to verify that it's fixed."

## Tracker
- [ ] Reproduced at the capture's place, before screenshots kept
- [ ] The brightness step across the near edge measured (ground in far shadow, inside vs outside the near map)
- [ ] Cause named
- [ ] After screenshots at the same place and sun: no visible edge; step measured
- [ ] Owner has looked

## Decisions

## Open questions

## Links
QUAL-18 (near edge fade), BUG-78 (near/far coupling), PERF-41.

## Files
src/shadow-fade.js, src/main.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's chat message and capture.
- 2026-11-18 Owner on card `bug217-shadow-seam-look`: "Good: land it" — likes the performance of hills in the coarse map only, shadow definition "totally good enough". Follow-on seam ticketed as BUG-229. Landing in progress.

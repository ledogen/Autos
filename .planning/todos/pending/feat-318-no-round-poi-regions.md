---
id: FEAT-318
type: feature
status: open
severity: major
opened: 2026-11-20
source: owner, 2026-11-20 — "We should seek to remove all large diameter circular POI interaction regions. Everything should either be a driveway, a parking spot, or just a rectangular strip on the shoulder. The circle bleeds into the road and is ugly. If we're just marking a spot on the shoulder, make sure it's at least two and a half car lengths and two car widths, so it's easy to just fly in and park."
relates: DEC-474, DEC-422, DEC-429, FEAT-288, ASSET-74, FEAT-178, FEAT-88, src/poi.js, src/main.js, src/camp.js
---
lane: unplaced

# FEAT-318: No round POI regions: every POI parks in a driveway, a parking spot or a shoulder strip

## Next steps
Owner: look at the sheet (owed card feat318-poi-regions-look) and answer the open questions below. Lane c2 lands
land/wave2-1120 on a "Good".

## Summary
Every POI that answers the parking brake used to wear a 10 m orange ring round its pad centre. The pad centre is
12.1 m off the road's centreline, so the ring reached 2.1 m from it, across the near lane. Now every such POI parks in
a rectangle: its model's PARK box where it has one (the store's stalls, the shop's lift, the site's bay), else a
12.0 x 3.5 m strip on the shoulder in front of its pad. Mom's door, a hidden 25 m circle, is her strip too.

## Description
### Inventory before (seed-independent: the roster and the models decide it)
| POI type (model) | Region | Drawn by | "Truck is here" test | Had a driveway / spot? | Now |
|---|---|---|---|---|---|
| mom's house (trailer) | 10 m ring + 25 m door circle | orange curtain, `main.js _rebuildPoiMarkers` | door: `camp.js atMoms` (25 m) | no | shoulder strip; the door is the strip |
| Larry's (trailer + van) | 10 m ring | orange curtain | `_poiInReach`: `poiSystem.nearest(10 m)` + `_inPoiSpot` | no | shoulder strip |
| burger joint, tackle shop, office, school, doctor | 10 m ring | orange curtain | as Larry's | no | shoulder strip |
| residence x5 (trailer, Winnebago, porch, deck, cabin) | 10 m ring | orange curtain | as Larry's | no | shoulder strip |
| farm: barn (farm pad), broadside barn (lay-by), produce stall | 10 m ring | orange curtain | as Larry's | no | shoulder strip, slid along the road clear of the barn |
| stranded motorist (broken car) | 10 m ring | orange curtain | as Larry's | no | shoulder strip |
| expedition camp | 10 m ring | orange curtain | as Larry's | no | shoulder strip |
| general store / gas station on a fallback cube | 10 m ring | orange curtain | as Larry's | no | shoulder strip |
| general store | PARK box (5 stalls) | box curtain | 10 m + box | yes (stalls) | unchanged |
| gas station | PARK box (storefront bay) + 2 pump zones | box curtains | 10 m + box | yes | unchanged |
| auto shop | PARK box (bay A lift) | box curtain | 10 m + box | yes (the lift) | unchanged |
| work site | PARK box (in front of the slab) | box curtain | 10 m + box | yes | unchanged |
| firewood yard | drop zone (bed over it) | drop mark | 10 m + bed over the zone | yes | unchanged |
| gas pump | 2 pump zones | blue box curtains | the zones | yes | unchanged |

Other readers of the 10 m radius: the service screen and the shop's engine quote (`_serviceInReach`, `_shopCures`),
the fetch and multi-drop hand-over, the camp prompt and the tow hint (`_inPoiRing`), the smoke's seats, `tow-seat` and
`story-poi`.

### As built
- **The strip** (`poi.js _shoulderStrip`): 2.5 x 4.705 m by 2 x 1.66 m (the Ranger's `bodyLength` / `bodyWidth`),
  11.76 x 3.32 m, rounded up to **12.0 x 3.5 m**. Inner edge 0.1 m outside the paved edge (5.0 m off the centreline,
  where the lane's edge line is); outer edge 8.6 m, so it reaches 0.5 m onto the pad (the shoulder plus the pad gap is
  only 3.1 m). Centred on the pad; on a bend it steps out until no point is inside the lane; where the model stands on
  the pad's road edge (the barn) it slides along the road in 0.5 m steps to the first place clear of the model (a broadside barn on a 14 m lay-by clears at 12.35 m of a 12.5 m slide; a 1.5 m step missed it).
  Stored as the POI's `park` box in the model frame (`park.strip = true`), so every PARK-box reader takes it unchanged:
  the curtain, the trigger, `towSeat`, the smoke. Built cold from the road in `PoiSystem.build`, never saved.
- **Its yard**: a lawn piece or a mailbox whose footprint would stand in the strip is not placed (the mailbox tries its
  next spot along the shoulder, DEC-429's own rule).
- **The trigger**: `_inPoiSpot` is the truck's centre in the box (0.3 m slack) or, at the firewood yard, the bed over
  its drop zone. No radius anywhere: `_poiInReach`, `_serviceInReach`, the hand-over and `_shopCures` ask which POI's
  spot or pad holds the truck. `_atPoi` (was `_inPoiRing`) is "on a POI's pad or in its spot".
- **Mom's door** (`camp.js atMoms`): her strip, grown by 0.3 m. `campMomsRadiusM` and its slider are gone.
- **Start seats** (`poi.js startSeat`): the burger joint, mom's and Larry's start the truck in their strip.
- **Deleted**: `POI_PARAMS.poiInteractR`, the circle branch of the curtain, `campMomsRadiusM`.
- **Gate** (`test/story-start-clear.mjs`, part 4): every brake-answering POI has a spot; every strip is at least
  11.76 x 3.32 m, no point of it (0.5 m grid) is within 5.0 m of any road's centreline, and it overlaps no POI solid and
  no solid prop. 3 seeds (2741906, 518337, 1): 51 strips, all clear; the closest point to a centreline 5.09 m.

### Left as they are (each a design choice, not guessed)
1. **The green start ring** (`START_ZONE_R` 25 m, `mission.js`; drawn by `main.js _stageRing`). Accepting a job swaps
   the orange spot for it, and the clock starts when the truck leaves it. It is round on purpose: room to turn round
   before the clock runs. Choice: keep the 25 m circle, or a rectangle (which size: the strip itself would start the
   clock as you pull out, before any turn).
2. **A job's end** (`ARRIVE_RADIUS` 28 m, invisible; the GPS draws a 6 m ring at the route end). You arrive by driving
   into it, no park. Choice: keep drive-in arrival, or make every end a park in the destination's spot (a gameplay and
   scoring change; roadside landmarks have no spot to park in).
3. **The paper route's targets** (3 m green halo + spike, DEC-414): a scored throw target, not a parking region.
4. **The tutorial's reset grace** (20 m round a POI, DEC-281): an invisible tolerance, not an interaction region.

## Tracker
- [x] Inventory every circular POI region (table above)
- [x] DEC-474 written
- [x] Shoulder strip: size from the Ranger, off the lanes, clear of the model and its yard, cold from the road
- [x] Triggers, mom's door, start seats, service screen, hand-over read the spot; no radius left
- [x] Circle code deleted (`poiInteractR`, the round curtain, `campMomsRadiusM`)
- [x] Gate: story-start-clear part 4
- [x] Sheet wip/feat-318/sheet.jpg (16 types on seeds 518337 and 2741906, two chase-camera views, BUG-251, FEAT-322)
- [ ] The owner's look (owed card feat318-poi-regions-look)
- [ ] Owner: the start ring and the job's end (open questions)

## Open questions
- The green start ring: keep it round (25 m), or a rectangle? (recommend: keep it round until a rectangle has a size
  that leaves room to turn round).
- A job's end: keep drive-in arrival (28 m), or park in the destination's spot? (recommend: keep; a roadside landmark
  has no spot).

## Links
Sheet: `wip/feat-318/sheet.jpg` (git-invisible). Owed card: `feat318-poi-regions-look`.

## Files
`src/poi.js` · `src/main.js` · `src/camp.js` · `test/story-start-clear.mjs` · `test/story-poi.mjs` · `test/tow-seat.mjs` ·
`test/cdp-smoke.mjs`

## Log
- 2026-11-20: c2, land/wave2-1120: built as above.
- 2026-11-21: c2: the strip slides 0.5 m at a time (a broadside barn on a lay-by needs 12.35 m of its 12.5 m slide). The
  smoke's line-source seat is the PARK box's centre again (towSeat puts a gas station's truck at its pump), and the
  firing's orbit is read off the camera's aim point (the truck now starts in the joint's strip, ~8 m from the ring).
  The stranded motorist is hidden until its job, so the sheet has no row for it; its strip is built the same way.

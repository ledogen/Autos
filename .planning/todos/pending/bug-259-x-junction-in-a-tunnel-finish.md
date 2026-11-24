---
id: BUG-259
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 — "the junction pads do bleed outside of the tunnels sometimes which Looks weird because the gravel texture on the shoulder disappears. […] Driving Downhill on one of the legs into the intersection is almost undrivable and takes a steep dip at the end It's an absolute death trap […] seed: 1960791808 intersection […] the terrain under road geometry carries its camber and pokes through the ribbon at the intersection. the roof sections also dont miter perfectly. […] at the point of the intersection, the mountain above seemed to be earthworked down towards the intersection. There should be no earthwork at the intersection. There should only be earthwork near the portals."
relates: BUG-234, DEC-471, DEC-068, src/road.js
---
lane: engine & world

# BUG-259: X junctions inside tunnels are unfinished

## Next steps
Items 2, 3 and 5 are fixed on `land/bug-259-tunnel-x` (gate `tunnel-x-junction`). Left: item 1 (the pad over the tunnel floor) and item 4 (the roof miter), both mesh work in `src/road-mesh.js` / the pad ring; see Log 2026-11-24 for what was measured. Then the owner's drive.

## Summary
BUG-234 made crossing roads meet at an X junction. The owner drove two of them and approved landing as "a strict improvement", with five defects left, mostly where the X sits underground.

## Description
From the owner's drive (words in `source:`):
1. The junction pad bleeds outside the tunnel, and the shoulder's gravel texture disappears there.
2. One leg into the X runs downhill and ends in a steep dip: "an absolute death trap". The owner notes this is probably not entirely BUG-234's fault.
3. Seed 1960791808: the terrain under the road carries the road's camber and pokes through the ribbon at the X.
4. Same site: the tunnel roof sections do not miter (meet at a clean angled joint).
5. Same site: the mountain above is earthworked down toward the X. Ruling below.

## Tracker
- [ ] Pad stays inside the tunnel; shoulder gravel kept
- [x] The downhill leg's end dip measured and fixed (or ticketed apart if it is a profile bug)
- [x] No terrain through the ribbon at the X
- [ ] Roof sections miter
- [x] No earthwork above an underground X; earthwork only near portals
- [ ] Owner's drive

## Decisions
- 2026-11-24, owner: "There should be no earthwork at the intersection. There should only be earthwork near the portals." Recorded as DEC-494.

## Files
`src/road.js`

## Log
- 2026-11-24: opened from the owner's answer on card bug234-built-drive.
- 2026-11-24 (land/bug-259-tunnel-x): items 2, 3, 5. Cause of 3 and 5: the mouth funnel (`_boreNotchCS`) climbed out of each leg's span end AT the node as if it were a portal, and the pad carve and the legs past their ends then cut the skin to the pad (1960791808: 61 m pit; 2280440363: 89-113 m deep Xs, skin 1.0 m over the deck, a leg's camber on it). Fix: `_undergroundNodes` (every leg leaves in a bore, no mouth at the node); there the funnel measures from real portals only, the pad carve owns only probes under the apex, and `boreSpanAt` carries the bore past the leg ends (ownership, rivals, shade, listener). Item 2 was the junction's: the deck hold's recovery was pinned to the bore floor, so the ceiling pass shipped 48 % on a leg solved at 20 %; at a node inside a bore it now runs DEC-409's design maximum (24 %). Bonus: the chamber was lit like a portal (shade 1.0), now 0.25.
- Not done: item 1 (pad): at 2280440363 the pad is the convex-hull fallback (two roads crossing twice 100 m apart leave each X at shallow angles), 4.3 m and 1.4 m outside the bores; at 1960791808 the welded pad stays inside the tubes, but every pad paves over the tube floor's gravel. Item 4 (miter): thin lining slivers over the chamber where the four tubes meet. Sheet `wip/bug-259/sheet.jpg`.


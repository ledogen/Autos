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
All five items are fixed on `land/bug-259-tunnel-x` (gate `tunnel-x-junction`, checks 1-9). Left: the owner's drive (sheet `wip/bug-259/sheet-2.jpg`).

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
- [x] Pad stays inside the tunnel; shoulder gravel kept
- [x] The downhill leg's end dip measured and fixed (or ticketed apart if it is a profile bug)
- [x] No terrain through the ribbon at the X
- [x] Roof sections miter
- [x] No earthwork above an underground X; earthwork only near portals
- [ ] Slice 3 (owner, 11-24 evening): inside tunnels, no ground texture over the road surface and no z-fighting (two surfaces at the same depth flickering)
- [ ] Owner's drive

## Decisions
- 2026-11-24, owner: "There should be no earthwork at the intersection. There should only be earthwork near the portals." Recorded as DEC-494.

## Files
`src/road.js` (`_junctionRingWeld`, `_setJunctionRing`, `tubeMiterPlane`, `siblingTubeTest`), `src/road-mesh.js` (`buildTunnelTube`), `test/tunnel-x-junction.mjs`

## Log
- 2026-11-24: opened from the owner's answer on card bug234-built-drive.
- 2026-11-24 (land/bug-259-tunnel-x): items 2, 3, 5. Cause of 3 and 5: the mouth funnel (`_boreNotchCS`) climbed out of each leg's span end AT the node as if it were a portal, and the pad carve and the legs past their ends then cut the skin to the pad (1960791808: 61 m pit; 2280440363: 89-113 m deep Xs, skin 1.0 m over the deck, a leg's camber on it). Fix: `_undergroundNodes` (every leg leaves in a bore, no mouth at the node); there the funnel measures from real portals only, the pad carve owns only probes under the apex, and `boreSpanAt` carries the bore past the leg ends (ownership, rivals, shade, listener). Item 2 was the junction's: the deck hold's recovery was pinned to the bore floor, so the ceiling pass shipped 48 % on a leg solved at 20 %; at a node inside a bore it now runs DEC-409's design maximum (24 %). Bonus: the chamber was lit like a portal (shade 1.0), now 0.25.
- Not done: item 1 (pad): at 2280440363 the pad is the convex-hull fallback (two roads crossing twice 100 m apart leave each X at shallow angles), 4.3 m and 1.4 m outside the bores; at 1960791808 the welded pad stays inside the tubes, but every pad paves over the tube floor's gravel. Item 4 (miter): thin lining slivers over the chamber where the four tubes meet. Sheet `wip/bug-259/sheet.jpg`.
- 2026-11-24 slice 2 (items 1, 4). Pad: an underground junction's ring is its legs' own pavement (no fillet, no straight back chord; two legs still overlapping at their mouths share one chord), so the bore floor's 3 m gravel shoulder runs round the chamber. Worst ring point past a lane edge 1.57 / 7.29 / 4.37 m → 0.00 (1960791808; 2280440363 (−52, 29), (19, −42)); the 8 underground Ts 0.00; collider vs drawn pad 0.00 cm. Roof: the lines were each tube's R run-on standing proud where it crossed another tube's wall. Partner legs (most nearly opposite, > 135°) now meet on the bisecting plane (`tubeMiterPlane`): each tube is cut past it, each bore volume is its span + run-on on its own side. Rays seeing a lining past its plane 16 / 130 / 71 of 2000 → 0. Not fixed: seed 94567479's T bore shade 0.74 (slice-1 census, a portal near the node).
- Residual (lighting, not geometry; a headless ray-cast of the linings shows them closed, vertex shade 0.20-0.25 throughout): one faint seam line at 1960791808's through/cross miter, and the lit right wall at 2280440363 (19, −42) (present on main too); both look like direct sun reaching the lining through the shadow maps. Freecam shots with the truck parked away exaggerate both (the near shadow box follows the truck). Sheet `wip/bug-259/sheet-2.jpg`.
- 2026-11-24 evening, owner in chat: "one more thing for the tunnel fix. a lot of the road surface inside the tunnels is covered by ground texure / there is z fighting. make an effort to clean that up too". Added as slice 3; no seed given, so the lane censuses tunnels on random seeds for terrain at or above the ribbon inside a bore.

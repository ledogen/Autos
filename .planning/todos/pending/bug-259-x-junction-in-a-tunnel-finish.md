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
A world-gen lane (Opus), after BUG-234 lands. Reproduce on seed 1960791808 and the BUG-234 drive site (seed 2280440363 at 19, −42).

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
- [ ] The downhill leg's end dip measured and fixed (or ticketed apart if it is a profile bug)
- [ ] No terrain through the ribbon at the X
- [ ] Roof sections miter
- [ ] No earthwork above an underground X; earthwork only near portals
- [ ] Owner's drive

## Decisions
- 2026-11-24, owner: "There should be no earthwork at the intersection. There should only be earthwork near the portals."

## Files
`src/road.js`

## Log
- 2026-11-24: opened from the owner's answer on card bug234-built-drive.

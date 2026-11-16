---
id: BUG-179
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "two legs diverge in elevation rapidly and there is a tear at the interface"
relates: BUG-171, src/road.js, src/road-mesh.js
---
lane: unplaced

# BUG-179: Two road legs diverge in height quickly and the surface tears where they meet

## Next steps
A world-gen lane (Opus) reproduces it from the capture, finds which two legs disagree and why, and says whether it
shares a root with BUG-171 (junction limb ground steps). No fix chosen yet.

## Summary
At one place on seed 1684703087 two road legs leave each other with rapidly different elevations, and there is a
visible tear along the line where their surfaces meet. The owner marked the spot with an in-game capture.

## Description
Owner's capture: `Logs/autos-capture-1794791342440.json` (place capture, free roam, quality Normal, freecam).

- Seed `1684703087`. Mark at x −270.19, z 158.38. Capture region x −370…−170, z 58…258.
- At the mark the game reported: on road, run `g:-1,-1,0:-1,0,0`, arc length 1404.85 m, road grade height
  188.19 m, ground height 188.67 m (0.48 m above the grade), camber 0.053, centreline radius within design.

`node test/replay.mjs Logs/autos-capture-1794791342440.json` on main (2026-11-15):
- REPRODUCED: the headless road equals the game's road at the mark (all six fields match).
- Surface window-invariance over the region: identical across stream centres (347 on-road points, worst grade
  difference 0.000 m). So this is not a streaming artifact; the generated geometry itself has the tear.
- Fold metric at the mark: centreline radius within the design minimum. Not a fold.

Not yet known: which second leg is involved, the size of the height gap along the interface, and whether the tear
is in the drawn mesh only or in the physics ground too (MESH == PHYSICS says both).

## Tracker
- [ ] Reproduced headlessly with the two legs named and the height gap measured along the interface
- [ ] Root cause found; same root as BUG-171 or a separate one, stated
- [ ] Fixed at the root, with a gate or census that fails before and passes after
- [ ] Owner looks at the spot on seed 1684703087

## Links
Capture: `Logs/autos-capture-1794791342440.json`. Possibly related: BUG-171 (deep dive
`.planning/dives/BUG-171-option2-gore-steps.html`); unverified.

## Files
`src/road.js` · `src/road-mesh.js` · `test/replay.mjs`

## Log
- 2026-11-15: minted from the owner's capture. Replay reproduces the road at the mark and shows the surface is
  window-invariant there. No investigation beyond that.

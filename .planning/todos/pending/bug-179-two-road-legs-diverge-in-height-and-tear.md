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
Root found (29a330e7 on `land/bug-179`, worktree CarGame-spare, not landed): the merge plan drops a fork chain at one node. STOPPED for
the owner: card `bug179-fork-chain` (options listed in the branch's ticket log). Say whether it shares a root with BUG-171.

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
- 2026-11-15 (Lane C, read-only, land/bug-171): NOT BUG-171's root. Two legs of one node, `g:-433663,326333,-1:-1,0,0`
  (arc ~230) and the mark's `g:-1,-1,0:-1,0,0` (arc ~1400), run side by side 6.3 m apart (3.17 m each side of the
  seam, decks overlapping) with grades 3.1 m apart (190.48 vs 187.38) ~40 m from the node. The resolver winner flips
  at their equidistance line: a 3.31 m step at (−273.7, 161.9) in one 5 mm move; also 0.56 / 0.29 m steps inside the
  pad with no winner or rival change. All three identical on main, option 2 and the BUG-171 foot fix (±8 m lines in 4 directions).
- 2026-11-15: minted from the owner's capture. Replay reproduces the road at the mark and shows the surface is
  window-invariant there. No investigation beyond that.

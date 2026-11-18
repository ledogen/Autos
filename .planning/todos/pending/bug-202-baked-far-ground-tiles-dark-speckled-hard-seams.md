---
id: BUG-202
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I switched on ultra to check out the shadows ... When I did that and started flying around I saw a bunch of what looked for broken baked textures. You can only get this close to them in FreeCam because when you teleport the car there, it live streams the full resolution texture and the glitches go away. In the boundary is even more noticeable."
relates: PERF-48, DEC-207, DEC-234, DEC-073, src/terrain-bake.js, src/terrain.js
---
lane: Perf

# BUG-202: Baked far ground shows dark speckled tiles with hard seams

## Next steps
Perf lane (Opus): reproduce from the capture on Ultra, name what the dark tiles are, fix at the root, show before/after.

## Summary
On Ultra, far ground drawn from the terrain bake (the pre-rendered ground image used beyond ~70 m from the truck,
DEC-207) shows rectangular tiles that are much darker and speckled, with straight hard edges against their
neighbours, and grass/sand colour that does not line up across tile boundaries. Teleporting the truck there swaps
in the live ground shader and the glitches go away.

## Description
Capture: `Logs/autos-capture-1794958847788.json` (place capture; seed 3885818179; mark x −173.5, z 258.7; the stream
centre, i.e. the truck, was near x −620…−632, z 345…357, so the mark is about 450 m from the truck, seen from the
freecam). Owner's screenshot: `wip/orch/bug-202-owner-screenshot.png` in the main checkout (git-invisible).

What the screenshot shows: several axis-aligned rectangular patches, tens of metres on a side, darker than the
ground around them and covered in a fine dark speckle; their edges are straight lines; one edge runs along the
boundary of a terrain shadow. Elsewhere the grass/sand split steps sideways at a tile edge.

Not known: whether this is Ultra only (he had just switched tier in the session: a tier switch may leave tiles baked
under the old settings, or bake them at a different resolution), whether the dark tiles are a different bake
resolution level, a tile baked with a shadow or lighting term in it, a tile whose bake never finished or was read
before it was written, or a mip level problem (mip levels: the smaller pre-shrunk copies of a texture the GPU uses
at a distance). Whether a player can see it from the truck on any tier, or only from the freecam.

The owner also noted visible shadow pop-in on Ultra and judged it far enough away to be fine: not part of this ticket.

## Tracker
- [ ] Reproduced from the capture; the dark tiles named (which bake level / state) and measured
- [ ] Known whether it is visible from the truck (chase camera) on Normal, High, Ultra, or freecam only
- [ ] Known whether a tier switch mid-session causes it
- [ ] Fixed at the root, with a headless or browser check that fails before and passes after
- [ ] Before/after screenshots for the owner, from his capture's viewpoint

## Decisions
- 2026-11-17, owner: reported as above.

## Files
`src/terrain-bake.js` · `src/terrain.js`

## Log
- 2026-11-17: minted by the orchestrator from the owner's capture and screenshot.

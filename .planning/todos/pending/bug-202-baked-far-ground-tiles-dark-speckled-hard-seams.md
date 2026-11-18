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
Owner look at `wip/bug-202/sheet.jpg` (owed card bug202-bake-tiles-look), then land `land/bug-202-bake-tiles`. Owed after
landing: an Ultra GPU A/B on a quiet machine (the fix puts the ground past ±6 chunks back on the live shader on High/Ultra).

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

**Finding (2026-11-17, Perf lane).** The dark tiles were other chunks' ground. The bake atlas (one 3072² texture
holding the baked ground) has 12 × 12 tiles and is toroidal: chunk (cx, cz) always writes to tile (cx mod 12, cz mod 12),
so every chunk 12 apart shares a tile. The header assumed the chunk ring is at most 11 across; that stopped being
true when High/Ultra got deep warm rings: the chunk map holds ring + warm + keep margin = 2·(3+3+1)+1 = 15 chunks
across on High and 2·(4+4+1)+1 = 19 on Ultra. Both chunks of a pair were drawn from the same tile, and the one baked
last won: grey scree from a chunk 768 m away pasted onto grass, its normals with it (the dark, speckled shading), hard
straight seams at the 64 m chunk edges, and the sand/grass line jumping sideways at a tile edge. Readout (per chunk:
material + atlas slot, in-browser): Ultra 104–107 slots drawn by 2–4 chunks each, High 32–39, Normal 0. Starting on
Ultra and switching Normal → Ultra in-session are the same (the switch re-bakes everything; the tier switch is not the
cause, Ultra's ring is). Not a shadow, mip or bleed fault: the edge along a terrain shadow was a coincidence.
**From the truck:** on Ultra the shared tiles start 3 chunks from the truck's chunk (≈ 170–220 m; the fog there is
≈ 15 %), on High 5 chunks (≈ 300 m, fog ≈ 50 %), so a player sees them wherever the truck has an open view that far.
Not freecam-only. (The two truck-eye spots tried at the capture's truck were walled in by trees and rock: no picture.)
**Fix** (`src/terrain-bake.js`): only chunks inside the 12-chunk window around the stream centre ([c − 6, c + 5], the
prop-shadow atlas's window) are baked; the rest keep the live shader. The bake state is now keyed by atlas slot
(which chunk's pixels the tile holds), so a chunk coming back into the window never trusts a tile overwritten while it
was out. Normal: no change (its 9-chunk ring is inside the window). **Cost:** VRAM unchanged (same atlases); bake work
smaller (≤ 144 tiles, was every chunk); GPU: chunks past ±6 chunks (≥ ≈ 350 m) run the live shader on High (36 of 180
chunks) and Ultra (164 of 308). Not benched (machine shared): owed. Lever if Ultra wants the far bake back: size the
atlas per tier (Ultra 17 tiles → ≈ 200 MB of VRAM instead of 100 MB).

## Tracker
- [x] Reproduced from the capture; the dark tiles named (which bake level / state) and measured
- [x] Known whether it is visible from the truck (chase camera) on Normal, High, Ultra, or freecam only
- [x] Known whether a tier switch mid-session causes it
- [x] Fixed at the root, with a headless or browser check that fails before and passes after
- [x] Before/after screenshots for the owner, from his capture's viewpoint
- [ ] Owner look (sheet) and landing
- [ ] Ultra GPU A/B (active cycles) on a quiet machine

## Decisions
- 2026-11-17, owner: reported as above.
- 2026-11-17, owner IDEA (not a ruling): "one change that could potentially help fix this problem is if we move texture
  streaming to the chase camera instead of leaving it at the truck." Evaluated: chunk, road and prop streaming already
  follow the active camera (roadStreamCenter: the freecam in freecam, else the truck; the chunk colliders ride on the same
  ring); only the bake's 70 m live/baked band follows the truck. The chase camera (and the opening shot, a 16 m orbit)
  sits within metres of the truck, so it changes nothing in play. It would not have fixed this: the wrong tiles sat
  170 m+ from the stream centre on Ultra, where the bake is legitimately shown; following the camera would only hide
  them from a freecam hovering low. Recommendation: do not build it; the slot fix removes the defect at every distance.

## Files
`src/terrain-bake.js` · `src/main.js` (call site) · `test/terrain-bake-slots.mjs` · `test/gates.mjs`

## Log
- 2026-11-17: minted by the orchestrator from the owner's capture and screenshot.
- 2026-11-17: Perf lane. Cause: toroidal atlas slots shared on High/Ultra. Fix f982c97a (bake window + slot-keyed state);
  gate `terrain-bake-slots` (FAIL 217/361 chunks wrong before, PASS after); affected 11/11 green; gpu-reset PASS (ground
  comes back; the impostor-atlas count is noisy on old and new). Sheet wip/bug-202/sheet.jpg. Unbenched: Ultra GPU.

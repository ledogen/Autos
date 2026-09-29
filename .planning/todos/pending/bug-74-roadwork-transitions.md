---
id: BUG-74
type: bug
status: open
severity: minor
opened: 2026-09-27
source: owner, seed w (197, 616) place capture, after the FEAT-84 pass 15 fill-as-dirt fix ("still looks bad to me")
relates: FEAT-84 (surface rules), D-07/D-10 (road cut/fill carve zones), BUG-75 (grid seams — a different line)
---

# BUG-74: roadwork transitions — the shoulder→ground edge is a seam right under the player

## What the owner sees

Roadwork always travels with the road, so the fill skirt / cut face → surrounding ground transition
is always in the driver's near field, where a line is easy to read. At (197, 616) on seed w the fill
embankment (dirt) meets rock: even with fill behaving as natural dirt and the biome dither on, the
edge reads as a seam, not as gravel that has spilled out of a gravel bed.

## What it should look like

An overspill: the shoulder material thinning out into the surroundings over a wide, noisy, uneven
front — density falling off, not a colour crossfade and not a line. Think a gravel bed's edge.

## Constraint from the owner

"I'm trying to avoid engineering it into a ton of rules stacked on rules." One mechanism, not
another exemption. Candidates, cheapest first:
- Feed the carve weight (`aSurf.w`, signed) through the SAME dither the rock share gets, with a
  wider/lower-frequency field, so the skirt's classification edge is ragged over ~10 m.
- Widen the carve feather for the SURFACE weights only (geometry keeps its feather): the vertex
  writer could use a softened `blendW` (e.g. `smoothstep` over a longer distance from the road)
  for `sDirt/sRock`.
- Or drop the fill-zone surface override entirely (fill takes the natural biome weights, geometry
  unchanged) — then the skirt IS the surrounding ground and there is no edge to hide.

## 2026-09-27 — first mechanism in, owner to judge

The seam under the player is the ROAD MESH's own smooth shoulder lip (roadDirtColor) meeting
textured terrain. One rule added, replacing none: on a FILL embankment the dirt relief and the
grey stones ramp in with the carve feather — smooth at the pavement (matching the lip), full
texture where the feather ends (`ts_fill = max(aSurf.w, 0)` in the FEAT-84 block). The lip
edge is gone; what remains at seed w (197, 616) is the tan→rock front, softened by the biome
dither. If it still reads as a band, the next lever is the same dither applied to the carve
weight itself (wider field), not a new zone rule.

## 2026-09-27 (evening) — second class: the cut/fill crossover

Owner's frame (seed 1666428418, (−1391, −536)): the grey scree of a road CUT stopped dead along
the road where the cut became fill — scree → tan skirt on one side, scree → grass on the other,
a transverse line. Cause: the vertex writer classified the carve zone by SIGN (`isFill = delta >
0`), so one centimetre of cut was full broken rock (rock share 1, rock albedo forced, cutout
colour, exempt from dither/stones/green) against one centimetre of fill as dirt.

Fix — the same single mechanism extended, no new rule: cut-ness is continuous with DEPTH,
`cutness = smooth(0, roadCutRockDepth, −delta)` (1.5 m). Rock share, cutout colour and the signed
carve weight (`aSurf.w = blend × (1 − 2·cutness)`) all follow it, so the scree ramps in along the
road as the excavation deepens, fades toward its daylight line, and a shallow scrape is dirt like
a fill. Overhead at the spot: scree → tan → green as a graded band. Both classes now have the one
mechanism; owner to judge in play.

## 2026-09-28 — owner: "still starts abruptly … not sure the complexity was worth it … just fade it"

Ruled and done: the CUT no longer has rules of its own. The set of exemptions a cut carried (own
cutout colour kept, rock albedo forced, no dither, no stones, no under-rock green) was itself the
edge — each switched on at cutness 0.5. Deleted (`ts_cut` gone from the shader). A cut is now
ground whose rock share rises with excavation depth (`cutness`, `roadCutRockDepth` 1.5 → **4 m**,
slider "Cut rock depth (m)"), and the ORDINARY rock rules do the rest: coverage s^γ with the biome
dither (shallow cut → low share → the fragments sink under the dirt — the "height wiring" the
owner asked for), grey rock, stones, inclination-gated green. Fill keeps its one rule (texture
ramps in with the feather). Net: fewer rules than before this bug was filed. Cut faces lose their
green stripes (steep = bare, the pass-11 ruling); the cutout colour only shows through where rock
does not win. Owner to judge in play; the knob is the depth.

## 2026-09-28 — RULING: all of it reverted except the dither

Owner: "didn't work. revert all attempts at smoothing the transition except dithering." Reverted
in the code (the ticket history above stays as the record of what was tried):
- signed carve weight / fill-as-dirt (pass 15, `5f5ff4a`),
- fill relief + stones ramping with the carve feather (`880e7a4`, the BUG-74 part only),
- cut-ness continuous with depth (`45b768b`), the cut-rule deletion and `roadCutRockDepth`
  (`2fdde36`).
Kept: the biome dither (`a161026`, defaults 0.5 / 0.3), and the unrelated fixes from the same
commits (BUG-75 border normals, QUAL-32 matte terrain, BUG-73 in-place attributes).

State now: `aSurf.w` = unsigned carve weight; cut = rock 1 + cutout colour + rock albedo forced,
fill = dirt 1 + fill colour; engineered zones exempt from the rock mix, dither, stones and the
under-rock green (all × (1 − w)); `isFill = delta > 0`. The roadwork seam is as it was at the
dither commit. OPEN — next attempt should be a different idea, not another rule on the carve
weight; the owner's own suggestions were "blur it or fade it" and "use the height wiring to bring
the rocks below the dirt" (i.e. make the transition happen in the height contest, not in colour).

## 2026-09-28 (later) — the CUT "gravel seam": the bench was classified by a sign test

Owner: fix the "gravel seams under roads at earthwork cut sections". Probed (headless
`_sampleCarveWorld` across the section; scratchpad `probe-cut.mjs`), three spots:

| spot | cut-side bench (5–8 m) | sign flip | wall |
|---|---|---|---|
| seed 6 (427,−82) case 22 | cut −1.3…−3.5 m | at 4.2 m, UNDER the asphalt | 3.5 m rise |
| seed 6 (−40,192) case 25 | FILL +2.1…+0.4 m | at 8.0 m — exactly the core edge | 2.8 m rise |
| seed 1666428418 (−1391,−536) | FILL +0.7…+0.1 m | at 9 m in the ramp | a 0.5 m scrape |

The carve holds a flat 3 m bench at road grade beside the asphalt (`carveHalfWidth` 8 vs ribbon
5). `_writeChunkVertexColors` classified every carve-zone vertex by `isFill = grade − raw > 0`,
so on that flat bench the tan-vs-rock decision was whether the raw hill happened to sit a few cm
above or below grade: case 25 = a tan bench with a hard line to a rock-1 wall at 8 m; case 22 = a
≤1 m tan interpolation strip (+ the tan road-mesh skirt) against a rock bench; the scrape = a full
scree wall for 0.5 m of excavation. That strip is a classification artefact, not the ground.

First cut keyed rock on the carved bank's STEEPNESS (bench = dirt both sides, wall → rock).
It removed the strip but also the rock bench — owner: "I kinda liked how there was gravel fill
that the road was built on top of, kinda like railroads … bring back the rock texture at cuts
but do a better job of blending the edge." So, what shipped:

**Fix (one driver replacing the sign test; `vSurf.w` stays unsigned, exemptions untouched):**
cut-ness = `smooth(−F, F, −delta)` with `roadCutRockFade` F = 2 m (slider "Cut Rock Fade (m)",
Road Surface) — half rock exactly where the grade meets the raw hill, full ballast once the road
sits F into it, shoulder dirt once it rides F up on fill. The fade spans 2F of depth in every
direction (across the section AND along the road at a crossover) and the biome dither rags the
front. Vertex colour = fill → cutout by cut-ness; rock share = cut-ness. Differs from the reverted
depth ramp (`45b768b`) in being CENTRED on the crossover (that one switched on AT the line) and in
moving nothing else.

**The strip itself was the shader, not the writer:** experiment (terrain material hidden → no
strip; ribbons alone → none) proved it terrain. The local-colouring rule `ts_gain` (dirt winning
texels over its vertex weight → pull toward `uColDirt`, a saturated orange-brown) was the ONE
zone rule without `× (1 − vSurf.w)`; the mixed rock/dirt band of a cut (the 1 m interpolation band
under the sign test, the whole fade now) went orange. Exempted like the others — one token.

Also: the road mesh's 0.15 m skirt face takes the same fade (dirt → cutout by `delta` at the edge
vertex, raw height via `_terrainRef`, which is now the RAW sampler at BOTH construction sites in
main.js — the seed-rebuild one passed `analyticHeight`, unused until now). Invisible from the
road (FrontSide), matches the bench from outside.

Result (scratchpad `shots/before` → `after4`): case 22 grades straight from asphalt into the rock
bench, no strip; case 25 keeps the ballast bench, ragged fade into the shoulder, no orange; the
0.5 m scrape is a gravel spill fading along the road, not a scree wall; pass walls unchanged.
**Class 1 (fill skirt toe vs natural rock ground, seed w) is NOT touched** — still open. Owner to
judge in play.

## Acceptance

- At the capture spot, driver's-eye and 30 m overhead: no continuous line between the skirt and
  the ground; the shoulder material fades out over ≥ 8 m with a ragged front.
- Cut walls unchanged. No new per-zone rule in the shader beyond the one mechanism chosen.

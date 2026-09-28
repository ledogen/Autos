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

## Acceptance

- At the capture spot, driver's-eye and 30 m overhead: no continuous line between the skirt and
  the ground; the shoulder material fades out over ≥ 8 m with a ragged front.
- Cut walls unchanged. No new per-zone rule in the shader beyond the one mechanism chosen.

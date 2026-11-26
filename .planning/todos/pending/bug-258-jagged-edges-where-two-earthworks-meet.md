---
id: BUG-258
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 — "Make a new ticket for smoothing out jagged edges and terrain and use these locations as an example of where there are jagged edges. another example is here: 3435846510 -2835 670. I've been noticing these for a while and it bothers me. It seems like they appear sometimes just at really sharp crests that generate naturally, but mostly from the intersection of two different earthworks"
relates: BUG-64, BUG-130, FEAT-77, src/terrain-height.js, src/road.js, src/water.js
---
lane: engine & world

# BUG-258: Jagged terrain edges where two earthworks meet

## Next steps
(A) the bank-cliff fix is BUILT on `land/bug-258-bank-cliff` (worktree `CarGame-bug258a`), gate `junction-bank-cliff` green;
landing waits on the affected gates (`node test/run-all.mjs --serial --changed=src/road.js,test/junction-bank-cliff.mjs,test/gates.mjs,test/bug258-crease-census.mjs`)
and `fingerprint-world` vs main. Then owner: (B) rounded natural ridges is undecided — he asked for a better sheet.

## Summary
A jagged edge is a CREASE (the slope jumps across a line) or a STEP (the ground jumps) that the 1 m terrain mesh
draws as a zigzag. Measured over 200 random worlds, most crease length is natural: the ridged noise makes true knife
ridges. Where two earthworks meet, the worst cases are a junction bank cut off standing (a cliff of up to ~3 m) and
a switchback's two fills meeting in a hard max. A road's own bank and the stream channels are tighter than the 1 m
mesh can draw, and none of the proposed fixes touches those.

## Description

### How it was measured (2026-11-24, main 012d3dcc)
`test/bug258-crease-census.mjs` (a rainy-day script, not a gate) samples the composed ground on the mesh's own grid:
integer metres, every cell split along (x, z+1)–(x+1, z) as `THREE.PlaneGeometry` does. A **crease** is a mesh edge
whose two triangles' normals differ by ≥ 12° (the dihedral angle). Connected crease edges form one segment (its
length = its extent). A **step** is a segment where the function itself jumps > 0.5 m within 0.1 m. Each crease edge
is classed by the source it disappears without: the raw ground already has it (natural); the POI bench, a junction pad,
the stream carve, or the road union's rivals switched off moves it by > 40 %; otherwise it belongs to one road's own
cross-section. The census covers 200 random seeds (`wip/bug-258/seeds.txt`; seed 6 excluded), the player's story
region (spawnDecision, region roads + POIs, streams carved). It samples 30 random 64 m chunks that a road's earthwork can
reach plus 10 of the rest, and scales each stratum to the 2500 m region.

### Census (200 random worlds, per world)
All creases are ≥ 12°. "All" counts segments ≥ 3 m long. "Sharp" counts segments ≥ 10 m long whose worst edge is ≥ 30°,
over the whole region; "near roads" restricts "sharp" to the chunks a road's earthwork reaches. km = metres of crease
per world. The region is 19.6 km².

| cause | all: km / share | sharp: km / share | sharp near roads: km / share | worst edge median / p90 | length median / p90 |
|---|---|---|---|---|---|
| natural knife ridge | 289 / 66 % | 208 / 82 % | 78 / 72 % | 43° / 66° | 29 / 68 m |
| stream channel | 59 / 13 % | 21 / 8 % | 7.1 / 7 % | 37° / 59° | 19 / 44 m |
| one road's own bank (beyond 10.5 m) | 38 / 9 % | 13 / 5 % | 13 / 12 % | 39° / 59° | 22 / 51 m |
| one road's core edge / cut foot (≤ 10.5 m) | 41 / 9 % | 3.2 / 1 % | 3.2 / 3 % | 38° / 63° | 20 / 57 m |
| **two earthworks**: road × road union | 7.5 / 2 % | 3.0 / 1 % | 3.0 / 3 % | 41° / 64° | 18 / 37 m |
| **two earthworks**: road × stream, road × POI bench, junction pad | 3.1 / 1 % | 1.0 / 0.4 % | 1.0 / 1 % | 45° / 67° | 24 / 45 m |
| **step**: junction bank cut off at the 36 m footprint | 0.76 / 0.2 % (27 per world) | 0.74 | 0.74 / 1 % | 68° / 90° | 26 / 53 m |
| **step**: other (switchback flips, carve-path handovers) | 2.2 / 0.5 % (76 per world) | 2.2 | 2.2 / 2 % | 100° / 125° | 28 / 52 m |

So two earthworks meeting (union + road × other + the footprint cliff) are 4–5 % of the sharp creases near roads.
They are among the sharpest, though, and the two steps are the only edges where the ground actually jumps.

### What makes each edge (numbers from the example sites)
1. **Natural knife ridges (the largest share).** `coarseHeight` takes `1 − |n|` per octave. That is a true crease where
   `n = 0`, at every scale: at 1 cm sampling the slope still jumps 22.8° | −23.5° (46°) at the owner's site (−2818, 696).
   This is not under-sampling. Octave 3 (250 m wavelength) is at n = 0.0005 there. Where one simplex kernel dominates,
   the zero line is STRAIGHT and often axis-aligned (x ≈ −2823 runs N–S for 120 m). That looks man-made: a knife ridge that
   reads like an earthwork edge. At the owner's site (±48 m): natural creases of 46–72°, 50–140 m long. Its road (at
   x ≈ −2790) contributes only 15–19° cut-foot creases. The other feature there is a pond basin. Ponds do not carve the ground.
2. **A junction bank cut off standing (a step).** Near a junction `_carveCrossSection` widens the core by `jc.widen`, which
   also pushes the toe cap (`carveHalfWidth + maxEmbankmentToe + DEEP_BANK_TOE_EXTRA`) past the resolver's footprint
   (`_resolveFootHW()` = 36 m). The resolver stops at 36 m while the bank still has weight 0.15. So the fill ends in a
   cliff: 3.03 m at seed 308883464 (−557, 163), 38 m long; 1.76 m at seed 81975313 (−2030, 418), where it meets a stream.
3. **Two earthworks meeting in a hard max/min.** `_carveCrossSectionBlended` unions fills by max and cuts by min. Where
   one bank takes over from the other, the slope jumps by the difference of their slopes. At the switchback, seed
   1946683182 (−1247, 1200), two passes of one run (fills 9.15 / 9.24 m) cross: the slope goes 0.04 → 1.53 (a 55° jump),
   33 m long.
4. **One road's own bank.** It is C1 in the maths: the smoothstep weight has zero slope at the core edge (8 m). But its
   curvature there is 6·depth/ramp², about 0.5 /m for a 5 m cut. That is a ~2 m fillet the 1 m mesh draws at 15–23°.
   The bank creases further out sit where the toe cap engages.
5. **Stream channels.** The bank weight is linear (C0 at the lip and at the top of the bank), and the channel is narrow
   for its depth. A smoothstep bank (prototype `streamBankSmooth`) did not help: 181 → 176 m at seed 81975313.
6. **Other steps** (switchback arm flips, the BUG-130 family; a leg-carve vs junction-carve handover, e.g. seed 465737683
   (689, 186), 7.5 m) are separate sources, and none of the fixes below touches them.

### Fixes prototyped (proto branch, each param-gated and off by default)
| | change (one place, MESH == PHYSICS by construction) | measured | moves | cost |
|---|---|---|---|---|
| (A) `carveToeInFoot` | `toeExt = min(toeExt, _resolveFootHW())` in `_carveCrossSection`: the bank's weight reaches 0 inside the resolver's footprint | seed 308883464: the 3 m cliff (48 m of step) → none | ground ≤ 4.2 m where the cliff stood; deck 0.000 m | one `min` per sample: 0 (estimated) |
| (B) `ridgeRoundM` | `\|n\|` → `sqrt(n² + ε²)` in `coarseHeight`, with ε = ridgeRoundM · freq · 3 per octave (the ridge is rounded over ~ridgeRoundM metres) | owner's site: natural creases 287 m → 7 m, worst 55° → 13° (4 m). Seed 292410072: 74° → 21° (4 m is short of a 74° jump: ~6 m) | ridge tops ≤ 2.8 m lower (4 m); ≤ 1 cm elsewhere; **routes and the water network re-derive** (a new stream at sites 1 and 4) | raw height 1.65–2.4 ms per 4225-sample chunk either way: not measurable (measured) |
| (C) `carveUnionBlendM` | the takeover in `_carveCrossSectionBlended` blends over k m of height (`_blendMax`: equal where the banks meet, exact max once they differ by k, k → 0 at the shoulder) | switchback: the 44° crease gone at k = 6, but the site's union creases total 132 → 147 m; k = 10 makes new ones | off-deck ≤ 1.7 m, deck 0.000 m | a few flops per rival per sample: < 1 % of the 2.9 µs carve sample (estimated) |

What none of them fixes: one road's own bank fillets, stream channels, the other steps, and any crease where two
sources merely coincide. A mesh-side fix (flip each cell's diagonal to follow the crease) would cover every source.
It is fenced: Box3D's heightfield has a fixed split, so MESH == PHYSICS (DEC-069) would break by up to ~0.3 m at a crease.

### Fences (decision records)
- DEC-260 (fix by construction, never averaged away): (A)–(C) change the defining functions, so the ground is C1 by
  construction. A smoothing or blur pass over the heightfield would violate it.
- DEC-069 (MESH == PHYSICS): holds. `height()` is the one function for the Worker, the main thread and the headless
  gates, and the carve functions are shared by `_sampleCarveWorld` and `_buildCarveTable`.
- DEC-065 (no longitudinal grade smoother): untouched. Nothing here touches a road's profile, and the deck moved 0.000 m in every A/B.
- `ridgeSharpness` 1.6 is the "P7-3 calibrated lock" terrain character. (B) changes the raw world, so routes and streams
  move. That is the owner's call.
- The POI pad / driveway carve (another lane, in flight) is not touched by any of the three.

## Tracker
- [x] Reproduce at the owner's site and the BUG-64 sites; name the cause of each edge (2026-11-24)
- [x] Census over random seeds: how often, how tall (200 worlds, 2026-11-24)
- [x] Fix proposed to the owner with screenshot sheets (MESH == PHYSICS holds) — card `bug258-jagged-pick`
- [x] (A) bank-cliff fix built as code, gate `junction-bank-cliff` (2026-11-24)
- [ ] (A) affected gates green + fingerprint-world vs main, landed
- [ ] (B) decided on a better sheet (owner)

## Decisions
- 2026-11-24, owner (card bug258-jagged-pick): "2. Build (A) only: the bank-cliff fix, no change to the raw world" — "start with A since its a pure bug fix and put it on main."
- 2026-11-24, owner: BUG-64 closes; overlap walls stay in FEAT-77; this ticket covers the jagged edges, with BUG-64's sites as examples.

## Open questions
- (B): build or not, on a better sheet. (C) not picked.
- (B) changes the raw world (ridge tops ≤ 2.8 m lower; routes and streams re-derive). Acceptable for "rounder ridges"?

## Links
Sheet `wip/bug-258/sheet.jpg` (worktree `/Users/ledogen/CodeShit/CarGame-bug258`, git-invisible). Census logs
`wip/bug-258/census-{a,b}.jsonl`. Tools: `wip/bug-258/{ab,transect,shade,ridge,cost,shots,sheet}.mjs`. Census and
summary: `node test/bug258-crease-census.mjs census|site|summary`.

## Files
`src/road.js` (`_carveCrossSection` toe cap: (A)) · `test/junction-bank-cliff.mjs` (gate) · `src/terrain-height.js` (`coarseHeight`) · `src/road.js` (`_carveCrossSection`, `_carveCrossSectionBlended`,
`_resolveFootHW`) · `src/water.js` (`streamCarveSample`) · `test/bug258-crease-census.mjs`

## Log
- 2026-11-24: opened from the owner's answer on card bug64-walls-pick.
- 2026-11-24: measured (lane p, branch proto/bug-258-jagged-edges): census of 200 random worlds, 6 sites sheeted
  before/after. Prototypes are param-gated and off, so main's behaviour is unchanged. No gates run, nothing for landing.
- 2026-11-24: (A) built (lane p, `land/bug-258-bank-cliff`): `toeExt` capped at `_resolveFootHW()`, no param. Gate
  `junction-bank-cliff` (3 story regions, every junction leg): main 45 / 61 / 46 cliffs, worst 6.41 / 5.67 / 6.35 m
  (3.20 m at (−557, 163)) → 0; deck 0.000 m. Affected gates + fingerprint held at the orchestrator's word (owner playing).
- 2026-11-25: fix (A) looked at, "All good". (B) picked at 4 m (DEC-502): landing branch next.

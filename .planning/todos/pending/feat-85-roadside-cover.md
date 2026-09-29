---
id: FEAT-85
type: feature
status: in-progress
severity: minor
opened: 2026-09-22
source: owner request 2026-09-22 ("some sort of grass or bush that will decorate the shoulders of the road where the terrain is green … road maintenance beats back the brush to the edge of the shoulder where it comes up like a wall")
relates: FEAT-06 (prop system — this is a new instanced layer in it), PERF-21 (impostor LOD — the distance-fade here is the cheaper cousin), FEAT-84 (surface textures, built alongside), FEAT-72 (road furniture — same "placed from road geometry" family), ART-STYLE.md rule 7 (no cutout foliage — honoured, not excepted)
branch: feature/roadside-cover (worktree CarGame-roadside-cover, :3754)
---

# FEAT-85: Roadside cover — grass tufts + woody brush along the shoulders, and sparse on all green ground

## Request

Off the shoulder there was nothing but round bushes and trees. The owner wants a grass/brush
cover that (a) stands as a beaten-back **wall** at the shoulder edge — the thing the player sees
most — and (b) is present more or less everywhere the ground is green, so the wall does not look
painted on.

## Rulings (owner, 2026-09-22)

- **Opaque geometry clumps**, not alpha-tested cards. Blades are solid tapered strips, brush is
  stems + diamond leaf cards. ART-STYLE.md rule 7 (no cutout foliage) holds; nothing here has alpha.
- **Composition:** mixed — grass tufts 0.4–0.8 m and woody brush 1.0–1.6 m.
- **Beat-back:** 1–4 m from the pavement edge, **and the wall must not be a perfectly aligned
  thing** — the beat-back distance wanders as a noise field along the road, with a *different*
  noise field governing the backcountry density.
- **Wind:** yes, subtle, a slider.
- **Coverage:** road-edge wall + sparse everywhere green, quality-tier gated (off on Low).

## What shipped (this branch)

- Geometry `prop-geometry.js` — three Eastern Sierra natives (owner's second pass, 2026-09-22):
  `makeGrassClump` = Indian ricegrass (fine wiry blades + airy straw seed stalks, 0.32–0.64 m,
  ~40 tris), `makeRyeClump` = Great Basin wild rye (broad arching blue-green blades + tall seed
  spikes, 1.2–1.9 m, ~70 tris), `makeSageClump` = big sagebrush (gnarled arching stems with crowns
  of small grey-green leaf cards, 0.8–1.4 m, ~85 tris). Vertex colours base → tip, `aSway`
  (0 root → 1 tip; rye 0.8×, sage 0.35×). The physics `bush` blob is untouched.
- Palette `prop-palette.js`: `grass`/`rye`/`sage` variants baked AFTER every existing category
  (older variants byte-identical), `COVER_CATS`, and `buildCoverMaterial` — Lambert DoubleSide with a
  vertex patch: **distance fade** (each instance shrinks toward its root between `fadeStart` and
  `fadeEnd`, so past the window it costs zero fragments) and **wind** (position-keyed phase +
  gust, amplitude × `aSway`).
- Scatter `prop-scatter.js` `coverPass` — LAST pass, additive:
  - *Wall:* `samplers.roadWalk(cx, cz, step)` (new `RoadSystem.walkTileRoads`) hands over the per-
    tile road slices of the 3×3 tiles, sampled every 0.9 m with tangent, run-arc `arcS` and a bore
    flag. Per sample and side: beat-back = 1–4 m by 1-D value noise over `arcS` (~22 m wavelength,
    per side), `wallRows` (4) candidates spread across a 2.2 m band behind the inner face, a slower
    field (~55 m) sets hedge-vs-verge (the tall share, split rye/sage by `sageFrac`). A candidate
    belongs to the chunk it LANDS in.
  - *Backcountry:* 640 chunk-rng candidates, kept with probability ground × patchiness (2-D value
    noise ~40 m, bare below 0.38), held off the road by the widest beat-back.
  - Both read `samplers.groundAt` (new `TerrainSystem.groundAt` → {green, rock}, the same slope +
    treeline rules the terrain paints with): ricegrass and sage stand at full density on green and
    at `dirtFrac` (0.3) of it on dirt, wild rye on green only, nothing on rock. Never in ponds/
    streams, on lay-by or junction pads (new `RoadSystem.junctionPadBlocked`), or beside a bore.
  - Every per-candidate draw is seeded by the candidate's WORLD POSITION, so the result does not
    depend on iteration order or on which neighbours' roads were registered.
- `prop-system.js`: cover keys use the cover material, cast no realtime shadow, skip the shadow
  bake, skip the road-intrusion sweep (they stand inside the exclusion on purpose), render in the
  near + far rings (never billboard-only); `setCoverFade` / `setCoverWind`; wind clock in `update`.
- `main.js`: samplers `roadWalk` / `greenAt` / `padBlocked`; tiers write `cover.enabled` +
  `coverFade` (Low off / Normal 60–95 m / High 90–130 / Ultra 110–160) through the impostor sync
  hook. GUI folder "Roadside cover (FEAT-85)" under Props.
- Gate `test/roadside-cover.mjs` (fast): geometry sanity, the band, both sides, chunk ownership,
  wandering inner face, bores/pads bare, determinism + slice-order invariance, additive/green-gated.

### Owner pass 5 (2026-09-23, first drive) — density, cost, LOD

Direction ruled: "I WANT a TON more props … grass blanketing everything … rocks increase on every
quality setting, grass scales with the quality slider … shoulder cover −80 % and sporadic …
distance LOD, it abruptly stops." Built:

- **Wall −80 % + sporadic.** `wallRows` 4 → 2, `wallDensity` 0.9 → 0.55, and a THIRD noise field
  along the arc (`wallPatchFreq` 0.06/m, `wallPatchMin` 0.45) gates whole stretches bare, so the
  remainder stands in clumps with gaps (≈ 0.5 × 0.6 × 0.4 ≈ 12–20 % of pass 4).
- **Backcountry blanket, tier-scaled.** `backAttempts` 640 → 1100 at `density` 1; the tier writes
  `cover.density` (Low 0 / Normal 1 / High 1.6 / Ultra 2.2, `coverDensity` in QUALITY_PRESETS). The
  wall is a road feature and does not scale. `dirtFrac` 0.3 → 0.5 (more ricegrass on dirt slopes).
- **Far-ring LOD (the cost answer).** Chunks in the 'far' prop ring (beyond lodRing) stand cheap
  stand-ins — `grassLo` 3 tris / `ryeLo` 4 / `sageLo` 4 (`_loTuft`, `makeSageLo`) in place of the
  40 / 70 / 85-tri clumps. The swap is a POOL KEY remap in `_placeChunk` (`COVER_FAR_CAT`), so a
  promote/demote re-place moves the clump between pools with the placement untouched; the
  placement list never names a Lo cat. `cover.farLod` toggles it (GUI, rebuild). Budget at Normal:
  9 near chunks × ~600 clumps × 40 = ~220k tris + 16 far × 600 × 3 = ~30k, vs ~600k without.
- **Staggered fade.** Each instance hashes its own fade START inside the window (0–75 % of the
  way to the end), so across the band the cover THINS instead of every clump shrinking in step
  (the "line" the owner saw). Windows widened: Normal 50–110, High 80–150, Ultra 100–190.
- **Ground litter fades too.** `smallRock` + `medRock` render through a second material
  (`groundMaterial`, `FADE_CATS`) — the same shrink at 0.7× the window, no wind, front faces — so a
  pebble costs no fragments past ~75 m and litter no longer stops at the prop-ring edge.
- **Zone rocks + a MEDIUM rock** (in the scatter, not tier-scaled — rocks are what tie the props
  to the bump map): `scatter.zoneRocks` is an additive pass on its own stream, 900 attempts/chunk,
  kept by ground zone (rock 1.0 / dirt 0.35 / grass 0.06 — the terrain's own `groundAt`) × a ~30 m
  patchiness field, split small 58 % / medium 32 % / large 10 %. `medRock` = 0.16–0.36 m blob,
  30–60 % buried, NON-collidable (an engine body per instance × hundreds per rocky chunk is the
  BUG-60 broad-phase ceiling; what stands proud is ground-clearance scale). Large = the collidable
  `rock` class with its full keep-out. Base `smallRocksPerChunk` 30–60 → 60–110 everywhere.
  Sliders: Props → Density → Zone rocks.
- Capacities: smallRock 9k → 30k, rock 3k → 4k, medRock 12k, grassLo/ryeLo/sageLo 80k/10k/14k.
- Gate: the additivity check is now prefix-based (zone rocks append after the legacy passes,
  before the cover, and must all be rock cats).

NOT done, proposed (owner's call): make sagebrush a soft-drag collidable like the `bush` blob
(one line: `collision: {kind:'bush', radius}` in `bakeCover` for sage — the per-frame cost is an
8 m grid-cell lookup, no engine body, so "so many bushes" is a triangle question, not a physics
one). Bushes then scale with the cover density and the far-ring swap like the rest.

### Owner pass 7 (2026-09-24) — the cost, measured, and paid back

Owner: stutters on an unloaded M4 Air "due to prop generation"; intent was a negligible cost.
`test/bench-scatter.mjs` (new; real road + headless terrain, the game's sampler set, ring-2 window):

| per chunk, seed 6 / 42 | mean ms | what it was |
|---|---|---|
| main-equivalent densities | ~2 (first-chunk JIT outlier excluded) | |
| pass 5 as first built | 26.7 / — | roadClear 59 % (1246 `queryNearest`/chunk), groundAt 30 % (1378 × 5 terrain samples) |
| after this pass | 5.4 / 3.7 | roadClear 82 / 52, groundAt 289 |

What paid it back (all in `litterPasses`, prop-scatter.js):
- **Ground grid**: `groundAt` on 4 m nodes (289/chunk), bilinear for the green/rock/slope
  decision; a clump that stands takes one exact `heightAt`. Was one groundAt per candidate.
- **Road grid**: the walk slices (1.8 m) bucketed into 12 m cells; a litter candidate's distance
  to the nearest sample is the centreline distance ± 0.9 m, so only the band around its keep-out
  pays `queryNearest`. One road-reach probe per chunk short-circuits chunks with no road near.
  Collidable large rocks always ask exactly (pads count as road; the sweep would churn).
- **Litter deferral**: chunks scattered in the billboard-only ring skip the litter passes (nothing
  of it is drawn there — at Normal that was 24 of 49 chunks paying for nothing); a promotion
  queues `scatterLitterGen` as a time-sliced job (`_commitLitter` appends). Gate: deferred ==
  inline, byte for byte.
- Boulders ×2 (`boulderChance` 0.08), owner ask.

GPU side is UNMEASURED headless (vsync-locked). The FEAT-84 block per terrain fragment: 6 texture
taps + the blend, 2 fbm for the mottle, 4 fbm + 2 × 9-cell lattices for the splotches. New A/B:
*Terrain Look → Surface textures* (uSurfOn) skips the whole block; *Splotch strength 0* skips the
lattices. Measure on the Air with the stats panel before deciding the look.

### Owner pass 8 (2026-09-25) — riverbanks

Ricegrass, wild rye and sage on the stream BANKS (`cover.bankAttempts` 360 / `bankDensity` 0.85
/ `bankTallFrac` 0.45 / `bankSageFrac` 0.15): a third cover source keyed on
`streamAt(x,z).inBank` (the ramp between the channel and grade), no green gate (riparian ground
grows on dirt), rye-heavy, never in the channel. A 16 m coarse probe skips the pass in chunks with
no stream (a `streamAt` is a segment walk). Gate check 6 pins bank-only, channel-free, on top of
the dry scatter. Sliders under Roadside cover.

## Acceptance

- [x] A dense, irregular grass/brush line along both shoulders on green ground; sparser on dirt, bare on rock.
- [x] Small grass 20 % smaller at double density, large grass 20 % larger, sway doubled (owner pass 2).
- [x] Inner face wanders 1–4 m off the pavement edge; hedge/verge character changes along the road.
- [x] Sparse patchy cover on open green ground; none in the mown verge.
- [x] No cover on pads, in bores, in water; existing prop placements byte-identical.
- [x] Fades out with distance (no pop), gated by tier, wind slider.
- [ ] Frame cost measured on the Normal tier (see the measurement note in the resolution).
- [ ] Owner eyes on density, heights, colours (first-pass numbers).

## Known limits / follow-ups

- A road that is adopted AFTER a chunk scattered gets no wall in that chunk until the chunk
  re-streams (the BUG-71 sweep re-drops chunks only for *intruded* props). If it shows, extend
  `invalidateRoadIntrusions` with a road-signature check for cover.
- Cover instances stay resident (vertex stage) out to the far ring; only fragments are culled by
  the fade. If the vertex cost shows on Low-class hardware, gate cover to the near ring.
- No collision (drive through), no baked shadow.

## Owner pass 9 (2026-09-28) — rocks tumble

"put some random rotation on prop rocks they really stick out on the side of hills" (seed
4005740076 (37, 13): every rock upright on a 1:1 cut face). `rock` / `medRock` / `smallRock`
placements now carry the existing `tilt` / `tiltAz` lean (random axis, up to `rockTiltMax` 1.0 rad,
slider "rock tumble max (rad)"), applied after the yaw so the set spans every orientation; the
blob is centred at its origin so a lean keeps it bedded. Boulders stay yaw-only — their mesh
collider (`sphereVsMeshInstance`) is yaw-only and must match what is drawn. Both `placeBlob`
copies (scatterChunk + scatterLitterGen) draw the same two rng values AFTER the record's own
draws, so every earlier placement decision is unchanged and the deferred-litter gate holds.

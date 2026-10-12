---
id: FEAT-106
type: feature
status: open
severity: minor
opened: 2026-10-10
source: owner, 2026-10-10 — "scaffold a new feature which would be road damage … a pothole generator and
  … cosmetic cracks, some of which will be asphalt filled … I want potholes to be dangerous enough that a
  player considers avoiding them whenever they see them and tries to evaluate how bad they are in a split
  second decision. It's important that this feature does not add a lot of performance overhead."
relates: SURF-06 / D-03 (`potholeNoise` in `src/road-carve.js` — the existing micro-noise this sits beside),
  `src/road-quality.js` (the per-500 m quality tier that drives everything here), BUG-28 (the ribbon
  fragment shader + `aMark` attribute the cracks ride), FEAT-70 (wheel disc contact — the pothole far
  edge is exactly the sharp edge that ticket is about), FEAT-93 (hazard punctures — potholes stay on the
  wear-gated rule), SM-3 damage (`src/damage.js` bump-stop / rim-yield / alignment paths)
invariants: SM-INV-12 (worldgen is meta-free — placement from the seed only), SM-INV-2 (par from road
  geometry only), feedback_emergent_over_injected (danger comes from geometry, never a "pothole hit"
  damage rule), feedback_cold_generation_only (nothing saved)
---

# FEAT-106: Road damage — potholes you steer around, cracks you just see

## Request

Asphalt already comes in three ages. These are the `roadQuality` tiers from `src/road-quality.js`.
Each 500 m stretch of a run gets one quality value `q`, and the ribbon shader reads it to pick the
markings:

| Tier | `q` | Markings today | Road damage this ticket adds |
|---|---|---|---|
| **New** | ≥ 0.66 | solid edges, bright | none — clean surface |
| **Aged** | 0.33–0.66 | dashed edges, faded | cracks (some areas sealed); rare shallow ravel |
| **Old** | < 0.33 | faint centre dash only | cracks (sealed or not), shallow ravel, **deep potholes** |

There are two sub-features:

1. **Cracks: cosmetic only, with no physics.** Some areas are sealed and some are not, decided per area.
2. **Potholes: modelled in the physics.** They come in two classes:
   - **Deep** — small and deep. The asphalt is chipped out right down to the base course.
   - **Shallow (ravel)** — wide and shallow. The seal coat has flaked off over a whole lane, or
     the whole road width, and is only millimetres deep.

**Design target for the deep class.** Every pothole the player sees forces a split-second
judgement: "how bad is that one, and do I swerve?" The size and look of the hole has to answer
that question honestly, and the physics has to back up the answer.

**Hard constraint: the performance cost must be negligible** (budget below).

## What exists today (and how this differs)

`potholeNoise` (SURF-06, `src/road-carve.js:119`) is **not** potholes, despite its name. It is a
smooth two-octave value noise: ±4 cm at a 3.3 m lattice, scaled by `(1 − q)`. It is sampled at
three places that must agree: the physics resolver (`road.js` `_sampleCarveWorld`), the terrain
carve, and the ribbon vertices. In practice it is a **road roughness** field, meaning a long, gentle
undulation. It has no edges, so it can never produce the square-edge hit that makes a pothole
dangerous.

- **Decision for the owner:** keep it as roughness and rename it (`roadRoughness`), or retire it
  once real potholes exist. **Recommendation: keep and rename.** It gives an old road a ride
  quality between the potholes, and the name collision will otherwise mislead future sessions.
  FEAT-93 already says "potholes keep the wear-gated rule", which is still true either way.

## Placement — deterministic, keyed to the road, not to the world

Placement is **seeded from the world seed and the run**, never from run state (SM-INV-12), and it is
never saved (cold generation). Key it on `(worldSeed, runKey, arc cell)`. A `runKey` is the
road network's ID for one continuous road; an arc cell is a fixed ~25 m slice of that road's
length. Hash each cell into 0..N holes, each with:
`arcS, uLat, class, radius / extent, depth`.

Why key on (run, arc) and not on world XZ: placement is then **window-invariant** — the same hole in
the same spot however the streaming window is laid out. It also lets holes sit where real ones do:

- **Deep holes cluster in the wheel paths.** These are the two bands roughly ±0.9 m either side
  of each lane centre. Some also sit along the edge line, where the shoulder is unsupported.
  Clusters are good: one hole often has a smaller sibling near it.
- **Ravel patches** span one lane (`uLat` 0 → ±halfWidth) or the full width, and run 3–20 m
  along the road.
- **Density scales with `(1 − q)`** inside the Old tier. Starting point is 0–6 deep holes per
  100 m; this is a slider, not a ratified number.
- **No damage on junction pads, bores or graph-leaf caps.** That matches where `potholeNoise` is
  already suppressed (`road.js` ~7596).

## Physics — the holes are in the surface, the danger is emergent

**Wheels.** The wheel contact (`queryContacts`) samples the analytic surface on a stencil of four
rings of eight offsets. It takes the envelope of `h(sample) + √(r² − d²)`. Here `h` is the surface
height at a sample, `d` is that sample's distance from the hub, and `r` is the wheel radius. So if
the hole is in the surface, the behaviour falls out on its own:

- **The tyre bridges.** A 0.36 m radius wheel spanning a 0.6 m hole can only sink 0.16 m
  geometrically. A shallower hole lets it touch bottom. A narrower hole lets it ride the lip.
- **At speed the wheel barely drops.** It has ~30 ms over the hole at 20 m/s and falls ~1–2 cm
  in that time. It then meets the **far edge** square-on. That far edge is the hit that bends
  rims in real life.
- **The hit flows through the damage paths SM-3 already has.** Bump-stop force drives alignment
  bend and the wear-gated puncture (`_landBumpStop`). Contact depth past `WHEEL_SOFT_BAND` (0.15 m)
  drives rim yield.
- **Nothing pothole-specific goes into `damage.js`.** If a hole is not dangerous enough, the
  lever is the hole's geometry (depth, edge sharpness), not a damage multiplier.

**Where the hole lives.** Add one term in `_sampleCarveWorld`'s on-ribbon branch, next to the
`potholeNoise` line:

`gradeY −= potholeDepthAt(runKey, arcS, uLat)`

It must return **0 almost everywhere, fast** (see Performance).

**Depth profile.**
- **Deep holes:** a flat floor with a steep wall. The wall slope falls over ~3–5 cm horizontal,
  not a smooth bowl, because the edge is the point.
- **Ravel patches:** a flat step down of a few millimetres to ~1.5 cm, with a ragged outline. The
  outline is a cheap angular noise on the radius.

**Calibration note on "a couple of millimetres".** A 2–3 mm step sits inside the tyre's own
compliance, so the suspension will not register it at all. Start ravel depth at **8 mm** as a
slider. At that depth it reads as a thump and a tyre-roar change, not a hazard. Ravel should
never be dangerous. It is the "rough old road" texture, and it teaches the player what the
dangerous kind is by contrast.

**Chassis and debris do not see holes.** The Box3D road trimesh stays smooth, so only the wheels
feel potholes. That is intentional. A 10 cm hole never reaches the chassis, and debris rolling
over a hole is not worth a collider per hole.

**Relation to FEAT-70.** The far edge is a sharp edge. The current stencil climbs sharp edges in
small steps, which makes the impact a little stepped too. That is acceptable for this ticket. If
the hit feels quantised, it is FEAT-70's problem, not a reason to soften the hole.

## Visuals — readable in a split second

The ribbon mesh is ~2 m between sections and ~1.25 m across (`CROSS_SEGS = 8`). A 0.5 m hole cannot be
geometry in the ribbon. So:

- **Potholes (both classes) are an instanced decal.** That is ONE `InstancedMesh` — one draw call
  that renders every copy of the same small mesh, each copy with its own position and colour. It
  covers all visible holes, placed from the **same CPU hole list the physics reads**, so the drawn
  hole and the felt hole agree by construction.
  - The mesh is a small faceted plate laid on the ribbon. It uses `polygonOffset` (a depth bias,
    so it wins the depth test against the surface it lies on) and `sampleY`, so it follows crown
    and camber. Depth is **painted in flat facets**: a dark floor, a shadowed near wall and a lit
    far wall, per ART-STYLE.md (flat colour, faceted, no textures). From the driver's eye this
    reads as a recess without cutting the ribbon.
  - **Readability is the acceptance criterion, not realism:**
    - A deep hole is **dark, small and hard-edged**, with a visible broken lip.
    - A ravel patch is **lighter grey, wide and ragged**. Flaking seal coat exposes the older,
      paler surface beneath.
    - The player should tell the two classes apart at 60 m, and judge a deep hole's size at 30 m.
- **Cracks are drawn in the existing ribbon fragment shader.** That means no new mesh, attribute,
  draw call or texture. `aMark` already carries `(uLat, arcS, q, feather)` per vertex, which is
  enough to draw road-aligned cracks per pixel:
  - **Transverse cracks** — thermal cracks across the road every ~6–15 m (hashed on `arcS`), with
    wobble.
  - **Longitudinal cracks** — along the lane joint and the wheel paths.
  - **Alligator cracking** — patches of fatigue cracking in the wheel paths, Old tier only.
  - **Sealed vs not sealed is per crew area.** A road crew seals every crack in a stretch at once,
    so the flag must be constant across a stretch. `q` is already one random value per 500 m
    stretch, so derive the flag from it. For example, sealed if `fract(q · 7) < 0.5`. That is
    free: no new attribute, and the shader and CPU need not agree because cracks have no physics.
    - **Unsealed:** a thin dark line (~1 cm), slightly darker than asphalt.
    - **Sealed:** a wider black band (~5–8 cm) with a little extra sheen. These are "tar snakes",
      the overbanded sealant strips.
  - `feather` is 0 on pads, so cracks fade into junctions the same way markings already do
    (QUAL-11).

## Performance budget

| Item | Budget | How |
|---|---|---|
| Physics lookup | ≤ 2 % of the physics step | Early-out on `q ≥ 0.66` (New tier). Otherwise one hashed cell lookup plus its neighbours, cached per run-cell (a ~25 m cell holds a handful of holes). Called ~32 samples × 4 wheels × substeps, so no allocation and no `Map` churn in the hot path. |
| Hole decals | **1 draw call** (2 if the classes split) | One `InstancedMesh`, refilled when ribbon tiles stream in or out. A fixed instance cap (e.g. 512) stops it growing. |
| Cracks | **0 draw calls, 0 bytes** | Fragment-shader maths on the existing ribbon pass. Keep it to a few hash and `smoothstep` calls, and skip it entirely when `q ≥ 0.66`. |
| Generation | negligible | Holes are hashed lazily per cell. No bake, no worker, nothing stored. |

Measure the physics cost with the PERF-08 profiling harness before and after. Do not use a gate for
this: wall-clock gates are report-only.

## Gameplay hooks (no work here — noted so nobody adds it by accident)

- **Par (SM-INV-2).** The par oracle already slows down on low-`q` stretches. Potholes do **not**
  feed par. Par stays a function of road geometry and the existing quality tier.
- **Region difficulty.** Later regions could have worse roads, meaning a lower `q` distribution.
  That would be a worldgen change keyed on region, never on run state (SM-INV-12). It is the
  owner's call and out of scope here.

## Acceptance

- [ ] **Deterministic + window-invariant.** The same seed gives the same holes at the same
      `(runKey, arcS, uLat)`, whatever the streaming window. Add a headless gate in the shape of
      the existing road window-invariance checks.
- [ ] **New-tier roads are untouched.** The physics height and render are byte-identical to today
      on `q ≥ 0.66` stretches.
- [ ] **Mesh/physics agreement.** Every decal instance sits on a hole the physics resolver
      returns, and vice versa.
- [ ] **Danger is emergent and speed-dependent.** Use a scripted headless drive straight through
      a deep hole on fresh parts:
      - a crawl (~10 mph) produces no damage;
      - ~45 mph produces a measurable bump-stop or rim event and some alignment or wheel damage.
      The numbers come from the existing SM-3 paths, not from a pothole rule.
- [ ] **One-sided hits are felt.** Hitting a deep hole with one front wheel produces a visible
      steering/yaw kick. This should emerge from the contact normal; nothing scripts it.
- [ ] **Ravel is harmless.** Driving the length of a ravel patch at speed produces no damage
      events. It does change the ride (strut velocity is visibly busier than on smooth asphalt).
- [ ] **Readable.** In-browser check (CDP screenshot from the driver camera) that deep holes and
      ravel patches are distinguishable at ~60 m.
- [ ] **Cracks.** Old and Aged stretches show transverse and longitudinal cracks, and Old stretches
      also show alligator patches. Each stretch is either fully sealed or fully unsealed, never mixed.
      New stretches show none.
- [ ] **Performance.** The physics step stays within +2 % on an Old-tier stretch (PERF-08 harness).
      The road pass gains at most 2 draw calls.
- [ ] **Sliders** in the Roads debug folder: deep-hole density, deep-hole depth, ravel density,
      ravel depth, crack density, and a master toggle per class.
- [ ] `potholeNoise` renamed to roughness or retired, per the owner's decision above. No dead code
      either way.

## Suggested order

1. Build the hole generator and `potholeDepthAt`, physics only. Add the determinism gate and the
   scripted-drive damage gate, then tune depth and edge until the 10 vs 45 mph split holds.
2. Add the decal `InstancedMesh` from the same list. Do the readability pass in-browser.
3. Add the shader cracks and the sealed-stretch flag.
4. Measure performance and finalise the sliders.

Step 1 alone is shippable and testable without any visuals.

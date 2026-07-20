---
id: FEAT-31
type: feature
status: completed
opened: 2026-07-20
closed: 2026-07-20
severity: minor
source: owner — "the flat world seems like it's just below an actual generated world; it would be
  good to have a testing lab flat world fully independent of the overhead of the free-roam world"
relates_to: FEAT-30 (PAR_REF calibration — the lab's reason to exist), FEAT-29 (par oracle),
  D-18 (grid world, which this supersedes for measurement work)
---

# FEAT-31: Testing lab — isolated flat world with instrumented tracks

## The problem

Grid world (D-18) called `terrainSystem.setChunksVisible(false)` and nothing else. The road
ribbons, junction pads, props, water and dust were never hidden, so they stayed in the scene at
their real elevations (~150 m over most of seed 6) while the truck sat on a plane at y=0 — the flat
world literally read as being parked underneath the real one. Worse for measurement: every worldgen
system kept streaming and drawing, so its cost sat inside anything measured there.

## Resolution

`src/lab.js` + a real mode in main.js (`enterLab` / `exitLab`, pause-menu entry "testing lab").

**Teardown, both halves.** Visual: terrain chunks, road meshes, props, water, dust all hidden
(new `setVisible()` on RoadMeshSystem / PropSystem / DustSystem — the seam grid world always
needed). Work: the ENTIRE worldgen streaming block is skipped in the loop —
`terrainSystem.update`, `roadSystem.update`, `roadSystem.warmRoutes`, `propSystem.update`,
`shadowBake.update`, `waterRenderer.sync`, `waterSystem.warmRegion`,
`roadMeshSystem.syncToChunkRing`. (First pass only cleared terrain's internal `_enabled` flag and
hid meshes, which bought the draw calls but left road routing, prop scatter and water warming
churning in the background — corrected before ship.) Fog thinned from the worldgen
FogExp2 0.006 (which swallowed the far end of a 400 m strip and hid the 150 m skidpad entirely) and
restored on exit. Physics needed no new cases — the lab sets `_gridWorldActive`, which every
contact-query gate already reads; `_labActive` additionally suppresses the ramp rig, which would
otherwise sit across the drag strip at the origin.

**Layout (revised 2026-07-20).** Everything shares the **+X axis** so the facility stays compact —
drive right to go faster, turn off into a lane or a pad. The drag strip originally ran along −Z,
perpendicular to the pads, which spread the site over two axes for no reason.

```
 z=+86  ────────────  rumble: large  (150 mm @ 500 mm)
 z=+72  ────────────  rumble: med    (100 mm @ 350 mm)
 z=+58  ────────────  rumble: small  ( 50 mm @ 250 mm)
 z=+40  ============  DRAG STRIP →  start ▏100 200 300▕ finish(400) ▕ brake board(470)
 z=  0     ▲ ramp     (the D-19 jump rig)
 z=-300      (25)      (  60  )        (      150      )   skidpads
```

**Tracks**, all auto-timed on gate crossing (no button to fumble mid-run):
- **Drag strip** 400 m with 100 m marks; truck stages on the start line. Reports time, trap speed,
  0–100 split and implied accel. A flying pass is flagged ROLLING and derives no accel.
- **Braking**, armed by the *driver's brake input above ~97 km/h*, not by a line — a trigger line
  is gameable, and in testing produced a 210 m "braking distance" that was mostly throttle. Voided
  if the throttle comes back. Reports distance and implied decel.
- **Skidpads** at R = 25 / 60 / 150 m, bracketing the radii the router actually produces. A lap
  gives `v = 2πR/t`, hence **`mu_realized = v²/(g·R)`** — the number the whole mode exists for.
- **Rumble lanes** ×3, parallel to the strip, for the damage/wear model (SM-INV-5). Crest heights
  50 / 100 / 150 mm at 250 / 350 / 500 mm spacing (owner-specified small and large; med
  interpolated). They are REAL geometry: physics and mesh both read one `rumbleSurface(x, z)`
  function, so collision and visual cannot drift apart — the failure this codebase has paid for
  repeatedly on the road side. Profile is a **raised cosine, not a sawtooth**: a discontinuous
  slope hands the solver an unbounded impulse and you measure the integrator, not the suspension.
  Lanes feather laterally and fade longitudinally so entering one is not a kerb strike.

  Measured in-game (body Y peak-to-peak, driven across all three): strip baseline 0.009 m →
  small 0.025 → med 0.048 → large 0.090. Monotonic, and the suspension filters roughly half the
  crest height through to the body. That is the severity ladder the damage model's threshold
  (light bump-stop contact must NOT damage, hard contact must) gets placed against.

**Grid world (D-18/D-19) deleted, not deprecated.** `enterGridWorld`/`returnToWorld`, both pause-menu
buttons and the `_gridWorldActive` flag are gone; every physics gate that read it now reads
`_labActive`. The pause menu is `resume / story mode (beta) / testing lab`. The **ramp rig was kept**
and moved into the lab — it would have died with grid world, but a jump is a legitimate suspension
and damage input, the same purpose the rumble lanes serve.

## Why it matters (FEAT-30)

`test/measure-vehicle-limits.mjs` measures the truck's envelope headlessly — the ceiling. It cannot
measure transitions (turn-in, trail-braking, an open-diff RWD truck back on the power at exit),
which is where a human's time goes. The lab measures the fraction of the ceiling a human realizes:
the `k` in `PAR_REF = k × measured`. Skidpad `mu_realized` vs the harness's steady-state `mu` IS k,
per radius.

## Cross-validation (in-game vs headless harness)

| | lab (driven) | headless | Δ |
|---|---|---|---|
| 400 m | 16.60 s | 16.98 s | 2% |
| 0–100 km/h | 9.08 s | 9.48 s | 4% |
| implied accel | 3.06 m/s² | 2.93 m/s² | 4% |
| braking decel | 7.19 m/s² | 7.04 m/s² | 2% |

The residual is the ~6 km/h of stage creep (the truck is tracked by body centre, which rolls ~0.35 m
before crossing). The harness and the real game loop agree — which is what makes the headless
envelope numbers usable for calibration at all.

## Measured teardown (Chrome, `?prof=1`, `window.__ri()` / `window.__world()`)

| | draw calls | triangles | geometries |
|---|---|---|---|
| free-roam | 71 | 213,126 | 100 |
| in lab | 25 | 1,634 | 114 |
| in lab, after driving 600 m | 17 | 1,618 | **114** |

Geometry count is the decisive number: unchanged across 600 m of driving, i.e. nothing is being
generated. Cycling in/out four times settles at 157 geometries (100 → 154 → 155 → 157 → 157) with
draw calls pinned at 71 and textures flat — a one-time rebuild of road-ribbon tiles on the return
path, bounded, not a leak.

## Mode exclusion

The lab is inert unless entered: `labSystem.update()` runs only under `_labActive`, its geometry
group is `visible = false`, and the HUD panel is hidden. It is reachable only from the pause menu,
and every other pause-menu destination (story mode, grid world, return to world) calls `exitLab()`
first, so modes can never stack.

## Gate

`test/lab-timing.mjs` (registered, subsystem `story`, cost `fast`) drives LabSystem with synthetic
exactly-known paths. It caught two real bugs during development:
- Idling near the timing line and wobbling across it banked a phantom 4.02 s lap (a mu of ~4).
  Fixed by requiring the swept angle about the pad centre to reach ~2π, not merely two crossings.
- A `smoothstep` guard (`if (e1 <= e0) …`) broke descending edges, silently flattening **every
  rumble lane to zero**. It reads fine in review and would look fine in a screenshot from any
  distance. The gate now pins amplitude, crest spacing, a C1 curvature bound, the lane-edge
  feather and lane separation for all three lanes.

38 checks total.

## Regression check across the rotation

Rotating the strip and relocating the pads must not change any measurement, and did not:
drag 400 m 16.60 → 16.58 s · 0–100 9.08 → 9.07 s · implied accel 3.06 → 3.06 m/s² ·
braking 96.3 → 96.1 m at 7.19 → 7.19 m/s². The headless envelope harness re-ran byte-identical.
Full `test:all` green (36/36).

## Follow-ups (not blocking)

- No grade test. The `g·sinθ` term in par is analytic and low-risk, but a constant-grade ramp in the
  lab would close it.
- The lab has no in-world labels (would need a font/texture atlas); the HUD panel names the track.

---
id: BUG-54
type: bug
status: done
severity: major
opened: 2026-08-20
source: owner observation while driving (2026-08-20)
lane: B → Spare (2026-11-01: Lane B has no session; Spare took it)
relates: FEAT-48 (Box3D chassis + the static mirrors it collides with), QUAL-25 (chassis collision
  mesh), BUG-22/22b (the rock sphere proxy — a secondary suspect here, see below)
---

# BUG-54: chassis gets launched at extreme suspension travel

**Owner, 2026-08-20:** "the vehicle body collides with the small rocks on the road ... launching the
car into the air. This only seems to happen when the car is at extreme suspension travel like going
over a dip or something or cornering super hard and then it clips one of those tiny rocks and gets
launched."

**Owner, revised same day:** "i must be mistaken. its probably just a glitchy collision body on
terrain or it could be wheel on body at max suspension compression."

## The symptom (the part we're confident about)

At **extreme suspension travel** — dip entry, or the loaded side in a hard corner — the vehicle body
gets a large upward impulse it has not earned. Not a wheel bump: a launch. Rocks were the initial
suspicion but the trigger is the suspension state, not the prop.

The rock story is **not** the obvious culprit it first looked like: the decorative `smallRock`
category (6–13 cm, `data/flora.js:107`) is baked with `collision = null`
(`src/props/prop-palette.js:169`) and never reaches physics at all. Something else is doing this.

## Hypotheses, in the order worth testing

**1. Chassis hull vs the terrain/road heightfield.** At full bump the body sits at its lowest; the
chassis hulls (`src/physics.js:194` onward, bottom edge at y = 0.14 local) start touching the
terrain statics. If a step ends with the hull deeply interpenetrating the heightfield, the engine
resolves it as a large positional/impulse correction — a launch. This is the owner's "glitchy
collision body on terrain" and it is the most likely of the three. Note that nothing *hard*-limits
strut compression: the bump stop (`src/suspension.js:371`) is a **linear penalty spring**, so a big
enough hit compresses straight through it and drops the hull onto the ground.

**2. Debris pinched between the wheel core and the body.** The four wheel "hard cores"
(`src/physics.js:249`) are spheres *on the chassis body* that **track the strut** — at full
compression they ride up level with the hull. They collide with `GROUP_DEBRIS` only. A dynamic
debris body caught between a rising rim core and the chassis hull has nowhere to go, and the solver
resolves that pinch by throwing the truck. Note this cannot be literal self-collision — the rim
cores and the hulls are shapes on the *same* body, which never collide with each other — so "wheel
on body" has to route through a third object, and debris is the only candidate.

**3. The `rock` collider standing proud of the visible rock.** Still real, still worth fixing, but
demoted to a contributing factor rather than the cause. The visible blob is an ellipsoid squashed
in Y (`axisScale [1.25, 0.7, 1.0]`) while the collider is an **isotropic sphere** sized off the 90th-
percentile *horizontal* flank reach (BUG-22b), then buried 20–90%. For the smallest rock at the
smallest instance scale, the visible top sits ≈ 0.15 m above ground and the collider top ≈ 0.30 m —
a 2× invisible kerb. That is the wrong shape regardless of whether it is what launched the truck.
(These are also supposed to be excluded within `roadExclusion` = 9 m of the road, so if they are
genuinely being hit *on the road surface*, `roadClear` is a second defect — window-invariance, same
class as BUG-25.)

## How to tell them apart

The headless harness is the right instrument here, not a screenshot loop:

- Reproduce in a rainy-day script (`test/assert-m4-*.mjs` pattern) — drive a dip or a hard corner
  until the launch fires, and log per-step: `strutComp[i]` vs the travel limit, chassis contact
  count by `userData.kind` (`terrain` / `prop` / `debris`), max penetration depth, and the impulse
  applied to the chassis that step.
- **If the launch step shows a `terrain` contact on a chassis hull → hypothesis 1.** Fix upstream:
  either stop the hull reaching the ground (a genuine hard bump stop / travel clamp) or stop the
  engine over-correcting (contact push-out limit, more substeps, CCD on the hull).
- **If it shows a `debris` contact on a rim core → hypothesis 2.**
- **If it shows a `prop` static contact where nothing visible is present → hypothesis 3.**

Capture the seed and location so it replays deterministically (worldgen is strictly seed-determined).

## Acceptance

- Driving at full suspension travel over a dip or through a hard corner does not launch or
  noticeably deflect the vehicle body.
- The root cause is named from harness data, not inferred — state which hypothesis it was and the
  numbers that showed it.
- Hard obstacles still stop the truck exactly as they do today: this must not soften the rock/
  boulder/tree read that BUG-22/22b tuned in, and must not change normal driving feel.
- If the fix touches the rock collider, the change lands in BOTH consumers — the analytic wheel
  query (`prop-system.js` `queryProps`) and the engine mirror (`terrain-physics.js`
  `PropPhysics.syncChunk`) — they must not disagree.

## Resolution (Spare, 2026-11-01) — hypothesis 3, measured

**Root cause: the collidable `rock`'s sphere collider stood proud of the rock you see.** It was named
from harness data (`wip/bug-54/*.mjs`).
- The visible blob is squashed to 0.7 in height. The sphere was sized off its 90th-percentile
  horizontal flank reach, so it was taller than the rock: 0.22–0.70 m per unit scale. The worst was
  **1.12 m** (variant 4 at scale 1.6: sphere r 1.85, visible half-height 1.15).
- **3.1 % of rock placements were invisible**: the rock fully under the ground while its sphere still
  poked out, up to **0.34 m**. That is the invisible kerb.
- Driven at 15 m/s over the worst invisible one (rock top 2 cm under the ground, sphere top 0.33 m
  above it), the retired sphere gave the body **1.14 m/s up and 1.81 rad/s of roll rate**. The mesh
  collider gives exactly what bare ground gives (0.06 m/s, 0 rad/s). That is the "launch off nothing
  at full travel".

**Fix:** the collidable rock now collides as its **own triangle mesh**, the boulders' BUG-22c path, in
BOTH consumers by construction:
- the analytic wheel query, `prop-system.js` `queryProps` → `sphereVsMeshInstance`;
- the engine mirror, `terrain-physics.js` `PropPhysics.syncChunk` → `addMesh`.

What you see is what you hit. The sphere path and its `rockRadiusScale` slider are deleted; nothing
else used them.

**Supporting fix: the triangle query handles a centre INSIDE the solid** (`prop-collider.js`
`sphereVsMesh`). It used to assume the centre stayed outside, which held for 20 m boulders. A 0.37 m
wheel can sink its centre into a 0.3 m rock, and it would then have been pulled IN or ignored. The
closest triangle's face normal now says which side the centre is on. Inside, the push is out through
that face with depth = r + distance. Every rock face winds outward (gate-checked, 400/400).

**Hard obstacles still stop the truck:** the mesh IS the visible surface, the target BUG-22/22b were
tuning the sphere toward. Hypotheses 1 and 2 were not pursued: the 2026-10-03 progressive implicit
bump stop and BUG-99's separate wheel-core bodies changed both since this was filed, and the
hypothesis-3 kick alone reproduces the reported launch.

**Gates:**
- `rock-collision-mesh.mjs` section 5 (rocks: mesh, outward winding, collider top = visible top,
  buried = no contact, inside pushes out — the inside check fails on the old query).
- `props.mjs` updated (rock is `mesh`; the query at a rock's centre now returns an outward push).
- `rock-collision-proxy.mjs` (which locked the sphere) retired.

**Separate finding, NOT changed (a world-look call for the owner):** `prop-scatter.js` `placeBlob`
sinks every blob by `cfg.blob.radius[1] × axisScale[1] × scale`, which is the LARGEST radius in the
range (2.0 m), not the variant's own. The comment says "approximate exposed half-height from the
variant's nominal radius". So a small variant is buried as if it were 4× its size. Many rocks sit
deeper than their bury fraction says, and some vanish entirely. Using the variant's own half-height
would raise small rocks, medium rocks and litter into view across the whole world. With mesh colliders
this is purely visual now; it no longer makes invisible collision.

## Follow-up built — the sink by each rock's own size (owner, 2026-11-06, bug54-sink: "go"; Lane B, feature/machine)

- **Change.** `placeBlob` sinks a rock by its variant's OWN drawn radius × axis-y × scale. The scatter can't replay the
  palette's rng, so `prop-palette.js blobRadii` takes the radii from the baked variants and `PropSystem` hands them to
  the scatter on its samplers (`blobRadius`).
  - Only rock, boulder, medRock and smallRock are covered. Bushes keep the category sink (only rocks were ruled; they
    have the same quirk).
  - A caller without the radii (older fixtures) gets byte-unchanged placements.
  - `fingerprint-world` passes the same radii, so it hashes what the game draws.
- **The prediction above was half wrong.** The old sink used `halfH × (0.5 − bury)`, so an oversized halfH sank rocks
  whose bury draw was over half, and LIFTED those under half. Small rocks bury 10–40 %, so the old sink raised every
  one of them; some cleared the ground.
- **Measured** (`wip/bug-54-sink/floatprobe.mjs`; real terrain, seeds 6, 48213, 90517, 2718, 31337 × 25 chunks; each
  rock's real mesh posed as drawn):

  | | out of sight, old → new | floats (lowest point above ground) | touches by < 2 cm |
  |---|---|---|---|
  | rock (3,863) | 1 → 0 | 1 (3.9 cm) → 0; every rock now ≥ 30 cm in | 1 → 0 |
  | boulder (5) | 0 → 0 | 0 → 0 | 0 → 0 |
  | medRock (9,198) | 0 → 0 | 0 → 0 | 0 → 0 |
  | smallRock (35,094) | 0 → 0 | 5 → 0 | 207 → 4 |

- **Record by record** (60,831 placements): the same placements in the same order. Every field is identical but a
  rock's y.
  - rock: 3,863 moved (2,169 up, 1,694 down), by up to 64 cm.
  - medRock: 9,198 moved (3,025 up, 6,173 down), by up to 3.6 cm.
  - smallRock: all 35,094 down, by up to 2.9 cm.
  - boulder: 5 up, by up to 62 cm.
- **MESH == PHYSICS by construction:** the rock collider (terrain-physics.js `PropPhysics`) is built from the same
  placement record (y, scale, rotY) and the same variant triangles.
- **Gate `test/rock-sink.mjs`:** PropSystem wiring; each rock's height within 0.5 − bury of its own size (the old sink
  fails it); bushes unchanged; posed as drawn, none floats or hides on flat (≥ 1.5 cm in), 45° (≥ 2.2 cm) or 60°
  (≥ 3.1 cm).
- **fingerprint-world vs main 6099321f:** 48/54 components identical (network, profiles, junctions, poi, surface, carve,
  tiles, water in all six windows); props differs in each window, and the record diff above shows it's only rock y.

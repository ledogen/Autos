---
id: BUG-40
type: bug
status: completed
opened: 2026-08-02
closed: 2026-08-02
severity: major
source: user-capture (rangersim-capture-1785652557957.json, seed 6, mark 42,614)
relates_to: QUAL-16 deg-2 kink connectors, junction-flow stage 5 (_connectorDesignAt), QUAL-23
---

# BUG-40: deg-2 connector hump launches the truck at a tight kink

## Observed

Driving downhill through the elbow at (42, 614) on seed 6 at ~20 m/s, the truck is thrown into the
air and front-flips. The user reports this as rare but recurring across the world — "every once in a
while there's just a hidden spiker", and worst right after a straightaway where speed is highest.

## Root cause

The mark sits 4.7 m short of a **deg-2 kink node** at (41.1, 618.7) joining `g:-1,0,0:0,0,0` (arc 576,
its end) to `g:0,0,0:-1,1,1` (arc 0, its start). The elbow connector owns the surface there
(`blendW` 1.00, `dom` 1.00) and its design height comes from `_connectorDesignAt` — a
`1/(gap² + XS_SOFT²)` blend of BOTH legs' grade and lateral cross-section, `gap` being the query's
distance to that leg's asphalt EDGE.

Decomposed at the mark, the driven surface sat **0.433 m above the ribbon of the leg being driven**:

| | grade | gap | lateral (crown+camber) | weight |
|---|---|---|---|---|
| leg A (driven) | 101.430 | 0.00 | +0.050 | 0.50 |
| leg B (sibling) | 101.806 | 0.00 | +0.598 | 0.50 |

Two compounding defects, both amplified by the tight kink:

1. **Clamped off-end grade.** Leg B's foot projects past its own start, so `runProfile` CLAMPS to its
   endpoint sample — a fictitious horizontal extension of leg B out over leg A, constant 101.806 across
   the whole window. Contribution **+0.19 m**.
2. **Unbounded sibling camber.** Leg B's `xs` term is `signedLat · sin(camber)` evaluated ~5 m off ITS
   centreline at a saturated 15° bank (`camberMaxAngleDeg` 20; R ≈ 11 m is well past
   `camberKneeRadiusM` 60). Contribution **+0.30 m**.

On an ordinary elbow neither matters — the sibling is a road-width away so its weight is ~1%
(`XS_SOFT` is only 0.5 m). On a TIGHT kink the two legs' asphalt overlaps, the sibling's gap-to-edge
falls to 0 on the road you are actually driving, and both fictions land at HALF weight.

Resulting longitudinal profile: **+13% → +42% → 0% → −2% inside 4 m**, i.e. ~5.7 g of vertical
acceleration demand at 20 m/s. The truck cannot follow it and launches.

**Rarity** (`test/deg2-hump-census.mjs`, seed 6, 3 connectors / 6 leg approaches):
0.433 / 0.197 / 0.105 / 0.059 / 0.036 / 0.036 m. One approach in six is a launcher, and only bites
when arrived at fast — matching the user's "rare but still happens".

## Fix

`src/road.js`, three surgical edits (tagged `BUG-40`):

- `_projectOntoRun` + `_projectOntoRunRanges` (kept in sync): return `overDist`, the CONTINUOUS twin of
  the existing `offEnd` boolean — how far past the run's terminus the query lies. Free; both
  projections were already computed for `offEnd`.
- `_runGradeAt`: report `out.off = pr.overDist`, and bound the camber lever arm at
  `halfWidth + roadCarveExtraWidth`. That cap is past the shoulder AND past `carveHalfWidth`, so ribbon,
  shoulder plane and connector weld are bit-unchanged — only the far toe (which ramps to raw terrain
  anyway) ever sees it. Deliberately NOT applied in `_carveDirtY`, whose fold IS the road's own
  cross-section and must stay continuous across the whole footprint (BUG-15).
- `_connectorDesignAt`: fade each leg's weight to zero over `XS_OFF_FADE` = 4 m of `overDist`, via
  smoothstep so weight and derivative stay continuous (switching on the `offEnd` boolean would inject
  exactly the C0 crease `_carveDirtY` spends five stages fighting). If BOTH legs are off-end — the
  throat of a sharp fillet, where the corner is cut past both mouths — the tapers collapse and the ratio
  is undefined, so fall back to the untapered weights; there both grades are the same clamped node
  height, which is the plaza value that throat should carry.

## Verification

- `test/deg2-hump-census.mjs 6 900`: worst hump **0.433 m → 0.128 m**; approaches over 0.20 m **1 → 0**.
  The four non-pathological approaches are unchanged to 3 dp (0.105 / 0.059 / 0.036 / 0.036) — the fix
  is a no-op away from the failing geometry.
- `test/deg2-launch-metric.mjs` on the capture, along the true through-line (leg → fillet → leg), peak
  vertical demand at 20 m/s: **approach 2.86 g → 1.25 g**, fillet apex 2.30 g → 2.13 g.
- `npm test`: 24/24 affected gates green (road 13, terrain 5, story 3, water 3), including
  restream-invariance, road-smoothness, shoulder-lateral-continuity and centerline-curvature.

## Residual (deliberately not fixed here)

The fillet APEX still shows ~2.1 g at the 20 m/s reference, essentially unchanged by this fix — a
different cause. The connector's centreline cuts the corner, so at the apex it is laterally offset from
BOTH legs and picks up both legs' crown+camber folds; where curvature reverses through the node the two
folds add with the same sign and raise a low ridge. It matters far less than the approach hump did: an
R ≈ 11 m fillet caps speed at sqrt(µ·g·R) ≈ 9.9 m/s, which scales the demand by (9.9/20)² to ≈ 0.5 g.
The bug that was reported sat BEFORE the fillet, where the truck is genuinely doing 20 m/s and no
braking anticipates it. Revisit only if the apex is felt in play.

---
id: ASSET-03
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-19
closed: 2026-08-19
blocked-by: FEAT-59
relates: FEAT-06, FEAT-36
---

# ASSET-03: Beach ball

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A classic segmented beach ball. Camp/lakeside dressing, and the most obvious first candidate for
dynamic prop physics — a light sphere the truck can punt across a pad is the cheapest possible
demonstration that props are no longer scenery.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤320** (low-subdiv icosphere; silhouette matters more than shading) |
| Texture | one albedo, **256×256** — coloured panels, or vertical-stripe UV; alternative is per-panel material slots if that stays under the palette's slot budget |
| Real size | 0.40 m diameter |
| Origin | **centre**, not base-seated — it is a sphere and will be simulated |
| Forward | n/a (rotationally symmetric; no yaw convention) |
| Collision | `{ shape: 'sphere', radius: 0.20, mass_kg: 0.15, restitution: 0.75 }` |

## Acceptance

- `assets/models/beach-ball.glb` exists, export-clean under ASSETS.md settings, texture embedded.
- Sources committed: `assets/models/src/beach-ball.blend` + `beach-ball.py`.
- Origin is the sphere centre (documented in the registry entry — it deviates from the base-seated
  default and will bite whoever places it otherwise).
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- Collision metadata carries `mass_kg`/`restitution` beyond FEAT-59's shape+dims minimum. Those
  fields are **inert until dynamic prop physics exists** (FEAT-36, itself blocked on the FEAT-48
  physics-adapter seam) — carried
  now so nothing is re-plumbed later, per FEAT-59's rule.
- Until then it is a static prop like the rest of this set; that is not a failure of this ticket.

## Resolution (2026-08-19)

`assets/models/beach-ball.glb` — **252 tris** (budget 320), 0.400 x 0.400 x 0.394 m,
origin at the sphere centre. Sources: `assets/models/src/beach-ball.blend` + `beach-ball.py`.
Registered as `beachBall` in `data/prop-models.js`.

**Deviations from the spec above, deliberate:**

- **No texture.** Took the ticket's own stated alternative — per-panel material slots —
  because ART-STYLE rule 1 prefers it and a beach ball is the ideal case: the panels ARE
  the artwork, they are large flat areas of pure colour, and a gore boundary is a mesh edge
  either way. Five slots: `BallWhite` `BallRed` `BallGreen` `BallBlue` `BallYellow`.
- **UV sphere, not an icosphere.** An icosphere's faces do not align to meridians, so every
  gore boundary would zig-zag. `SEG` is a multiple of `GORES` so each seam lands exactly on
  an edge loop.
- **Two white gores and four colours**, not strict white/colour alternation. Alternation is
  the textbook design but it is half white, and a gore is 60 deg — face-on that put one
  blank panel across the middle of the ball. This order shows 1 white + 2 colours from
  every viewpoint, with red|green and blue|yellow as the touching pairs (both near
  complementary; an earlier yellow|green pairing had a seam that vanished at distance).
- **8 stacks, not 9.** Even, so a ring lands exactly on the equator at full radius and the
  widest cross-section is a true 0.400 m. 9 gives squarer facets but shrinks the ball to
  0.394 — worse, since the collider is r 0.20 and a visual inside its collider cannot
  interpenetrate.

Audit: four views plus a **top-down** (the four canonical angles all miss a sphere's pole
cap) — clipping clean, coplanar clean, non-manifold/loose-vert clean, 0 inverted-face ray
hits, origin centred to < 1e-6.

**Caught during export:** the air valve overshot the r=0.20 collider by **12.3 mm**, which
would clip the ground at the rest orientation putting the valve underneath. The
axis-aligned bounding box could not see it — the valve is off-axis — so the check is now
`hypot(VALVE_OUT, VALVE_R)`. Pulled to +2.4 mm, still ~5 mm proud of the neighbouring facet
centres.

**Still needed before it appears in-world:** same as ASSET-01 — there is no lawn-furniture
scatter pool, so this is `spawnModel('beachBall')`-only. Making it the first punt-able
dynamic prop is FEAT-36, not this ticket.

### Tweak, 2026-08-19 — smaller polar disc (owner)

The white pole patch was 153 mm on a 400 mm ball (38% of the diameter) and read heavy.
Now **96.8 mm / 24.2%**, measured off the exported GLB.

Done for **zero extra tris** by making the ring latitudes UNEVEN rather than adding
geometry: the cap *is* the polar triangle fan, so its angular radius is just wherever ring
1 sits. `CAP_LAT` pulls that ring in to 14 deg; the remaining rings still spread evenly
from there to the equator, and one still lands exactly on 90 deg so the widest
cross-section stays a true 0.400 m. Adding a dedicated cap ring instead would have cost
2*SEG per pole (+72 tris) and blown the 320 budget.

`CAP_LAT` is a hoisted parameter — a different disc size is one number and a re-run.

### Tweak, 2026-08-19 — air valve removed (owner)

Cut on the owner's call, not flag-disabled: the parameters, `add_valve()` and its call site
are deleted. **268 -> 252 tris.**

Worth the note — with the valve gone, **every vertex now sits exactly on the r=0.20 sphere**
(radial max == min == 0.2000). The visual is perfectly inscribed in its collider and cannot
interpenetrate whatever it rests on. The valve was the only thing that had ever broken that,
and the only thing breaking the model's rotational symmetry.

The clearance lesson is kept as a comment in the generator header rather than as code: if
anything proud is ever added back, check it with `hypot(offset, radius)` against `RADIUS`,
NOT with the axis-aligned bounding box — the bbox cannot see an off-axis bump and reported
the 12.3 mm overshoot as clean.

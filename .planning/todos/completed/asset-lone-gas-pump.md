---
id: ASSET-14
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-22
closed: 2026-08-22
blocked-by: FEAT-59
relates: FEAT-46, FEAT-50, ASSET-13
---

# ASSET-14: Lone gas pump

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A single weathered pump on a small concrete pad, standing alone at the roadside — no canopy, no
store, maybe a hand-lettered sign. The rural counterpart to the full station: it says *this is the
last fuel for a while* far more effectively than a building does, and it is the cheapest POI in the
set to place anywhere.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤600** |
| Texture | one albedo, **512×512** — dial face, faded livery, rust streaks, price digits |
| Real size | 0.6 m × 1.1 m pad footprint, 1.9 m tall |
| Origin | base-seated: concrete pad at y=0 |
| Forward | −Z (dial face and nozzle face −Z) |
| Collision | `{ shape: 'box', dims: [0.6, 1.9, 1.1] }` — solid, not knockable |

Hose and nozzle as a simple hanging tube, ≤60 tris. Dial face is texture; do not model digits.

## Acceptance

- `assets/models/gas-pump.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/gas-pump.blend` + `gas-pump.py`.
- Texture ≤2K, dimensions divisible by 4; no Draco, no KTX2.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **This is the detailed pump; ASSET-13's are the simplified ones.** Deliberate duplication — the
  standalone is approached closely and alone, the station's four are seen together at a glance.
  Sharing one mesh would either overspend under the canopy or underdeliver at the roadside. If they
  ever converge, converge on this one.
- Refuelling *gameplay* is FEAT-50, not this ticket.
- Smallest POI in the class — it can sit on ground a building could not, which is most of its value.

---

## Resolution — 2026-08-22

Shipped as `assets/models/gas-pump.glb`, **592 tris**, 6 materials, one 512×512 texture atlas.
Sources: `assets/models/src/gas-pump.{blend,py}`. Registered as `gasPump` in `data/prop-models.js`
under a **new `gasStation` pool** — see "Open items", it does not spawn yet and that is deliberate.

### The owner reshaped it twice, and that moved five rows of the Spec table

Pass 1: *a vertical pole that says GAS, and at its base two pumps that face opposite sides; handle
visible on the side; simple box-style pumps, nothing flashy or retro.* So the asset is an **island**,
not a lone pump. Pass 2, against a second reference (a Wayne/Bennett-era cabinet): the pump itself
was *"a little bit too narrow and upright"* — so the body is now **wide and squat** under a
**chrome-framed head that overhangs it on three sides**, and the head carries a real gauge face.
The Spec table above is left as written; this section is what was actually built.

| Field | Spec said | Shipped | Why |
|---|---|---|---|
| Tri budget | ≤600 | **592** | Inside, but only just — this is the number to watch if anything else is added. It buys two pumps, a 4.55 m pole, a sign, two sign lights, two four-rail bezels and two cast nozzles. Pass 2 *saved* 60 (the blank-window dial and the roof crown went), pass 3 spent 96 on the bezels, pass 4 spent 24 net on the nozzles after shortening the hoses, pass 5 spent 12 on the second light. |
| Texture | 512×512, dial + livery + rust + digits | **512×512 atlas: GAS + the gauge face** | Livery and rust are *wear*, the named ART-STYLE anti-pattern — still dropped. The dial and digits stayed on the owner's 2026-08-22 call: a pump register is printed information, which is exactly what rule 1 buys a texture for. |
| Real size | 0.6 × 1.1 m, 1.9 m tall | **2.50 × 1.40 m, 4.55 m tall**; each pump 0.72 × 0.56 × 1.42 | The pole is the asset. Everything below it is detail the player only gets once they have already arrived. |
| Collision | `[0.6, 1.9, 1.1]` | `{ shape: 'box', size: [2.50, 1.45, 1.40] }` | Island and pumps up to the head at 1.42 m. **The pole above that is deliberately not collided** — a 4.55 m box would be an invisible wall to anything tall, and clipping a mirror on a sign post is not a crash. Note the registry field is `size`, not the ticket's `dims`. |
| Material names | (implicit, "stable") | `PumpSign` → **`PumpGraphic`** (pass 2), `PumpChrome` → **`PumpMetal`** (pass 4) | The first carries the gauge artwork as well as the sign now; the second is shared with the nozzle casting, so "chrome" stopped being true. Nothing referenced either — no palette, no loader hook. |

Forward (−Z) is unchanged and is what the first pump's gauge face, holster and hose face.
Base-seated at y = 0, unchanged. `yawOffset: 0` is deliberate — the pad yaw already points model −Z
at the road, which lays the island's 2.50 m length *along* the road and turns one pump to face it,
exactly how a car pulls in alongside.

### Composition

Six materials, six draw calls. `PumpConcrete` slab · `PumpBody` the pole, the sign arm and light
crossbar, the luminaire lenses · `PumpSkirt` the red pump bodies · `PumpTrim` the near-black parts
(plinth, hoses, luminaire housings, **and the sign box**) · `PumpMetal` head casing, bezel and
nozzle castings · `PumpGraphic` the baked atlas.

**The sign box is black** (owner, 2026-08-23). Cream-on-cream gave the board no boundary at all
against the pole and the lit faces — it needed the dark value to have an edge. The result is the
layered look the reference has: black edge trim, white face, and a thin black rule *inside* the
white that comes from the baked artwork rather than from geometry. The trim was resized to an even
**45 mm all round** at the same time; at the old 1.46 × 0.60 it was 30 mm across and 37.5 mm up,
which passes unnoticed in cream and reads as a mistake in black.

**`PumpMetal` is the one split that needed arguing**, and pass 4 made it pay for itself twice. It is
a thin rim at distance and the merge rule says don't — but a mid-grey band framing a warm cream dial
over a red body is the entire read of this pump: cream (`PumpBody`) makes the frame vanish into the
face, near-black (`PumpTrim`) turns it into a picture frame. It now also carries the whole nozzle
casting, on the owner's ruling that the frame is the same metal as the pump handle — which is the
merge rule doing its job, since the two are the same colour and the same role.

Value structure bottom to top: near-black plinth, wide red bodies carrying the only saturation, a
bright head with a cream dial as the thing you look *at*, then a white pole to a white sign at 4 m.

**The bezel is pass 3, and it is the part that finishes the head.** Four raised chrome rails tile
the margin band around the dial, so the artwork sits in a real recess rather than reading as a decal
on a flat box. The top rail is proud 48 mm against the others' 26 mm and rises 6 mm above the head:
that is the drip hood — the owner's brief was *"something that would keep the rain off the digits;
the reference has this but it's very subtle, we need something"*, so it is deliberately louder than
the reference. The plate is 8 mm bigger than the opening in both axes so its rim tucks *under* the
rails instead of butting them edge to edge; the artwork is mapped to the plate, so that lap hides
8 mm of cream margin and nothing that reads. Every rail is kept off the head's own faces — sides
inset 5 mm, sill starts 6 mm high, hood overshoots 6 mm — because a rail landing flush on the head's
side, top or bottom face is the same z-fight this model has now hit four times.

**The nozzle is pass 4.** The first one was four dark boxes and did not read as a handheld nozzle at
all. This one is the anatomy of the reference casting: a chunky body, a tapered spout leaving its
top-front, a big open **D-guard** hanging below, and a trigger inside the guard. The guard gets three
of the five parts because the loop is the signature — it is what says *you pick this up*. The loop
lies in the Y-Z plane, flat against the flank, which is how a nozzle actually hangs and keeps it out
of the driving line.

Two routing lessons paid for in rework: the hook had to become a **230 mm rail** hanging the nozzle
at its front end and porting the hose at its rear, because with both ends close together the hose's
U had nowhere to sag and swung outboard straight across the nozzle's own silhouette; and the hose
now enters the casting's **rear boss above the guard**, the way a real one is plumbed, instead of
threading past the loop.

The two pumps are one part list and its mirror through y = 0, separated by a 30 mm gap so they read
as two. The **squeeze handle** the owner asked for by name is real geometry. **The sign lights are pass 5**, and they moved from lighting the island to lighting the sign. There
are now **two flat luminaires on a single crossbar through the top of the pole**, one per sign face,
each tilted 31° — the angle from the fixture to the letter block's centre, so it points at the text
rather than at whatever is under it. Their lens is the one face given the pale material, chosen by
**measured normal, not by index** into the box's face order: once a part is rolled about its own
axis, which index is "the underside" depends on the roll, and hardcoding it is how a lens ends up on
the roof.

Two shapes here are deliberate. **One crossbar, not two arms** — a single beam from −Y to +Y through
the pole is 12 tris instead of 24, its tips buried in the housings, and it reads as the gantry it is.
And **the fixtures' long axis runs along X, along the sign, not along their own arm**: the brief was
"rotate it 90° about the pole", and the arm does exactly that, but the stated goal was that the throw
covers the sign text, and a fixture turned bodily with the arm would spread its light across the
sign's 200 mm thickness instead of down its 1.46 m length. So the arm turned and the housing did not,
which is also how every real sign floodlight is mounted.

### The atlas

One 512×512, two artworks: **GAS** on the top strip (192 px, plate aspect 2.667) and the **gauge
face** on the lower block (288 px, aspect 1.778), with a 32 px gutter between them against mip
bleed. One image and one material instead of two of each.

Everything is laid out in **atlas units** — the unit square that maps to the image — never in
per-region normalised coordinates, because the regions have different aspects and region-normalised
drawing would stretch the gauge and not the sign. Plate aspects are **derived** from the region
pixel sizes in the same file, so mesh and artwork cannot drift apart.

The registers **size themselves**: the digits are placed first at a chosen cap height, their glyph
box is measured, and the cream strip and dark surround are drawn around it at a fixed padding.
Fitting digits to a hand-typed window *width* is what the first bake did, and five digits fitted to
a wide window came out taller than the window and spilled over both edges.

### Audit (all clean at hand-over)

- **Inside-out faces: 0** — but only after pass 5. `beam()` built its cross-section on a
  LEFT-handed frame (`side.cross(d)` instead of `d.cross(side)`), so every beam in the model
  exported with its normals pointing inward: both sign braces, the light arm and head, and three
  guard rails per nozzle — **54 faces**. It never showed in Blender's viewport and the owner caught
  it in-game. The check that finds it is cheap and should be part of every audit here: copy the mesh
  into a bmesh, record the face normals, run `bmesh.ops.recalc_face_normals`, and count the ones that
  reversed. Note the mirrored pump was *correct* the whole time — `mirror_y()` re-winds, which
  cancelled the fault on exactly one of the two.

- Overlapping coplanar faces within 1 mm: **0**. The same fault was found and fixed **four times**
  across the four passes, always where **two boxes end flush**: skirt into cabinet, body into head,
  bezel rails against the head's own faces, and the trigger stopping 0.5 mm short of the guard's
  front stile. Fix is always to overlap or offset, never to butt.
- Non-manifold edges / loose verts / degenerate faces: **0**. The sign faces started as single open
  quads and were closed into thin plates (+20 tris) rather than shipped as boundaries.
- Exports single-sided (`campfire`/`gnome` convention), no Draco, no KTX2, one embedded PNG,
  metalness 0 throughout, 287 KB.
- **Artwork handedness verified rendered from both sides**, sign and gauge. It shipped as `SAG` on
  the +Y face in pass 1: a bmesh face has a zero normal until `normal_update()` runs, so the
  `face.normal.y > 0` test silently returned false on both plates. Pass 2 removed the class of bug
  rather than the instance — `mirror_y()` now owns both the winding flip and the `u → 1 − u`, and
  every atlas region spans the full U range so that flip is always correct.

### Open items

- **`gasStation` is a pool of its own and NOTHING CONSUMES IT YET.** Owner ruling 2026-08-22: this
  POI does not hand out work, it sells you fuel. No roster slot in `src/poi.js` names `gasStation`,
  so **the model does not spawn**. That is deliberate and follows the flamingo rule in
  `prop-models.js` — do not re-tag it `missionGiver` to make it appear. The slot arrives with
  **FEAT-50 refuelling**, which is what gives a gas stop something to do. Until then the asset is
  reachable only through `spawnModel('gasPump')`.
- **`PumpSkirt` is the recolourable material** if this ever wants a curated pool (2026-08-21 palette
  ruling). None is declared: nothing passes a `variant` yet. **Caveat if one is added** — the gauge
  face's red GASOLINE band is baked into the atlas at the same red and a palette swap will not move
  it. Keep any pool to reds, or re-bake per variant.
- **ASSET-13 (full gas station) should now converge on this pump**, per the Notes above. Its four
  pumps under the canopy can reuse `pump_parts()`; the island, pole and sign are this ticket's alone.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-50 (refuelling), which owns the orphaned `gasStation` pool**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.

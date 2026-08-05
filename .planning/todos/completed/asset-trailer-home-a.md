---
id: ASSET-21
type: asset
status: done
severity: minor
opened: 2026-08-04
updated: 2026-08-04
closed: 2026-08-04
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, ASSET-09, ASSET-10
---

# ASSET-21: Trailer home A (single-wide mobile home)

**POI model** — a destination, not dressing. Sits alongside the log cabin (ASSET-16) as an anchor for
lawn furniture (ASSET-01..08): a trailer with a grill, a propane tank and a flamingo out front is a
home. Distinct from ASSET-09 (Winnebago RV) and ASSET-10 (Airstream) — those are *vehicles*, this is
a **sited** dwelling on skirting, not something that looks like it could drive away.

## Request

A single-wide mobile home, exterior only, deliberately plain: flat-colour low-poly with a shallow
gable roof, an accent stripe along the flank, skirting to the ground, three windows a side, one at
each end, and a door with a stoop. No wheels, no hitch, no AC unit — it reads as settled.

The point of the asset is **parametric recolour**: one body colour driven across cyan → yellow →
white so a row of trailers reads as a park rather than a copy-paste.

## Spec

| Field | Value |
|---|---|
| Tri budget | ≤1200 — **shipped at 1188** (was ≤800/624; raised twice by the detail passes below) |
| Texture | **none.** Flat material colours, no UVs — the siding is geometry |
| Real size | 12.36 m × 4.58 m (incl. stoop) × 3.15 m to roof, **3.71 m to the flue cap**; body 12.0 × 3.5 |
| Origin | base-seated: skirting bottom at y=0, centred on the body footprint |
| Forward | −Z (door and stoop face −Z) |
| Collision | `{ shape: 'box', dims: [3.5, 3.15, 12.0] }` — body only; excludes the stoop **and the flue**, which is why the height stays 3.15 and not 3.71 |
| Draw calls | 7 (one per material) |

### Runtime recolour — the material names are the API

Two materials are recoloured, matched by substring exactly as `src/vehicle-model.js` does for paint:

| Material | Role |
|---|---|
| `TrailerBody` | main siding — **the cyan → yellow → white parameter** |
| `TrailerAccent` | stripe band — second, independent parameter |

Both are flat `baseColorFactor` with no texture, so a recolour is one `material.color.set()` each —
no texture multiply, no tint shader. Verified across the range:

    cyan    body (0.28, 0.72, 0.76)   accent (0.10, 0.34, 0.40)
    yellow  body (0.88, 0.76, 0.28)   accent (0.46, 0.34, 0.12)
    white   body (0.90, 0.90, 0.88)   accent (0.55, 0.56, 0.58)

The other five — `TrailerRoof`, `TrailerSkirt`, `TrailerTrim`, `TrailerDoor`, `TrailerCurtain` —
are **fixed and must not be recoloured**.

## Acceptance

- [x] `assets/models/trailer-home-a.glb` exists, export-clean: 65.3 KB, no `extensionsUsed`, no
      images, no Draco/KTX2.
- [x] Sources committed: `assets/models/src/trailer-home-a.blend` + `trailer-home-a.py`.
- [x] Tri count within budget (1188 / 1200). Material names stable.
- [x] Base-seated, forward −Z, verified from the exported glTF bounds.
- [x] No inverted windings — 45 rays cast from 9 m out on all four flanks and from above,
      asserting the first face hit points back at the ray. Zero back-facing hits. (Backface
      culling in the viewport is the eyeball version of the same check, and is what
      `GLTFLoader`'s default `FrontSide` materials will do in-game.)
- [x] Recolour verified at all three ends of the range.
- [ ] Loads and places in-world through the FEAT-59 model import service. **Still blocked.**

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Exterior only. No interior.** Every window opening is recessed and capped with a curtain plane
  (`TrailerCurtain`), so the missing interior is never visible. The gable void is sealed by triangular
  infill at both ends — without it you look straight through and see the inside of the far wall.
- The `-a` suffix is deliberate: this is the first of a family. A `trailer-home-b` should vary the
  silhouette (roof pitch, window rhythm, length), **not** just the colour — colour is already free at
  runtime.

### Opening detail pass (2026-08-04) — 624 → 890 tris, budget ≤800 → ≤900

Against the reference render, the openings were bare recesses: no frames, no glazing bars, and a door
that was a flat painted rectangle. Added, all in `TrailerTrim` so the draw-call count stays at 7 and
the recolour contract is untouched:

| Detail | Cost | Where |
|---|---|---|
| Proud picture frame, all 9 openings | 16 tris each (144) | `build_frame()` |
| Vertical glazing bar, 8 windows | 6 tris each (48) | `build_mullion()` |
| Window let into the upper door slab | 16 tris | `build_door_detail()` |
| Latch-side knob | 10 tris | `build_door_detail()` |
| Pleated curtains, 8 windows + door | 50 tris | `build_curtain()` |

Two things worth knowing before touching this again:

1. **The recess now starts at `+FRAME_OUT`, not on the wall plane** (`build_recess(start=)`). The
   frame's inner edge and the reveal are then the same surface, so no gap can open between them. The
   frame's outer edge wall closes back down to the wall plane, so it is solid from every angle —
   verified with backface culling on.
2. **The door slab is a ring, not a solid cap** (`build_recess(back_hole=)`). It has to be punched
   with the same rect as the door window, or the slab covers the window and the window is invisible
   — which is exactly what the first attempt did. `door_window_rect()` exists so both derive the rect
   from one place.

The door frame skips its bottom member (`skip_bottom`): the door's sill *is* the wall bottom, so that
member would be degenerate. Its edge wall is still emitted, so the frame has an underside rather than
an open slot above the stoop.

**The curtain is now pleated, not a flat plane.** A flat cap read as a void through the glass. It is
folded into a vertical zigzag — 4 folds a window, 2 in the door — so flat-shaded facet normals band
it light/dark, the same trick the siding uses, at 2 tris a fold. `COL_CURTAIN` also warmed to
(0.82, 0.65, 0.52): it is the only colour seen through a window, and the old beige-grey was reading
as shadow. Two constraints on `build_curtain()`:

- **Folds recede away from the viewer, never toward.** A forward bulge would interpenetrate the
  mullion, whose front face sits only 0.015 m inside the wall plane.
- **The fold count must be EVEN**, so both outer edges land back on the recess plane and meet the
  reveal flush. An odd count leaves one edge floating `CURTAIN_PLEAT_D` proud of it — a gap.

### Fixtures pass (2026-08-05) — 890 → 1188 tris, budget ≤900 → ≤1200

Owner-directed, against the same reference. **Window slats were explicitly declined** — do not add
them on a later pass thinking they were an oversight.

| Detail | Cost | Where |
|---|---|---|
| Curtains: 4 → 6 pleats a window, 2 → 4 in the door, irregular fold depths | +36 | `build_curtain()` |
| Tubular stair: 3 tread slabs on 4 leg bars, replacing the solid stoop | +38 | `build_steps()` |
| Handrails both sides: 2 posts + a diagonal rail each | +64 | `build_steps()` |
| Skirting: vertical battens, ground rail, crawl-space vent | +122 | `build_skirt_detail()` |
| Woodburner flue with rain cap | +30 | `build_chimney()` |
| Skirt/body ledge cap — **a hole fix, see below** | +8 | `build_skirt_detail()` |

`tube()` is the new primitive under the stair, rails and flue: a square-section bar between two
points. Its winding is *derived, not guessed* — build a right-handed frame `(u, v, axis)` with
`v = axis × u`, and walking the ring in increasing angle then along `+axis` gives outward faces. The
derivation is in the docstring; redo it there rather than flipping quads until a screenshot looks
right.

Two real defects were found and fixed during this pass, both worth remembering:

1. **The skirt/body ledge was an open ring.** The skirt is inset `SKIRT_INSET` from the body and its
   box has no top face, so there was a 0.06 m slot around the whole trailer that you could see into
   from below — present since the asset was first built, invisible from eye level. Capped with
   `flat_ring_z()`. It also covers the batten tops, which is what makes their `'+z'` skip safe.
2. **`build_recess()` sinks an opening; it does NOT punch one.** The walls get their holes from
   `build_wall()`'s grid. The skirt is a plain `box()`, so the first vent was a sealed pocket behind
   an intact face — geometry present, invisible from outside, and a ray-cast is what proved it
   (`TrailerSkirt` at the wall plane rather than `TrailerRoof` at depth). The skirt's `-Y` face is now
   built as a `flat_ring()` around the vent. This is the *same* trap as the door slab a pass earlier;
   assume any future recess on a `box()` surface needs its hole punched explicitly.

Also: a shallow recess with these palette colours is invisible. Every skirt-adjacent colour sits
within 0.06 of the others and there is no AO, so the vent only reads once it is deep enough for the
reveal faces to shade differently — `VENT_DEPTH` 0.035 → 0.090.

Budget note: this leaves **12 tris of headroom**.

### Siding — how it works, and the two traps

13 horizontal lap courses (0.165 m each), cut as shallow V-grooves **inward** from the wall plane:
offset 0 on every course line, −0.020 m on the mid-lines. The light/dark banding is entirely facet
normals under flat shading — no texture, no extra material. This is where the tri budget went
(`TrailerBody` 60 → 410).

Two things keep a single-sided wall from gapping open, and both are load-bearing — a gap here is a
see-through hole, not a cosmetic seam:

1. **Grooves cut inward only, and much shallower than the openings are deep** (0.020 vs 0.09/0.10).
   An opening's reveal is a plane from the wall plane back to −depth, so grooved wall edges land
   *inside* it. The surfaces meet, and the reveals need no per-course splitting — which would have
   cost more triangles than the siding itself.
2. **Every critical height is snapped onto a course line** (`snap_course()`): sills, heads, door
   head, stripe edges. Offset is 0 on course lines, so the wall still meets roof, skirt and openings
   dead flush.

The one seam this cannot close is the **vertical building corner** — two receded walls miss each
other by the groove depth. `build_corners()` covers it with posts, which is what corner trim is for
on the real thing anyway.

`SIDING_DEPTH = 0` restores the old flat walls (212 tris) with everything else intact.

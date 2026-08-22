---
id: ASSET-24
type: asset
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-08-22
closed: 2026-08-22
blocked-by: FEAT-59
relates: FEAT-45, SM-1, ASSET-08, ASSET-25
---

# ASSET-24: Campfire

**Camp gear** — the player's own kit, rendered at their campsite. `items.md`'s **visible-kit rule**:
what you carry is what renders, so *the campsite is the inventory screen*. Shares the camp anchor
convention (ASSET-23), and must fit the **6 m camp pad** (`campPadHalfM 3`, `src/camp.js`).

## Request

A small fire laid on bare ground — a few stones nudged into a loose ring, split logs in a lean-to,
ash and embers. Per `items.md`, the bedroll-and-campfire is **the default camp, no modifier**:
everybody has one, and it is *"the thing that renders when you carry nothing else."* So this is the
one camp asset that is on screen at every single camp, every night of a 20-day run.

## Spec

| Field | Value |
|---|---|
| Slot | `fire` |
| Tri budget | **≤300** |
| Texture | one albedo, **512×512** — charred bark, ash, ember glow **in albedo only** (see Notes) |
| Real size | 0.7 m diameter × 0.3 m tall |
| Origin | base-seated and centred: ground at y=0, ring centre at x=z=0 |
| Forward | n/a (rotationally symmetric — yaw-randomise on placement) |
| Collision | **none** — do not collide a 0.3 m fire on a 6 m pad the player parks on |

## Acceptance

- `assets/models/campfire.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/campfire.blend` + `campfire.py`.
- Seats at the `fire` slot; the `over-fire` slot (ASSET-25's A-frame) clears it without intersecting.
- Reads as a laid fire when **unlit** — if it only works with flames on top, the asset is leaning on
  work that isn't its own.
- Tri count within budget; material names stable and distinctive (the flame/light rig attaches by
  material and node name).
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Ships unlit — flames, light and dynamic shadows are a VFX ticket.** Same rule as ASSET-08,
  ASSET-13 and ASSET-17, but this one has the most riding on it: FEAT-45 deferred *"tent model +
  **animated campfire w/ dynamic shadows**"*, and the day/night pass (`src/moon.js`, two-light shadow
  cascade, `fogColor` as a **radiance** value) is what that animation will have to live inside. Model
  a cold fire with a clean attach point; do **not** bake glow into the albedo beyond dull embers.
- **Distinct from ASSET-08 (fire pit).** That is a built, permanent, stone-ringed POI fixture that
  belongs to a place. This is the player's own fire, small and ephemeral, laid wherever they stopped.
  Do not merge them — the difference between *someone lives here* and *I slept here* is the entire
  point of both.
- No gameplay. Whether a fire is required to sleep, and what it is worth, is SM-1 / `src/day.js`.

## Resolution (2026-08-22)

**Closed — model delivered.** `assets/models/campfire.glb` ships at **472 tris**
(FireStone 220 + FireCoal 143 + FireLog 61 + FireAsh 48), 0.708 x 0.378 x 0.675 m, base-seated at
exactly y = 0, single-sided, 34 kB. Sources committed at `assets/models/src/campfire.blend` +
`campfire.py` (parametric, Blender 5.2.0 LTS). Registered as `campfire` in `data/prop-models.js`
with `collision: { shape: 'none' }`, as the spec asks. Commits `777fdf4` + `8d576f6`.

Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges, 0 loose verts,
0/7784 inverted first-hit rays.

### Deliberate departures from the spec above

- **No texture.** The spec budgeted one 512x512 albedo for "charred bark, ash, ember glow".
  ART-STYLE.md rule 1 wins: char and ash are *wear*, which is the named anti-pattern, and the spec's
  own Notes forbid baked glow. Four flat materials, zero images — `FireAsh` / `FireCoal` /
  `FireLog` / `FireStone`. Same call as ASSET-02's cancelled face texture.
- **Over budget: 472 against 300.** The 11-stone fire ring is 220 of it; everything this ticket
  specified comes to 252, comfortably inside 300. **The 300 was a number for a ringless fire** — the
  first build dropped the ring entirely and landed at 232. ASSET-08, the other ringed fire, budgets
  450 with ~300 earmarked for stones, which is the right order. **If this ticket is ever reopened,
  its budget should read 500.**
- **Taller and slightly wider: 0.378 m against 0.30, 0.708 m against 0.70.** At 0.7 wide x 0.3 tall a
  teepee is twice as wide as it is high, the logs come out near horizontal, and it reads as three
  logs lying down rather than a laid fire. The 8 mm of extra width is the stone ring, whose footprint
  this ticket never budgeted either.
- **Three logs, teepee, tips touching**, with one carrying a side branch (owner call 2026-08-21).
  The spec said "split logs in a lean-to"; five logs read as a wigwam frame.
- **A stone ring, after all** (owner calls 2026-08-21/22) — see the flag below.

### The flame is not in the .glb, and that is the design

glTF carries meshes, node transforms and keyframes; it carries **no lights and no particle systems**,
so an animated fire authored in Blender would not survive export at all. Flames also want additive
blending and a scrolling shader, which is a `ShaderMaterial` in `src/`, and the light has to live
inside the existing two-light day/night cascade rather than fight it from inside an asset file.

The `.glb` therefore ships **cold**, with an empty node **`FireFlameAnchor` at (0, 0.085, 0)** in
model space for the VFX rig to parent flame quads and a point light to. Material names are the rest
of that rig's API. This satisfies the spec's "Model a cold fire with a clean attach point".

### FLAG for ASSET-08 (fire pit) — a conflict this ticket created

This ticket's Notes make the ring ASSET-08's entire identity: a stone-ringed pit says *someone lives
here*, a bare laid fire says *I slept here*, and "the difference between those two is the entire
point of both". The first build honoured that by dropping the stones; the owner's 2026-08-21/22 calls
put an 11-stone ring back on and re-framed this as a **found** ring the player is re-using.

**The two assets now share their strongest silhouette cue.** ASSET-08 needs a different
distinguishing feature or the pair will read as the same object at any distance.

**Resolved the same day:** ASSET-08 was re-specced by owner ruling from "a ring of stones around a
bed of ash" to a **brick-and-mortar backyard fire ring** — coursed blocks, staggered joints, dead
level, 1.0 m across, sitting on a footing. The distinction is now *built versus found*, carried by a
straight level top edge that nothing natural has, and it survives at silhouette distance.

### One acceptance line is NOT met, and is carried forward, not dropped

*"Loads and places in-world through the FEAT-59 model import service."* The registry entry exists —
that half is done, and it is the half an asset ticket owns. What is missing is the other half:
`src/camp.js` has no `fire`-slot renderer, and nothing calls `spawnModel` for any camp slot. That is
**FEAT-66** (camp gear slot renderer), already carrying the identical gap from ASSET-23. Closing this
does not close that.

---
id: ASSET-22
type: asset
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-09-30
closed: 2026-09-30
blocked-by: FEAT-59
relates: FEAT-46, ASSET-32, ASSET-31
---

# ASSET-22: Rural mailbox

**Road furniture** — repeats along the network, never a destination. It makes a road read as
maintained and inhabited *between* POIs, at a density no POI model can carry. Placed from road
geometry rather than scattered at random.

## Request

A steel mailbox on a weathered timber post at the roadside — flag up or down, slightly canted, a
dented one here and there. Small, endlessly repeatable, and the closest thing this asset class has to
a **load-bearing gameplay object**: `.planning/story-mode/missions.md` §2 describes the paper route
as *"a fixed stack of papers, a wide fan of delivery POIs"* — and there is currently nothing in the
world to deliver **to**. The newspaper roll asset already exists; its target does not.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤250** — it will be the most-repeated object in the game; treat the budget as hard |
| Texture | one albedo, **512×256** — galvanised steel, rust at the seams, timber grain, a faint house number |
| Real size | 0.20 m wide × 0.48 m deep box, 1.15 m to the box top |
| Origin | base-seated: post foot at y=0 |
| Forward | −Z (box **opening** faces −Z; the flag is on the −X side) |
| Collision | `{ shape: 'box', dims: [0.20, 1.15, 0.48] }` — knockable, not a wall |

Flag modelled **up** (a delivery target reads better raised) as a separate, stably-named node, so a
down state is a transform rather than a second model.

## Acceptance

- `assets/models/mailbox.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/mailbox.blend` + `mailbox.py`.
- Tri count within budget — verified, not estimated. At this repeat count it is the only number in
  the ticket that really matters.
- The flag is an addressable child node with a stable name.
- Reads as a mailbox in silhouette at ~40 m from a moving vehicle.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The one asset in the class most likely to need density instancing.** Mailboxes along a road are
  exactly the *scatter* case that is FEAT-59's **deferred** palette/`InstancedMesh` criteria, not its
  core per-mesh path. A few placed by hand is fine to prove the asset; a populated route is not, and
  will want that deferred work finished first. Say so before anyone plans the paper route around it.
- **Is a paper-route drop point** [owner, 2026-09-30] — a mailbox can carry the `newsCustomer` tag
  in place of a porch, scored like any POI. A cluster of mailboxes (not yet ticketed) is occasional
  visual juice and still one drop point, one paper. Untagged mailboxes double as lawn furniture
  (FEAT-71) and are scenery only. Ruling + build notes: `missions.md` §2 "A drop point is a porch or a mailbox".
- **Ships as scenery with no interaction.** Throw detection, delivery scoring, and the papers-
  remaining budget are all paper-route mission work; `.planning/story-mode/missions.md` §2 and
  DESIGN.md govern. This ticket only guarantees a target exists to aim at.
- The house number is texture, and should be varied by **UV offset into a shared strip**, not by a
  second texture — that is the cheapest possible way to make a repeated object stop reading as a
  clone.
- Pairs with ASSET-32 (uncle's van).


---

## Resolution (2026-09-30, extended 2026-10-01) — SHIPPED AS AN ELEVEN-FLAVOUR KIT

Eleven `.glb` files, one generator. All eleven base-seated, forward `-Z`, zero images, inside the
250-tri budget, and registered in `data/prop-models.js`. Five shipped 2026-09-30; the owner asked
for six more from photo references on 2026-10-01.

| File | Tris | Flavour | Size (W x H x D) |
|---|---|---|---|
| `mailbox-classic.glb` | **132** | Galvanised tunnel box on a 4x4 timber post, flag up | 0.223 x 1.235 x 0.478 |
| `mailbox-tube.glb` | **212** | Same box on a steel pipe post, newspaper tube slung beneath | 0.223 x 1.235 x 0.478 |
| `mailbox-leaning.glb` | **148** | Canted post, dented box, door hanging open, flag snapped off | 0.285 x 1.085 x 0.586 |
| `mailbox-cluster.glb` | **204** | Three small boxes on a shared rail between two posts | 0.840 x 1.197 x 0.400 |
| `mailbox-pillar.glb` | **180** | Box on a dry-stacked stone pillar under a cast cap | 0.528 x 1.273 x 0.497 |
| `mailbox-bucket.glb` | **192** | Post set in a 5-gallon pail of concrete | 0.268 x 1.235 x 0.478 |
| `mailbox-planter.glb` | **242** | Galvanised wash-tub planter at the foot, finial on the post | 0.554 x 1.262 x 0.554 |
| `mailbox-barn.glb` | **180** | A barn: gable, overhanging dark roof, white trim on red | 0.276 x 1.221 x 0.486 |
| `mailbox-limb.glb` | **188** | A tree limb for the post, standard box | 0.257 x 1.235 x 0.478 |
| `mailbox-chicken.glb` | **244** | Jigsawn chicken cut-outs bolted to a standard box | 0.223 x 1.410 x 0.596 |
| `mailbox-fancy.glb` | **184** | Cast aluminium: panelled body, topper, scroll bracket, ball finial | 0.243 x 1.497 x 0.437 |

**SIX OF THE ELEVEN REUSE `tunnel_box()` UNCHANGED.** That is the shape of the kit — a mailbox is a
mailbox, and the variety lives in what it is mounted on. Only the barn and the cast one replace the
box itself, because those are a different object in the world rather than a different mounting.

Sources: `assets/models/src/mailbox.py` + `mailbox.blend`. Own work, no `CREDITS.md` entry.

### Acceptance

- [x] `.glb` exists, export-clean under ASSETS.md — five of them.
- [x] Sources committed (`mailbox.blend` + `mailbox.py`).
- [x] **Tri count verified, not estimated** — through the depsgraph with modifiers applied, and
      again out of the `.glb`'s own index accessors. Worst case 212/250.
- [x] The flag is an addressable child node with a stable name (`Flag`), origin on its pivot.
      **Except `mailbox-leaning`, which has none on purpose** — its flag is snapped to a stub.
      Consumers must check for the node, not assume it.
- [x] Reads as a mailbox in silhouette at ~40 m.
- [x] Loads through the FEAT-59 service (`spawnModel('mailboxClassic')` etc.). `model-palette`
      and `dist-assets` gates green; the 12 affected gates green.

### Deviations from the spec, and why

**The 512x256 albedo was dropped; the kit is untextured.** The ticket budgeted it for "galvanised
steel, rust at the seams, timber grain, a faint house number". Three of those four are *wear*,
which ART-STYLE rule 1 names as the anti-pattern and which `gas-pump` (2026-08-22) already had
stripped on the same grounds. The fourth, the house number, is ~25 mm of lettering on a 0.20 m box
— sub-pixel at the 40 m distance this ticket itself sets — and there is no addressing system in
the game for it to carry information into. ASSETS.md's kit rule also bites: five files cannot
share one image (three.js does not dedupe across `.glb` loads), so a texture here costs five
bakes, not one. **If an addressing system ever arrives, the UV-offset-into-a-shared-strip note in
this ticket is still the right way to do it** — it just has nothing to say yet.

**Variety went into silhouette and recolour pools instead.** Eleven shapes that do not look like
each other at distance, plus three curated pools — `MAILBOX_PAINT` on `MailBox` (galvanised /
cream / bottle green / oxide red / matte black) shared by the nine flavours that use the standard
box, `BARN_PAINT` on `BarnBody` and `FANCY_PAINT` on `FancyWhite` for the two that replace it.
All three are five entries long on purpose, so one seed-derived index means a consistent choice
whichever flavour a spawner drew. Index 0 of each equals its own `.glb`'s authored colour, which is
what `test/model-palette.mjs` asserts.

**One ticket, five files** is the sanctioned `steel-drum.py` / `road-signs.py` kit packaging
(ASSETS.md): one `.py`, one `.blend`, a `.glb` per variant, one registry entry each.

### What this does NOT do

- **Nothing places them.** No pool tag, deliberately — road furniture is placed *from road
  geometry*, which is **FEAT-72**. Do not invent a `roadFurniture` tag to make them appear (the
  flamingo / road-sign rule).
- **A populated paper route still wants FEAT-59's deferred `InstancedMesh` path first**, exactly
  as this ticket's own note warns. Each mailbox is 3-5 draw calls cloned per spawn. A handful
  placed by hand proves the asset; a route planned around them does not.
- **No interaction.** Throw detection, delivery scoring and the papers-remaining budget are paper-
  route mission work (`missions.md` SS2, DESIGN.md). `mailbox-cluster` is the model the
  2026-09-30 multi-customer note asked for; wiring it to several customers is that work, not this.

### The second wave's own findings (2026-10-01)

Each of these was caught by a numeric check, not by looking:

- **The derelict's lean sign.** Rotating about `+X`, `y' = y cos t − z sin t`, so a point high on
  the post only moves toward `+Y` (the road) when `sin t < 0`. The sign that looks right when typed
  leans it away.
- **A finial that shares its post's top four corners welds to it.** `remove_doubles` merged them and
  left 4 non-manifold edges. Six millimetres of overlap fixes it — the "nothing abuts exactly" rule
  in the generator's own header, broken in the easiest place to break it.
- **Trim that starts flush z-fights.** The barn shipped five coplanar face pairs: a sill belt
  starting exactly on the body's bottom plane, windows starting exactly on the wall plane, a door
  frame on the gable cap, a knee brace flush with the board, and the two X-braces lapped at
  identical depth. None of it is visible in Blender, which is two-sided.
- **So the export gate now runs the whole numeric audit**, not just the inverted-face ray cast:
  non-manifold edges, loose verts, degenerate faces and coplanar pairs within 1.2 mm. It refuses to
  let a bad export stand.
- **The chicken took three proportion passes.** 60 mm neck at 290 mm tall came back a goose; the
  second was a slab. A chicken's neck *flares into the breast* and carries a *small* head — 116 mm
  at the root, 224 mm of rise (about one box height), comb sitting down on the crown.
- **A whole-model facing probe lies on a wide base.** The planter's 0.55 m wash tub is perfectly
  Z-symmetric and dwarfs the box's 23 mm of door asymmetry, so the probe reported the door
  backwards. Measure facing on the BOX material only.

### Three traps worth keeping

1. **Facing.** The `+Y up` conversion sends Blender `+Y` to glTF `-Z`, so the front must be
   modelled facing Blender **+Y** — not `-Y`, which is what "facing you in Front view" means and
   is the natural thing to type. The whole kit shipped backwards through three rounds of
   screenshots; a coordinate print caught it. Now written up in ASSETS.md.
2. **An open door needs somewhere to be open INTO.** Swinging the derelict's door off a capped
   shell left a solid galvanised wall. It gets a real 90 mm recessed cavity in the dark hardware
   colour — still ART-STYLE's "cap every opening", the same move as the trailer's curtains.
3. **Dents must not break nesting.** The derelict's first dent varied along the box's length at
   12 rad/m, which moved the shell's front rim and the cavity sleeve 90 mm behind it by up to
   28 mm *differently* — the sleeve came out through the shell and read as a hole. One ray in 257
   caught it. `export()` now hard-asserts zero inverted-face ray hits, so it cannot ship again.

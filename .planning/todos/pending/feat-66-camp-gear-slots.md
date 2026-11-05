---
id: FEAT-66
type: feature
status: open
severity: minor
opened: 2026-08-17
updated: 2026-11-02
relates: ASSET-06, ASSET-23, ASSET-24, ASSET-25, ASSET-26, ASSET-78, ASSET-79, FEAT-59, FEAT-45, FEAT-122, SM-1
---

# FEAT-66: Camp gear slot renderer

`src/camp.js` builds a 6 m camp pad (`campPadHalfM 3`) but renders **no gear on it**. ASSET-23's
tent is authored, exported and export-clean, and has nowhere to go — it is not in
`data/prop-models.js` and nothing places it. This is the missing half of `items.md`'s **visible-kit
rule**: *what you carry is what renders, so the campsite is the inventory screen.*

Split out of ASSET-23 at close (2026-08-17): the model was the asset ticket, the placement path is
a feature.

## Scope

Four **named slots** on the pad, per the camp anchor convention in ASSET-23..26:

| Slot | Gear | Asset |
|---|---|---|
| `shelter` | bedroll / sleeping bag / tent | ASSET-23 (tent.glb, done) |
| `fire` | campfire | ASSET-24 (**campfire.glb, done** — registered as `campfire`) |
| `over-fire` | cooking kit | ASSET-25 |
| `shade` | tarp | ASSET-26 |

Every camp-gear model is base-seated, centred on its own footprint, forward -Z. **Same slot ⇒ same
origin ⇒ swapping the model is the whole upgrade** — the renderer resolves slot → current kit item
→ model id, and nothing about placement changes when the player upgrades.

## Acceptance

- `data/prop-models.js` carries a `tent` entry (`assets/models/tent.glb`, collision
  `{ shape: 'box', dims: [1.4, 1.1, 2.2] }`).
- `src/camp.js` places the shelter slot's model at a fixed pad-local offset, loaded through
  `src/model-service.js` (FEAT-59), and leaves room for the `fire` slot and the parked Ranger
  inside the 6 m pad.
- Empty slots render nothing — no placeholder, no phantom gear.
- Adding ASSET-25/26 later is a registry entry plus a slot mapping, not renderer work.
- **REQUIRED (owner 2026-10-15, review-2 R-19): `tent.glb` (ASSET-23)** is visible at camp when the
  player possesses the item (inventory not built yet). Until then it stays shipped and unregistered —
  do not delete it.
- **REQUIRED (owner 2026-10-15, review-2 R-19): `awning.glb` (ASSET-06)** is visible at camp when the
  player possesses the item (inventory not built yet). It moves from lawn furniture to camp gear; it
  is not in any `lawnFurniture` / `yardClutter` pool and must not be tagged into one to make it appear.

**Update 2026-08-22 — ASSET-24 closed, so TWO slots now have models waiting.** `campfire.glb` is
registered in `data/prop-models.js` as `campfire` (472 tris, 0.708 x 0.378 x 0.675 m, base-seated,
`collision: none`), so the `fire` slot needs only the mapping. Two things about it the renderer
should know:

- It carries an empty node **`FireFlameAnchor` at (0, 0.085, 0)** in model space. The flame/light/
  flicker VFX is a separate ticket, but whoever writes it will parent to that node, so do not strip
  non-mesh children when placing the model.
- Its footprint is 0.708 m, and the `over-fire` slot (ASSET-25's A-frame) has to straddle it without
  intersecting — that is ASSET-24's own acceptance line and it lands here.

**Update 2026-10-01 — `fire` slot DONE, lit.** `src/campfire.js` (`CampfireFx`) places
`campfire.glb` at the pad centre when camp is made (it replaced the blue placeholder cube in
`main.js`) and supplies ASSET-24's deferred VFX: faceted unlit flame cones on FireFlameAnchor, a
pulsing FireCoal emissive, rising embers (one instanced draw), and one flickering PointLight
scaled by the sky's nightFactor like the lamp pools. Tunables in the "Campfire (FEAT-66)" debug
folder. The light's shader-program variant is precompiled at boot (chained after PERF-21's
prewarmLightPrograms), and the light is `visible=false` whenever no camp is up, so it has no
per-pixel cost while driving.

- **No fire shadows yet (owner, 2026-10-01).** The truck parks out of shot, so there is nothing
  near the fire to cast one. Turn on `light.castShadow` when the tent/tarp land. That costs a
  six-face cube shadow map, so it needs a quality toggle.
- **Slot offsets still open.** The fire sits at pad-local (0, 0). When the shelter slot lands,
  give both slots pad-frame offsets (pad record carries `tx/tz/nx/nz`). The fire is
  yaw-randomised from a hash of the pad position.
- Remaining scope: shelter (tent / bedroll), over-fire (ASSET-25), shade (ASSET-26), and the
  inventory → slot mapping (visible-kit rule).

**Update 2026-10-16 — the slot mapping reads the BACKPACK, not the inventory** (items.md §2c,
owner). Owned camp gear rides in the truck; only what is **packed** comes out at camp, set up
automatically. So the renderer resolves slot → packed item → model id. Every run starts with the
Pack (2 slots) holding the bedroll; the fire is always there and takes no slot.
The `shelter` row above predates this: the **bed** (bedroll / air mattress / sleeping pad / deluxe
pad) is one slot, and the blanket and sleeping bag render *with* the bed, not in place of it. The
campfire is not an item — it spawns to mark camp.

## Owner rulings 2026-11-02 (the FEAT-66 plan)

1. **The tent is +10% recovery**, the same as the sleeping bag: an add-on in its own pack slot, adding
   to the bed's and the other add-ons' bonuses.
2. **The awning works like the shade tarp: it fills the shade deficit** at the chosen site, trees or
   no trees. Both are items; both fill the whole shade segment (`camp.js vibeAssist`).
3. **The cooking kit and the shade tarp are items too.** The kit is look-only until groceries exist.
4. **Bed models.** The sleeping bag's thumbnail model is already laid out flat: use it as is. The
   bedroll needs an UNROLLED version for camp (ASSET-78). The blanket is a layer that sits on top of
   the bedroll or the sleeping bag (ASSET-79).

## Built — 2026-11-02 (feature/run-shape)

- **`src/camp-gear.js`** (render-only, like `campfire.js`). `CAMP_SLOTS` are points in the pad frame
  (u along the road, v away from it); every model faces the road (front −Z along −n), so the tent's
  door, the awning's open side and the kit's frame face the fire and the truck. **Slots that share a
  point nest:** the kit straddles the fire at (0, −1.3); the bed, the tent and the shade share
  (0, +1.3/+1.1) — shade over where you sleep. Measured with their guy lines the tent is 2.4 × 3.2 m
  and the tarp 3.7 × 3.5 m: side by side with a fire they do not fit on a 6 m pad, nested they do.
  The fire moved off the pad centre to its slot; the camera still focuses on the centre.
- **The bed slot stacks** by `layer`: bed → sleeping bag → blanket, each on the measured top of the
  one under it. Every other slot shows the first packed. No `model`, nothing rendered.
- **`data/items.js`**: `campSlot` + `model` on every camp item; new `tent` (rest 0.10), `awning` and
  `shadeTarp` (`fills: 'shade'`), `cookingKit` (23 kg). Descs drafted (no digits) — the owner's words
  are welcome. **`data/prop-models.js`**: `tent`, `awning` registered.
- **`src/inventory.js`**: `packed()` (the equipped pack's contents) and `fills()`.
- **`src/camp.js` `vibeAssist(site, fills)`**: the whole deficit of each filled segment, all assists
  capped at `VIBE_ASSIST_CAP` 0.3, applied to the CHOSEN site (main.js `_siteVibe`: the night's
  rate and the card's vibe %), never inside the hunt. The vibe bar shows it as a ghosted tail after
  the shade segment (`.vseg-ghost`, the shade green at 40% opacity), on the hunt card and the
  confirm card, unlabelled.
- **`src/main.js`**: `_enterCampScene` lights the fire at its slot and dresses the pad; the
  inventory's `onChange` re-dresses a camp that is up, so packing at camp shows at once;
  `_exitCampScene` clears it. Dev handle `window.__campGear`.
- **The bed models** (owner: use the thumbnail models as is): `sleeping-bag.glb`, `air-mattress.glb`,
  `sleeping-pad.glb`, `deluxe-sleeping-pad.glb`, exported from `assets/models/src/items.py` (`WORLD` rows:
  length on glTF Z, head end at +Z) and registered; a bag on a pad stacks and shows through the tent
  door. **`export_glb` now runs headless** (`blender -b`): only the GUI's window override needed a
  window, the glTF exporter does not.
- **Thumbnails** for `tent`, `awning`, `shadeTarp`, `cookingKit`: rendered through the items.py rig
  from their own .glbs (`from_glb`), headless. For the owner's look on the item-setup page.
- **Gates:** `test/camp-gear.mjs` (new — the layout on the real .glbs, the stacking, the shade fill,
  the tent's rest); cdp-smoke `campGear` step (a packed tent loads at camp, repacking re-dresses it).

## Owner's look — 2026-11-05 evening (:3731)

- **The camp gear "render[s] just fine in camp."** The look is done.
- *"there is no tent awning or cooking kit on 3731"*: no run gives them yet (below). They are reachable through
  the debug grant; where a run gets them is the open question below.

## Still owed

- **The bedroll's and the blanket's models**: ASSET-78 (bedroll, unrolled — the one every camp shows)
  and ASSET-79 (blanket layer). Until then the starter camp's bed slot is empty.
- **Where the four new items come from** (shelf, rewards) — owner's call. Debug grant only today: backtick →
  "Story · Inventory (FEAT-122)" → item → "grant item" (story mode does not hold the debug lockout; only
  scenarios do). Recommended for the alpha, pending FEAT-168's shelves: mission rewards, B–A, as the other camp
  gear will be — the tent and the shade tarp from residences and farms, the awning from the general store and
  residences, the cooking kit from the food vendor and farms.
- **Fire shadows** (`light.castShadow`) — wanted once the tent landed; a six-face cube shadow map, so it
  needs a quality toggle first. Its own perf item.
- **The starter Pack has one free slot**, so today a player can bring the tent OR a shade OR the kit.
  The bigger packs (items.md §2c) are unbuilt.

## Notes

- **No tier language in the registry** (SM-INV-10 via items.md): the sleeping-bag/tent difference
  must never surface as a number. Name entries for what they are, not for what rung they occupy.
- The tent's fly is authored double-sided so the open door shows the inside — verify that survives
  the load path and is not flattened by a material default.

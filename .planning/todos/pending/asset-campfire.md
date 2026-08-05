---
id: ASSET-24
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
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

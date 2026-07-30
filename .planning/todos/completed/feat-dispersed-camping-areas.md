---
id: FEAT-45
type: feature
status: completed
opened: 2026-07-28
closed: 2026-07-30
severity: minor
relates_to: FEAT-16 (2D map), FEAT-21 (road POI scatter), story mode (DESIGN.md — sleep/doze clock)
---

# FEAT-45: Dispersed camping areas

## Request

Designate **dispersed camping areas** — the general zones where the player is allowed to camp
(as on real forest-service land, where dispersed camping is permitted in broad areas rather
than at discrete numbered sites). Shown on the 2D map (`M`) as a **yellow overlay** covering
the permitted area.

## Ratified: the camp dialogue is gated on the parking brake (owner, 2026-07-29)

Establishing camp uses the **same trigger as taking a mission** (shipped for FEAT-46 POIs on
2026-07-29 — see `_updatePoiPrompt` in `src/main.js`): you must be **stopped**, then **latch the
parking brake with Space**. The rising edge of the latch — not a dedicated interact key — opens
the dialogue. Prompt/dialogue copy:

- in a camping area, stopped, brake not latched → prompt reads **"park to establish camp"**
  (mirrors the mission prompt's "park to begin mission")
- on the latch edge → dialogue: **"campsite (stats) · establish camp · abandon"**

Reuse the mission trigger's rules verbatim: edge-triggered (so spawning or sitting latched never
re-opens a dialogue you just abandoned), and a speed gate loose enough that idle creep still counts.

## Open questions (scope in plan mode when picked up)

- What defines an area's extent — a radius around road edges/spurs, a terrain-derived polygon
  (low grade, off-water, off-road-carve), or a seeded blue-noise blob set?
- Is the overlay purely informational, or does it gate a camp/sleep action (story mode's
  sleep/doze clock — check `.planning/story-mode/DESIGN.md` invariants before wiring gameplay)?
- Rendering: filled translucent yellow polygons on `map2d`, or a coarse raster/tile mask?
- Any world-space cue when the player is inside one (sign, HUD hint), or map-only for now?
- Relationship to FEAT-21 POIs — same placement machinery, or independent?

## Acceptance

- Camping areas are deterministic and window-invariant (same seed/params → same areas from any
  stream center), consistent with the rest of worldgen.
- The 2D map renders them as a legible yellow overlay that reads as "area", not "point".
- No regression on existing road/terrain/map gates.
- Camp is established only from a stopped truck with the parking brake latched, and the world-space
  prompt / dialogue copy matches the ratified section above.

## Resolution (2026-07-30, SM-1 worktree feature/sm-1)

Shipped as `src/camp.js` (CampSystem + CAMP_PARAMS) in Phases C/D — commits 926d89b (zones + map
borders), f4bedb1 (grading, pad, sleep, mom's house). Gate: `test/camp-zones.mjs` (2594752).

**The owner ratified the full camping spec in-session 2026-07-30, answering this ticket's open
questions:**

- **Extent**: seeded macro-cell discs (~1 km mean diameter, ~20% global map density — measured
  17.8–19.5% across seeds; gate asserts 15–25% globally, deliberately not per-region which is
  high-variance). Pure `f(seed, cell, CAMP_PARAMS)`; region clip is a post-filter (window-invariant,
  SM-INV-12).
- **Zones gate camping AND are road-tethered**: camping only inside a zone within **20 m of the
  road edge** — the prompt says so when you stray ("dispersed camping is limited to 20m from the
  road edge"). The player is not meant to wander off-road hunting spots.
- **Rendering**: BLM-style — the 2D map shows only a yellow casing along road stretches inside a
  zone, never a filled disc (`map2d._drawCampZones`).
- **World-space cue**: the park-to-make-camp prompt + live **vibe** stacked bar (flatness up to
  50% graded over 6 m · shade/tree-count up to 30% over 6 m · water up to 20% within 30 m),
  shown in-zone below 20 kph.
- **Relationship to FEAT-21/46**: independent placement machinery (zones are permission, not
  furniture), but the interaction reuses the FEAT-46 parking-brake latch edge exactly as ratified
  here — POI pads win when both are in reach.
- **Make camp**: 30 in-game minutes, digs a 6 m flatten pad through the unified road pad-carve
  (`road.setCampPads` → the POI pad mechanism; road surface stays bit-identical — story-poi gate).
  Dialogue: break camp · **sleep** (energy meter + integer-hour timer; recovery `r(vibe)` =
  lerp(1.5, 3.0) h/h, average = full in 8 h, best = 2× worst) · fish (wip stub, only when water
  found). **Mom's house** at the region spawn sleeps at fixed average vibe.

Deferred, per the owner: tent model + animated campfire w/ dynamic shadows; the "home-cooked meal"
wake buff at mom's (→ IDEAS.md); FEAT-38 spur-clearing tie-in when spurs exist.

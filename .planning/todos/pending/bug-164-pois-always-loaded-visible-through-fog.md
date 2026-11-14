---
id: BUG-164
type: bug
status: in-review
severity: major
opened: 2026-11-12
source: owner, 2026-11-13 inbox — "I noticed that all POIs are always loaded. I can see them through the fog"
relates: [PERF-44, PERF-41, PERF-45, src/main.js]
---
lane: engine & world (the perf lane)

# BUG-164: Every POI stays loaded and draws through the fog

## Next steps
Orchestrator: land `land/bug-164` (one commit on main). Owner: look at the before/after pair below and rule on the
pop-in distance (recommendation: keep the rings' reach).

## Summary
Every POI model and yard in the region was drawn at any range (~60–70 objects, ~350 meshes, ~54 k triangles out
past the terrain edge). Past the drawn terrain a building has no ground under it, so it hung in the sky as a
fog-coloured silhouette. Fixed with the reach the orange rings already use: a POI's model and yard are hidden past
the drawn terrain, ((terrain ring + 1) · 64 m) = 192 m at Normal.

## Description
### Cause
`main.js _rebuildPoiMarkers` added every POI model, cube and yard satellite straight into the `poi-markers` group
and nothing ever hid them by distance. The materials DO take fog (FogExp2 0.006: 99.7 % fog colour at 400 m), but
fog colour ≠ the sky behind it, and past ~200 m there is no terrain to hide the building against. So the far ones
read as grey shapes floating on the horizon. Frustum culling hid the ones behind the camera; nothing hid the rest.

### Fix
Each POI now gets one Group holding its model (or cube) and its yard. The 10 Hz poll (`_updateMissionRings`, beside
the ring cull) sets the Group's `visible` from the distance to the terrain's own stream centre (`roadStreamCenter()`)
against `poiRingShowR()`, the reach the rings were given on 2026-11-03 ("render at draw distance"). Hidden means not
drawn and not in the shadow pass (Three.js skips invisible objects in both). The models stay loaded: the
geometry is shared with the cached template, so unloading would save no memory and add a reload hitch.

Unaffected: the POI colliders stay in `poiPhysics` (a collider 192 m+ from the stream centre cannot be touched,
and it is shown again before the truck is near it); map markers and mission logic read `poiSystem`, never the meshes;
FEAT-149 ornaments keep their own `visible` flag (a child flag survives the parent Group's), and their body swap runs
within 60–120 m, inside the cull radius; FEAT-102's motorist still hides through its own mesh flag.

### Measured (`test/poi-draw-census.mjs`, three random seeds, parked at the run's start, freecam at +3 m through four headings, 20 s per config)
`render()` main-thread ms per second (median / p99 / worst over the seconds), draw calls and triangles per frame (median),
shadow pass included:

| seed | before: ms/s med / p99 / worst · calls | after: ms/s med / p99 / worst · calls |
|---|---|---|
| 1768572700 | 62.0 / 73.8 / 73.8 · 116 | 52.2 / 61.3 / 61.3 · 88 |
| 17535907 | 52.3 / 68.3 / 68.3 · 108 | 44.7 / 57.1 / 57.1 · 102 |
| 759313244 | 62.0 / 72.8 / 72.8 · 119 | 50.0 / 63.2 / 63.2 · 92 |

About 8–12 ms/s of render CPU (15–19 %) and 6–28 draw calls per frame. Triangles in the frame drop only ~3–7 k of
~650–850 k: the frustum already culled most far POIs, so expect no measurable GPU change (PERF-41: triangles are cheap
on this GPU). Raw: `wip/bug-164/census.log` and `*-census.json` in the perf worktree (git-invisible).

## Tracker
- [x] POIs fade with the fog like terrain and props; none visible beyond it.
- [x] POI models beyond view distance are not drawn (and not in the shadow pass) — main-thread ms/s measured; GPU
  active cycles not run (no PERF-40 leg: the in-frame triangle change is < 1 %, below what the bench resolves).
- [x] Map markers and mission logic are unaffected by a POI's model being hidden.
- [ ] Owner look: pop-in distance.

## Open questions
- Pop-in distance. A POI now appears at 192 m (Normal), the same moment its ring does; at Normal fog it is ~27 %
  visible there (High 256 m ~35 %, Ultra 320 m ~40 %). Recommendation: keep it, one reach for ring and building.
  The alternative is the full built terrain, (ring + warm) · 64 m, which only differs on High/Ultra.

## Links
Before/after pair (the service station 548 m out, seed 1768572700): `wip/bug-164/before-1768572700-asis.png` vs
`wip/bug-164/after-1768572700-asis.png` in /Users/ledogen/CodeShit/CarGame-perf.

## Files
`src/main.js` (`_poiYards`, `_rebuildPoiMarkers`, `_updateMissionRings`) · `test/poi-draw-census.mjs` (the probe, not a gate)

## Log
- 2026-11-13 (perf lane): reproduced headless (census + screenshot), fixed, measured on the bench's three pinned random
  seeds before (main ba9458b3) and after.

## Landing (2026-11-13)
On main 0d9cb9f4 (smoke 26 steps, zero console errors; affected gates 9/9). Stays open for the owner look at the pop-in distance (owed: bug164-look).

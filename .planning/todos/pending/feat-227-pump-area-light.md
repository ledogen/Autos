---
id: FEAT-227
type: feature
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "we should add a point source light or two to the gas station fueling area"
relates: DEC-229, DEC-228, DEC-227, FEAT-226, BUG-174, BUG-175, src/main.js
---
lane: Spare

# FEAT-227: A real light at the gas station's fuelling area

## Next steps
Orchestrator: land `land/light-cull` (the light cull, below). Owner: with the cull, a dedicated pump light costs +2.8–4.0 %
GPU only within 200 m of a station and nothing elsewhere. Worth it? And is 200 m right (the pool pops on/off there)?

## Summary
The bay light also serves the fuelling areas: one point light goes to whichever lit place is nearest the truck (service
bay, gas station canopy, lone pump island). Since the light cull (owner 2026-11-16) it leaves the scene entirely while
no lit place is within 200 m, which saves 3.1–4.1 % GPU everywhere away from stations. No shadow.

## Description
- Placement (`PUMP_LIGHT` in src/main.js, model frame per `q.modelKey`): gas station (0, 3.4, −3.0), over the island,
  1.2 m under the 4.6 m soffit so the canopy glows broadly rather than in a hot spot (the DEC-228 lesson); lone pump
  island (0.28, 3.3, 0), over the pumps, just under the sign box (3.5 m). 120 cd, range 10 m, decay 2, warm white
  0xfffaee (the soffit lenses' StationLamp colour).
- One light per place is enough: from 3.3 m it lights the island, both lanes and a truck at either pump. The pool fades
  out about 8 m from the island.
- Bay and pumps share the light (`POI_LIGHT`, keyed by model, `_placePoiLight`). A pump right beside a service station
  gets only the nearer of the two, and the light hops between them when the truck crosses the halfway line. The
  siting is independent (src/poi.js), so this pairing is rare.
- Shader programs: 0 new from the light. On arrival at the station both main and the branch compile the same 5
  (`StationSign`, the sign's first draw); the scene holds 2 point lights in both (campfire + the POI light).

### Cost (everywhere)
GPU active cycles (busy % × MHz), B / A, paired alternating 2 s windows, spawn view with no station on screen, load
under 4. A = the branch before any pump light.

| B | seed | noon median (IQR) | night median (IQR) |
|---|---|---|---|
| second point light (ec9d5d91) | 71203 | 1.037 (1.033–1.042) | 1.034 (1.033–1.036) |
| second point light (ec9d5d91) | 28519 | 1.035 (1.015–1.058) | 1.044 (1.029–1.213) |
| shared light (946c1cc0, shipped) | 71203 | 0.982 (0.91–1.02) | 0.987 (0.95–1.025) |
| shared light (946c1cc0, shipped) | 28519 | 0.998 (0.988–1.022) | 0.992 (0.983–1.016) |

Every lit pixel in the world pays for every point light, wherever it stands, so the second light cost ~3.5 % whether or not a
pump was in sight. Harness: wip/lights-1116/ab.mjs + run-ab.sh, logs ab-run1/2.log, ab.log.

### Light cull (owner, 2026-11-16: "can we not just cut off the light beyond a certain distance? say 200m away")
`POI_LIGHT_CUTOFF_M = 200` in src/main.js: `_poiLight.visible` is false while no lit place is within it. three.js compiles
the point-light count into every lit shader, so the far world runs zero-point-light programs. The prewarm
(`prewarmLightPrograms` / the late sweep, src/vehicle-model.js) now covers 0, 1 and 2 point lights per lamp state (15 states,
was 10), so a switch never compiles mid-drive. Same A/B method as above, harness wip/light-cull/ (ab.mjs, hitch.mjs, boot.mjs).

| measurement | seed 71203 noon / night | seed 28519 noon / night |
|---|---|---|
| far: light removed / present | 0.968 / 0.969 | 0.959 / 0.969 |
| near (at the pumps): + dedicated 2nd light / shared only | 1.028 / 1.040 | 1.034 / 1.036 |

Switch hitch (seed 6, 23:00, cold shader cache, worst frame in 2.5 s; 60 Hz frame = 16.7 ms): main, first time the light
leaves the scene: 483 ms, +85 programs; later switches 16.8 ms. Branch: every switch 16.8 ms, +0 programs, render() CPU
max 2.1–2.5 ms before and after. Boot prewarm (15 states, was 10): cold cache 1.7 → 1.9 s (one run 7.7 s), warm
1.0 → 1.4 s. Far, a culled second light would cost nothing (it is out of the shaders like the first).

## Tracker
- [x] One point light at the nearest fuelling area, from boot, moved only
- [x] Night pictures before/after: truck at the pump, and from the road approaching
- [x] Everywhere cost measured (GPU active cycles, 2 seeds, noon and night)
- [x] 0 new shader programs when it first becomes relevant
- [x] Light cull: out of the scene beyond 200 m, prewarmed, no switch hitch (land/light-cull)
- [ ] Owner: shared light (free) or a dedicated pump light (+2.8–4.0 % GPU, only within 200 m of a station)
- [ ] Owner: the 200 m cut-off (the pool pops on/off there)
- [ ] Owner look at night

## Decisions
- 2026-11-15, owner: "we should add a point source light or two to the gas station fueling area" (DEC-229).

## Open questions
- Keep the shared light, or add a dedicated pump light, now +2.8–4.0 % GPU only within 200 m of a station? Recommendation:
  shared still; the pumps and a service bay are rarely in view together.
- 200 m: at night the lit pool switches on/off in one frame at that range. Not looked at.

## Files
`src/main.js`, `src/vehicle-model.js`

## Log
- 2026-11-15: ec9d5d91 a second light (+3.4 % GPU), then 946c1cc0 the shared light. Pictures
  wip/lights-1116/{gasStation,gasPump}-{atpump,approach}-{before,after}.png, sheets feat227-*-sheet.png.
- 2026-11-15: main merged (c37e3765), bay 48 cd (DEC-296, 32380bfb). Affected gates 10/10 green (cdp-smoke left to main).
- 2026-11-16: light cull, ec6d28e7 (land/light-cull). Far −3.1–4.1 % GPU; a dedicated 2nd light near a station +2.8–4.0 %;
  switch hitch 483 ms → none; boot prewarm +0.2–0.4 s. Affected gates 10/10 green (cdp-smoke left to main). Not looked at: the pool popping at 200 m.

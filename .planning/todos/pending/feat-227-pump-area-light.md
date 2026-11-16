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
Orchestrator: land `land/lights-1116`. Owner: a night look at the forecourt (wip/lights-1116/feat227-*-sheet.png in the
spare worktree), and the call below: is a second light worth +3.4 % GPU everywhere?

## Summary
The bay light now also serves the fuelling areas. The one point light that is always in the scene goes to whichever lit
place is nearest the truck: the service bay, the gas station's canopy or a lone pump island, and takes that place's
settings. A dedicated second light was built and measured at +3.4 % GPU everywhere, so it was not shipped. No shadow.

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

## Tracker
- [x] One point light at the nearest fuelling area, from boot, moved only
- [x] Night pictures before/after: truck at the pump, and from the road approaching
- [x] Everywhere cost measured (GPU active cycles, 2 seeds, noon and night)
- [x] 0 new shader programs when it first becomes relevant
- [ ] Owner: shared light (shipped, free) or a dedicated pump light (+3.4 % GPU)
- [ ] Owner look at night

## Decisions
- 2026-11-15, owner: "we should add a point source light or two to the gas station fueling area" (DEC-229).

## Open questions
- Keep the shared light, or pay ~3.5 % GPU everywhere for a dedicated pump light (ec9d5d91 has it)? Recommendation:
  shared. The pumps and a service bay are rarely in view together.

## Files
`src/main.js`

## Log
- 2026-11-15: ec9d5d91 a second light (+3.4 % GPU), then 946c1cc0 the shared light. Pictures
  wip/lights-1116/{gasStation,gasPump}-{atpump,approach}-{before,after}.png, sheets feat227-*-sheet.png.
- 2026-11-15: main merged (c37e3765), bay 48 cd (DEC-296, 32380bfb). Affected gates 10/10 green (cdp-smoke left to main).

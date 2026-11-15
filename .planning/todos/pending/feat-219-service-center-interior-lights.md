---
id: FEAT-219
type: feature
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "There's still no point sources for light inside the service center. I noticed this in the tutorial. It's just dark in there.…"
relates: FEAT-180, FEAT-184, FEAT-221, src/service.js
---
lane: B

# FEAT-219: Light sources inside the service center

## Next steps
Lane B adds point lights inside the service center.

## Summary
The service center interior has no point lights and is dark, noticed in the tutorial. It needs lamps inside.

## Description
Inbox i4mm:
> There's still no point sources for light inside the service center. I noticed this in the tutorial. It's just dark in there.

## Tracker
- [x] Point light sources inside the service center, so the interior is lit day and night
- [x] Checked in the tutorial service stop, night and day, and for frame cost

## Files
`src/service.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-14 (lane B): ONE PointLight (no shadow) created when the service screen opens in the bay, removed on exit; `SERVICE_LIGHT` in src/main.js is the single knob (60 cd, 12 m, over the lift): RETUNE AFTER FEAT-180 changes exposure (sky.js/exposure untouched). Ceiling strips were already emissive in the model. Measured headless: draw calls 118 -> 118, tris +0, shader programs 268 -> 429 (the light count changes, so lit materials recompile once on entry), steady frame 16.7 ms both (vsync-bound), worst frame at entry 25-35 -> 39-43 ms. Shots wip/service-center/{before,after}-h{12,22}-view{0,1,2}.png. Unverified: the hour probe did not visibly change the sky (both look dusk), real-GPU entry hitch.

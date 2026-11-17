---
id: FEAT-233
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "How possible would it be to draw the gas pump GUI on the actual gas pump as well as how it's drawn now as a 2D overlay?" then "The pump face is totally readable in game right now Granted it only shows the two numbers I think since we're making a new page for it anyway Let's reuse the style that's on the gas pump right now Just the two numbers in boxes With unleaded at the bottom All we have to do is animate those numbers spinning I would prefer rolling drum style numbers as to the digital style that's on there right now However the lighting is right now is also working just fine It seems to have a slight illumination. Go ahead and make the ticket"
relates: FEAT-50, BUG-182, ASSET-14, src/fuel-stop.js, src/main.js, data/prop-models.js, assets/models/gas-pump.glb
---
lane: B

# FEAT-233: The pump's own face shows the sale, live, in rolling drums

## Next steps
Landed (39015cdc, land/feat-233; src/pump-face.js). Owner: look card `feat233-look` (night and day pictures; drum colour; the chase
camera never sees the face). Ticks the last box.

## Summary
While you fuel, the numbers on the 3D pump you are parked at spin with the sale. The 2D overlay stays as it is.

## Description
The owner's spec:
- Reuse the style already on the pump model's face: just the two numbers in boxes, "unleaded" at the bottom.
- The numbers are rolling drums (wheels of digits that roll over), not the digital style on the model's face now.
- Keep the face's lighting as it is today ("a slight illumination"); it already reads in game.
- The 2D overlay is unchanged.

Shape: the face is painted on a canvas (a small bitmap the code draws) used as a texture on the pump's face, repainted
only while fuel flows, only on the pump in use. It needs BUG-182's redraw after a GPU reset.

## Tracker
- [x] The pump in use shows the sale and gallons in rolling drums, in the model face's own style
- [x] Idle pumps look as they do today, apart from drums in place of digital digits
- [x] Night and day pictures: reads as it does today
- [x] Survives a GPU reset (a real GPU-process crash in wip/feat-233/shots.mjs; test/gpu-reset.mjs runs free roam, no pump open)
- [ ] Owner has looked

## Log
- 2026-11-16: filed at the owner's word.
- 2026-11-16 Lane B (land/feat-233): src/pump-face.js — a canvas copy of each model's own gauge artwork with drums painted over its windows, on a quad 1 mm proud of every plate, in a clone of the face material (night glow mirrored). Both pump models: the station (2 windows, UNLEADED — the owner's description) and the lone pump (3 windows, GASOLINE). One rest + one live texture per model; drum carry shared with the 2D display (fuel-stop.js drumPositions, checked in fuel-stop gate). Face brightness vs today: night within 1 %, day face/background ratio within 4 %.
- Unverified: the chase camera never sees the face (it is on the island side of the truck, behind the 2D display); the owner's look.

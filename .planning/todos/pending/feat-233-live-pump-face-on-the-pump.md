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
Lane B: build it; then a look card.

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
- [ ] The pump in use shows the sale and gallons in rolling drums, in the model face's own style
- [ ] Idle pumps look as they do today, apart from drums in place of digital digits
- [ ] Night and day pictures: reads as it does today
- [ ] Survives a GPU reset (test/gpu-reset.mjs)
- [ ] Owner has looked

## Log
- 2026-11-16: filed at the owner's word.

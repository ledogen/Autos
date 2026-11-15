---
id: BUG-177
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "the texture for the gas pump face, which I was inspecting to see if the price is updated live. Seems busted. It's bright white, even in the darkness."
---
lane: Spare

# BUG-177: The gas pump face is bright white, even in the dark

## Next steps
Spare (the GPS + pump agent, land/gps-1115): find why the face ignores the scene's light and whether its picture is drawn at all.

## Summary
The pump's face should show its readout (the live price) and darken with the night. The owner sees a blank bright white panel. Not known whether this predates the FEAT-180 lighting rebuild.

## Tracker
- [ ] The face shows its readout and follows the scene light (a lit display may glow, but not as a white panel)
- [ ] Owner has looked

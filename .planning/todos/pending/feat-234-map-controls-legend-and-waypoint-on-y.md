---
id: FEAT-234
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "It's weird that A and Y both set the waypoint on the map view. Let's just commit to making it Y. Let's also show the waypoint control on the bottom of the map next to the distance legend. actually show all the map controls there Pan, zoom, and set waypoint"
relates: src/map2d.js, src/main.js
---
lane: Map batch

# FEAT-234: Map: the waypoint is Y only, and the controls are shown by the distance legend

## Next steps
Owner: look at the map (keyboard and pad). Pad: Y drops / clears; A no longer does.

## Summary
A and Y both set the map waypoint; commit to Y. Show all map controls (pan, zoom, set waypoint) at the bottom of the map next to the distance legend.

## Tracker
- [x] Y sets the waypoint; A no longer does (Enter too: `_onKeyDown` drops the waypoint on N, Y and a click only)
- [x] Pan, zoom and set-waypoint controls shown at the bottom by the distance legend, pad and keyboard glyphs (`_drawControls`, map2d.js; keycaps drawn on the sheet's margin, round for pad buttons)
- [ ] Owner has looked

## Decisions
- 2026-11-16, owner: "Let's just commit to making it Y" — DEC-319 (supersedes DEC-225's defaults 1 and 5).

## Files
`src/map2d.js` (`_onKeyDown`, `_drawMarginalia`, `_drawControls`) · `src/gamepad.js` (BINDINGS row) · `src/main.js` (comments)

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (lane C, land/map-batch): built. Row sits after the contour note; it stops short of the scale label, or of the cursor's coordinate readout while that shows (pad cursor at the sheet centre). Screenshots in wip/map-batch/ (map-kb2.png keyboard, map-pad.png pad). Not run on a physical pad: pad mode was forced with pad.active.

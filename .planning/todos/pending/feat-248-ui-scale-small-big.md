---
id: FEAT-248
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "We need a UI scale option. Playing this on a TV, the text is way too small to read. It's about perfect on my 15 inch MacBook And on my 1440p 27 inch monitor. I'm actually a fan of the way the new Monster Hunter game has only two options for UI scale, so let's do the same. The current setting can be called small and the TV mode can be called big."
relates: UI-STYLE.md, index.html
---
lane: unplaced

# FEAT-248: UI scale setting: Small (today) and Big (TV)

## Next steps
Owner looks (owed card ui-1117-look) and tunes the Big factor (--ui-zoom in index.html, 1.5 now). DEC-383.

OLD: A free lane (Sonnet): a two-value setting, Small = today, Big = TV. Find the cheapest single lever (one root scale) and show both on a 1080p TV-sized capture.

## Summary
Text is unreadable on a TV. Two options only: Small is the current size, Big is for a TV.

## Description
Read `.planning/research/UI-STYLE.md` first (12 px font floor, one pinned monospace font). The Big factor is the agent's proposal for the owner to tune.

## Tracker
- [x] Setting in the options menu, saved
- [x] Every menu, HUD, card and prompt scales
- [x] Nothing overflows the screen at Big on 1080p and 720p (smoke step uiscale)
- [ ] Owner has looked on the TV

## Log
- 2026-11-17: built on land/ui-1117 (35afeacd): CSS zoom on body children but the WebGL canvas. Map/cluster bitmaps are stretched, slightly soft. Main-menu pages scroll at Big. Sheet: wip/ui-1117/sheet.jpg.
- 2026-11-20: owner, via card ui-1117-look: "It works pretty well, but it's a little bit too big." then "big setting zoom should go from 1.5x to 1.4x" (the coordinator relayed 1.2 first, corrected to 1.4). index.html `html[data-ui-scale=big] { --ui-zoom }` 1.5 -> 1.4. Checked at 2045x1200 in wip/followups-1120/ui.jpg.

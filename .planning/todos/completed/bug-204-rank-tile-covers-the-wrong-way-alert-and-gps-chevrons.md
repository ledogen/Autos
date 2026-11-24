---
id: BUG-204
type: bug
status: closed
opened: 2026-11-17
severity: minor
source: orchestrator (FEAT-267 sheet)
---

# BUG-204: The rank tile sits on top of the "Wrong way" alert and the GPS chevrons

## Next steps
None. Closed 2026-11-21 on land/bugs-1121: the strip rows follow the job stack's measured bottom.

## Summary
On a hurried job the rank bar and letter tile are drawn top-centre, where "Wrong way. Turn around" and the in-world GPS leg's chevrons also appear. The tile covers both.

## Description
Seen in `CarGame-land-gps/wip/feat-267/sheet.jpg`, row "~50 m past the second cluster", right column. Demolition gained the rank bar in FEAT-267, but courier and papers share the layout.

## Tracker
- [x] The wrong-way alert is fully readable with the rank tile up
- [x] The UI-STYLE.md rules hold (12 px floor, token palette)

## Decisions

## Open questions

## Links
FEAT-267, BUG-203

## Files
src/main.js / the HUD's rank tile and alert line

## Log
- 2026-11-17 minted from the FEAT-267 sheet.
- 2026-11-17 same strip, second case (`CarGame-land-gps/wip/feat-267/sheet-r2.jpg`, the hit frame): the "spawn point set" toast overlaps the rank bar, with the deed line and the "+$" pay read-out stacked under it. One fix should cover the whole top-centre strip.
- 2026-11-18 index.html: while #rank-timer is shown, the toast/ignition/reset (196 px), machine-word (226 px) and stranded (256 px) rows sit under the job stack (CSS :has, no JS; px scale with the FEAT-248 zoom). Sheet wip/bugs-1118-alerts/sheet.jpg (forced-DOM harness, both UI sizes, kb + pad prompts: 20/20 clear vs 15/20 overlapping). Not checked in a live job: a fragile job's damage/health bars sit lower in the stack and can still overlap the strip.
- 2026-11-21 lane s2 (land/bugs-1121): CLOSED. Root cause of the leftover: 553e3d71's fixed 196/226/256 px rows assumed the rank-only stack (bottom 186 px at 1x); a fragile load's bars take it to 308 px (430 at Big), so "Wrong way" at 226 px sat on them (20/20 overlap, wip/bugs-1121/before-frag.log). Now a ResizeObserver in main.js writes the stack's bottom (--job-stack-b) and each row is max(its %, that bottom + 0/30/60 px): 40/40 clear, both UI sizes, kb + pad, with and without the bars (after*.log). cdp-smoke asserts it on the live demolition job, bars forced on. The GPS chevrons are in the world, not the strip; the tile still covers them by design of the tile's place.

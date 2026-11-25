---
id: FEAT-327
type: feature
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-23 — four inbox notes on the big UI mode, quoted in the Description; and card feat239-look, 2026-11-24 — "put the controls hint in the legend instead. also the legend should be collapsable and align to the bottom so it can be out of the way. open by default"
relates: FEAT-248, FEAT-239, FEAT-234, BUG-208, .planning/research/UI-STYLE.md
---
lane: Spare

# FEAT-327: Big UI notes of 11-23, the map legend, the camp highlight

## Next steps
Built on land/feat-327-big-ui; owner looks at wip/feat-327/sheet.jpg (small vs big, HUD and map legend) and drives the camp card. Numbers: cluster net 1.0 (was 1.4), run readout + column 1.15, rank tile 1.0, POI labels 13 px at Big (was 11).

## Summary
The owner played at the big UI scale and sent four notes. Two map answers from the 11-24 cards ride along because they touch the same files.

## Description
Big UI mode (owner's words):
1. "we need to significantly reduce the cluster size. The HUD and text are good. The only text that is a little too small is the text under POIs on the map."
2. "the camping screen gets two rows of buttons. The D-pad movement through them is not natural. It jumps down sometimes when you're pressing right or left. I had a can of beans in my inventory so it's possible that that extra button confused it."
3. "the rear springs and rear dampers tooltip shows up off the bottom of the screen."
4. "the mission overlay, timer, and details are in the way of seeing where you're driving. On the small UI mode it's totally fine […] Really it's the rank display in particular that takes up a disproportionate amount of space. We can probably shrink it a little."

Map:
5. FEAT-239 follow-up: "put the controls hint in the legend instead. also the legend should be collapsable and align to the bottom so it can be out of the way. open by default".
6. BUG-208: the owner picked "Wider yellow casing (about 10 px), both lines" for the campable-ground highlight under the job line and the GPS line.

## Tracker
- [x] 1 cluster much smaller at big scale; map POI label text a little larger
- [x] 2 camp card D-pad moves predictably over two rows (with a food button present)
- [x] 3 rear spring / damper tooltips stay on screen
- [x] 4 mission overlay smaller at big scale, the rank display first
- [x] 5 controls hint inside the legend; legend collapsible, bottom-aligned, open by default
- [x] 6 camp casing about 10 px under both lines (closes BUG-208)
- [ ] Owner's look

## Log
- 2026-11-24: opened from the inbox and the 11-24 card answers.
- 2026-11-24 lane u: all six built, gates 5/5. Tooltip root cause: fixed-position tips got zoomed left/top (placeTip, park-badge.js). D-pad root cause: menu-nav nearest() let a next-row button beat a same-row neighbour; sideways now stays in its row. Legend: CONTROLS rows + fold (mouse click on the band; pad has no fold, no new button). Camp casing 10 px.

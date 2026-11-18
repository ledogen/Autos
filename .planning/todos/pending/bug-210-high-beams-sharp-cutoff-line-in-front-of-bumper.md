---
id: BUG-210
type: bug
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "On the ground right in front of the front bumper, the high beams illuminate the ground differently. There's a sharp, bright cutoff line."
relates: FEAT-212, FEAT-223, PERF-37, DEC-373
---
lane: bug (alpha by default)

# BUG-210: High beams leave a sharp bright cutoff line on the ground by the front bumper

## Next steps
Fixed on land/bugs-1117-pad-cam-light; owner looks at night with the high beams, card bugs-1117-pad-cam-light-drive. Close on his word.

## Summary
On the ground just ahead of the front bumper the high beams light the ground differently, with a hard bright cutoff line.

## Description
Owner's words, verbatim (inbox 20261118062244-wtht):

> On the ground right in front of the front bumper, the high beams illuminate the ground differently. There's a sharp, bright cutoff line.

## Tracker
- [x] No visible hard cutoff line on the ground ahead of the bumper with the high beams on (gate headlamp-near-field; shots wip/bugs-pcl/sheet.jpg)
- [x] Nothing else about the headlights changes (low beam untouched; high beam's pattern above the axis untouched, ≈3 % less at 5 m, the ground 1–3 m ahead dimmer)
- [ ] Owner looks at night

## Decisions

## Open questions
- Answered: no, the low beam's near field ramps softly (measured). Was: does it show with the low beams too? He named the high beams.

## Links
FEAT-212, FEAT-223, PERF-37, DEC-373

## Files
src/vehicle-model.js (HEAD_TUNE.highCoreDownDeg, highBeam)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062244-wtht).
- 2026-11-18 CAUSE: the high-beam cookie was a round 28° disk + 33° halo, so it threw peak candela 12–30° below the axis onto the ground 1–3 m ahead; at 1/d² that read 10–70× the road at 10 m, and the spot's 57° cone edge cut it off within 0.2 m of ground (0 → 78 between 0.5 and 0.7 m ahead of the lamp, 400/m). The low beam's pattern has almost nothing there.
- FIX (7adc6a4d): the high pattern is squashed below the axis to HEAD_TUNE.highCoreDownDeg = 11° (a debug slider beside the core radius). Gate headlamp-near-field (three's spot formula on the real patterns; the old disk fails as control). No shadows (DEC-227 unchanged).

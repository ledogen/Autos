---
id: FEAT-262
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "The maintenance menu needs to tell you if your tire is old or standard"
relates: FEAT-212, src/service-screen.js
---
lane: unplaced

# FEAT-262: Maintenance names the tire fitted on each corner

## Next steps
Owner looks (owed card ui-1117-look); close on "Good".

## Summary
Each corner line under Tires and Wheels shows the fitted tire's own name (Old tire, Standard tire, Sport tire, All-terrain tire, Load-range E tire).

## Description
The name comes from `PARTS[fitted].name` in `data/parts.js`, through `parts.fitted('tire' + corner)`. Shown for every tire, factory or not (other rows still hide a stock part's name).

## Tracker
- [x] Every corner line names its tire
- [ ] Owner has looked

## Decisions
- 2026-11-17, owner: "The maintenance menu needs to tell you if your tire is old or standard" (DEC-384)

## Files
`src/service-screen.js` (`_corner`)

## Log
- 2026-11-17: built on land/ui-1117; picture in wip/ui-1117/big-maint-*.png; no gate asserts the text.

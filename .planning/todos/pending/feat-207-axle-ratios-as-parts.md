---
id: FEAT-207
type: feature
status: open — built on land/feat-207, NOT on main; owner approved for alpha 2026-11-14, rename pending (DEC-205)
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "the rear end gear ratios should be available to find as mods in game as well. generally the shorter ratios can be a little rarer."
relates: FEAT-166 (the differential as parts), FEAT-23 (drivetrain architecture), data/ranger.js (`finalDrive: 3.73`), data/parts.js, data/stock-weights.js
---
lane: B

# FEAT-207: Rear-axle gear ratios as findable parts — shorter ratios rarer

## Next steps
Owner answered 2026-11-14 (DEC-205): ALPHA, the four ratios are good, rename the part "final drive". Lane B renames it on land/feat-207 and the orchestrator lands it. The debug part selector is FEAT-222.

## Summary
The rear axle's final-drive ratio becomes a part the player can find and fit, like tires and the differential. Shorter gearing (a numerically higher ratio: more pull, more rpm at speed) is a little rarer.

## Description
- The truck carries **3.73** today (`finalDrive` in `data/ranger.js`). `[DEFAULT]` the set is the ratios Ford sold in this axle: 3.45, 3.55, 3.73, 4.10.
- A ratio is a part on the truck configuration: found, bought, fitted at an auto shop, lost on death.
- Rarity rises as the ratio gets shorter: 4.10 the rarest of the set.
- The physics already reads `finalDrive`; the work is the part, the shop row and the stock weights.

## Tracker
- [ ] Ratio parts in the parts data, with stock weights (shorter = rarer)
- [ ] Fitting one changes `finalDrive` on the live truck and survives a save
- [ ] Shown on the diagnostics / service screen
- [ ] Rename the part "final drive" everywhere the player sees it (the socket "Rear axle ratio" and the part names) (DEC-205)
- [ ] Landed for alpha; added to MILESTONES.md alpha table

## Decisions
- 2026-11-13, owner: ratios are findable mods; shorter ratios a little rarer.
- 2026-11-14, owner (card feat207-try): "alpha\nrename the part as \"final drive\" the ratios are good." (DEC-205). The rest of that note (the debug part selector) is FEAT-222 (DEC-206).


## Files
`data/parts.js` · `data/stock-weights.js` · `src/service.js` · `data/ranger.js`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-14: scribe recorded the owner's answer; open questions closed.

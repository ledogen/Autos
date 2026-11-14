---
id: FEAT-207
type: feature
status: open
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "the rear end gear ratios should be available to find as mods in game as well. generally the shorter ratios can be a little rarer."
relates: FEAT-166 (the differential as parts), FEAT-23 (drivetrain architecture), data/ranger.js (`finalDrive: 3.73`), data/parts.js, data/stock-weights.js
---
lane: B

# FEAT-207: Rear-axle gear ratios as findable parts — shorter ratios rarer

## Next steps
BUILT on land/feat-207, awaiting landing + the owner's two answers (card `feat207-try`: alpha or later, and the ratio set).

## Summary
The rear axle's final-drive ratio becomes a part the player can find and fit, like tires and the differential. Shorter gearing (a numerically higher ratio: more pull, more rpm at speed) is a little rarer.

## Description
- The truck carries **3.73** today (`finalDrive` in `data/ranger.js`). `[DEFAULT]` the set is the ratios Ford sold in this axle: 3.45, 3.55, 3.73, 4.10.
- A ratio is a part on the truck configuration: found, bought, fitted at an auto shop, lost on death.
- Rarity rises as the ratio gets shorter: 4.10 the rarest of the set.
- The physics already reads `finalDrive`; the work is the part, the shop row and the stock weights.

## Tracker
- [x] Ratio parts in the parts data, with stock weights (shorter = rarer)
- [x] Fitting one changes `finalDrive` on the live truck and survives a save
- [x] Shown on the diagnostics / service screen

## Decisions
- 2026-11-13, owner: ratios are findable mods; shorter ratios a little rarer.

## Open questions
- Alpha or later? (The message followed the "visual mods before alpha" one but does not say.)
- Is the set of four ratios right, or do you want wider (3.08, 4.56)?

## Files
`data/parts.js` · `data/stock-weights.js` · `src/service.js` · `data/ranger.js`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-14 lane B: built. Slot `axle` (data/parts.js), parts axle345/355/373(stock)/410, weights 2/2/4/0.5, rewards by rarity (4.10 uncommon), service-screen row under Drivetrain, thumb = the diff's. test/parts.mjs §5: stock 3.73, wheel torque ∝ ratio. Physics fingerprint identical to main. No DEC conflicts found.

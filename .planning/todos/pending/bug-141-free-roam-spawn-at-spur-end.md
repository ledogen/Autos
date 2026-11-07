---
id: BUG-141
type: bug
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: BUG-135 (story start seat), test/story-start-clear.mjs
---
lane: Spare

# BUG-141: free roam can spawn the truck facing a spur's dead end, or on a steep grade

Owner, verbatim (2026-11-07 tracker inbox): "Vehicle spawns in free roam are kind of busted This has been mostly rectified in story mode due to the presence of the tutorial and spawning at the burger joint But in free roam, it can still spawn you facing the end of a spur with nowhere to go My take is it should always spawn you on relatively level ground and not right at the end of the spur Relatively level is like under a 20% grade"

## Acceptance

- [ ] Free roam spawns on a road under 20 % grade, not near a spur's dead end, facing the long way.
- [ ] A census over random seeds: how often today's spawn fails either rule, and 0 after.

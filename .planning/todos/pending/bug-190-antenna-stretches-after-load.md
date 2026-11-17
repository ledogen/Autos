---
id: BUG-190
type: bug
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "I started a new game and chose to play the tutorial After the loading screen, the whip antenna was teleporting back and forth a million miles away stretched out into infinity This is right after load game breaking but a slight visual distraction. I'm pretty sure we just teleported the truck without teleporting the antenna so it had to catch up"
relates: FEAT-236, BUG-183
---
lane: unplaced

# BUG-190: The whip antenna stretches to infinity right after a load

## Next steps
Spare lane fixes it.

## Summary
After the loading screen (new game, tutorial) the whip antenna teleports back and forth, stretched far away. The truck was moved without the antenna.

## Description
Owner's reading: the truck is teleported and the antenna has to catch up. Fix at the root: every truck teleport resets the antenna's state to the truck (one place all teleports go through, cf. BUG-183's `_closeMenus` on teleport).

## Tracker
- [ ] After any teleport or load the antenna starts at rest on the truck
- [ ] A gate teleports the truck 1 km and checks the antenna tip stays within its length

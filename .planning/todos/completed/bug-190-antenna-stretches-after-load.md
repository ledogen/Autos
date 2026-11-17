---
id: BUG-190
type: bug
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "I started a new game and chose to play the tutorial After the loading screen, the whip antenna was teleporting back and forth a million miles away stretched out into infinity This is right after load game breaking but a slight visual distraction. I'm pretty sure we just teleported the truck without teleporting the antenna so it had to catch up"
relates: FEAT-236, BUG-183
---
lane: unplaced

# BUG-190: The whip antenna stretches to infinity right after a load

## Next steps
Closed.

## Summary
After the loading screen (new game, tutorial) the whip antenna teleports back and forth, stretched far away. The truck was moved without the antenna.

## Description
Owner's reading: the truck is teleported and the antenna has to catch up. Fix at the root: every truck teleport resets the antenna's state to the truck (one place all teleports go through, cf. BUG-183's `_closeMenus` on teleport).

## Tracker
- [x] After any teleport or load the antenna starts at rest on the truck
- [x] A gate teleports the truck 1 km and checks the antenna tip stays within its length

## Resolution
Root cause: `createAntenna.step` differences the mount's world position twice; a teleport gave a ~10^4 m/s velocity, and the unclamped drag term (dragK·|v|·v) flung the tip. Fix: any one-step base jump over 5 mast lengths snaps the antenna to rest (covers every path that moves the truck, by construction). Gate `test/antenna-teleport.mjs` (fails 374 km tip without the guard).

---
id: FEAT-264
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117103006-j5xw) — "After sleeping at the camp site for any amount of time over two hours you wake up and the campfire is dead. No more flames and smoke particle effects rising from the ashes. Let's also remake a campfire model that doesn't have the three logs, just ashes at the bottom."
relates: DEC-393, ASSET-90, ASSET-24, FEAT-66, FEAT-230, src/campfire.js, src/main.js
---
lane: unplaced

# FEAT-264: The campfire is dead after a long sleep

## Next steps
Owner: look at the dead fire (owed card camera-campfire-look) and answer the relight / cooking question below. A lane then builds ASSET-90 and swaps it in.

## Summary
Sleep more than two hours at a camp and you wake to a dead fire: no flames, no rising embers (the only "smoke" the fire has), no light, no coal glow. Until ASSET-90 (ashes-only model) exists, the live model shows with its logs.

## Description
`CampfireFx.setDead(true)` (src/campfire.js) is called by `_sleepAtCamp` when the sleep is at a camp (not the truck, not mom's) and `hours > CAMPFIRE_BURN_H` (2). `show()` lights it again, so a new camp, or breaking camp and re-making it, gives a fresh fire. The logs are a material (`FireLog`) of the single mesh in `campfire.glb`, so they cannot be hidden; the dead fire keeps its logs and unlit coal material until ASSET-90.

### What happens today when you stay at camp after waking
- Nothing relights the fire. Only break camp and make camp again does (a new fire, but the camp chore costs its 30 minutes).
- Cooking (FEAT-230): the "cook a potato" and "cook groceries" buttons are HIDDEN while the fire is dead, and the click handler refuses too, so cooking neither silently works nor breaks. This is a stand-in, not a ruling.

## Tracker
- [x] Fire dead after a sleep of more than 2 h at a camp (flames, embers, light, coal glow off)
- [x] Cooking refused while dead
- [ ] ASSET-90 shipped and swapped in (no logs, ashes only)
- [ ] Owner has looked

## Decisions
- 2026-11-17, owner: DEC-393.

## Open questions
- Can the dead fire be relit (a lighter, firewood from the pack, a button), or is break-and-remake the only way? Today: only break-and-remake.
- Should cooking be possible at a dead fire (as embers) or hidden, as now? The cook buttons are hidden today.
- Does an exactly-2 h sleep keep the fire? Today yes (strictly over 2 h).

## Links
ASSET-90 (`asset-90-campfire-ashes.md`), DEC-393.

## Files
`src/campfire.js` · `src/main.js` (`_sleepAtCamp`, `_renderCampUI`, the cook handlers)

## Log
- 2026-11-17 (lane s2): built on `land/camera-campfire`; the dead state is render-only (CampfireFx) plus a `fireOut` flag on the camp card state.

---
id: FEAT-264
type: feature
status: done
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117103006-j5xw) — "After sleeping at the camp site for any amount of time over two hours you wake up and the campfire is dead. No more flames and smoke particle effects rising from the ashes. Let's also remake a campfire model that doesn't have the three logs, just ashes at the bottom."
relates: DEC-393, DEC-397, ASSET-90, ASSET-24, FEAT-66, FEAT-230, src/campfire.js, src/main.js
---
lane: unplaced

# FEAT-264: The campfire is dead after a long sleep

## Next steps
Owner: look at the round-2 sheet (owed card campfire-camera-r2-look): the dead fire's smoke and a cook relighting it. "Good" closes this ticket.

## Summary
Sleep more than two hours at a camp and you wake to a dead fire: ASSET-90's ashes-only model, no flames, no embers, no light, no coal glow, and thin grey smoke rising off the ashes. Cooking at it relights it at once (DEC-397).

## Description
`CampfireFx.setDead(true)` (src/campfire.js) is called by `_sleepAtCamp` when the sleep is at a camp (not the truck, not mom's) and `hours > CAMPFIRE_BURN_H` (2). `show()` lights it again, so a new camp, or breaking camp and re-making it, gives a fresh fire. The logs are a material (`FireLog`) of the single mesh in `campfire.glb`, so they cannot be hidden; the dead fire keeps its logs and unlit coal material until ASSET-90.

### Staying at camp after waking (DEC-397)
- The cook buttons show at a dead fire. A cook click relights it (`setDead(false)`, `fireOut` cleared) before the 30 min fade. Nothing else relights it; break camp and make camp again still lays a fresh fire.
- The dead fire smokes: `CampfireFx.smokeSource()` hands the FireFlameAnchor to `TireSmokeSystem.setFireSmoke` each frame (smoke.js `FIRE_SMOKE`, one tunable block).

## Tracker
- [x] Fire dead after a sleep of more than 2 h at a camp (flames, embers, light, coal glow off)
- [x] ASSET-90 shipped and swapped in (no logs, ashes only)
- [x] Owner round 1 (2026-11-17): "if you cook at a dead fire the fire is instantly relit. simple, reads nicely." and "add smoke particle effects to the dead campfire. they should go mostly up, and expand before fading out" (DEC-397)
- [x] Cooking at a dead fire relights it (the cook buttons show again)
- [x] The dead fire smokes: grey, subtle, mostly up, swelling, fading
- [x] Owner has looked (round 3 + opacity 0.70: "perfect. its ready for main", 2026-11-18)

## Decisions
- 2026-11-17, owner: DEC-393.
- 2026-11-17, owner: DEC-397 (cooking relights a dead fire; the dead fire smokes).

## Open questions
- ~~Can the dead fire be relit?~~ Closed by DEC-397: cooking relights it; nothing else does.
- ~~Cooking at a dead fire?~~ Closed by DEC-397: allowed, and it relights the fire.
- Does an exactly-2 h sleep keep the fire? Today yes (strictly over 2 h).

## Links
ASSET-90 (`asset-90-campfire-ashes.md`), DEC-393.

## Files
`src/campfire.js` · `src/main.js` (`_sleepAtCamp`, `_renderCampUI`, the cook handlers)

## Log
- 2026-11-17 (lane s2): built on `land/camera-campfire`; the dead state is render-only (CampfireFx) plus a `fireOut` flag on the camp card state.
- 2026-11-17 (lane p, round 2): DEC-397 built. Cook buttons show at a dead fire and a cook relights it; the dead fire smokes (smoke.js FIRE_SMOKE on the tire-smoke pool: no new mesh, draw or light, ~13 puffs alive). Smoke step `deadFire` checks smoke, the relight and a fresh camp. Sheet wip/asset-90/sheet-r2.jpg.
- 2026-11-17 (r3): DEC-404 smoke lighter (0xa8a6a0 → 0xdcdad4), life 4–6 → 7–10.5 s, size capped at 2.0 m. Sheet wip/campfire-r3/sheet.jpg. Smoke step deadFire PASS; night frames are black in both, unverified by eye.
- 2026-11-17: owner (inbox 20261118064935-5l8d): wants a Light campfire button in the camp menu, because waking before first light leaves a black screen. Minted FEAT-286.
- 2026-11-18: owner found r3 too thin; peak opacity 0.42 → 0.70 on main. Owner: "perfect. its ready for main". CLOSED.

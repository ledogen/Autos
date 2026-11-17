---
id: FEAT-253
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Here's the plan. Post alpha, we build a system that allows the Player to position loads in the bed of the truck. This solves two problems One it lets us put a load behind our toolbox . 2. it also Automatically forbids cargo that you can't fit. We'll add in a system of custom built poses that lets you tilt the load up on the tailgate or on the cab depending on what load it is. Or perhaps we can Let the player pose it and then freeze it to the truck when they strap it. This also means when we add other bed accessories, they'll naturally block cargo. Pre-alpha, remove the toolbox"
relates: FEAT-204, FEAT-112
---
lane: unplaced

# FEAT-253: Post-alpha: the player positions loads in the bed; bed accessories block cargo

## Next steps
Post-alpha. Nothing to build now. The pre-alpha half (remove the bed toolbox) is on FEAT-204.

## Summary
After alpha, the player places a load in the bed (authored poses, or free pose then frozen when strapped). A load that does not fit is refused by geometry, and bed accessories such as a toolbox take real space.

## Description
Owner answer on the feat204-toolbox-freight card: "Bail: no bed toolbox; its slots go elsewhere".

## Tracker
- [ ] Design pass after alpha

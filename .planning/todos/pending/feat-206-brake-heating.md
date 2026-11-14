---
id: FEAT-206
type: feature
status: open
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "post alpha: brake heating. vibe: you accept a really heavy freight mission (should pay proportional to load/distance so this one seems extra juicy). the mission warns you this load exceeds your tire, suspension and brake recommended capacity. you take it anyway. its a struggle and you come to a huge downhill. if you go too quick the brakes wont be able to manage the heat for long and you get fade and runaway. if you downshift to 2nd and take your time or stop and take a break halfway you can make it."
relates: FEAT-112 (load verdicts), FEAT-51 (coolant temperature, the same kind of heat track), missions.md (freight pay), src/physics.js (brake torque)
---
lane: B

# FEAT-206: Brake heating — fade and runaway on a long descent with an overweight load

## Next steps
Post alpha (owner). Nothing to do until then.

## Summary
Brakes heat with the energy they absorb and cool with airflow and time. Hot brakes fade. With a load over the truck's rated capacity, a long descent taken fast ends in a runaway; second gear, patience or a stop halfway gets you down.

## Description
### The scene the owner wants
1. A very heavy freight job, paying in proportion to load and distance, so it looks unusually good.
2. The offer warns that the load exceeds the recommended capacity of the tires, the suspension and the brakes.
3. The player takes it. A long steep descent arrives.
4. Too fast: brake temperature climbs past what the brakes shed, the pedal fades, the truck runs away.
5. Engine braking in 2nd, or a stop to cool halfway, makes it.

### Pieces
- A brake temperature state per axle: heat in = brake power (torque × wheel speed), heat out = convection rising with road speed plus a still-air term. Friction falls above a fade temperature.
- A capacity warning on the offer card, from the load verdicts (FEAT-112).
- Freight pay proportional to load × distance (check missions.md's current freight pay first).
- A way to read it: a gauge, smoke, a smell line.

## Tracker
- [ ] Brake temperature model in the physics, with fade
- [ ] Capacity warning on overweight freight offers
- [ ] Freight pay scales with load × distance
- [ ] The descent scene plays out as described, in a headless scenario

## Decisions
- 2026-11-13, owner: post alpha.

## Files
`src/physics.js` · `src/damage.js` · `data/offers.js`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.

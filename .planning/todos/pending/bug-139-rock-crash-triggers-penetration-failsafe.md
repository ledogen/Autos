---
id: BUG-139
type: bug
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: BUG-99 (tire on rock), BUG-54 (rock colliders), BUG-114 (recovery seat)
---
lane: B

# BUG-139: tumbling over a rock prop teleports the truck up (the penetration failsafe)

Owner, verbatim (2026-11-07 tracker inbox): "When crashing the vehicle, especially when tumbling over static rock props, It seems like we're triggering the terrain penetration fail safe. See if you can recreate this and figure out why I'm seeing teleportation upwards instead of natural collisions."

Owner, verbatim (2026-11-07 tracker inbox): "I'm definitely noticing that driving over static rock props that are partially buried in the ground really over triggers the penetration failsafe"

## Acceptance

- [ ] Reproduced headlessly: a tumble over a partly buried rock prop, and a drive over one.
- [ ] The cause named: why the failsafe fires where the collision should answer.
- [ ] The failsafe fires only on a real fall-through; a gate pins a rock tumble with no teleport.

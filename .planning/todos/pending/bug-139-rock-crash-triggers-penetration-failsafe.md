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

## Root cause and fix (Lane B, 2026-11-08, `land/bug-139`)

**Reproduced.** On flat ground with one half-buried rock (the largest rock variant, r 2.1 m, mirrored into the engine
as the game does), main fires physics.js's Step 1 failsafe (a wheel contact deeper than 2r = 0.736 m → the body is
lifted by that depth, vy zeroed) 5 times driving over it at 10 m/s, 5 at 15 m/s, and 4 / 2 times tumbling onto it
sideways at 8 m/s + 3 rad/s / 10 m/s + 4 rad/s; the reported depths reach 1.5 m driving and 5.5 m tumbling.

**Cause: the rock's contact, two ways (src/props/prop-collider.js `sphereVsMesh`, since BUG-54's d863bd78).**
1. **Outside read as inside.** Which side of the rock a wheel centre is on came from the NEAREST triangle's face
   normal. Where the nearest point is an edge or a vertex, several faces share it and the one picked can face away
   from the centre — a centre outside reads inside. Around the game's own rocks (seed 6, 305 rocks, the meshes are
   closed: every edge on exactly two triangles) 846 of 37,430 points that are truly outside (2.3 %) read inside;
   778 of them deeper than 2r, worst 4.0 m. Inside, the push also pointed the wrong way: into the rock.
2. **Inside, depth r + distance.** Even a true inside read r + distance — unbounded, while the failsafe's own note
   says a prop contact is capped at r and "never trips the failsafe". Deep in a rock during a tumble it did.

**Fix:** inside is a ray-parity count (one skewed ray, Möller–Trumbore; run only when the point is within reach or
the nearest face disagrees, so the common miss costs nothing more), and an inside centre reports depth r —
continuous with r − distance at the surface and under the failsafe. A wheel deeper in a rock than that is the
wheel's hard core's job: the engine mirrors the rock and pushes it out over a few steps.

- **Gate** `rock-contact` (fast, 0.8 s): every rock/boulder mesh of the seed-6 palette, 20,000 points against an
  independent three-ray inside test — main 269 of 18,028 outside points read inside, deepest 12.4 m; fixed 0, deepest
  0.368 m (= r) — and the drive/tumble scenarios above: main 16 failsafe steps, fixed 0 (deepest wheel contact 0.12 m).
- Probes: `CarGame-machine/wip/bug-139/inside.mjs [seed] [n]` (the census on a world's rocks), `closed.mjs`.

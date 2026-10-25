---
id: BUG-81
type: bug
status: pending
severity: major
opened: 2026-10-05
source: Owner report (in-game observation, no capture yet). Second report 2026-10-25 (below).
---
lane: Spare

# BUG-81 — tunnel portals don't seal to the mountain; bore shoulder doesn't mate the approach; driving onto the portal from above floats/teleports the car

## What the owner saw

1. **Portal not sealed to the hillside.** Often the portal ring sits proud of, or short of, the
   terrain behind it — gaps where you can see past the portal edge into/around the bore.
2. **Bore floor/shoulder doesn't mate the approach.** Inside the tunnel, the floor just beyond the
   road edges (the shoulder band) doesn't meet the terrain/shoulder of the approach road at the
   mouth — a visible step or seam at the portal line.
3. **Glitchy collision at the portal mouth.** Driving down onto the portal from above (over the
   top of the mouth) often makes the car float and then teleport.

## Owner, 2026-10-25 (plane play-test)

> "i touched a tunnel portal and it messed up my whole everything lol. launched me super hard truck
> was totaled."

Item 3 at full force: a brush against the portal (not a drive onto it from above) threw the truck
hard enough to total it. Severity raised to major. The visual side (holes at the portal, shadows
inside the bore) is split out as BUG-93 so this ticket is the physics: find which overlap kicks —
portal ring trimesh vs heightfield, bore lining vs the depressed bore slot (terrain-physics.js
~66), or the suspension probes vs the analytic terrain — with a capture at the portal and
`node test/replay.mjs`, before touching the seal.

## Where to look

- Mesh: `src/road-mesh.js` ~931 / ~1024 (FEAT-40 bore lining + portal ring, `pArc` ring ~1126).
- Physics: `src/terrain-physics.js` ~141 (bores + portals into the road trimesh — MESH == PHYSICS).
- Carve: the terrain carve around the portal in `src/road.js` / `src/terrain.js`.
- Item 3 smells like the car landing inside / between the portal trimesh and the heightfield
  (overlap → depenetration kick = "teleport"), or the suspension probes hitting the analytic
  terrain while the body rests on the trimesh (= "float"). Confirm which before fixing.

## Related

- BUG-77 — tunnel spans stored in the wrong arc domain (bore drawn up to 24 m off where the profile
  put it). A mislocated span would also leave the portal where the hillside isn't. Check whether
  item 1 reproduces on runs **without** `offCurveSpans` before treating it as separate.
- BUG-67 — portal opening inside a junction.

## Acceptance

- [ ] Brushing a portal ring at road speed never launches the chassis (BUG-54's damage-energy
      readout stays under a hard landing's); proven on a capture replay, then a drive.

- Portal ring meets the terrain on its full perimeter at the headwall line — no daylight gap, no
  ring floating clear of the slope — across a multi-seed census of portals (headless, numeric:
  terrain height vs ring perimeter).
- Bore floor/shoulder edge height matches the approach terrain/shoulder at the portal line to
  within a few cm on both sides.
- Driving off the hillside onto/over the portal mouth: no float, no teleport. Reproduce with a
  capture first, then pin with a headless check.
- MESH == PHYSICS still holds (the collider is whatever is drawn).

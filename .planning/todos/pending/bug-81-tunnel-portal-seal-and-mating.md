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

## Progress — 2026-10-29 (Spare): the launch is FIXED; seal/mating items open

**Root cause of item 3 (launch / float-then-teleport): the BUG-37 bore-wall contact
(`RoadSystem.queryTunnelWallContact`), not the trimesh or the heightfield.** It tested only
"is this probe's arc inside a span", never "is the probe inside the tube". So a wheel on the
hillside beside a portal (seed 6, every portal measured): lat 9 m → depth 1.4 m, lat 10.5 m → 2.9 m,
with the normal pointing at the bore axis. Past 2·wheelRadius (0.74 m) that trips physics.js's
catastrophic-penetration failsafe → teleport; under it, a tire-spring force of metres of
"penetration" → launch. It also pulled a wheel resting on the tube's outer crown DOWN into the bore
(the "from above" case). Fix: `rho >= R → null` — only a centre inside the tube touches the shell,
which also caps depth < r (the invariant the failsafe comment already assumed).
Pinned in `test/road-tunnel.mjs` (5): beside-the-portal probes 0/16 before → 16/16 after, plus the
depth < r cap. penetration-failsafe + cdp-smoke green.

**Still owed:** the owner's drive (brush a portal at road speed). **Secondary, not fixed:** the
bore-ownership rule in `_sampleCarveWorld` has the same lateral blind spot — a below-apex wheel at
lat 9–13 m inside a span (past the 4 m mouth inset) reads the bore floor (≈ deck) while the
heightfield/mesh there is the raw hill (+4..+11 m). It cannot launch (no ground force, the chassis
rests on the heightfield) but a wheel pressed into the hill beside a portal dangles = "float". Bound
ownership to |lat| < R only if a drive shows it. Items 1–2 (seal, shoulder mating) are untouched.

## Owner drive, 2026-10-30 (main at 75e13065)

> "portals are good but the tube behind them still launches you into the tunnel (one sided collision
> i think)"
> "portal fit is good. there's still a little gap between exterior shoulder and interior shoulder tho.
> Sometimes the exterior shoulder pokes through the road apron as well (follows terrain line for
> 'too long')"

So: item 3 (the portal brush) is closed; the launch has moved to the TUBE — driving onto the bore
lining from outside (over the crown / against the outer wall) still kicks the truck into the tunnel.
The BUG-37 wall contact now fires only from inside (rho < R), so this is the other side: the lining
trimesh itself, which has one face side, or the "secondary" bore-ownership blind spot in
`_sampleCarveWorld` (above) pulling a wheel outside the tube down to the bore floor. New item:

4. **Tube launches from outside.** Reproduce with a capture on the hill above a bore and
   `node test/replay.mjs`; then bound the bore ownership to |lat| < R, or give the lining a
   two-sided / outward-facing contact — whichever the replay names.

Items 1–2 restated by the drive: the shoulder gap at the portal line (exterior shoulder vs interior
shoulder), and the exterior shoulder following the terrain line past the headwall so it pokes up
through the apron.

## Acceptance

- [x] (drive confirmed 2026-10-30: "portals are good") Brushing a portal ring at road speed never launches the chassis (BUG-54's damage-energy
      readout stays under a hard landing's); proven on a capture replay, then a drive.

- Portal ring meets the terrain on its full perimeter at the headwall line — no daylight gap, no
  ring floating clear of the slope — across a multi-seed census of portals (headless, numeric:
  terrain height vs ring perimeter).
- Bore floor/shoulder edge height matches the approach terrain/shoulder at the portal line to
  within a few cm on both sides.
- Driving off the hillside onto/over the portal mouth: no float, no teleport. Reproduce with a
  capture first, then pin with a headless check.
- MESH == PHYSICS still holds (the collider is whatever is drawn).

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

## Owner, 2026-11-01 — item 4 jumps Spare's queue

> "Tunnel tube can jump the queue. Bare minimum it should be a wall from both sides. Desired fix is
> making the tube not visible by burying the portal deeper in the wall like an actual road tunnel
> (we always seek to imitate real life)."

So item 4 is next for Spare, ahead of BUG-93 and BUG-100. Two bars: the floor is a two-sided tube —
the lining pushes back from outside as well as inside, no launch, no pull-in. The target is that the
tube is never reachable from outside at all: seat the portal deeper into the hillside so the bore
starts inside rock, as a real road tunnel does, and the hill is what you drive on above it. Junctions
near portals (clipping, obstructions, messy generation) stay a separate ticket — BUG-67.


### Item 4 floor — DONE 2026-11-01 (Spare)

Two ways in from outside, both measured, both closed:

1. **The lining was a one-way wall.** Box3D mesh triangles (and heightfields) collide from their front
   face only — a box driven at the back face passes straight through (headless, measured). The
   lining faces into the bore, so from outside a truck sank in unopposed until the front-face contact
   threw it in. `RoadPhysics` now adds the back faces of every non-surface geometry (the lining and
   the portal ring): a wall from both sides.
2. **The invisible trench.** The heightfield's bore slot (FEAT-40) has to run the WHOLE bore — a
   heightfield cannot overhang, so anywhere it climbed back to the hill inside a bore it would be a
   wall across the lane. It left a trench 2R wide and cover + R deep under the drawn hill, along every
   tunnel. Live, seed 6: barrels dropped on the hill over four bores fell 33–75 m into it. The **lid**
   (`TerrainPhysics._addLid`) is the drawn hill itself over every slot cell, as an upward-facing
   terrain mesh, kept where the hill clears the crown by 0.5 m: one-sided, so a truck in the bore
   below never touches it. Same barrels now stay on the hillside (0.5–1.3 m above it, rolling down).
   A truck still drives through the bores (body 0–1.7 m over the deck, as without the fix).

Gate: `test/bore-collider.mjs` (registered) — a box on the hill over a bore stays up, one driven
through the bore passes untouched, one driven at a shell's back face stops (fails without the fix on
the first and third). Physics gates 21/21, smoke 19/19.

### Item 4 target — DONE 2026-11-01 (Spare): portals buried deeper

`roadV2.portalCover` 2 → 6 (data/ranger.js + the router default; the debug slider still reaches 0–20).
`extendBorePortals` places a portal where the deck sits R + portalCover under the coarse ground, so at
2 the portal sat at the ~9 m cut = bore crossover. Measured on the REAL hill across the whole arch
(|lateral| ≤ the ring's 10.6 m, rock over the arch's own height) on four seed windows, 44 portals:

| portalCover | arch out of the hill | under 2 m of rock | bored |
|---|---|---|---|
| 2 | 6 | 29 | 3056 m |
| 4 | 2 | 6 | 2974 m |
| 6 | 2 | 2 | 2892 m |
| 8 | 2 | 2 | 2813 m |

The two that never move are ONE portal seen from two windows: seed 6, a spliced run
(g:1067143,−293510…), span 830–940 — BUG-77's mislocated span, not portal placement. Every other
portal has ≥ 2 m of real rock over the whole arch at 6. The deck, the routes and par are untouched (the
pass only re-classes stations): bores 5 % shorter, approach cuts ~4 m deeper. Screenshots:
`wip/bug-81-item4/`.

Gates: affected 78/81 → the known reds (road-tunnel 22.5 %, road-clearance) identical to main, and
`vertical-curvature` open-road kinks 17 → 19 — two mild crests (0.031 / 0.035 /m) that were INSIDE
a bore on main and now sit in the approach cut a few metres before the moved portal; no deck changed,
so its ceiling moved with that note. Smoke 19/19. **Owner's look owed:** the deeper approach cuts.
## Owner look, 2026-11-01 — item 5: "better, maybe not there yet"

> most irl tunnel mouths have earth basically fully framing the portal. in our game there is still
> usually a bare spot on top where you see the tunnel itself. any way we bury it in far enough its
> fully framed? otherwise just fix the weird gap between the terrain and tunnel where you can see
> thru the map (pic attached)

Two asks, Spare's: (1) find out whether burying further (portalCover beyond 6, or a local terrain
raise over the ring) gets full earth framing without wrecking the approach cut, and give the number;
(2) regardless, fix the see-through gap between the terrain and the tube beside the ring (the
screenshot shows the tube entering a terrain hole wider than the tube, sky visible through it).

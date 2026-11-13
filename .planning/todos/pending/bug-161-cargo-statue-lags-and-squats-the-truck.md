---
id: BUG-161
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 inbox — "I was driving a fragile mission with a marble statue as the payload I Noticed that Occasionally the marble statue would lag slightly behind the car It would also appear to push the rear end down and Slow the car a little bit seems like some sort of physics glitch. It was intermittent and only occurred a couple times about two or three seconds Each time this was on a three or four kilometer mission I Want to say that it seemed like it happened more often in positive G maneuvers like hitting a dip Or anytime the road curved upwards, but I'm not sure about that"
relates: [PERF-42]
---
lane: B

# Fragile cargo (marble statue) lags behind the truck, squats the rear and slows it

## What

Intermittent, 2–3 s at a time, a couple of times on a 3–4 km fragile mission. The statue drifts behind
the truck, the rear end is pushed down and the truck slows. The owner suspects positive-g moments (a dip, a
road curving upward) but is not sure.

Two candidate causes to separate: (1) the cargo's hold on the bed (its joint or contact) stretching under
high vertical load, so the mass acts behind the axle and drags; (2) a slow physics step (PERF-42's spike
seconds) letting the cargo body fall behind the chassis. Reproduce headless with the statue's real mass over
a dip at speed and log the cargo's offset from its bed seat and the rear strut loads.

## Acceptance

- [ ] Reproduced headless, with the cause named (hold stretch vs slow step vs other).
- [ ] The cargo's offset from its seat stays within the hold's slack over a dip at mission speed.
- [ ] No rear squat or speed loss beyond what the statue's static mass explains.

## Findings (Lane B, 2026-11-12)

**The hold does not stretch.** `wip/bug-161/dip.mjs` (220 kg statue hull welded at strapPose over a cosine dip,
optional trimesh deck so the chassis hulls meet it): dips and sags 18–30 m/s, 0.6–1.5 m deep, grades to 15 %, the
load stays ≤ 1.6 mm off its seat and the end speed matches the unladen line. The physics fingerprint is unchanged.

**Latent: the rear tire's debris query saw the welded load.** The wheel's debris query is a SPHERE of the tire
radius (0.368 m) about the hub, far fatter than the tire (0.12 m half-width), so it reaches 0.35 m inboard of the
hub — past the wheelhouse wall (0.545 m from centre) into the bed. Kinematic sweep (`wip/bug-161/pose.mjs`, every
FREIGHT load, rear strut 0.18–0.32 m, roll and pitch ±30°): every load that sits on the deck between the wheelhouses
and spans the arch (pallets, drums, table, artwork, glass, fountain, X-ray) overlaps the sphere at ordinary ride
height, up to 12 cm deep at the bump stop. The statue overlaps only at 0.32 m (70 mm into the stop), ≤ 1 mm
statically; driven over a dip the overlap reads 18–25 mm (the query meets the load's start-of-step pose from a hub
that has moved on within the step). Only physics.js's world-frame `n.y < −0.1` filter kept the tire from pressing on
it: the normal is −0.4 to −0.9 on a level truck, and passes the filter when the compressed wheel is on the HIGH side
of a 15–25° roll (one rear wheel up a bank or a rock at the stop). Unreachable on a road dip; reachable off-road.
**Fixed at the root:** the adapter records welds (`weldedTo`), `contactSphere(…, { skipWeldedTo })` leaves out
bodies welded to the asking body, and Step 0.5 asks with the chassis. A load welded to the truck is part of it.
Gate: freight-strap §7 — a block inside the RR wheel's sphere level with the hub (normal horizontal) is pushed
loose (6 pushes) and never welded (0); with the skip removed the welded block takes 6.

**Cargo soaks** (`test/drive-soak.mjs --seeds=2 --km=4 --cargo=sculptureB`, two runs, 4 random seeds, 4 km of road
each). They were started before the `cargotire` detector existed, so they count only `cargo` (the load more than
10 mm off its seat):

| run · seed | findings | worst cargo offset |
|---|---|---|
| r1 · 1328188534 | cargo 5 | 92 mm at 18.5 m/s |
| r1 · 724783119 | cargo 13 | 174 mm at 12.6 m/s |
| r2 · 1236227223 | strut 3 · jolt 2 · cargo 3 | 90 mm at 15.0 m/s |
| r2 · 198355854 | jolt 1 · cargo 10 | 174 mm at 13.2 m/s |

The first seeds' sites were read as autopilot wrecks. The second seeds' captures are on the road, not just after a
re-seat, and have not been replayed. Logs and captures: `wip/bug-161/soak/r1.log`, `r2.log`, `r1/`, `r2/` in the
CarGame-machine worktree.

**Follow-up, not fixed here:** BUG-165. The same fat sphere reaches LOOSE bed cargo between the wheelhouses (firewood,
the loose tire), held off only by the same filter.

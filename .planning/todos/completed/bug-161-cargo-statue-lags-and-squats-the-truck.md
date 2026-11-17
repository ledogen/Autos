---
id: BUG-161
type: bug
status: closed
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 inbox — "I was driving a fragile mission with a marble statue as the payload I Noticed that Occasionally the marble statue would lag slightly behind the car It would also appear to push the rear end down and Slow the car a little bit seems like some sort of physics glitch. It was intermittent and only occurred a couple times about two or three seconds Each time this was on a three or four kilometer mission I Want to say that it seemed like it happened more often in positive G maneuvers like hitting a dip Or anytime the road curved upwards, but I'm not sure about that"
relates: [PERF-42]
---
lane: B

# BUG-161: Fragile cargo (marble statue) lags behind the truck, squats the rear and slows it

## Next steps
Gate landed (ef5b7249, test only; no src change). Owner: drive a marble-statue job on the current build, card `bug161-statue-drive`.
If the lag shows, press the capture key; no sighting on a few jobs -> close.

## Summary
The owner saw the statue lag, the rear squat and the truck slow, 2–3 s at a time. Headless, on main, the statue is
honest: it squats the truck by exactly its weight on the springs and rides its seat within 1.3 mm through a launch,
a stop and dips to 1 m at 25 m/s. Two real mechanisms were found and fixed after that drive (11-12/13); neither was
proven to be what the owner saw.

## Description
Intermittent, 2–3 s at a time, a couple of times on a 3–4 km fragile mission. The statue drifts behind
the truck, the rear end is pushed down and the truck slows. The owner suspects positive-g moments (a dip, a
road curving upward) but is not sure.

Two candidate causes to separate: (1) the cargo's hold on the bed (its joint or contact) stretching under
high vertical load, so the mass acts behind the axle and drags; (2) a slow physics step (PERF-42's spike
seconds) letting the cargo body fall behind the chassis. Reproduce headless with the statue's real mass over
a dip at speed and log the cargo's offset from its bed seat and the rear strut loads.

### The statue on the springs (2026-11-16, `wip/bug-161/squat.mjs`, now freight-strap §9)
220 kg, the registry box 0.80 × 1.54 × 0.80 m, welded at strapPose (body z 1.025; axles −1.282 / +1.568, wheelbase 2.85):
81 % of it on the rear, 874 N a rear corner, 205 N a front one.

| | predicted | measured (laden − unladen) |
|---|---|---|
| static rear strut | 874 / 33 000 = 26.5 mm | 26.7 mm |
| static front strut | 205 / 33 000 = 6.2 mm | 6.0 mm |
| rear body drop (spring + tire in series, 24.8 kN/m) | 35.2 mm | — |
| 0.6 m × 20 m dip at 20 m/s: bottom at 1 + v²(d/2)(2π/L)²/g = 2.2 g | 26.5 × 2.2 = 58 mm | 61 mm (in the bump stop) |

- Load off its seat: 0.10 mm static, 0.15 launch (WOT 6 s) and full stop, 0.31 in the 0.6 m dip, 1.24 in a 1 m dip at 25 m/s.
  Its velocity against the bed's at the seat: ≤ 0.09 mm/s. The weld couples in the same step; nothing lags.
- Speed: WOT 6 s ends 19.48 m/s laden vs 20.35 unladen (16 % more mass, 4 % less speed); the dip leaves 20.17 vs 20.34.
- Mass is counted once: freight never enters `stowedKg` (inventory.js); the engine body alone carries it.
- The drawn statue: main.js snapshots truck and debris on every step and draws both at the same alpha (freight-strap §6).

### Approximation found, not the cause
The suspension's in-step body copy (suspension.js, BUG-140) moves the chassis inside the step with `mass + stowedKg` and
the tuned inertia; a welded load is not in it. Telling the copy +220 kg moves the dip trace ≤ 2.5 mm (0.6 m dip) and
≤ 12 mm for a step or two in the 1 m dip (peak 311.0 vs 311.7 mm), static unchanged (`wip/bug-161/copy.mjs`).

### Earlier findings (Lane B, 2026-11-12/13)
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

The first seeds' sites were read as autopilot wrecks. So are the second seeds' (replayed below). Logs and captures: `wip/bug-161/soak/r1.log`, `r2.log`, `r1/`, `r2/` in the
CarGame-machine worktree.

**The soak captures, replayed (Lane B, 2026-11-13): crash steps, not the owner's symptom.** Five captures
(`SOAK_TRACE=n SOAK_AFTER=m node test/drive-soak.mjs --cargo=sculptureB --replay=<capture>`) all reproduce, with the
same numbers on main after the welded-body skip landed. Every one follows the same pattern:

| capture | truck velocity, own frame (x side, z back) | chassis advance on the step | load off seat, per step | strike next step |
|---|---|---|---|---|
| r2 198355854-cargo-3 | (−10.1, 0.8, −8.4) m/s | 0.21 | 162 (174 in the soak run) → 56 → 18 → 6 mm | 31 kN·s |
| r2 198355854-cargo-1 | (−6.1, 0.8, +10.5) | 0.43 | 125 → 43 → 14 | 27 kN·s |
| r2 1236227223-cargo-1 | (+14.2, 1.8, +3.6) | 0.35 | 175 → 58 | 0.6 kN·s |
| r1 724783119-cargo-1 | (+9.5, 1.0, −6.4) | 0.57 | 88 → 30 → 10 | 16 kN·s |
| r1 1328188534-cargo-1 | (−18.4, 2.2, +0.5) | 0.67 | 100 → 34 → 11 | 2–3 kN·s |

- The truck is in a spin each time: sliding sideways, or backwards, at 7–19 m/s. The worst has no road within 15 m. The
  soak's `offroad: false` only means "not on a planned off-road leg". These are autopilot spin-outs ending in a body
  strike against a bank.
- The mechanism is the engine's swept (continuous) collision. The chassis is a bullet (a body the engine sweeps so it
  cannot tunnel). When its sweep meets the ground inside a step, the engine parks it at the moment of impact and keeps
  its velocity. The welded load is a separate body to the engine, and its sweep touches nothing, so it makes the
  whole step. The load ends that step ahead by the chassis's shortfall: (1 − 0.21) × 13.2 m/s × 1/60 s = 174 mm, which
  is the soak's worst. The joint then reels it back over 3 steps (50 ms, ×0.33 a step).
- The cost was not a lag. For 1–2 frames the load was drawn jumping up to 17 cm out of its seat. And the reel spread
  the strike over 3 steps, so the fragile load felt 3.3 g of a strike that stopped the truck sideways from 8.5 m/s in
  one step.
- **Fixed in the adapter:** a weld is rigid. `PhysicsEngine.step` puts a welded body back on its weld once it drifts
  past `WELD_SLOP` (10 mm), with velocity left alone (the clamp keeps it too). Dips hold the weld within 1.6 mm, so
  normal driving never trips it. Gate: freight-strap §8 (the chassis sideways at 13 m/s into a wall 0.10 m off its
  flank).

**The owner's 2–3 s lag, squat and slow-down is still unexplained.** None of the soak's 16 km reached it: no
`cargotire`, and no cargo offset outside a spin. The welded-body skip (above) is the only mechanism found that can
slow the truck. Next lead: an in-game capture (the capture key) taken while the statue lags, replayed headless.

**Follow-up, not fixed here:** BUG-165. The same fat sphere reaches LOOSE bed cargo between the wheelhouses (firewood,
the loose tire), held off only by the same filter.

## Tracker
- [ ] Reproduced headless, with the cause named (hold stretch vs slow step vs other). Not reproduced: the hold does
  not stretch, the mass is honest; the two mechanisms found are fixed (welded-body skip, weld projection).
- [x] The cargo's offset from its seat stays within the hold's slack over a dip at mission speed (≤ 1.3 mm).
- [x] No rear squat or speed loss beyond what the statue's static mass explains (freight-strap §9).

## Open questions
- Should the in-step body copy carry welded loads' mass and inertia (the complete model)? Recommendation: yes, as its
  own small ticket; it changes laden ride only, by ≤ 12 mm for a step in a hard dip, and no unladen fingerprint.

## Files
`src/physics-engine.js` (skipWeldedTo, _projectWelds) · `src/physics.js` · `src/suspension.js` · `test/freight-strap.mjs` §7–9

## Log
- 2026-11-12/13 (Lane B): ccfda524 / d2c5e2ef welded-body skip; e0b3b03a weld projection; soaks and replays above.
- 2026-11-16: freight-strap §9 (ddef0113): static squat within 1 mm of m·g split / wheel rate, seat ≤ 1 mm launch+stop,
  ≤ 2 mm and ≤ weight × 2.2 g squat in the dip, ≤ 0.3 m/s speed. No src change: physics fingerprint identical by
  construction. freight-strap 1/1 green. Unverified: the owner's in-game sighting.
- 2026-11-17: CLOSED — owner drove it 2026-11-17: "Drove it: fine now, close BUG-161".

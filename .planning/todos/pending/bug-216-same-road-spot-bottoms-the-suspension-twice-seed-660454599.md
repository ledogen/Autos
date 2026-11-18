---
id: BUG-216
type: bug
status: open
opened: 2026-11-17
severity: major
source: owner run log autos-run-660454599 (Logs/run-660454599/run.jsonl)
relates: BUG-90, BUG-97, BUG-200, DEC-065, DEC-260, src/road.js
---

# BUG-216: Two road spots bottom the suspension repeatedly on seed 660454599

## Next steps
Diagnosis done (2026-11-18). Orchestrator: decide whether to build fix 1 (the bore corner, a plain defect, one line in
`_v2GradePts` plus the gate); owner: answer owed card `bug216-bottoming-spots` on the junction class (spot B).

## Summary
Spot A, the one that ended the run, is a sharp station corner on a bore floor 10 m inside the portal: it bottoms a
NEW truck at 60 km/h. The cause is the ±0.25 m bound that BUG-90 kept on corner rounding near bores. Spot B is the foot
of a −34 % junction recovery ramp: a new truck bottoms there only from 80 km/h. That sag class is the one BUG-97 ruled
fair at junction speed. BUG-200 option E does not fix either spot. The rest of the 72 events are wear, or the shoulder lip.

## Description

### The log (72 bumpStop events, clustered within 30 m)
| spot | events | days | speed | peak (kN) vs floor 12 F / 6 R | what |
|---|---|---|---|---|---|
| A (461, 976) | 17 | 4, 7, 9 | 58–65 km/h, both directions | FL 24, 34, 38 (day 9: 37.7 vs a 30.0 kN puncture threshold, tire 4 %) | bore-floor station corner |
| B (657, 1910–1930) | 11 | 4 (one pass) | 88 km/h, braking from 111 | 12–32 on the sag, then 59 / 89 off the road | recovery-ramp sag, then off the outside of a 90° kink |
| C (41, 156) | 5 | 5, 6, 9 | 79–97 km/h | 12–20 | milder bore corner |
| D (421, 789) | 4 | 4, 9 | 66–73 km/h | 15–18 | lat −6.3 m: shoulder lip on a −19 → −8 % sag |
| day-8 puncture (540, −518) | 2 | 8 | 58–67 km/h | 25, 50 | smooth 7 → 12 % climb (≤ 0.7 %/m), lat 4.6–5.9 m (lip); front spring 3 %, tire 12 % |
Everything else is 1–2 events per place, mostly with the front spring at 0–15 %: the wear spiral, as designed.

### Spot A: a station corner on a bore floor
- The bore floor is flat (0 %) for 60 m. Then the road climbs out at 10 %. The shipped 4 m polyline turns
  −13.4 → +1.7 % at ONE sample (arc 478), 10 m inside the portal (bore span 468–584).
- The surface the wheels ride: 0 % → dip to −3.7 % → +15.5 % → 9 % → 10 %, all within 8 m. The change of grade peaks at
  7.3 %/m (R 14 m), with −3.5 %/m on each side of it (ringing). Sheet `wip/bug-216/profiles.png`, top row.
- Cause: `_v2GradePts` rounds the 10 m station corners with a low-pass (vSmoothM 15). Within ±2 stations of a bore that
  pass is bounded to ±0.25 m (BUG-90 item 4). Here the bound saturates, so the corner ships sharp and rings.
  `test/vertical-curvature.mjs` skips bores, so no gate sees this class.
- Mesh and physics agree (deck raycast vs the contact query, within 3 cm). Not a seam or a step.
- A new truck, on the logged line (2.2 m right of centre):
  - 40 km/h: 8 mm into the stop, 3 kN (under the 12 kN floor).
  - 60 km/h: 35 mm, FL 17.9 kN.
  - 63 km/h (the logged speed): 38 mm, FL 21.0 kN, RL 7.7 kN.
  - 80 km/h: 48 mm, FL 34 kN.
  - Worn (springs F 20 % / R 50 %, dampers 30 / 34 %) at 63 km/h: FL 30.9 kN. The log reads 24, 34 and 38 kN.
  - A careful 60 km/h tunnel exit bottoms a new truck: **road defect**.
- Bound removed (scratch copy): the corner rounds to ≤ 1 %/m (2.6 %/m at worst with pothole noise). At 63 km/h a new
  truck no longer reaches the stop. At 80 km/h it is 12 mm in at 4.4 kN, and worn at 63 km/h it is 3.6 kN. No events.

### Spot B: the foot of a junction recovery ramp
- The run leaves a bore at −11 %. It steepens to −34 % (the recovery's design maximum) 8–20 m before a deg-2 node,
  then sags −34 → −7 % over 8 m (4.3–4.9 %/m, R ≈ 21 m). Ten metres on there is a 90° kink (connector R ≈ 10 m).
- A new truck on the sag alone (the kink excluded):
  - 40 km/h: nothing.
  - 60 km/h: 6–10 mm into the stop, 2–4 kN (under the floor).
  - 80 km/h: 12.9 / 15.4 kN on the fronts.
  - 88 km/h: 18.7 / 21.6 kN front, 9.2 / 10.5 kN rear.
- The 59 kN hit at (655, 1927), the left impact and the 89 kN landing at (641, 1956) happened OFF the drawn asphalt:
  the truck ran straight off the outside of the kink at 76 km/h and went down an embankment. That is the driver.
- The census (below) finds this class at 3.3 per 10 km, all within the node's reach. BUG-97 (owner, 2026-10-30):
  junction-zone sags of 0.03–0.10 /m are "fair at junction speed". B (0.053 /m) is inside that band.

### Spot C
Same class as A, milder: a 7.1 % corner at one sample, 3 m inside a bore, 3.1 %/m. With the bound removed: 0.9 %/m.

### BUG-200 option E (`land/bug-200-hairpin-grade`, its road.js in a scratch copy)
- A and C are unchanged: they are not junctions.
- B: the ramp eases from −34 to −24 %. But E holds −24 % until 2 m past the old foot, then breaks onto the pad grade
  harder: −25 → −5 % in 4 m, 6.8 %/m (R 15 m).
- A new truck on E: 60 km/h FR 13.1 kN (an event; main has none); 80 km/h 17.6 / 29.4 kN; 88 km/h 23.8 / 37.3 kN.
  So **E does not fix B; it makes B's foot sharper**.
- Across the census E removes most of the junction class (see below). What is left is the same "E knee" (−21 → −4 %).

### Census
- Method: 12 random seeds (`wip/bug-216/seeds.txt`), the 1300 m core of a 1500 m window, 165.5 km of road. The
  centreline profile at 0.5 m; a spot is a stretch with |Δ²y| ≥ 0.03 /m over ±1 m, which is 3 %/m or R ≤ 33 m.
- Pad interiors are skipped. Cause: bore = within 20 m of a bore; junction = within the node's pad reach; open = elsewhere.

| sags per 10 km (count) | bore | junction | open |
|---|---|---|---|
| main | 0.36 (6; 2 at ≥ 0.06 /m) | 3.3 (55; 12 ≥ 0.045, 1 ≥ 0.06) | 0.60 (10; 1 ≥ 0.045) |
| bound removed | 0 (0) | 3.3 (55) | 0.60 (10) |
| option E | 0.36 (6) | 1.3 (21; 4 ≥ 0.045) | 0.42 (7) |

- Crests ≥ 0.03 /m: bore 7 → 1 with the bound removed; junction 11 → 5 on E.
- The owner's seed (12.6 km in its core): bore 2, junction 3.
- Worst bore sags: 0.094 /m at seed 1175381898 (−971, 829), −16.5 → +3.4 %; 0.077 /m at seed 1380228728 (−994, −431).
  Both are sharper than BUG-90's "unacceptable" dip 2 (0.074 /m).
- So the bore corner is **the generator, not this seed**: about one per 28 km of road. His seed has more than its share.

### Fixes, simplest first
1. **Bore corner (A, C): a plain defect with a small fix.**
   - In `_v2GradePts`, drop the near-bore ±0.25 m bound, so every station corner gets the same rounding (one line).
   - Stop `vertical-curvature.mjs` skipping bores: read the deck with a query height under the apex, the way
     `analyticHeight` already resolves it in a bore. The class is then caught.
   - Expected: A 7.3 → ~1 %/m and no bump stop at 63 km/h even on worn springs. Census: bore sags 6 → 0, bore crests 7 → 1.
     Junction and open spots are identical. Nothing else moves.
   - Why the bound looks safe to drop: it was kept so the deck could not cross a class boundary. But bore spans come
     from the solved stations, never from the rounded samples, so they cannot change. The portal cover moves by about
     0.4 m at most.
   - Gates to run: road-tunnel, bore-junction-clearance, vertical-curvature, fingerprint-world.
2. **Junction recovery sag (B): the owner's call (BUG-97 stands until he says otherwise).**
   - (a) Leave it. B bottoms only from 80 km/h, 25 m before a 90° kink.
   - (b) When E lands, give E's knee the same sag limit `roundCrests` applies (sagLoad 1 g at the design speed). E
     sharpens exactly this spot.
   - (c) Both.

## Tracker
- [x] Profile and grade at both spots reported (step height, curvature, what feature it is)
- [x] A fresh truck driven over each at the logged speed: bottoms or not (A: yes from 60 km/h; B: from 80 km/h)
- [x] If a defect: cause named, census on random seeds (12 seeds / 165 km, per the orchestrator's brief, not 30)
- [x] BUG-200 option E re-measured: fixes neither spot (B's foot gets sharper)
- [ ] Owner: the junction class (card `bug216-bottoming-spots`)
- [ ] Fix 1 built (orchestrator's call), with vertical-curvature covering bores

## Decisions

## Open questions
- Owner: spot B / the junction sag class: leave (BUG-97), sag-limit E's knee, or both?
- Conflicts to check before fix 1: DEC-065 (no longitudinal grade smoother). Fix 1 widens the EXISTING station-corner
  rounding into bores; it adds no smoother. Read as no conflict. DEC-260 ("fix by construction, never averaged
  away") is about the physics ground. The rounding is part of how the profile is built; this is not a repair pass.
  Read as no conflict. A stricter by-construction route exists: interpolate the stations with a C1 curve instead of
  lerp + low-pass. It is bigger and moves every road.

## Links
Sheet `wip/bug-216/profiles.png` (worktree CarGame-land-feat180-dusk; wip/ is untracked). Probes in `wip/bug-216/`:
`profile.mjs` (0.5 m profile: centreline, road top, contact, deck and terrain rays), `drive.mjs` (real physics + damage
at set speeds), `census.mjs`, `agg.mjs`, `pts.mjs`. Census data `census-{main,noclamp,optE}.jsonl`. Owed card
`bug216-bottoming-spots`.

## Files
src/road.js (`_v2GradePts`, the near-bore BOUND), test/vertical-curvature.mjs, Logs/run-660454599/run.jsonl

## Log
- 2026-11-17 minted by the orchestrator from the owner's lost run (seed 660454599, day 9).
- 2026-11-18 diagnosis (no road change): A = bore corner under BUG-90's near-bore bound (defect, fix 1); B = junction
  recovery sag (BUG-97 class, owner call); E fixes neither. Census 12 seeds / 165 km. Harness note: drive-soak's
  `freshState` has no `bumpForce`, so its soak never sees spring wear.

---
id: BUG-148
type: bug
status: open
severity: major
opened: 2026-11-08
source: Spare, junction-edge-lip run on 9 random seeds (identical on main and the BUG-146 branch)
relates: BUG-137, BUG-144, BUG-145 (pad tears and steps), BUG-146
---
lane: B

# BUG-148: a 9.46 m pad tear on seed 749163472

junction-edge-lip's SMOOTH check fails on seed 749163472 at (557.3, 717.0): the pad surface jumps 9.46 m within
5 cm — a cliff in the pad. Pre-existing on main. Census copy: CarGame-spare-base/wip/bug-146/lip-census.mjs <seeds>.

## Acceptance

- [ ] Cause found and fixed at the pad/leg level (mesh == physics).
- [ ] junction-edge-lip passes at that site; the seed joins the gate if no existing seed covers the shape.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-148`, on top of `land/bug-150`)

**No wheel meets this tear; the SMOOTH check sampled inside a tunnel mouth.** The T `551926,725834,-1` (3 legs,
ring 13.6 m) sits on a trunk whose bore starts 10.3 m out on `g:1,0,2:551926,725834,-1`, inside the pad's ring. The T
slide's pass 1 placed it there: no open-air fork, and a T always beats no T. That is a lone bore at a junction, which
the owner ruled fine in BUG-67 (2026-11-03). Inside the tube, FEAT-40's bore ownership hands a probe WITHOUT a height
(the mesh carve table, the old SMOOTH) the hill over the bore. A probe WITH a height under the crown (a wheel) gets the
deck. The "tear" at (557.34, 717.00) is the mouth's edge: the pad top 134.50 on one side, the hill over the tube
143.97 on the other.

- **Wheel's view:** 0 of 5,433 pad points (0.25 m grid) are off the pad top by more than 5 cm at wheel height (pad top
  + 0.3 m).
- **Height-less view:** 349 points stand 9.5 m up, all of them inside the tube.
- **Drawn:** the mouth is a real one (`isMouth` true). 0 drawn skin points stand inside the tube undiscarded within
  30 m; the mouth capsule cuts them.
- **Collider:** the heightfield's bore slot covers the tube. The wheel probe is the one above.

**Fix (gate only):** `junction-edge-lip`'s SMOOTH samples the pad the way a wheel does, with its height (pad top +
0.3 m). Only bore ownership reads that height, so the result is unchanged everywhere outside a bore. Seed 749163472
joins SEEDS, the first gate seed with a portal inside a pad. The gate passes: 4 seeds, 154,810 pad points, worst tear
0.075 m (limit 0.08). With the old height-less sampling it fails at 9.46 m.

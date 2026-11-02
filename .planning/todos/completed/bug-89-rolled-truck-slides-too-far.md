---
id: BUG-89
type: bug
status: done
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "slides too far when truck is on side add friction so you self right or roll more often"
lane: B → Spare (2026-11-01: Lane B has no session; Spare took it)
relates: QUAL-25 (chassis collision mesh)
---

# BUG-89: Truck on its side slides too far

## Symptom
Once the truck is on its side (body/cab contact, not tires), it skates a long way instead of
digging in. Real body-on-dirt friction is high (μ ~0.5–0.8 plus gouging), which converts sliding
energy into either a self-right or a further roll.

## Acceptance
- [x] Body-vs-ground friction raised (adapter seam / chassis collider material) so side-slides
      scrub off speed quickly; numbers verified headlessly (slide distance from a fixed tip-over
      speed, before/after).
- [x] Rollover/self-right still emerge from physics — no scripted flip.
- [x] `fingerprint-physics` diff is expected; physics gates green.

## Resolution (Spare, 2026-11-01)

**The root cause was not the body friction. It was frictionless TIRES.** Measured, not inferred
(`wip/bug-89/*.mjs`):
- The engine mixes friction correctly. A plain box decelerates at exactly the pair μ·g (0.1/0.3/0.7/0.8).
- The same side-lying truck stepped by the BARE engine decelerates at 0.67 g at pair μ 0.7. Through
  stepPhysics it managed only 0.29 g. So the vehicle model was the difference.
- Muting stepPhysics' chassis force restored it (0.715 g). That force averaged **~8 kN UP**, 60 % of
  the 13.3 kN weight.
- The source is Step 2.6, `_hubNormalXZ`: the part of a tire's contact normal that is not along the
  strut. On its side the strut is horizontal, so the down-side tires' whole ground load lands there.
  The strut-axis load is ≤ 0, so Step 3 treats the wheel as airborne and runs no Pacejka. The truck was
  resting 60 % on a frictionless contact.

**Fix (physics.js Step 2.6):** when a tire's strut carries no load, its off-axis contact load now scrubs
with Coulomb friction μN against the hub's sliding. μ is the tire's own (`frictionCoeff` × wear). Below
`SIDEWALL_V_REG` = 0.1 m/s it is regularised, so at rest it holds instead of chattering (tighter, 0.03 and
0.01, chattered and drifted on flat ground). A loaded strut never takes the branch. **The BUG-27b body
μ 0.1 is untouched**: a bumper grazing the shoulder still slides, as ruled.

| case | before | after |
|---|---|---|
| on its side, 15 m/s along its length, flat dirt | 245 m (125.6 m in the gate's 10 s window), still sliding | **26.9 m, 3.6 s** (0.50 g ≈ 60 % × 0.8 + 40 % × 0.1) |
| on its side, 8 m/s toward its roof | 93.9 m | 9.8 m |
| on its side, 8 m/s toward its belly | 61.7 m, no roll | 5.1 m, trips 101° → 90° toward its wheels |
| lying still on its side across a 15° slope | slid away, 75 m in 10 s at up to 15 m/s | holds: 0.42 m creep in 10 s (the regularisation) |

- Rollover and self-right stay emergent: nothing is scripted, it is only the missing rubber friction.
- `fingerprint-physics` is **IDENTICAL** to main. The bumpy-ground drive never unloads a strut while a
  tire touches, so normal driving is bit-for-bit unchanged. (The acceptance expected a diff; it isn't
  needed.)
- Gate `test/side-slide.mjs` (new): fails on main's physics (125.6 m, 70.1 m), passes with the fix.
- Affected physics suite + cdp-smoke: 19/19 green.
- Ceiling (`ponytail:` in code): the support is taken as static, so a sidewall on a moving rock scrubs
  against the world.
